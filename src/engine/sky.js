// The sky is a terminal: a fixed grid of character cells behind the world. Each cell asks
// "what is up there?" (gradient, sun, moon, stars, clouds, far ranges) and answers with one
// glyph. Computed at cell resolution, then stamped to the screen.

import { Program, texture, bindTex, UNIT, FS_TRI } from './gl.js';
import { COMMON, HEADER, RAMP_DEFS } from './glsl.js';
import { G } from './atlas.js';

const CELL_FS = COMMON + RAMP_DEFS + `
layout(location = 0) out vec4 o_col;
layout(location = 1) out vec4 o_gl;
uniform vec2 u_cs;
uniform vec3 u_sunDiscCol, u_glowCol, u_moonCol, u_cloudLit, u_cloudDark;
uniform float u_sunRad, u_moonRad, u_skyUnder;
uniform mat3 u_starRot;

float dirGlyph(float a){
  int k = int(floor(mod(a / 3.14159265 * 4.0 + 0.5, 4.0)));
  return k == 0 ? ${G('-')}.0 : k == 1 ? ${G('/')}.0 : k == 2 ? ${G('|')}.0 : ${G('\\')}.0;
}

void main(){
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 ndc = (cell + 0.5) * u_cs * u_viewport.zw * 2.0 - 1.0;
  vec3 rd = normalize(u_camFwd.xyz + u_camRight.xyz * (ndc.x * u_viewport.x * 0.5 / FOCAL)
                                   + u_camUp.xyz * (ndc.y * u_viewport.y * 0.5 / FOCAL));
  vec3 hsh = hash3(ivec3(ivec2(cell), 7));
  float el = rd.y;
  vec3 sun = u_sunDisk.xyz, moon = u_moonDir.xyz;
  float hz = pow(1.0 - clamp(el, 0.0, 1.0), 5.0);
  vec3 col = mix(u_skyZenith.rgb, u_skyHorizon.rgb, hz);
  float cs = dot(rd, sun);
  float sd = max(cs, 0.0);
  col += u_glowCol * (pow(sd, 5.0) * 0.2 + pow(sd, 30.0) * 0.5 + pow(sd, 260.0) * 1.4) * (0.3 + 0.7 * hz);

  int ramp = R_SKY;
  float fixedG = -1.0, under = u_skyUnder;
  vec3 addCol = vec3(0.0);
  float solid = 0.0; // 1 = sun, 2 = moon

  // --- stars and the river of them
  float starV = u_skyZenith.w;
  if (starV > 0.01 && el > 0.0) {
    vec3 sr = u_starRot * rd;
    float lat = asin(clamp(sr.y, -1.0, 1.0)), lon = atan(sr.z, sr.x);
    const float A = 0.0125;
    float band = floor(lat / A);
    float ncol = max(floor(6.2832 * cos((band + 0.5) * A) / (A * 0.66)), 1.0);
    float ci = floor((lon / 6.2832 + 0.5) * ncol);
    vec3 h = hash3(ivec3(int(band), int(ci), 3));
    float mwd = dot(sr, normalize(vec3(0.35, 0.3, 0.88)));
    float mw = exp(-mwd * mwd * 26.0) * (0.35 + 0.65 * noise4(vec2(lon * 0.5, lat * 1.1)).r);
    float fade = starV * smoothstep(0.0, 0.14, el);
    addCol += vec3(0.035, 0.04, 0.075) * mw * fade;
    if (h.x < 0.02 + 0.14 * mw) {
      float mag = pow(h.y, 5.0);
      float tw = 0.62 + 0.38 * sin(TIME * (1.4 + h.z * 5.0) + h.z * 60.0);
      float b = (0.22 + 1.5 * mag) * tw * fade;
      addCol += mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.8, 0.58), h.z) * b;
      fixedG = mag > 0.45 ? ${G('*')}.0 : mag > 0.1 ? ${G('+')}.0 : h.z > 0.5 ? ${G('.')}.0 : ${G("'")}.0;
    }
  }

  // --- the sun: a disc of the heaviest characters, with a hand-drawn corona
  float ang = acos(clamp(cs, -1.0, 1.0));
  if (u_sunDisk.w > 0.0 && ang < u_sunRad * 3.6) {
    vec3 off = rd - sun * cs;
    float a2 = atan(dot(off, u_camUp.xyz), dot(off, u_camRight.xyz));
    float rr = ang / u_sunRad;
    if (rr < 1.0) {
      col = u_sunDiscCol * (1.0 - 0.32 * rr * rr) * u_sunDisk.w;
      fixedG = rr < 0.55 ? ${G('@')}.0 : rr < 0.85 ? ${G('#')}.0 : ${G('O')}.0;
      under = 0.8; solid = 1.0; addCol = vec3(0.0);
    } else {
      float fall = pow(clamp(1.0 - (rr - 1.0) / 2.6, 0.0, 1.0), 2.0);
      float spoke = sin(a2 * 11.0 + TIME * 0.12 + sin(a2 * 3.0) * 1.5);
      if (spoke > 0.15 && hsh.y < fall * 1.25) {
        fixedG = dirGlyph(a2);
        col += u_sunDiscCol * fall * 0.3 * u_sunDisk.w;
      }
    }
  }

  // --- the moon: a lit sphere with seas, phase from the real sun direction
  float cm = dot(rd, moon);
  if (u_moonDir.w > 0.0 && cm > cos(u_moonRad)) {
    vec3 off = (rd - moon * cm) / sin(u_moonRad);
    float lx = dot(off, u_camRight.xyz), ly = dot(off, u_camUp.xyz);
    float nz = sqrt(max(1.0 - lx * lx - ly * ly, 0.0));
    vec3 N = normalize(u_camRight.xyz * lx + u_camUp.xyz * ly - moon * nz);
    float lam = max(dot(N, sun), 0.0);
    float seas = noise4(vec2(lx, ly) * 0.31 + 0.5).g * 0.6 + noise4(vec2(lx, ly) * 0.85 + 0.2).b * 0.4;
    float alb = mix(0.5, 1.0, smoothstep(0.38, 0.6, seas));
    vec3 mc = u_moonCol * (pow(lam, 0.8) * alb + 0.03);
    col = mix(col, mc, u_moonDir.w);
    ramp = R_BONE; fixedG = -1.0; under = 0.42; solid = 2.0; addCol = vec3(0.0);
  }

  // --- clouds: the same field that shades the ground
  if (u_misc.z > 0.01 && el > 0.004) {
    float tpl = (u_counts.z - u_camPos.y) / el;
    vec2 cxz = u_camPos.xz + rd.xz * tpl;
    float dn = cloudDensity(cxz) * exp(-tpl * 0.00009);
    if (dn > 0.004) {
      float dn2 = cloudDensity(cxz + sun.xz * 300.0);
      float shade = clamp(1.0 - dn2 * 0.8 + (1.0 - dn) * 0.35, 0.0, 1.0);
      vec3 cc = mix(u_cloudDark, u_cloudLit, shade * (0.55 + 0.45 * hz));
      cc += u_glowCol * pow(sd, 9.0) * 0.9 * (1.0 - dn * 0.7);
      cc += u_flash.w * vec3(0.7, 0.8, 1.0) * (0.3 + noise4(cxz * 0.0005 + TIME * 0.31).r);
      float a = smoothstep(0.0, 0.5, dn);
      if (solid == 1.0) a *= 0.55;
      col = mix(col, cc, a);
      addCol *= 1.0 - a;
      if (a > 0.3 && solid == 0.0) { ramp = R_CLOUD; fixedG = -1.0; under = mix(u_skyUnder, 0.5, a); }
    }
  }

  // --- ranges beyond the edge of the map, and the haze below the horizon
  float az = atan(rd.z, rd.x);
  float ridge = 0.003 + 0.03 * noise4(vec2(az * 0.52, 0.37)).r * noise4(vec2(az * 0.17, 0.11)).b * 1.8
              + 0.008 * noise4(vec2(az * 2.3, 0.71)).g;
  ridge = mix(ridge, floor(ridge * 140.0) / 140.0, 0.7); // flat-topped: mesa country
  vec3 fogc = u_fogColor.rgb + u_sunColor.rgb * (pow(sd, 6.0) * u_fogParams.z * u_sunDisk.w);
  if (el < ridge) {
    vec3 mc = mix(fogc, u_skyZenith.rgb * 0.45 + fogc * 0.2, 0.5);
    col = mix(mc, fogc, clamp(1.0 - el / max(ridge, 1e-4), 0.0, 1.0) * 0.7);
    ramp = R_ROCK; addCol = vec3(0.0); under = u_skyUnder * 0.8;
    fixedG = -1.0; solid = 3.0;
  }
  if (el < 0.0) { col = fogc; ramp = R_SAND; }

  col *= EXPOSURE;
  float baseL = luma(col);
  col += addCol;
  under *= (baseL + 0.002) / (luma(col) + 0.002);   // stars light the ink, not the cell behind it
  float L = luma(col);
  float lev = pow(clamp(L, 0.0, 1.0), u_world.w) * 15.0 * (solid > 0.0 || ramp == R_CLOUD ? 1.0 : 0.6);
  // a slow breathing in the grain of the sky
  lev += (noise4(cell / 96.0 + vec2(TIME * 0.003, TIME * 0.0017)).a - 0.5) * 2.6 + (hsh.z - 0.5) * 0.9;
  lev = clamp(lev, 0.0, 15.0);
  float l0 = floor(lev);
  float g0 = rampGlyph(ramp, l0), g1 = rampGlyph(ramp, min(l0 + 1.0, 15.0));
  float tm = g0 == g1 ? 0.0 : smoothstep(0.3, 0.7, lev - l0);
  if (fixedG >= 0.0) { g0 = fixedG; g1 = fixedG; tm = 0.0; }
  o_col = vec4(col, under);
  o_gl = vec4(g0, g1, tm, 0.0);
}`;

const RESOLVE_FS = HEADER + `
uniform sampler2D u_tex0, u_tex1;
uniform vec2 u_cs;
out vec4 o;
void main(){
  vec2 cf = gl_FragCoord.xy / u_cs;
  ivec2 ci = ivec2(cf);
  vec2 cu = fract(cf);
  vec4 c = texelFetch(u_tex0, ci, 0);
  vec4 g = texelFetch(u_tex1, ci, 0);
  vec2 uv = vec2(cu.x, 1.0 - cu.y);
  float tpp = 96.0 / u_cs.y;
  float lod = max(log2(tpp) - 0.35, 0.0);
  float d = textureLod(u_atlas, vec3(uv, g.x), lod).r;
  if (g.z > 0.004) d = mix(d, textureLod(u_atlas, vec3(uv, g.y), lod).r, g.z);
  float aa = clamp(tpp / 32.0 * 1.15, 0.02, 0.5);
  float a = smoothstep(0.5 - aa, 0.5 + aa, d);
  o = vec4(c.rgb * mix(c.a, 1.0, a), 1.0);
}`;

export class Sky {
  constructor(gl) {
    this.gl = gl;
    this.cellProg = new Program(gl, 'skyCells', FS_TRI, CELL_FS);
    this.resolveProg = new Program(gl, 'skyResolve', FS_TRI, RESOLVE_FS);
    this.fb = null;
    this.starRot = new Float32Array(9);
    this.under = 0.3;
  }

  resize(w, h, cellW) {
    const gl = this.gl;
    this.cs = [cellW, cellW * 1.5];
    const cw = Math.ceil(w / this.cs[0]) + 1, ch = Math.ceil(h / this.cs[1]) + 1;
    if (this.fb) {
      gl.deleteFramebuffer(this.fb);
      gl.deleteTexture(this.t0);
      gl.deleteTexture(this.t1);
    }
    const mk = () => texture(gl, { w: cw, h: ch, internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.NEAREST });
    this.t0 = mk();
    this.t1 = mk();
    this.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.t0, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.t1, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.cw = cw;
    this.ch = ch;
  }

  // Pass 1: decide every cell. Call before binding the scene target.
  update(env, time) {
    const gl = this.gl;
    // the celestial sphere turns slowly about a tilted pole
    const a = time * 0.004 + env.sun[0] * 0.5, c = Math.cos(a), s = Math.sin(a);
    const t = 0.6, ct = Math.cos(t), st = Math.sin(t);
    this.starRot.set([c, s * ct, s * st, -s, c * ct, c * st, 0, -st, ct]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.cw, this.ch);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const p = this.cellProg.use();
    p.f2('u_cs', this.cs[0], this.cs[1]);
    p.f3('u_sunDiscCol', ...env.sunDisc).f3('u_glowCol', ...env.glow);
    p.f3('u_moonCol', 0.95, 0.97, 1.0);
    p.f3('u_cloudLit', ...env.cloudLit).f3('u_cloudDark', ...env.cloudDark);
    p.f1('u_sunRad', env.sunRad).f1('u_moonRad', 0.052).f1('u_skyUnder', this.under);
    gl.uniformMatrix3fv(p.u('u_starRot'), false, this.starRot);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Pass 2: stamp the glyphs onto the current target.
  draw() {
    const gl = this.gl;
    bindTex(gl, UNIT.u_tex0, this.t0);
    bindTex(gl, UNIT.u_tex1, this.t1);
    this.resolveProg.use().f2('u_cs', this.cs[0], this.cs[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
