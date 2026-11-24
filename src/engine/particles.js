// Two kinds of moving glyphs.
//
//  Particles - simulated on the CPU, a few thousand at most: fire, embers, smoke, dust kicked
//              up by hooves, waterfall spray. Flexible; each has its own life and glyph sequence.
//  Weather   - stateless, tens of thousands, positions computed in the vertex shader from the
//              instance id and the clock: rain streaks, splash rings, blowing dust, fireflies.

import { Program } from './gl.js';
import { COMMON, HEADER, GLYPH_FS, GLYPH_FX } from './glsl.js';
import { G } from './atlas.js';

const P_STRIDE = 12; // floats: pos3, size, color3, alpha, glyph, rot, stretch, pad

const PVS = COMMON + GLYPH_FX + `
layout(location = 0) in vec4 a_ps;   // pos, size
layout(location = 1) in vec4 a_col;  // rgb (HDR), alpha
layout(location = 2) in vec4 a_g;    // glyph, lit (0/1), unused, unused
out vec2 v_uv; flat out vec4 v_gl; flat out vec3 v_ink; flat out vec2 v_fx;
void main(){
  vec3 P = a_ps.xyz; float hW = a_ps.w;
  vec3 col = a_col.rgb;
  if (a_g.y > 0.5) { float sh; col *= irradiance(P, vec3(0.0, 1.0, 0.0), 1.0, sh) * EXPOSURE; }
  float fog = fogAmount(P);
  col = mix(col, fogTint(normalize(P - u_camPos.xyz)) * (a_g.y > 0.5 ? 1.0 : 0.0), fog) * a_col.a;
  vec2 c = vec2(float(gl_VertexID & 1) - 0.5, float(gl_VertexID >> 1) - 0.5);
  vec3 wp = P + u_camRight.xyz * (c.x * hW * ASPECT) + u_camUp.xyz * (c.y * hW);
  gl_Position = u_viewProj * vec4(wp, 1.0);
  v_uv = vec2(c.x + 0.5, 0.5 - c.y);
  v_gl = vec4(a_g.x, a_g.x, 0.0, 0.03);
  v_ink = col;
  v_fx = glyphFx(hW * FOCAL / max(gl_Position.w, 0.01));
}`;
const PFS = HEADER + GLYPH_FS + `
flat in vec3 v_ink; out vec4 o;
void main(){ float a = glyphAlpha(); if (a < 0.004) discard; o = vec4(v_ink * a, a); }`;

export class Particles {
  constructor(gl, max = 6000) {
    this.gl = gl;
    this.max = max;
    this.n = 0;
    // simulation state
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.kind = new Array(max);
    this.seed = new Float32Array(max);
    this.scale = new Float32Array(max);
    this.data = new Float32Array(max * P_STRIDE);
    this.prog = new Program(gl, 'particles', PVS, PFS);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, P_STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.bindVertexArray(null);
    this.addCount = 0; // additive particles are packed first
  }

  // kind: { glyphs: [layer...], colors: [[r,g,b,a] ...] over life, size: [start, end], gravity, drag, wind, lit, additive }
  emit(kind, x, y, z, vx, vy, vz, life, scale = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.age[i] = 0; this.kind[i] = kind; this.seed[i] = Math.random(); this.scale[i] = scale;
  }

  update(dt, engine) {
    const { pos, vel, life, age, kind, seed, scale } = this;
    const e = engine.atmo.env, wd = engine.atmo.windDir, ws = e.wind * 6;
    const land = engine.land;
    let n = this.n;
    for (let i = 0; i < n; ) {
      age[i] += dt;
      if (age[i] >= life[i]) {
        n--;
        pos.copyWithin(i * 3, n * 3, n * 3 + 3); vel.copyWithin(i * 3, n * 3, n * 3 + 3);
        life[i] = life[n]; age[i] = age[n]; kind[i] = kind[n]; seed[i] = seed[n]; scale[i] = scale[n];
        continue;
      }
      const k = kind[i];
      const dr = Math.exp(-k.drag * dt);
      vel[i * 3] = (vel[i * 3] - wd[0] * ws * k.wind) * dr + wd[0] * ws * k.wind;
      vel[i * 3 + 1] = vel[i * 3 + 1] * dr - k.gravity * dt;
      vel[i * 3 + 2] = (vel[i * 3 + 2] - wd[1] * ws * k.wind) * dr + wd[1] * ws * k.wind;
      if (k.turb) {
        const t = engine.time * 3 + seed[i] * 40;
        vel[i * 3] += Math.sin(t * 1.3 + pos[i * 3 + 1]) * k.turb * dt;
        vel[i * 3 + 2] += Math.cos(t * 1.7 + pos[i * 3 + 1] * 1.3) * k.turb * dt;
      }
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (k.bounce) {
        const h = land.heightAt(pos[i * 3], pos[i * 3 + 2]) + 0.05;
        if (pos[i * 3 + 1] < h) { pos[i * 3 + 1] = h; vel[i * 3 + 1] *= -0.3; }
      }
      i++;
    }
    this.n = n;
    // pack: additive first, then lit/alpha
    const d = this.data;
    let w = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const k = kind[i];
        if ((k.additive ? 0 : 1) !== pass) continue;
        const t = age[i] / life[i];
        const cs = k.colors, ct = t * (cs.length - 1), ci = Math.min(cs.length - 2, ct | 0), cf = ct - ci;
        const a = cs[ci], b = cs[ci + 1];
        const o = w * P_STRIDE;
        d[o] = pos[i * 3]; d[o + 1] = pos[i * 3 + 1]; d[o + 2] = pos[i * 3 + 2];
        d[o + 3] = (k.size[0] + (k.size[1] - k.size[0]) * t) * scale[i];
        d[o + 4] = a[0] + (b[0] - a[0]) * cf; d[o + 5] = a[1] + (b[1] - a[1]) * cf; d[o + 6] = a[2] + (b[2] - a[2]) * cf;
        d[o + 7] = a[3] + (b[3] - a[3]) * cf;
        const gl2 = k.glyphs;
        d[o + 8] = k.sequence ? gl2[Math.min(gl2.length - 1, (t * gl2.length) | 0)] : gl2[(seed[i] * gl2.length) | 0];
        d[o + 9] = k.lit ? 1 : 0;
        w++;
      }
      if (pass === 0) this.addCount = w;
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n * P_STRIDE);
  }

  // lit dust and smoke belong with the ink (lighten blend)
  ink() {
    const m = this.n - this.addCount;
    if (m <= 0) return;
    const gl = this.gl;
    this.prog.use();
    gl.bindVertexArray(this.vao);
    // instanced attributes with an offset: rebind pointers at the first non-additive particle
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    for (let i = 0; i < 3; i++) gl.vertexAttribPointer(i, 4, gl.FLOAT, false, P_STRIDE * 4, this.addCount * P_STRIDE * 4 + i * 16);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m);
    for (let i = 0; i < 3; i++) gl.vertexAttribPointer(i, 4, gl.FLOAT, false, P_STRIDE * 4, i * 16);
  }
  light() {
    if (!this.addCount) return;
    const gl = this.gl;
    this.prog.use();
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.addCount);
  }
}

const gl_ = (s) => [...s].map(G);
export const KIND = {
  flame: { glyphs: gl_('WM&$%A^*"\''), sequence: true, colors: [[2.6, 2.2, 1.3, 1], [2.4, 1.2, 0.25, 1], [1.7, 0.42, 0.06, 0.9], [0.5, 0.08, 0.02, 0]], size: [0.8, 0.34], gravity: -3.4, drag: 1.2, wind: 0.25, turb: 5 },
  ember: { glyphs: gl_("*+.'"), colors: [[3.0, 1.4, 0.3, 1], [2.4, 0.7, 0.1, 1], [1.2, 0.2, 0.03, 0]], size: [0.22, 0.14], gravity: -1.1, drag: 0.6, wind: 0.6, turb: 7, additive: true },
  smoke: { glyphs: gl_('~sS%&@'), sequence: true, colors: [[0.5, 0.42, 0.36, 0], [0.42, 0.4, 0.4, 0.5], [0.34, 0.34, 0.36, 0.3], [0.3, 0.3, 0.32, 0]], size: [0.35, 1.5], gravity: -1.0, drag: 0.5, wind: 1.0, turb: 2, lit: true },
  dust: { glyphs: gl_('.,:;*%'), colors: [[0.62, 0.48, 0.33, 0.0], [0.62, 0.48, 0.33, 0.85], [0.6, 0.47, 0.34, 0]], size: [0.25, 0.85], gravity: -0.25, drag: 2.2, wind: 0.5, turb: 1.5, lit: true },
  spray: { glyphs: gl_(".'*+:"), colors: [[1.0, 1.2, 1.4, 0.9], [0.8, 1.0, 1.25, 0.6], [0.6, 0.8, 1.0, 0]], size: [0.3, 0.6], gravity: 2.2, drag: 1.2, wind: 0.4, turb: 2, lit: true },
  spark: { glyphs: gl_('*+x'), colors: [[4, 3.6, 2.4, 1], [3, 1.6, 0.4, 0.8], [1, 0.3, 0.05, 0]], size: [0.2, 0.1], gravity: 9, drag: 0.4, wind: 0.1, additive: true, bounce: true },
};

// A campfire: flames, embers, a column of smoke.
export function emitFire(P, f, dt, wind) {
  const s = f.size, [x, y, z] = f.pos;
  f.acc = (f.acc || 0) + dt;
  const rate = 1 / (70 * s);
  while (f.acc > rate) {
    f.acc -= rate;
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 0.6 * s;
    P.emit(KIND.flame, x + Math.cos(a) * r, y + 0.1 + Math.random() * 0.2, z + Math.sin(a) * r, (Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 1.9, (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.6, s * (0.75 + 0.6 * (1 - r / (0.6 * s))));
    if (Math.random() < 0.09) P.emit(KIND.ember, x + Math.cos(a) * r, y + 0.5, z + Math.sin(a) * r, (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 2.5, s);
    if (Math.random() < 0.06) P.emit(KIND.smoke, x + (Math.random() - 0.5) * 0.3, y + 1.3, z + (Math.random() - 0.5) * 0.3, 0, 1.0 + Math.random() * 0.6, 0, 4 + Math.random() * 3, s);
  }
}

// --- stateless weather ---------------------------------------------------------------------

const WVS = COMMON + GLYPH_FX + `
uniform int u_mode;        // 0 rain, 1 splash rings, 2 blowing dust, 3 fireflies, 4 waterfall, 5 mist
uniform float u_amount;
uniform vec4 u_a;          // mode parameters
uniform vec4 u_b;
out vec2 v_uv; flat out vec4 v_gl; flat out vec3 v_ink; flat out vec2 v_fx;

// a quad whose long axis follows a world-space segment on screen
void streak(vec3 p0, vec3 p1, float widthK, float minPx, out float lenPx){
  vec4 c0 = u_viewProj * vec4(p0, 1.0), c1 = u_viewProj * vec4(p1, 1.0);
  if (c0.w < 0.3 || c1.w < 0.3) { gl_Position = CULL; lenPx = 0.0; return; }
  vec2 a = c0.xy / c0.w;
  vec2 axis = (c1.xy / c1.w - a) * u_viewport.xy * 0.5;
  float len = max(length(axis), minPx);
  vec2 ad = normalize(axis + vec2(0.0, 1e-4));
  vec2 c = vec2(float(gl_VertexID & 1) - 0.5, float(gl_VertexID >> 1));
  vec2 px = ad * (c.y * len) + vec2(ad.y, -ad.x) * (c.x * min(len * ASPECT * widthK, u_lod.w * 2.2));
  gl_Position = vec4((a + px * u_viewport.zw * 2.0) * c0.w, c0.z, c0.w);
  v_uv = vec2(c.x + 0.5, 1.0 - c.y);
  lenPx = len;
}
void billboard(vec3 P, float hW){
  vec2 c = vec2(float(gl_VertexID & 1) - 0.5, float(gl_VertexID >> 1) - 0.5);
  gl_Position = u_viewProj * vec4(P + u_camRight.xyz * (c.x * hW * ASPECT) + u_camUp.xyz * (c.y * hW), 1.0);
  v_uv = vec2(c.x + 0.5, 0.5 - c.y);
  v_fx = glyphFx(hW * FOCAL / max(gl_Position.w, 0.01));
}
vec3 pointLights(vec3 p){
  vec3 c = vec3(0.0);
  int nl = int(u_counts.x);
  for (int i = 0; i < nl; i++) {
    vec3 L = u_lightPos[i].xyz - p; float d2 = dot(L, L), r2 = u_lightPos[i].w * u_lightPos[i].w;
    if (d2 < r2) { float att = 1.0 - d2 / r2; c += u_lightCol[i].rgb * (att * att / (1.0 + d2 * 0.09)); }
  }
  return c + u_flash.w * vec3(0.7, 0.8, 1.0) * 1.2;
}

void main(){
  vec3 h = hash3(ivec3(gl_InstanceID, u_mode, 17));
  vec3 h2 = hash3(ivec3(gl_InstanceID, 91, u_mode));
  float t = TIME;
  v_gl = vec4(0.0); v_ink = vec3(0.0); v_fx = vec2(0.1, 2.0); v_uv = vec2(0.0);
  if (h.z > u_amount) { gl_Position = CULL; return; }

  if (u_mode == 0) {
    // rain: a box of drops that follows the camera and wraps
    vec3 box = vec3(70.0, 46.0, 70.0);
    vec3 vel = vec3(u_wind.x * u_wind.z * 9.0, -24.0 - h2.x * 6.0, u_wind.y * u_wind.z * 9.0);
    vec3 centre = u_camPos.xyz + u_camFwd.xyz * 24.0;
    vec3 p = vec3(h.x, h.y, h2.y) * box + vel * t;
    p = mod(p - centre + box * 0.5, box) + centre - box * 0.5;
    float gh = textureLod(u_th, p.xz * u_world.y + 0.5, 0.0).x;
    if (p.y < gh || (u_b.z > 0.0 && distance(p.xz, u_b.xy) > u_b.z)) { gl_Position = CULL; return; }
    float len;
    streak(p, p - vel * (0.028 + 0.02 * h2.z), 0.5, 5.0, len);
    v_gl = vec4(h2.z < 0.7 ? ${G('|')}.0 : h2.z < 0.85 ? ${G('!')}.0 : ${G(':')}.0, 0.0, 0.0, -0.02);
    vec3 amb = (u_ambSky.rgb * 1.6 + u_sunColor.rgb * u_sunDir.w * 0.4) * EXPOSURE + pointLights(p) * EXPOSURE;
    v_ink = vec3(0.5, 0.6, 0.78) * amb * (0.22 + 0.3 * h2.x);
    v_fx = glyphFx(min(len, u_lod.w * 2.2 / (ASPECT * 0.5)));
  } else if (u_mode == 1) {
    // splash rings where drops land: . o O ( ) then gone
    float period = 0.55 + h.x * 0.5;
    float ph = t / period + h.y * 7.0;
    float cyc = floor(ph), f = fract(ph);
    vec3 hc = hash3(ivec3(gl_InstanceID, int(cyc), 5));
    vec2 snap = floor(u_camPos.xz / 16.0) * 16.0;
    vec2 xz = snap + (hc.xy - 0.5) * 110.0 + u_camFwd.xz * 26.0;
    if (u_b.z > 0.0 && distance(xz, u_b.xy) > u_b.z) { gl_Position = CULL; return; }
    Terr T = terrainAt(xz);
    vec3 p = vec3(xz.x, max(T.h, T.water) + 0.05, xz.y);
    float d = distance(p, u_camPos.xyz);
    float hW = max(0.25 + f * 0.55, u_lod.x * d * 1.3);
    billboard(p + vec3(0.0, hW * 0.35, 0.0), hW);
    v_gl = vec4(f < 0.2 ? ${G('.')}.0 : f < 0.45 ? ${G('o')}.0 : f < 0.75 ? ${G('O')}.0 : ${G('0')}.0, 0.0, 0.0, -0.03 - f * 0.06);
    vec3 amb = (u_ambSky.rgb * 1.8 + u_sunColor.rgb * u_sunDir.w * 0.5) * EXPOSURE + pointLights(p) * EXPOSURE;
    v_ink = vec3(0.6, 0.7, 0.85) * amb * (1.0 - f) * 0.7;
  } else if (u_mode == 2) {
    // dust and sand running along the ground with the wind
    vec3 box = vec3(140.0, 9.0, 140.0);
    vec3 w = vec3(u_wind.x, 0.0, u_wind.y) * (6.0 + u_wind.z * 16.0) * (0.6 + 0.8 * h2.x);
    vec3 centre = vec3(u_camPos.x, 0.0, u_camPos.z) + vec3(u_camFwd.x, 0.0, u_camFwd.z) * 45.0;
    vec3 p = vec3(h.x, 0.0, h.y) * box + w * t;
    p = mod(p - centre + box * 0.5, box) + centre - box * 0.5;
    float gh = textureLod(u_th, p.xz * u_world.y + 0.5, 0.0).x;
    p.y = gh + 0.15 + h2.y * h2.y * box.y + sin(t * 2.0 + h2.z * 30.0) * 0.3;
    float d = distance(p, u_camPos.xyz);
    float len;
    streak(p, p + normalize(w) * max(0.5, u_lod.x * d * 2.2), 0.6, 4.0, len);
    v_gl = vec4(h2.z < 0.4 ? ${G('-')}.0 : h2.z < 0.7 ? ${G('~')}.0 : h2.z < 0.9 ? ${G('.')}.0 : ${G("'")}.0, 0.0, 0.0, -0.03);
    float sh; vec3 irr = irradiance(p, vec3(0.0, 1.0, 0.0), 1.0, sh);
    v_ink = vec3(0.9, 0.74, 0.52) * irr * EXPOSURE * (0.7 + 0.8 * h2.x);
    v_fx = glyphFx(len);
  } else if (u_mode == 3) {
    // fireflies drifting over wet ground
    vec2 home = u_a.xy + (h.xy - 0.5) * u_a.z;
    vec3 p = vec3(home.x + sin(t * 0.5 + h2.x * 20.0) * 3.0, 0.0, home.y + cos(t * 0.4 + h2.y * 20.0) * 3.0);
    p.y = textureLod(u_th, p.xz * u_world.y + 0.5, 0.0).x + 0.6 + 1.6 * h2.z + sin(t * 0.9 + h.x * 9.0) * 0.5;
    float d = distance(p, u_camPos.xyz);
    float blink = pow(max(sin(t * (1.2 + h2.x * 1.5) + h.y * 40.0), 0.0), 6.0);
    billboard(p, max(0.3, u_lod.x * d * 1.2));
    v_gl = vec4(${G('*')}.0, 0.0, 0.0, 0.0);
    v_ink = vec3(1.6, 2.2, 0.5) * blink * NIGHT;
    if (blink * NIGHT < 0.02) gl_Position = CULL;
  } else if (u_mode == 4) {
    // the falls: glyphs in free fall from the lip (u_a.xyz) to the pool (u_b.y), width u_a.w
    float drop = u_a.y - u_b.y;
    float T = sqrt(2.0 * drop / 9.81) * (1.0 + 0.25 * h2.x);
    float f = fract(t / T + h.x * 13.0);
    float fall = f * f * drop;
    vec2 side = vec2(-u_b.z, u_b.x);          // across the lip
    vec3 p = u_a.xyz + vec3(side.x, 0.0, side.y) * ((h.y - 0.5) * u_a.w * (1.0 + f * 0.5))
           + vec3(u_b.x, 0.0, u_b.z) * (-(1.0 + (12.0 + 5.0 * h2.y) * f));
    p.y = u_a.y - fall;
    float speed = 2.0 * f * drop / T;
    float d = distance(p, u_camPos.xyz);
    float len;
    streak(p, p + vec3(0.0, max(0.5, min(speed * 0.05, 2.2)) + u_lod.x * d, 0.0), 0.62, 5.0, len);
    v_gl = vec4(h2.z < 0.45 ? ${G('|')}.0 : h2.z < 0.65 ? ${G('!')}.0 : h2.z < 0.8 ? ${G('l')}.0 : h2.z < 0.92 ? ${G('1')}.0 : ${G(':')}.0, 0.0, 0.0, 0.0);
    float sh; vec3 irr = irradiance(p, normalize(vec3(-u_b.x, 0.6, -u_b.z)), 0.6, sh);
    v_ink = vec3(0.62, 0.8, 0.95) * irr * EXPOSURE * (0.55 + 0.6 * h2.x) * (0.5 + 0.7 * f);
    v_fx = glyphFx(len);
  } else {
    // mist boiling up where the water lands, with sparkles
    float life = 2.2 + h.x * 2.5;
    float f = fract(t / life + h.y * 9.0);
    float ang = h2.x * 6.2832, rad = (0.5 + h2.y * 2.0) + f * (3.0 + 7.0 * h2.z);
    vec3 p = vec3(u_a.x, u_b.y, u_a.z) + vec3(u_b.x, 0.0, u_b.z) * -15.0
           + vec3(cos(ang) * rad, 0.2 + f * (1.5 + 6.0 * h2.y) * (1.0 - 0.5 * f), sin(ang) * rad);
    float d = distance(p, u_camPos.xyz);
    billboard(p, max(0.3 + f * 0.6, u_lod.x * d * 1.3));
    float spark = step(0.9, h.z / max(u_amount, 1e-3)) * pow(max(sin(t * 6.0 + h.x * 50.0), 0.0), 8.0);
    v_gl = vec4(spark > 0.3 ? ${G('+')}.0 : h2.z < 0.5 ? ${G('.')}.0 : h2.z < 0.8 ? ${G(':')}.0 : ${G('*')}.0, 0.0, 0.0, -0.02);
    float sh; vec3 irr = irradiance(p, vec3(0.0, 1.0, 0.0), 1.0, sh);
    v_ink = vec3(0.7, 0.85, 1.0) * (irr * EXPOSURE * 0.75 * sin(f * 3.1416) + spark * 1.6 * (0.3 + sh));
  }
}`;

export class Weather {
  constructor(gl) {
    this.gl = gl;
    this.prog = new Program(gl, 'weather', WVS, PFS);
    this.vao = gl.createVertexArray();
    this.fireflies = null; // {x, z, r}
    this.localRain = null; // {x, z, r, amount}: rain that falls on one place only
    this.falls = null; // {x, y, z, bottom, dir:[x,z], width}
  }
  _draw(mode, count, amount, a, b) {
    if (amount <= 0.002) return;
    const gl = this.gl;
    this.prog.i1('u_mode', mode).f1('u_amount', amount);
    if (a) this.prog.f4('u_a', a[0], a[1], a[2], a[3]);
    if (b) this.prog.f4('u_b', b[0], b[1], b[2], b[3]);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }
  ink(engine) {
    const e = engine.atmo.env;
    this.prog.use();
    this.gl.bindVertexArray(this.vao);
    this._draw(2, 9000, Math.min(1, 0.05 + e.dust * 0.95 + e.wind * 0.12));
    if (this.falls) {
      const f = this.falls;
      this._draw(4, 9000, 1, [f.x, f.y, f.z, f.width], [f.dir[0], f.bottom, f.dir[1], 0]);
      this._draw(5, 2600, 1, [f.x, f.y, f.z, f.width], [f.dir[0], f.bottom, f.dir[1], 0]);
    }
  }
  light(engine) {
    const e = engine.atmo.env;
    this.prog.use();
    this.gl.bindVertexArray(this.vao);
    const lr = this.localRain, local = lr && lr.amount > e.rain;
    const amt = local ? lr.amount : e.rain, lb = local ? [lr.x, lr.z, lr.r, 0] : [0, 0, 0, 0];
    this._draw(0, 22000, amt, null, lb);
    this._draw(1, 5000, amt, null, lb);
    if (this.fireflies && e.night > 0.05) this._draw(3, 420, 1, [this.fireflies.x, this.fireflies.z, this.fireflies.r, 0]);
  }
}
