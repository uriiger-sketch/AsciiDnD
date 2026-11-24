// Shared GLSL: the per-frame uniform block and the functions every world shader uses
// (hashing, terrain lookup, wind, clouds, shadows, irradiance, fog, LOD weights, ramps).

import { GLYPH_ASPECT, RAMP } from './atlas.js';

export const RAMP_DEFS = Object.keys(RAMP).map((k) => `const int R_${k} = ${RAMP[k]};`).join('\n') + '\n';

export const MAX_LIGHTS = 16;
export const MAX_DISTURB = 8;

// Offsets (in floats) into the Frame uniform block. std140 with only mat4/vec4 members.
export const F = {
  viewProj: 0, view: 16, invViewProj: 32,
  camPos: 48, camRight: 52, camUp: 56, camFwd: 60, viewport: 64,
  sunDir: 68, sunColor: 72, ambSky: 76, ambGround: 80,
  fogColor: 84, fogParams: 88, wind: 92, misc: 96,
  shadowWin: 100, world: 104, sunDisk: 108, moonDir: 112,
  skyZenith: 116, skyHorizon: 120, flash: 124, lod: 128, counts: 132,
  lightPos: 136, lightCol: 136 + MAX_LIGHTS * 4, disturb: 136 + MAX_LIGHTS * 8,
  SIZE: 136 + MAX_LIGHTS * 8 + MAX_DISTURB * 4,
};

export const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
layout(std140) uniform Frame {
  mat4 u_viewProj; mat4 u_view; mat4 u_invViewProj;
  vec4 u_camPos;    // xyz, time
  vec4 u_camRight;  // xyz, focal length in px
  vec4 u_camUp;     // xyz, unused
  vec4 u_camFwd;    // xyz, exposure
  vec4 u_viewport;  // w, h, 1/w, 1/h
  vec4 u_sunDir;    // direction to the key light, intensity
  vec4 u_sunColor;  // rgb, unused
  vec4 u_ambSky;    // rgb, underglow (how much light the "paper" under the ink keeps)
  vec4 u_ambGround; // rgb, wetness
  vec4 u_fogColor;  // rgb, density
  vec4 u_fogParams; // height falloff, base height, sun scatter, dust
  vec4 u_wind;      // dir.x, dir.z, strength, phase
  vec4 u_misc;      // lightning flash, night factor, cloud cover, heat
  vec4 u_shadowWin; // local shadow window: origin.xz, size, 1/size
  vec4 u_world;     // world size, 1/size, ink gamma, level gamma
  vec4 u_sunDisk;   // true sun direction, visibility
  vec4 u_moonDir;   // xyz, visibility
  vec4 u_skyZenith; // rgb, star visibility
  vec4 u_skyHorizon;// rgb, unused
  vec4 u_flash;     // lightning position xyz, intensity
  vec4 u_lod;       // spacing per metre of distance, finest spacing, glyph size factor, min glyph px
  vec4 u_counts;    // lights, disturbers, cloud height, unused
  vec4 u_lightPos[${MAX_LIGHTS}]; // xyz, radius
  vec4 u_lightCol[${MAX_LIGHTS}]; // rgb, unused
  vec4 u_disturb[${MAX_DISTURB}]; // xz, radius, strength
};
uniform sampler2DArray u_atlas;
uniform sampler2D u_ramps, u_th, u_tcol, u_tmask, u_noise, u_shadowG, u_shadowL;
#define ASPECT ${GLYPH_ASPECT.toFixed(5)}
#define TIME u_camPos.w
#define FOCAL u_camRight.w
#define EXPOSURE u_camFwd.w
#define UNDER u_ambSky.w
#define WET u_ambGround.w
#define NIGHT u_misc.y
`;

export const COMMON = HEADER + `
uvec3 pcg3d(uvec3 v){
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(ivec3 p){ return vec3(pcg3d(uvec3(p))) * 2.3283064365386963e-10; }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec4 noise4(vec2 uv){ return textureLod(u_noise, uv, 0.0); }

struct Terr { float h; vec2 g; vec2 gm; float water; vec3 alb; vec4 mask; };
// g = smooth slope of the land (used for level of detail), gm = with fine relief (used for light)
// mask: r vegetation, g rock, b moisture, a packed/bare ground
Terr terrainAt(vec2 xz){
  vec2 uv = xz * u_world.y + 0.5;
  vec4 a = textureLod(u_th, uv, 0.0);
  Terr T;
  T.mask = textureLod(u_tmask, uv, 0.0);
  T.alb = textureLod(u_tcol, uv, 0.0).rgb;
  T.h = a.x; T.g = a.yz; T.water = a.w;
  float soft = 1.0 - T.mask.a;
  vec4 n1 = noise4(xz * 0.021), n2 = noise4(xz * 0.113 + 0.37);
  T.h += ((n1.r - 0.5) * 0.9 + (n2.g - 0.5) * 0.14) * soft;
  T.gm = T.g + ((n1.gb - 0.5) * 0.30 + (n2.ba - 0.5) * 0.42) * (0.35 + 0.65 * soft);
  return T;
}

// Wind: xy = horizontal wind vector (world xz), z = gust amount 0..1.
vec3 windAt(vec2 xz){
  vec2 dir = u_wind.xy; float st = u_wind.z, ph = u_wind.w;
  vec2 q = xz * 0.0031 - dir * ph * 0.011;
  float g1 = noise4(q).r, g2 = noise4(q * 3.3 + 0.5).g;
  float gust = smoothstep(0.32, 0.8, g1 * 0.68 + g2 * 0.32);
  float flut = sin(dot(xz, vec2(dir.y, -dir.x)) * 0.8 + ph * 1.9 + g2 * 14.0);
  vec2 w = dir * (st * (0.22 + 1.55 * gust)) + vec2(-dir.y, dir.x) * (flut * 0.2 * st);
  return vec3(w, gust);
}

// One cloud field for both the sky and the shadows it drops on the land.
float cloudDensity(vec2 xz){
  float cover = u_misc.z;
  vec2 q = xz * 0.00016 - u_wind.xy * (u_wind.w * 0.00035);
  float c = noise4(q).b * 0.62 + noise4(q * 2.9 + 0.31).a * 0.27 + noise4(q * 7.3).r * 0.11;
  return smoothstep(1.0 - cover * 0.95, 1.18 - cover * 0.7, c);
}
float cloudShade(vec3 p){
  if (u_misc.z < 0.02) return 1.0;
  vec3 L = u_sunDir.xyz;
  vec2 xz = p.xz + L.xz * ((u_counts.z - p.y) / max(L.y, 0.12));
  return 1.0 - 0.8 * cloudDensity(xz);
}

// Shadow volumes: each map stores, per ground texel, the height below which a point is in
// shadow (plus distance to the occluder for penumbra widening). Works for anything, anywhere.
float shadowAt(vec3 p){
  vec2 sg = textureLod(u_shadowG, p.xz * u_world.y + 0.5, 0.0).rg;
  float lit = smoothstep(-(0.5 + sg.g * 0.035), 0.0, p.y - sg.r);
  vec2 ul = (p.xz - u_shadowWin.xy) * u_shadowWin.w;
  float edge = min(min(ul.x, 1.0 - ul.x), min(ul.y, 1.0 - ul.y));
  if (edge > 0.0) {
    vec2 sl = textureLod(u_shadowL, ul, 0.0).rg;
    float l2 = smoothstep(-(0.12 + sl.g * 0.03), 0.0, p.y - sl.r);
    lit = min(lit, mix(1.0, l2, smoothstep(0.0, 0.05, edge)));
  }
  return lit;
}

// Light arriving at a point with normal n. 'wrap' softens the terminator (foliage, cloth).
vec3 irradiance(vec3 p, vec3 n, float wrap, out float sh){
  float ndl = max((dot(n, u_sunDir.xyz) + wrap) / (1.0 + wrap), 0.0);
  sh = 0.0;
  if (u_sunDir.w > 0.0005) sh = shadowAt(p) * cloudShade(p);
  vec3 c = u_sunColor.rgb * (u_sunDir.w * ndl * sh);
  c += mix(u_ambGround.rgb, u_ambSky.rgb, n.y * 0.5 + 0.5);
  int nl = int(u_counts.x);
  for (int i = 0; i < nl; i++) {
    vec4 lp = u_lightPos[i];
    vec3 L = lp.xyz - p;
    float d2 = dot(L, L), r2 = lp.w * lp.w;
    if (d2 < r2) {
      float d = sqrt(d2);
      float att = 1.0 - d2 / r2; att = att * att / (1.0 + d2 * 0.09);
      float nl2 = max((dot(n, L) / max(d, 1e-3) + 0.4) / 1.4, 0.0);
      c += u_lightCol[i].rgb * (att * nl2);
    }
  }
  if (u_flash.w > 0.001) {
    vec3 L = normalize(u_flash.xyz - p);
    c += u_flash.w * vec3(0.72, 0.8, 1.0) * (0.3 + 0.7 * max(dot(n, L), 0.0));
  }
  return c;
}

float fogAmount(vec3 p){
  float d = distance(p, u_camPos.xyz);
  float k = u_fogParams.x;
  float a = 0.5 * (exp(-k * max(u_camPos.y - u_fogParams.y, 0.0)) + exp(-k * max(p.y - u_fogParams.y, 0.0)));
  return 1.0 - exp(-u_fogColor.w * d * a);
}
vec3 fogTint(vec3 viewDir){ // viewDir: from camera toward the point
  float s = pow(max(dot(viewDir, u_sunDisk.xyz), 0.0), 6.0) * u_fogParams.z * u_sunDisk.w;
  return (u_fogColor.rgb + u_sunColor.rgb * s) * EXPOSURE;
}

// --- level of detail: constant density on screen, world-anchored glyphs --------------------
float lodSpacing(float d){ return max(u_lod.x * d, u_lod.y); }
// A level owns t in [0,1] (t = log2 of wanted spacing over its own), thinning itself by 4^-t,
// and cross-fades with its neighbours over a narrow band so nothing pops.
float lodWeight(float t, int lvl){
  const float D = 0.22;
  if (lvl == 0 && t < 0.0) return 1.0;
  if (t < -D || t > 1.0) return 0.0;
  if (t < 0.0) return (t + D) / D;
  float w = exp2(-2.0 * t);
  if (t > 1.0 - D) w *= (1.0 - t) / D;
  return w;
}
float rampGlyph(int ramp, float lev){
  return floor(texelFetch(u_ramps, ivec2(int(clamp(lev, 0.0, 15.0)), ramp), 0).r * 255.0 + 0.5);
}
// Density level (0..15) and ink colour for a lit surface colour. Tone lives mostly in the
// choice of character; the ink itself is kept legible in the dark.
float inkLevel(vec3 lit, out vec3 ink){
  float L = max(luma(lit), 1e-5);
  ink = lit * pow(L, u_world.z - 1.0);
  return pow(clamp(L, 0.0, 1.0), u_world.w) * 15.0;
}
const vec4 CULL = vec4(2.0, 2.0, 2.0, 1.0);
`;

// Fragment side: sample one or two SDF glyph layers and morph between them.
export const GLYPH_FS = `
in vec2 v_uv;
flat in vec4 v_gl;   // glyph a, glyph b, morph, weight bias
flat in vec2 v_fx;   // edge half-width, mip level
float glyphAlpha(){
  float d = textureLod(u_atlas, vec3(v_uv, v_gl.x), v_fx.y).r;
  if (v_gl.z > 0.004) d = mix(d, textureLod(u_atlas, vec3(v_uv, v_gl.y), v_fx.y).r, v_gl.z);
  return smoothstep(0.5 - v_fx.x, 0.5 + v_fx.x, d + v_gl.w);
}
`;

// Vertex side: edge width and mip for a glyph drawn hpx pixels tall.
export const GLYPH_FX = `
vec2 glyphFx(float hpx){
  float texelsPerPx = 96.0 / max(hpx, 1.0);
  return vec2(clamp(texelsPerPx / 32.0 * 1.15, 0.02, 0.5), max(log2(texelsPerPx) - 0.35, 0.0));
}
`;
