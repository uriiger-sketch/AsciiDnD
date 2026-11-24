// Terrain as a glyph field.
//
// The land lives in three textures. Nothing about the ground is stored per glyph: a quadtree
// picks tiles on the CPU (a few hundred numbers per frame) and the GPU invents every character
// from the tile id and gl_InstanceID - position, material, light, wind, level of detail.
// Screen density stays constant from your boots to the horizon, yet every glyph is anchored
// to a fixed spot in the world.

import { Program, texture, bindTex, UNIT } from './gl.js';
import { COMMON, HEADER, GLYPH_FS, GLYPH_FX, RAMP_DEFS } from './glsl.js';
import { G } from './atlas.js';

export const S0 = 0.125; // finest glyph spacing, metres
const TILE = 16; // glyph cells per tile edge
const TINST = TILE * TILE; // glyphs per tile
const T0 = S0 * TILE; // finest tile, metres
const LEVELS = 13;
const LOD_D = 0.22; // must match lodWeight() in glsl.js
const Q_FLOOR = 0.07;
const PATCH = 24; // proxy patch resolution (quads per edge)
const PROXY_K = 0.36; // proxy leaf if tile size <= K * distance
const MAX_TILES = 8192; // per list (ground, grass, near grass)
const MAX_PROXY = 2048;
const TILE_TEX_W = 256;

const TILE_DECODE = `
uniform sampler2D u_tiles;
uniform int u_tileBase;
uniform int u_salt;
// Decodes which world cell this instance is, with stable per-cell random numbers.
void tileCell(out vec2 xz, out float s, out int lvl, out vec3 r, out vec3 r2){
  int tid = (gl_InstanceID >> 8) + u_tileBase;
  int loc = gl_InstanceID & 255;
  vec4 tile = texelFetch(u_tiles, ivec2(tid & ${TILE_TEX_W - 1}, tid / ${TILE_TEX_W}), 0);
  s = tile.z; lvl = int(tile.w + 0.5);
  ivec2 cell = ivec2(floor(tile.xy / s + 0.5)) + ivec2(loc & 15, loc >> 4);
  r = hash3(ivec3(cell, lvl + u_salt * 64));
  r2 = hash3(ivec3(cell.y + 9173, cell.x - 3571, lvl + 57 + u_salt * 64));
  xz = (vec2(cell) + r.xy) * s;
}
`;

const WATER_GLSL = `
vec3 waterAlbedo(float depth){
  return mix(vec3(0.07, 0.36, 0.33), vec3(0.012, 0.08, 0.15), smoothstep(0.0, 2.6, depth));
}
vec3 waterNormal(vec2 xz){
  float t = TIME;
  vec2 w = vec2(
    sin(dot(xz, vec2(0.9, 0.4)) * 1.3 + t * 1.6) + sin(dot(xz, vec2(-0.5, 1.1)) * 2.3 + t * 2.3),
    cos(dot(xz, vec2(0.3, -0.8)) * 1.7 + t * 1.9) + sin(dot(xz, vec2(1.2, 0.2)) * 2.9 - t * 2.7));
  return normalize(vec3(w.x * 0.075, 1.0, w.y * 0.075));
}
`;

const GROUND_VS = COMMON + GLYPH_FX + RAMP_DEFS + TILE_DECODE + WATER_GLSL + `
out vec2 v_uv; flat out vec4 v_gl; flat out vec3 v_ink; flat out vec2 v_fx;
void main(){
  vec2 xz; float s; int lvl; vec3 r, r2;
  tileCell(xz, s, lvl, r, r2);
  Terr T = terrainAt(xz);
  if (T.mask.a > 0.97) { gl_Position = CULL; return; }
  float depth = T.water - T.h;
  bool wet = depth > 0.0;
  vec3 p = vec3(xz.x, wet ? T.water : T.h, xz.y);
  vec3 tc = u_camPos.xyz - p; float d = length(tc); vec3 v = tc / d;
  vec3 nUn = wet ? vec3(0.0, 1.0, 0.0) : vec3(-T.g.x, 1.0, -T.g.y);
  float q = clamp(abs(dot(nUn, v)), ${Q_FLOOR.toFixed(3)}, 16.0);
  float sS = lodSpacing(d);
  float t = log2(sS / s) - 0.5 * log2(q);
  float e = clamp((lodWeight(t, lvl) - r.z * 0.88) / 0.12, 0.0, 1.0);
  if (e <= 0.0) { gl_Position = CULL; return; }

  vec3 n = wet ? vec3(0.0, 1.0, 0.0) : normalize(vec3(-T.gm.x, 1.0, -T.gm.y));
  float slope = 1.0 - inversesqrt(1.0 + dot(T.g, T.g));
  vec3 alb = T.alb;
  int ramp = R_SAND;
  float fixedG = -1.0, lmod = 1.0;
  vec3 extra = vec3(0.0);
  float rock = clamp(T.mask.g + smoothstep(0.2, 0.42, slope), 0.0, 1.0);
  if (wet) {
    n = waterNormal(xz);
    alb = waterAlbedo(depth);
    ramp = R_WATER;
    vec3 hv = normalize(u_sunDir.xyz + v);
    float spec = pow(max(dot(n, hv), 0.0), 120.0);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    extra = u_sunColor.rgb * (u_sunDir.w * spec * 5.0) + u_skyHorizon.rgb * (fres * 0.55);
    if (depth < 0.25) alb = mix(T.alb * 0.6, alb, depth * 4.0);
  } else if (r2.x < rock) {
    // sandstone: horizontal beds, each its own hue, with dark grooves between them
    float by = p.y * 0.17 + (noise4(xz * 0.0043).b - 0.5) * 5.0;
    float bi = floor(by), bf = by - bi;
    vec3 hb = hash3(ivec3(int(bi), 77, 13));
    alb *= mix(vec3(0.6, 0.52, 0.52), vec3(1.28, 1.12, 0.96), hb.x);
    if (hb.y > 0.78) alb = mix(alb, vec3(0.62, 0.50, 0.36), 0.55);
    ramp = R_ROCK;
    if (bf < 0.16 && slope > 0.16) { ramp = R_STRATA; lmod = 0.72; }
    float streak = noise4(vec2(dot(xz, vec2(0.71, 0.71)) * 0.047, p.y * 0.0021)).g;
    if (slope > 0.4 && streak > 0.6) lmod *= 0.62;
  } else if (r2.x < rock + T.mask.a) {
    ramp = R_DIRT;
  } else {
    // wind ripples combed across the sand
    float rip = sin(dot(xz, u_wind.xy) * 2.3 + noise4(xz * 0.013).g * 9.0);
    lmod = 1.0 + 0.1 * rip;
    if (rip > 0.72 && r2.y < 0.4 && T.mask.r < 0.3) fixedG = ${G('~')}.0;
  }
  alb *= 0.86 + 0.28 * r2.y;
  alb *= mix(1.0, 0.55, WET * (1.0 - float(wet)));

  float sh;
  vec3 irr = irradiance(p + n * 0.1, n, 0.15, sh);
  vec3 lit = (alb * irr * lmod + extra * sh) * EXPOSURE;
  vec3 ink; float lev = inkLevel(lit, ink);
  if (!wet) { float calm = mix(1.0, 0.6, T.mask.a); ink *= 0.7 * calm; lev *= 0.86 * mix(1.0, 0.82, T.mask.a); }
  float fog = fogAmount(p);
  vec3 ft = fogTint(-v);
  ink = mix(ink, ft, fog);
  lev = mix(lev, min(pow(clamp(luma(ft), 0.0, 1.0), u_world.w) * 15.0, 4.5), fog);
  float f = clamp(lev + (r2.z - 0.5) * 3.6, 0.0, 15.0);
  float l0 = floor(f);
  float g0 = rampGlyph(ramp, l0), g1 = rampGlyph(ramp, min(l0 + 1.0, 15.0));
  if (fixedG >= 0.0 && f > 2.0) { g0 = fixedG; g1 = fixedG; }
  float tm = g0 == g1 ? 0.0 : smoothstep(0.3, 0.7, f - l0);
  if (g0 < 0.5 && tm < 0.02) { gl_Position = CULL; return; }

  float hW = u_lod.z * min(sS, u_lod.x * d * 2.4) * e;   // close up, glyphs grow, but only so far
  vec2 c = vec2(float(gl_VertexID & 1) - 0.5, float(gl_VertexID >> 1));
  vec3 wp = p + u_camRight.xyz * (c.x * hW * ASPECT) + u_camUp.xyz * (c.y * hW);
  gl_Position = u_viewProj * vec4(wp, 1.0);
  vec4 cb = u_viewProj * vec4(wp + v * (hW * 0.6), 1.0);
  gl_Position.z = cb.z / cb.w * gl_Position.w;
  v_uv = vec2(c.x + 0.5, 1.0 - c.y);
  v_gl = vec4(g0, g1, tm, (lev / 15.0 - 0.5) * 0.07);
  v_ink = ink;
  v_fx = glyphFx(hW * FOCAL / max(gl_Position.w, 0.01));
}`;

const INK_FS = HEADER + GLYPH_FS + `
flat in vec3 v_ink;
out vec4 o;
void main(){
  float a = glyphAlpha();
  if (a < 0.004) discard;
  o = vec4(v_ink * a, a);
}`;

const STROKE_VS = COMMON + GLYPH_FX + TILE_DECODE + `
out vec2 v_uv; flat out vec4 v_gl; flat out vec3 v_ink; flat out vec2 v_fx;
void main(){
  vec2 xz; float s; int lvl; vec3 r, r2;
  tileCell(xz, s, lvl, r, r2);
  Terr T = terrainAt(xz);
  float depth = T.water - T.h;
  vec3 nT = normalize(vec3(-T.gm.x, 1.0, -T.gm.y));
  float slope = 1.0 - inversesqrt(1.0 + dot(T.g, T.g));
  float moist = T.mask.b;
  float pn = noise4(xz * 0.0061).a * 0.6 + noise4(xz * 0.047 + 0.21).r * 0.4;
  float dens = T.mask.r * smoothstep(0.30, 0.6, pn + T.mask.r * 0.44 - 0.08);
  float reed = smoothstep(-0.6, -0.05, depth) * (1.0 - smoothstep(0.12, 0.42, depth));
  dens = max(dens, reed * 0.95) * (1.0 - smoothstep(0.18, 0.4, slope)) * (1.0 - T.mask.a);
  if (depth > 0.42 || r2.y >= dens) { gl_Position = CULL; return; }

  vec3 p = vec3(xz.x, max(T.h, T.water - 0.02), xz.y);
  vec3 tc = u_camPos.xyz - p; float d = length(tc); vec3 v = tc / d;
  float q = clamp(abs(dot(vec3(-T.g.x, 1.0, -T.g.y), v)), 0.06, 4.0);
  float sS = lodSpacing(d);
  float t = log2(sS / s) - 0.5 * log2(q);
  float e = clamp((lodWeight(t, lvl) - r.z * 0.88) / 0.12, 0.0, 1.0);
  if (e <= 0.0) { gl_Position = CULL; return; }

  vec3 r3 = hash3(ivec3(int(r.x * 65536.0), int(r2.y * 65536.0), lvl + 5));
  float tall = mix(0.34, 0.98, r2.x * r2.x) * (0.85 + 0.85 * moist) + reed * 1.0;
  float hW = max(tall, u_lod.z * sS * 1.25) * e;

  // lean with the wind; anything moving through the grass shoves it aside
  vec3 wv = windAt(xz);
  vec2 lean = wv.xy * (0.34 + 0.4 * r2.x);
  int nd = int(u_counts.y);
  for (int i = 0; i < nd; i++) {
    vec4 ds = u_disturb[i];
    vec2 dv = xz - ds.xy; float dl = length(dv);
    if (dl < ds.z) lean += dv / max(dl, 0.05) * ((1.0 - dl / ds.z) * ds.w);
  }
  vec3 dirW = normalize(vec3(lean.x + (r.x - 0.5) * 0.5, 1.0, lean.y + (r.y - 0.5) * 0.5));

  vec3 straw = vec3(0.56, 0.40, 0.13), green = vec3(0.17, 0.30, 0.07), sage = vec3(0.30, 0.37, 0.25);
  vec3 alb = mix(straw, green, clamp(moist * 1.2 - 0.1 + (r2.z - 0.5) * 0.3, 0.0, 1.0));
  alb = mix(alb, sage, step(0.7, noise4(xz * 0.019 + 0.6).g) * 0.8 * (1.0 - moist));
  alb = mix(alb, T.alb, 0.2) * (0.7 + 0.6 * r3.x);
  float glyph = r3.y < 0.62 ? ${G('|')}.0 : r3.y < 0.72 ? ${G('/')}.0 : r3.y < 0.82 ? ${G('\\')}.0
              : r3.y < 0.9 ? ${G('!')}.0 : r3.y < 0.96 ? ${G('l')}.0 : ${G(';')}.0;
  float glow = 0.0;
  if (r3.z > 0.9935 && dens > 0.45) { // desert bloom
    glyph = ${G('*')}.0;
    alb = r3.x < 0.4 ? vec3(1.0, 0.42, 0.05) : r3.x < 0.65 ? vec3(0.42, 0.25, 0.95)
        : r3.x < 0.85 ? vec3(1.0, 0.85, 0.2) : vec3(0.95, 0.95, 0.9);
    glow = 0.25;
  }

  vec3 nB = normalize(nT + vec3(lean.x, 0.5, lean.y) * 0.45);
  float sh;
  vec3 irr = irradiance(p + vec3(0.0, 0.15, 0.0), nB, 0.55, sh);
  irr += u_sunColor.rgb * (u_sunDir.w * sh * 0.6 * pow(max(dot(-v, u_sunDir.xyz), 0.0), 3.0));
  vec3 lit = alb * (irr * (0.62 + 0.3 * wv.z) + glow) * EXPOSURE;
  lit *= mix(1.0, 0.7, WET);
  vec3 ink; float lev = inkLevel(lit, ink);
  float fog = fogAmount(p);
  ink = mix(ink, fogTint(-v), fog);

  vec4 c0 = u_viewProj * vec4(p, 1.0);
  vec4 c1 = u_viewProj * vec4(p + dirW * hW, 1.0);
  if (c0.w < 0.2) { gl_Position = CULL; return; }
  vec2 a = c0.xy / c0.w;
  vec2 axis = (c1.xy / max(c1.w, 0.2) - a) * u_viewport.xy * 0.5;
  float len = length(axis);
  vec2 ad = len > 1e-3 ? axis / len : vec2(0.0, 1.0);
  float full = hW * FOCAL / c0.w;
  len = max(len, full * 0.6);
  vec2 rt = vec2(ad.y, -ad.x);
  vec2 c = vec2(float(gl_VertexID & 1) - 0.5, float(gl_VertexID >> 1));
  float wid = min(len * ASPECT * 0.9, u_lod.w * 2.6);
  vec2 px = ad * (c.y * len) + rt * (c.x * wid);
  gl_Position = vec4((a + px * u_viewport.zw * 2.0) * c0.w, c0.z, c0.w);
  vec4 cb = u_viewProj * vec4(p + v * (hW * 0.5), 1.0);
  gl_Position.z = cb.z / cb.w * c0.w;
  v_uv = vec2(c.x + 0.5, 1.0 - c.y);
  v_gl = vec4(glyph, glyph, 0.0, mix(-0.07, 0.05, clamp(lev / 12.0, 0.0, 1.0)));
  v_ink = ink;
  v_fx = glyphFx(wid / (ASPECT * 0.9));
}`;

const PROXY_VS = COMMON + WATER_GLSL + `
layout(location = 0) in vec3 a_grid;
layout(location = 1) in vec4 a_tile;
out vec3 v_col;
void main(){
  vec2 xz = a_tile.xy + a_grid.xy * a_tile.z;
  Terr T = terrainAt(xz);
  float depth = T.water - T.h;
  bool wet = depth > 0.0;
  vec3 p = vec3(xz.x, wet ? T.water : T.h, xz.y);
  vec3 n = wet ? vec3(0.0, 1.0, 0.0) : normalize(vec3(-T.gm.x, 1.0, -T.gm.y));
  vec3 alb = wet ? waterAlbedo(depth) : T.alb * mix(1.0, 0.8, T.mask.g);
  float sh;
  vec3 irr = irradiance(p + n * 0.1, n, 0.15, sh);
  vec3 lit = alb * irr * EXPOSURE;
  float fog = fogAmount(p);
  vec3 vd = normalize(p - u_camPos.xyz);
  v_col = mix(lit, fogTint(vd), fog) * UNDER;
  p.y -= a_grid.z * a_tile.z * 0.14;
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;

const PROXY_FS = `#version 300 es
precision highp float;
in vec3 v_col; out vec4 o;
void main(){ o = vec4(v_col, 1.0); }`;

export class Terrain {
  constructor(gl, land) {
    this.gl = gl;
    this.land = land;
    const n = land.n;

    // --- textures
    const th = new Float32Array(n * n * 4);
    const tc = new Uint8Array(n * n * 4);
    const tm = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      th[i * 4] = land.height[i];
      th[i * 4 + 1] = land.gx[i];
      th[i * 4 + 2] = land.gz[i];
      th[i * 4 + 3] = land.water[i];
      tc[i * 4] = Math.min(255, land.col[i * 3] * 255);
      tc[i * 4 + 1] = Math.min(255, land.col[i * 3 + 1] * 255);
      tc[i * 4 + 2] = Math.min(255, land.col[i * 3 + 2] * 255);
      tc[i * 4 + 3] = 255;
      tm[i * 4] = land.veg[i] * 255;
      tm[i * 4 + 1] = land.rock[i] * 255;
      tm[i * 4 + 2] = land.moist[i] * 255;
      tm[i * 4 + 3] = land.pack[i] * 255;
    }
    this.texH = texture(gl, { w: n, h: n, internal: gl.RGBA16F, format: gl.RGBA, type: gl.FLOAT, data: th });
    this.texC = texture(gl, { w: n, h: n, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: tc });
    this.texM = texture(gl, { w: n, h: n, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: tm });

    this._buildPyramid();

    // --- tile list texture (ground tiles in the first half, grass tiles in the second)
    this.tileData = new Float32Array(MAX_TILES * 3 * 4);
    this.texTiles = texture(gl, {
      w: TILE_TEX_W, h: (MAX_TILES * 3) / TILE_TEX_W,
      internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST,
    });
    this.nGround = 0;
    this.nStroke = 0;

    // --- proxy patch mesh
    const P = PATCH, V = P + 1;
    const verts = [], idx = [];
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) verts.push(i / P, j / P, 0);
    for (let j = 0; j < P; j++) {
      for (let i = 0; i < P; i++) {
        const a = j * V + i;
        idx.push(a, a + 1, a + V, a + 1, a + V + 1, a + V);
      }
    }
    const edge = (get) => {
      const base = verts.length / 3;
      for (let i = 0; i < V; i++) {
        const [x, z] = get(i);
        verts.push(x / P, z / P, 1);
      }
      for (let i = 0; i < P; i++) {
        const [x0, z0] = get(i), [x1, z1] = get(i + 1);
        const a = z0 * V + x0, b = z1 * V + x1;
        idx.push(a, b, base + i, b, base + i + 1, base + i);
      }
    };
    edge((i) => [i, 0]);
    edge((i) => [i, P]);
    edge((i) => [0, i]);
    edge((i) => [P, i]);
    this.patchIndexCount = idx.length;
    this.proxyVAO = gl.createVertexArray();
    gl.bindVertexArray(this.proxyVAO);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.proxyData = new Float32Array(MAX_PROXY * 4);
    this.proxyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.proxyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.proxyData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.emptyVAO = gl.createVertexArray();
    this.nProxy = 0;

    this.progGround = new Program(gl, 'ground', GROUND_VS, INK_FS);
    this.progStroke = new Program(gl, 'stroke', STROKE_VS, INK_FS);
    this.progProxy = new Program(gl, 'proxy', PROXY_VS, PROXY_FS);
    this.planes = new Float32Array(24);
  }

  bind() {
    const gl = this.gl;
    bindTex(gl, UNIT.u_th, this.texH);
    bindTex(gl, UNIT.u_tcol, this.texC);
    bindTex(gl, UNIT.u_tmask, this.texM);
    bindTex(gl, UNIT.u_tiles, this.texTiles);
  }

  // min/max height, max slope and max vegetation per quadtree node
  _buildPyramid() {
    const { n, height, gx, gz, veg, water } = this.land;
    const L = Math.log2(n) | 0;
    const mn = [], mx = [], mg = [], mv = [];
    let a = new Float32Array(n * n), b = new Float32Array(n * n), g = new Float32Array(n * n), v = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let lo = 1e9, hi = -1e9, gm = 0, vm = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = Math.min(n - 1, Math.max(0, i + di)), jj = Math.min(n - 1, Math.max(0, j + dj));
            const o = jj * n + ii;
            const h = height[o], w = water[o];
            if (h < lo) lo = h;
            if (h > hi) hi = h;
            if (w > hi) hi = w;
            const s = Math.hypot(gx[o], gz[o]);
            if (s > gm) gm = s;
            const vv = Math.max(veg[o], w > -500 ? 1 : 0);
            if (vv > vm) vm = vv;
          }
        }
        const o = j * n + i;
        a[o] = lo - 0.7;
        b[o] = hi + 0.7;
        g[o] = gm + 0.03;
        v[o] = vm;
      }
    }
    mn.push(a); mx.push(b); mg.push(g); mv.push(v);
    for (let l = 1, m = n >> 1; l <= L; l++, m >>= 1) {
      const pa = mn[l - 1], pb = mx[l - 1], pg = mg[l - 1], pv = mv[l - 1], pm = m * 2;
      a = new Float32Array(m * m); b = new Float32Array(m * m); g = new Float32Array(m * m); v = new Float32Array(m * m);
      for (let j = 0; j < m; j++) {
        for (let i = 0; i < m; i++) {
          const o0 = j * 2 * pm + i * 2, o1 = o0 + 1, o2 = o0 + pm, o3 = o2 + 1;
          const o = j * m + i;
          a[o] = Math.min(pa[o0], pa[o1], pa[o2], pa[o3]);
          b[o] = Math.max(pb[o0], pb[o1], pb[o2], pb[o3]);
          g[o] = Math.max(pg[o0], pg[o1], pg[o2], pg[o3]);
          v[o] = Math.max(pv[o0], pv[o1], pv[o2], pv[o3]);
        }
      }
      mn.push(a); mx.push(b); mg.push(g); mv.push(v);
    }
    this.pyr = { mn, mx, mg, mv, L };
  }

  // Choose proxy patches and glyph tiles for this camera.
  cull(cam, lodC) {
    const pl = this.planes, m = cam.viewProj;
    const set = (i, a, b, c, d) => {
      const l = Math.hypot(a, b, c) || 1;
      pl[i * 4] = a / l; pl[i * 4 + 1] = b / l; pl[i * 4 + 2] = c / l; pl[i * 4 + 3] = d / l;
    };
    set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
    set(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
    set(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
    set(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
    set(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
    set(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
    const inFrustum = (x0, y0, z0, x1, y1, z1) => {
      for (let i = 0; i < 6; i++) {
        const a = pl[i * 4], b = pl[i * 4 + 1], c = pl[i * 4 + 2];
        if (a * (a > 0 ? x1 : x0) + b * (b > 0 ? y1 : y0) + c * (c > 0 ? z1 : z0) + pl[i * 4 + 3] < 0) return false;
      }
      return true;
    };
    const { mn, mx, mg, mv, L } = this.pyr;
    const n = this.land.n;
    const cx = cam.eye[0], cy = cam.eye[1], cz = cam.eye[2];
    const td = this.tileData, pd = this.proxyData;
    let nG = 0, nS = 0, nP = 0;
    const SB = MAX_TILES * 4, NB = MAX_TILES * 8;
    let nN = 0;
    const half = this.land.size / 2, texel = this.land.texel;
    const stack = this._stack || (this._stack = new Int32Array(4096));
    let sp = 0;
    const top = LEVELS - 1;
    for (let j = -2; j < 2; j++) for (let i = -2; i < 2; i++) { stack[sp++] = top; stack[sp++] = i; stack[sp++] = j; stack[sp++] = 0; }
    while (sp > 0) {
      const pdone = stack[--sp], j = stack[--sp], i = stack[--sp], k = stack[--sp];
      const T = T0 * (1 << k), s = S0 * (1 << k);
      const x0 = i * T, z0 = j * T, x1 = x0 + T, z1 = z0 + T;
      // the pyramid texel that contains this node (nodes bigger than the land share the top one)
      const pk = Math.min(Math.max(k - 1, 0), L), msz = n >> pk, ts = texel * (1 << pk);
      const pi = Math.min(msz - 1, Math.max(0, Math.floor((x0 + half) / ts)));
      const pj = Math.min(msz - 1, Math.max(0, Math.floor((z0 + half) / ts)));
      const o = pj * msz + pi;
      const hmin = mn[pk][o], hmax = mx[pk][o], gmax = mg[pk][o], vmax = mv[pk][o];
      const pad = 3 * s + 2.5;
      if (!inFrustum(x0 - pad, hmin - 2, z0 - pad, x1 + pad, hmax + pad + 1, z1 + pad)) continue;
      const dx = Math.max(x0 - cx, 0, cx - x1), dz = Math.max(z0 - cz, 0, cz - z1), dy = Math.max(hmin - cy, 0, cy - hmax);
      const dmin = Math.hypot(dx, dy, dz);
      const fx = Math.max(cx - x0, x1 - cx), fz = Math.max(cz - z0, z1 - cz), fy = Math.max(Math.abs(cy - hmin), Math.abs(cy - hmax));
      const dmax = Math.hypot(fx, fy, fz);
      let done = pdone;
      if (!done && (k === 0 || T <= PROXY_K * dmin)) {
        if (nP < MAX_PROXY) { pd[nP * 4] = x0; pd[nP * 4 + 1] = z0; pd[nP * 4 + 2] = T; pd[nP * 4 + 3] = k; nP++; }
        done = 1;
      }
      const sLo = Math.max(lodC * dmin, S0), sHi = Math.max(lodC * dmax, S0);
      const rMin = Math.hypot(dx, dz), rMax = Math.hypot(fx, fz);
      const vyLo = dy > 0 ? dy / Math.hypot(dy, rMax) : 0;
      const vyHi = rMin > 0 ? fy / Math.hypot(fy, rMin) : 1;
      const qLo = Math.min(16, Math.max(Q_FLOOR, vyLo - gmax)), qHi = Math.min(16, Math.max(Q_FLOOR, vyHi + gmax));
      const tLo = Math.log2(sLo / s) - 0.5 * Math.log2(qHi), tHi = Math.log2(sHi / s) - 0.5 * Math.log2(qLo);
      if (tLo <= 1 && (k === 0 || tHi >= -LOD_D)) {
        if (nG < MAX_TILES) { const q = nG * 4; td[q] = x0; td[q + 1] = z0; td[q + 2] = s; td[q + 3] = k; nG++; }
        if (vmax > 0.03 && dmin < 1700 && nS < MAX_TILES) {
          let q = SB + nS * 4; td[q] = x0; td[q + 1] = z0; td[q + 2] = s; td[q + 3] = k; nS++;
          if (dmin < 380 && nN < MAX_TILES) { q = NB + nN * 4; td[q] = x0; td[q + 1] = z0; td[q + 2] = s; td[q + 3] = k; nN++; }
        }
      }
      if (k > 0 && (tLo < 0 || !done) && sp + 16 <= stack.length) {
        for (let c = 0; c < 4; c++) { stack[sp++] = k - 1; stack[sp++] = i * 2 + (c & 1); stack[sp++] = j * 2 + (c >> 1); stack[sp++] = done; }
      }
    }
    this.nGround = nG; this.nStroke = nS; this.nNear = nN; this.nProxy = nP;
    this.instances = (nG + nS + nN) * TINST;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texTiles);
    // upload only the rows each list actually uses
    const rowsPer = MAX_TILES / TILE_TEX_W;
    [nG, nS, nN].forEach((cnt, li) => {
      const rows = Math.ceil(cnt / TILE_TEX_W);
      if (rows) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, li * rowsPer, TILE_TEX_W, rows, gl.RGBA, gl.FLOAT, td, li * MAX_TILES * 4);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.proxyBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pd, 0, nP * 4);
  }

  drawProxies() {
    const gl = this.gl;
    this.progProxy.use();
    gl.bindVertexArray(this.proxyVAO);
    gl.drawElementsInstanced(gl.TRIANGLES, this.patchIndexCount, gl.UNSIGNED_SHORT, 0, this.nProxy);
  }
  drawGround() {
    const gl = this.gl;
    if (!this.nGround) return;
    this.progGround.use().i1('u_tileBase', 0).i1('u_salt', 0);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nGround * TINST);
  }
  drawStrokes() {
    const gl = this.gl;
    if (!this.nStroke) return;
    const p = this.progStroke.use().i1('u_tileBase', MAX_TILES).i1('u_salt', 1);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nStroke * TINST);
    // a second, thicker coat of grass close to the camera
    if (this.nNear) {
      p.i1('u_tileBase', MAX_TILES * 2).i1('u_salt', 2);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nNear * TINST);
    }
  }
}
