// Glyph objects: everything that is not the land itself (cacti, rocks, buildings, riders).
//
// An object is a cloud of glyph instances, each with a position, a surface normal, a colour and
// either a fixed character or a material ramp. Two kinds:
//   cards - billboards with a dark backing that write depth: together they read as a solid body
//   ink   - bare characters blended on top (planar text on walls, wires, small detail)
// Static objects live in spatial chunks whose instances are shuffled, so drawing the first k%
// of a chunk thins it evenly: distant things keep a readable glyph size instead of dissolving.

import { Program } from './gl.js';
import { COMMON, HEADER, GLYPH_FS, GLYPH_FX } from './glsl.js';
import { G } from './atlas.js';
import { m4, rng } from './math.js';

export const FLAG = {
  RAMP: 1, // a_info.x is a ramp id: the glyph is chosen by how much light falls on it
  CONTOUR: 2, // near the silhouette, draw a stroke that follows the outline
  PLANAR: 4, // lies in its surface (walls, roofs, decals) instead of facing the camera
  NIGHT: 8, // emissive only after dark (lamplit windows)
  SWAY: 16, // moves with the wind, weighted by a_nrm.w
  TWO_SIDED: 32, // never culled by facing (foliage, cloth, wires)
  UNLIT: 64,
};
export const STRIDE = 32;
export const MAX_BONES = 28;

// CPU-side growable list of glyph instances.
export class GlyphBuffer {
  constructor(cap = 2048) {
    this.cap = cap;
    this.count = 0;
    this._alloc(cap);
  }
  _alloc(cap) {
    const buf = new ArrayBuffer(cap * STRIDE);
    const f = new Float32Array(buf), u = new Uint8Array(buf), i = new Int8Array(buf);
    if (this.u8) u.set(this.u8.subarray(0, this.count * STRIDE));
    this.buf = buf; this.f32 = f; this.u8 = u; this.i8 = i; this.cap = cap;
  }
  // color: linear 0..1 rgb (stored gamma-2 encoded), n: unit normal, sway 0..1
  push(x, y, z, size, r, g, b, emis, nx, ny, nz, sway, glyph, flags, bone = 0, rnd = -1) {
    if (this.count >= this.cap) this._alloc(this.cap * 2);
    const o = this.count * STRIDE, fo = this.count * 8;
    const f = this.f32, u = this.u8, i8 = this.i8;
    f[fo] = x; f[fo + 1] = y; f[fo + 2] = z; f[fo + 3] = size;
    u[o + 16] = Math.min(255, Math.sqrt(Math.max(r, 0)) * 255);
    u[o + 17] = Math.min(255, Math.sqrt(Math.max(g, 0)) * 255);
    u[o + 18] = Math.min(255, Math.sqrt(Math.max(b, 0)) * 255);
    u[o + 19] = Math.min(255, emis * 255);
    i8[o + 20] = nx * 127; i8[o + 21] = ny * 127; i8[o + 22] = nz * 127; i8[o + 23] = Math.min(127, sway * 127);
    u[o + 24] = glyph; u[o + 25] = flags; u[o + 26] = rnd < 0 ? (Math.random() * 256) | 0 : rnd; u[o + 27] = bone;
    u[o + 28] = 0; u[o + 29] = 0; u[o + 30] = 0; u[o + 31] = 0;
    this.count++;
  }
  // Tag the most recently pushed glyph with a text level class.
  cls(c) { this.u8[(this.count - 1) * STRIDE + 28] = c; }
  // Append another buffer, transformed: position, yaw about Y, uniform scale, colour tint.
  append(src, x, y, z, yaw = 0, scale = 1, tint = null) {
    const n = src.count;
    while (this.count + n > this.cap) this._alloc(this.cap * 2);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const sf = src.f32, su = src.u8, si = src.i8, f = this.f32, u = this.u8, i8 = this.i8;
    for (let k = 0; k < n; k++) {
      const so = k * STRIDE, sfo = k * 8, o = (this.count + k) * STRIDE, fo = (this.count + k) * 8;
      const px = sf[sfo] * scale, py = sf[sfo + 1] * scale, pz = sf[sfo + 2] * scale;
      f[fo] = x + px * c + pz * s; f[fo + 1] = y + py; f[fo + 2] = z - px * s + pz * c; f[fo + 3] = sf[sfo + 3] * scale;
      if (tint) {
        u[o + 16] = Math.min(255, su[so + 16] * tint[0]); u[o + 17] = Math.min(255, su[so + 17] * tint[1]); u[o + 18] = Math.min(255, su[so + 18] * tint[2]);
      } else {
        u[o + 16] = su[so + 16]; u[o + 17] = su[so + 17]; u[o + 18] = su[so + 18];
      }
      u[o + 19] = su[so + 19];
      const nx = si[so + 20], nz = si[so + 22];
      i8[o + 20] = nx * c + nz * s; i8[o + 21] = si[so + 21]; i8[o + 22] = -nx * s + nz * c; i8[o + 23] = si[so + 23];
      u[o + 24] = su[so + 24]; u[o + 25] = su[so + 25]; u[o + 26] = su[so + 26]; u[o + 27] = su[so + 27];
      u[o + 28] = su[so + 28]; u[o + 29] = su[so + 29]; u[o + 30] = su[so + 30]; u[o + 31] = su[so + 31];
    }
    this.count += n;
  }
}

const VS = (defs) => COMMON + GLYPH_FX + defs + `
layout(location = 0) in vec3 a_pos;
layout(location = 1) in float a_size;
layout(location = 2) in vec4 a_color;
layout(location = 3) in vec4 a_nrm;
layout(location = 4) in uvec4 a_info;   // glyph or ramp, flags, random, bone
layout(location = 5) in vec4 a_aux;     // x: text level class (0 none, 1 fine, 2 middle, 3 coarse)
uniform mat4 u_model;
uniform vec4 u_lodP;                    // instances drawn (for tail fade), size scale
#ifdef BONES
uniform mat4 u_bones[${MAX_BONES}];
#endif
#ifndef OCCLUDER
out vec2 v_uv; flat out vec4 v_gl; flat out vec3 v_ink; flat out vec3 v_bg; flat out vec2 v_fx;
#else
flat out float v_y;
#endif
float dirGlyph(float a){
  int k = int(floor(mod(a / 3.14159265 * 4.0 + 0.5, 4.0)));
  return k == 0 ? ${G('-')}.0 : k == 1 ? ${G('/')}.0 : k == 2 ? ${G('|')}.0 : ${G('\\')}.0;
}
void main(){
  uint flags = a_info.y;
  float rnd = float(a_info.z) / 255.0;
#ifdef BONES
  mat4 B = u_model * u_bones[int(a_info.w)];
#else
  mat4 B = u_model;
#endif
  vec3 P = (B * vec4(a_pos, 1.0)).xyz;
  vec3 N = normalize(mat3(B) * a_nrm.xyz);
  float sc = length(B[1].xyz);
  if ((flags & 16u) != 0u) {
    vec3 w = windAt(P.xz);
    float k = a_nrm.w;
    P.xz += w.xy * (k * 0.3);
    P += vec3(sin(TIME * 4.3 + rnd * 6.28 + P.y * 1.7), 0.0, cos(TIME * 3.7 + rnd * 9.1 + P.x * 1.3)) * (k * 0.035 * (0.4 + w.z + u_wind.z));
  }
  float fade = 1.0 - smoothstep(0.82, 1.0, float(gl_InstanceID) / u_lodP.x);
  float hW = a_size * sc * u_lodP.y * fade;
#ifdef OCCLUDER
  // top-down height splat into the local shadow window
  vec2 c = vec2(float(gl_VertexID & 1) - 0.5, float(gl_VertexID >> 1) - 0.5);
  vec2 uv = (P.xz + c * hW * 0.8 - u_shadowWin.xy) * u_shadowWin.w;
  gl_Position = vec4(uv * 2.0 - 1.0, 1.0 - 2.0 * clamp((P.y + 60.0) / 700.0, 0.0, 1.0), 1.0);
  v_y = P.y;
#else
  vec3 tc = u_camPos.xyz - P; float d = length(tc); vec3 v = tc / d;
  if ((flags & 32u) == 0u && dot(N, v) < -0.14) { gl_Position = CULL; return; }
  // typeset panels come in three sizes; show whichever is legible at this distance
  float cls = a_aux.x * 255.0;
  if (cls > 0.5) {
    float px = hW * FOCAL / d, lo = u_lod.w * 1.5, wv = 1.0;
    if (cls < 2.5) wv *= smoothstep(lo * 0.9, lo * 1.1, px);
    if (cls > 1.5) wv *= 1.0 - smoothstep(lo * 1.8, lo * 2.2, px);
    if (wv < 0.01) { gl_Position = CULL; return; }
    hW *= wv;
  }
  float sh;
  bool soft = (flags & 32u) != 0u;
  vec3 Nl = soft && dot(N, v) < 0.0 ? -N : N;
  vec3 irr = irradiance(P + N * 0.45, Nl, soft ? 0.5 : 0.12, sh);
  vec3 alb = a_color.rgb * a_color.rgb;
  vec3 lit = alb * irr * EXPOSURE;
  if ((flags & 64u) != 0u) lit = alb;
  float em = a_color.a * ((flags & 8u) != 0u ? NIGHT * (0.8 + 0.2 * sin(TIME * 7.0 + rnd * 40.0)) : 1.0);
  lit += alb * em * 3.2;
  lit *= mix(1.0, 0.72, WET * (1.0 - em));
  vec3 ink; float lev = inkLevel(lit, ink);
  float g0, g1, tm = 0.0;
  if ((flags & 1u) != 0u) {
    float f = clamp(lev + (rnd - 0.5) * 0.9, 0.0, 15.0), l0 = floor(f);
    g0 = rampGlyph(int(a_info.x), l0); g1 = rampGlyph(int(a_info.x), min(l0 + 1.0, 15.0));
    tm = g0 == g1 ? 0.0 : smoothstep(0.3, 0.7, f - l0);
  } else { g0 = float(a_info.x); g1 = g0; }
  if ((flags & 2u) != 0u) {
    vec3 nv = mat3(u_view) * N;
    if (abs(nv.z) < 0.36 + rnd * 0.1) { g0 = dirGlyph(atan(nv.x, -nv.y)); g1 = g0; tm = 0.0; ink *= 1.2; }
  }
  float fog = fogAmount(P);
  vec3 ft = fogTint(-v);
  ink = mix(ink, ft, fog);
  vec3 bg = mix(lit, ft, fog) * (UNDER * 1.5);
  vec2 c = vec2(float(gl_VertexID & 1) - 0.5, float(gl_VertexID >> 1) - 0.5);
  vec3 wp;
  if ((flags & 4u) != 0u) {
    vec3 T = abs(N.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), N));
    vec3 Bt = cross(N, T);
    wp = P + T * (c.x * hW * ASPECT) + Bt * (c.y * hW) + v * (0.03 + d * 0.0012);
    gl_Position = u_viewProj * vec4(wp, 1.0);
  } else {
    wp = P + u_camRight.xyz * (c.x * hW * ASPECT) + u_camUp.xyz * (c.y * hW);
    gl_Position = u_viewProj * vec4(wp, 1.0);
#ifdef INK
    vec4 cb = u_viewProj * vec4(wp + v * (hW * 0.6), 1.0);
    gl_Position.z = cb.z / cb.w * gl_Position.w;
#endif
  }
  v_uv = vec2(c.x + 0.5, 0.5 - c.y);
  v_gl = vec4(g0, g1, tm, (lev / 15.0 - 0.5) * 0.06);
  v_ink = ink; v_bg = bg;
  v_fx = glyphFx(hW * FOCAL / max(gl_Position.w, 0.01));
#endif
}`;

const CARD_FS = HEADER + GLYPH_FS + `
flat in vec3 v_ink; flat in vec3 v_bg;
out vec4 o;
void main(){
  float a = glyphAlpha();
  vec2 q = abs(v_uv - 0.5);
  if (a < 0.5 && (q.x > 0.36 || q.y > 0.46)) discard;
  o = vec4(mix(v_bg, v_ink, a), 1.0);
}`;
const INK_FS = HEADER + GLYPH_FS + `
flat in vec3 v_ink; flat in vec3 v_bg;
out vec4 o;
void main(){
  float a = glyphAlpha();
  if (a < 0.004) discard;
  o = vec4(v_ink * a, a);
}`;
const OCC_FS = `#version 300 es
precision highp float;
flat in float v_y; out vec4 o;
void main(){ o = vec4(v_y, 0.0, 0.0, 1.0); }`;

let PROGS = null;
export function batchPrograms(gl) {
  if (PROGS) return PROGS;
  const mk = (name, defs, fs) => new Program(gl, name, VS(defs), fs);
  PROGS = {
    card: mk('card', '', CARD_FS),
    ink: mk('ink', '#define INK\n', INK_FS),
    occ: mk('occ', '#define OCCLUDER\n', OCC_FS),
    cardB: mk('cardB', '#define BONES\n', CARD_FS),
    inkB: mk('inkB', '#define BONES\n#define INK\n', INK_FS),
    occB: mk('occB', '#define BONES\n#define OCCLUDER\n', OCC_FS),
  };
  return PROGS;
}

export function makeVAO(gl, vbo, byteOffset = 0) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const o = byteOffset;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, o);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STRIDE, o + 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, STRIDE, o + 16);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.BYTE, true, STRIDE, o + 20);
  gl.enableVertexAttribArray(4); gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_BYTE, STRIDE, o + 24);
  gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.UNSIGNED_BYTE, true, STRIDE, o + 28);
  for (let i = 0; i < 6; i++) gl.vertexAttribDivisor(i, 1);
  gl.bindVertexArray(null);
  return vao;
}

const IDENTITY = m4.create();

// How much of a glyph cloud to draw at distance d so glyphs never shrink below minPx.
export function lodFor(avgSize, d, focal, minPx, count) {
  const px = (avgSize * focal) / Math.max(d, 0.5);
  if (px >= minPx) return { n: count, scale: 1, fadeN: count * 1.3 };
  const scale = minPx / px;
  const n = Math.ceil(count * Math.min(1, 1.6 / (scale * scale)));
  return { n, scale: Math.min(scale, 60), fadeN: n };
}

// World-static glyphs, bucketed into chunks for culling and thinning.
export class StaticBatch {
  constructor(gl, chunkSize = 128) {
    this.gl = gl;
    this.cs = chunkSize;
    this.progs = batchPrograms(gl);
    this.kinds = {}; // 'card' | 'ink' -> { chunks: [] }
  }

  // Sort a GlyphBuffer into chunks (shuffled inside each) and upload it.
  add(kind, buf, seed = 1) {
    const gl = this.gl, cs = this.cs, n = buf.count;
    if (!n) return;
    const f = buf.f32;
    const keys = new Map();
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(f[i * 8] / cs), cz = Math.floor(f[i * 8 + 2] / cs);
      const key = cx * 100003 + cz;
      let list = keys.get(key);
      if (!list) keys.set(key, (list = []));
      list.push(i);
    }
    const out = new Uint8Array(n * STRIDE), src = buf.u8;
    const outF = new Float32Array(out.buffer);
    const rand = rng(seed);
    const chunks = [];
    let w = 0;
    for (const list of keys.values()) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = (rand() * (i + 1)) | 0;
        const t = list[i]; list[i] = list[j]; list[j] = t;
      }
      const start = w;
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9, sz = 0;
      for (const i of list) {
        out.set(src.subarray(i * STRIDE, (i + 1) * STRIDE), w * STRIDE);
        const x = outF[w * 8], y = outF[w * 8 + 1], z = outF[w * 8 + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
        sz += outF[w * 8 + 3];
        w++;
      }
      chunks.push({ start, count: list.length, min: [x0 - 2, y0 - 2, z0 - 2], max: [x1 + 2, y1 + 2, z1 + 2], avg: sz / list.length });
    }
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, out, gl.STATIC_DRAW);
    for (const c of chunks) c.vao = makeVAO(gl, vbo, c.start * STRIDE);
    (this.kinds[kind] || (this.kinds[kind] = { chunks: [] })).chunks.push(...chunks);
    this.total = (this.total || 0) + n;
  }

  _draw(engine, kind, prog, noLod = false) {
    const k = this.kinds[kind];
    if (!k) return 0;
    const gl = this.gl, cam = engine.cam, pl = engine.terrain.planes;
    const minPx = 5 * engine.dpr, focal = engine.focal;
    prog.use().m4('u_model', IDENTITY);
    const uL = prog.u('u_lodP');
    let drawn = 0;
    for (const c of k.chunks) {
      let vis = true;
      for (let i = 0; i < 6 && vis; i++) {
        const a = pl[i * 4], b = pl[i * 4 + 1], cc = pl[i * 4 + 2];
        if (a * (a > 0 ? c.max[0] : c.min[0]) + b * (b > 0 ? c.max[1] : c.min[1]) + cc * (cc > 0 ? c.max[2] : c.min[2]) + pl[i * 4 + 3] < 0) vis = false;
      }
      if (!vis) continue;
      const dx = Math.max(c.min[0] - cam.eye[0], 0, cam.eye[0] - c.max[0]);
      const dy = Math.max(c.min[1] - cam.eye[1], 0, cam.eye[1] - c.max[1]);
      const dz = Math.max(c.min[2] - cam.eye[2], 0, cam.eye[2] - c.max[2]);
      const lod = noLod ? { n: c.count, scale: 1, fadeN: 1e12 } : lodFor(c.avg, Math.hypot(dx, dy, dz) + this.cs * 0.25, focal, minPx, c.count);
      if (lod.n < 1) continue;
      gl.uniform4f(uL, lod.fadeN, lod.scale, 0, 0);
      gl.bindVertexArray(c.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lod.n);
      drawn += lod.n;
    }
    return drawn;
  }

  opaque(engine) { engine.stats.glyphs += this._draw(engine, 'card', this.progs.card); }
  ink(engine) {
    engine.stats.glyphs += this._draw(engine, 'ink', this.progs.ink);
    engine.stats.glyphs += this._draw(engine, 'text', this.progs.ink, true);
  }

  occluders(engine) {
    const gl = this.gl, w = engine.shadowWin, prog = this.progs.occ;
    prog.use().m4('u_model', IDENTITY).f4('u_lodP', 1e12, 1, 0, 0);
    for (const kind in this.kinds) {
      for (const c of this.kinds[kind].chunks) {
        if (c.max[0] < w[0] || c.min[0] > w[0] + w[2] || c.max[2] < w[1] || c.min[2] > w[1] + w[2]) continue;
        gl.bindVertexArray(c.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, c.count);
      }
    }
  }
}

// A reusable baked glyph cloud for moving things (GPU buffer + stats).
export class Template {
  constructor(gl, buf, seed = 7) {
    // shuffle so partial draws thin evenly
    const n = buf.count, out = new Uint8Array(n * STRIDE), rand = rng(seed);
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    for (let i = n - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }
    let sz = 0;
    for (let i = 0; i < n; i++) {
      out.set(buf.u8.subarray(order[i] * STRIDE, (order[i] + 1) * STRIDE), i * STRIDE);
      sz += buf.f32[order[i] * 8 + 3];
    }
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, out, gl.STATIC_DRAW);
    this.vao = makeVAO(gl, vbo, 0);
    this.count = n;
    this.avg = n ? sz / n : 0.1;
  }
}

// Moving glyph objects with a small skeleton. Each entity: { template, model, bones, radius }.
export class EntityLayer {
  constructor(gl) {
    this.gl = gl;
    this.progs = batchPrograms(gl);
    this.list = [];
  }
  add(e) {
    e.model = e.model || m4.create();
    e.bones = e.bones || (() => { const b = new Float32Array(MAX_BONES * 16); for (let i = 0; i < MAX_BONES; i++) b[i * 16] = b[i * 16 + 5] = b[i * 16 + 10] = b[i * 16 + 15] = 1; return b; })();
    this.list.push(e);
    return e;
  }
  _draw(engine, prog, occluder) {
    const gl = this.gl, cam = engine.cam;
    prog.use();
    const uL = prog.u('u_lodP'), uB = prog.u('u_bones[0]'), uM = prog.u('u_model');
    let drawn = 0;
    for (const e of this.list) {
      if (e.hidden) continue;
      const x = e.model[12], y = e.model[13], z = e.model[14];
      const d = Math.hypot(x - cam.eye[0], y - cam.eye[1], z - cam.eye[2]);
      const lod = occluder ? { n: e.template.count, scale: 1, fadeN: 1e12 } : lodFor(e.template.avg, d, engine.focal, 5 * engine.dpr, e.template.count);
      if (lod.n < 1) continue;
      gl.uniformMatrix4fv(uM, false, e.model);
      gl.uniformMatrix4fv(uB, false, e.bones);
      gl.uniform4f(uL, lod.fadeN, lod.scale, 0, 0);
      gl.bindVertexArray(e.template.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lod.n);
      drawn += lod.n;
    }
    return drawn;
  }
  opaque(engine) { engine.stats.glyphs += this._draw(engine, this.progs.cardB, false); }
  occluders(engine) { this._draw(engine, this.progs.occB, true); }
}
