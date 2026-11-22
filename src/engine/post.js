// HDR post chain: bloom (so fire, sun and lightning actually glow through the type),
// light shafts from the sun, heat shimmer, filmic tone mapping, grade, vignette, grain.

import { Program, target, freeTarget, hdrFormat, bindTex, UNIT, FS_TRI } from './gl.js';
import { HEADER } from './glsl.js';

const DOWN_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex0;
uniform vec2 u_texel;
uniform float u_first;
in vec2 v_uv; out vec4 o;
void main(){
  vec3 a = texture(u_tex0, v_uv + u_texel * vec2(-1.0, -1.0)).rgb;
  vec3 b = texture(u_tex0, v_uv + u_texel * vec2( 1.0, -1.0)).rgb;
  vec3 c = texture(u_tex0, v_uv + u_texel * vec2(-1.0,  1.0)).rgb;
  vec3 d = texture(u_tex0, v_uv + u_texel * vec2( 1.0,  1.0)).rgb;
  if (u_first > 0.5) {
    // soft threshold + luminance-weighted average: bright ink blooms, single hot pixels don't sparkle
    vec4 w = 1.0 / (1.0 + vec4(dot(a, vec3(0.33)), dot(b, vec3(0.33)), dot(c, vec3(0.33)), dot(d, vec3(0.33))));
    vec3 m = (a * w.x + b * w.y + c * w.z + d * w.w) / (w.x + w.y + w.z + w.w);
    float l = max(m.r, max(m.g, m.b));
    o = vec4(m * smoothstep(0.35, 1.3, l), 1.0);
  } else {
    o = vec4((a + b + c + d) * 0.25, 1.0);
  }
}`;

const UP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex0;
uniform vec2 u_texel;
in vec2 v_uv; out vec4 o;
void main(){
  vec3 s = texture(u_tex0, v_uv).rgb * 4.0;
  s += (texture(u_tex0, v_uv + u_texel * vec2(-1.0, 0.0)).rgb + texture(u_tex0, v_uv + u_texel * vec2(1.0, 0.0)).rgb
      + texture(u_tex0, v_uv + u_texel * vec2(0.0, -1.0)).rgb + texture(u_tex0, v_uv + u_texel * vec2(0.0, 1.0)).rgb) * 2.0;
  s += texture(u_tex0, v_uv + u_texel * vec2(-1.0, -1.0)).rgb + texture(u_tex0, v_uv + u_texel * vec2(1.0, -1.0)).rgb
     + texture(u_tex0, v_uv + u_texel * vec2(-1.0, 1.0)).rgb + texture(u_tex0, v_uv + u_texel * vec2(1.0, 1.0)).rgb;
  o = vec4(s / 16.0, 1.0);
}`;

// Light shafts: smear the bright sky toward the sun; whatever stands in front cuts dark fingers.
const RAYS_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex0, u_tex3;
uniform vec2 u_sunUV;
uniform float u_amount;
in vec2 v_uv; out vec4 o;
void main(){
  vec2 d = (u_sunUV - v_uv);
  float dist = length(d);
  vec2 stepv = d / 28.0 * min(1.0, 0.75 / max(dist, 1e-3));
  vec3 acc = vec3(0.0);
  vec2 uv = v_uv;
  float w = 1.0, ws = 0.0;
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  uv += stepv * jit;
  for (int i = 0; i < 28; i++) {
    float z = texture(u_tex3, uv).r;
    vec3 c = texture(u_tex0, uv).rgb;
    float sky = step(0.999999, z);
    acc += c * sky * w * smoothstep(0.4, 2.5, max(c.r, max(c.g, c.b)));
    ws += w;
    w *= 0.965;
    uv += stepv;
  }
  o = vec4(acc / ws * u_amount, 1.0);
}`;

const COMPOSITE_FS = HEADER + `
uniform sampler2D u_tex0, u_tex1, u_tex2, u_tex3;
uniform vec4 u_grade;   // bloom, rays, saturation, contrast
uniform vec4 u_tint;    // rgb tint, vignette
uniform vec2 u_nearFar;
in vec2 v_uv; out vec4 o;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = v_uv;
  float heat = u_misc.w;
  if (heat > 0.002) {
    float z = texture(u_tex3, uv).r;
    float lin = u_nearFar.x * u_nearFar.y / (u_nearFar.y - z * (u_nearFar.y - u_nearFar.x));
    float m = smoothstep(60.0, 700.0, lin) * (1.0 - 0.75 * step(0.999999, z));
    uv += vec2(sin(uv.y * 210.0 + TIME * 7.0 + sin(uv.x * 31.0 + TIME * 1.7) * 2.0),
               sin(uv.x * 160.0 + TIME * 5.3) * 0.35) * (heat * m * 0.0016);
  }
  vec2 dc = uv - 0.5;
  float r2 = dot(dc, dc);
  vec3 c = texture(u_tex0, uv).rgb;
  c.r = texture(u_tex0, uv + dc * r2 * 0.003).r;
  c.b = texture(u_tex0, uv - dc * r2 * 0.003).b;
  c += texture(u_tex1, uv).rgb * u_grade.x + texture(u_tex2, uv).rgb * u_grade.y;
  c = aces(c * 1.05);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // night: what the moon lights goes blue and quiet; firelight keeps its colour
  c = mix(c, vec3(l) * vec3(0.5, 0.74, 1.3), NIGHT * 0.8 * (1.0 - smoothstep(0.1, 0.42, l + max(c.r - c.b, 0.0) * 1.2)));
  c = mix(vec3(l), c, u_grade.z);
  c = (c - 0.5) * u_grade.w + 0.5;
  c *= u_tint.rgb;
  c *= 1.0 - smoothstep(0.12, 0.85, r2) * u_tint.a;
  float n = fract(sin(dot(gl_FragCoord.xy + fract(TIME) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * 0.022;
  o = vec4(pow(max(c, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;

export class Post {
  constructor(gl) {
    this.gl = gl;
    this.down = new Program(gl, 'bloomDown', FS_TRI, DOWN_FS);
    this.up = new Program(gl, 'bloomUp', FS_TRI, UP_FS);
    this.rays = new Program(gl, 'rays', FS_TRI, RAYS_FS);
    this.comp = new Program(gl, 'composite', FS_TRI, COMPOSITE_FS);
    this.mips = [];
    this.scene = null;
    this.bloom = 0.55;
    this.raysAmount = 0.6;
    this.saturation = 1.08;
    this.contrast = 1.06;
    this.vignette = 0.62;
    this.tint = [1, 1, 1];
    this.enableBloom = true;
    this.enableRays = true;
  }

  resize(w, h) {
    const gl = this.gl;
    freeTarget(gl, this.scene);
    this.mips.forEach((m) => freeTarget(gl, m));
    freeTarget(gl, this.rayT);
    const f = hdrFormat(gl);
    this.scene = target(gl, w, h, { ...f, depthTexture: true });
    this.mips = [];
    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < 6 && mw > 8 && mh > 8; i++) {
      this.mips.push(target(gl, mw, mh, f));
      mw >>= 1;
      mh >>= 1;
    }
    this.rayT = target(gl, Math.max(w >> 2, 8), Math.max(h >> 2, 8), f);
    this.w = w;
    this.h = h;
  }

  begin() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
    gl.viewport(0, 0, this.w, this.h);
  }

  // sunUV: sun position on screen (0..1) or null when it is behind the camera / below ground
  end(sunUV, sunStrength, near, far) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    const mips = this.mips;
    let useBloom = this.enableBloom && mips.length > 1;
    if (useBloom) {
      this.down.use();
      let src = this.scene;
      for (let i = 0; i < mips.length; i++) {
        const dst = mips[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        bindTex(gl, UNIT.u_tex0, src.color);
        this.down.f2('u_texel', 0.5 / src.w, 0.5 / src.h).f1('u_first', i === 0 ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = dst;
      }
      this.up.use();
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = mips.length - 1; i > 0; i--) {
        const dst = mips[i - 1], s = mips[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        bindTex(gl, UNIT.u_tex0, s.color);
        this.up.f2('u_texel', 1 / s.w, 1 / s.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
    }
    const useRays = this.enableRays && sunUV && sunStrength > 0.01;
    if (useRays) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.rayT.fb);
      gl.viewport(0, 0, this.rayT.w, this.rayT.h);
      bindTex(gl, UNIT.u_tex0, this.scene.color);
      bindTex(gl, UNIT.u_tex3, this.scene.depth);
      this.rays.use().f2('u_sunUV', sunUV[0], sunUV[1]).f1('u_amount', sunStrength);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    bindTex(gl, UNIT.u_tex0, this.scene.color);
    bindTex(gl, UNIT.u_tex1, mips[0].color);
    bindTex(gl, UNIT.u_tex2, this.rayT.color);
    bindTex(gl, UNIT.u_tex3, this.scene.depth);
    const n = mips.length;
    this.comp.use()
      .f4('u_grade', useBloom ? this.bloom / Math.max(n - 1, 1) * 1.6 : 0, useRays ? this.raysAmount : 0, this.saturation, this.contrast)
      .f4('u_tint', this.tint[0], this.tint[1], this.tint[2], this.vignette)
      .f2('u_nearFar', near, far);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
  }
}
