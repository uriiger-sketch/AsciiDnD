// Shadows as height fields.
//
// For every ground texel we store the height below which a point is in shadow. One texture
// lookup then shadows anything at any height - grass, a hat brim, a cliff - with no shadow
// cameras and no cascades to tune. Two maps: the whole land (terrain only, marched far), and a
// sharp window that follows the camera and includes every glyph object as an occluder.

import { Program, texture, bindTex, UNIT, FS_TRI } from './gl.js';
import { HEADER } from './glsl.js';

const GLOBAL_FS = HEADER + `
in vec2 v_uv; out vec4 o;
void main(){
  vec3 L = u_sunDir.xyz;
  vec2 xz = (v_uv - 0.5) * u_world.x;
  float lh = max(length(L.xz), 1e-4);
  float tanE = L.y / lh;
  vec2 dir = L.xz / lh;
  float S = -1e4, dist = 0.0, t = 4.0;
  t += 2.0 * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  for (int i = 0; i < 96; i++) {
    float h = textureLod(u_th, (xz + dir * t) * u_world.y + 0.5, 0.0).r;
    float sv = h - t * tanE;
    if (sv > S) { S = sv; dist = t; }
    t = t * 1.045 + 2.0;
  }
  o = vec4(S, dist, 0.0, 1.0);
}`;

const LOCAL_FS = HEADER + `
uniform sampler2D u_tex0;  // tops of every occluder in the window (world y), -1e4 where empty
uniform float u_texels;
in vec2 v_uv; out vec4 o;
void main(){
  vec3 L = u_sunDir.xyz;
  float lh = max(length(L.xz), 1e-4);
  float tanE = L.y / lh;
  vec2 dir = L.xz / lh;
  dir /= max(abs(dir.x), abs(dir.y));          // one texel along the major axis per step
  float stepM = length(dir) * u_shadowWin.z / u_texels;
  vec2 duv = dir / u_texels;
  float S = -1e4, dist = 0.0;
  vec2 uv = v_uv;
  for (int i = 1; i <= 110; i++) {
    uv += duv;
    float top = textureLod(u_tex0, uv, 0.0).r;
    float t = float(i) * stepM;
    float sv = top - t * tanE;
    if (top > -5000.0 && sv > S) { S = sv; dist = t; }
  }
  o = vec4(S, dist, 0.0, 1.0);
}`;

export class Shadows {
  constructor(gl, engine) {
    this.gl = gl;
    this.engine = engine;
    this.ok = gl.caps.colorFloat || gl.caps.colorHalf;
    if (!this.ok) return;
    const mk = (n, filter) => {
      const t = texture(gl, { w: n, h: n, internal: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT, filter });
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t, fb, n };
    };
    this.G = mk(1024, gl.LINEAR);
    this.Lmap = mk(512, gl.LINEAR);
    // occluder tops: nearest-filtered, with a depth buffer so the highest glyph wins
    this.O = mk(512, gl.NEAREST);
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, 512, 512);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.O.fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.progG = new Program(gl, 'shadowGlobal', FS_TRI, GLOBAL_FS);
    this.progL = new Program(gl, 'shadowLocal', FS_TRI, LOCAL_FS);
    this.lastDir = [0, 0, 0];
    this.strip = 0;
    this.strips = 6;
    this.pending = 0;
    this.winSize = 204.8;
    this.localEnabled = true;
    engine.shadowG = this.G.t;
    engine.shadowL = this.Lmap.t;
  }

  setEnabled(on) {
    this.enabled = on;
    const e = this.engine;
    e.shadowG = on && this.ok ? this.G.t : e.noShadow;
    e.shadowL = on && this.ok ? this.Lmap.t : e.noShadow;
    if (!on) e.shadowWin = [0, 0, 1, 0];
    this.lastDir = [0, 0, 0];
  }

  update(engine) {
    if (!this.ok || this.enabled === false) return;
    const gl = this.gl, e = engine.atmo.env;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    // --- whole-land map: refresh all at once after a jump in time, otherwise a strip per frame
    const d = e.keyDir, l = this.lastDir;
    const dot = d[0] * l[0] + d[1] * l[1] + d[2] * l[2];
    const lit = e.keyInt > 0.0005;
    if (lit && dot < 0.99999995) {
      const full = dot < 0.9995;
      if (full) this.pending = 0;
      else if (this.pending === 0) this.pending = this.strips;
      if (full || this.pending > 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.G.fb);
        gl.viewport(0, 0, this.G.n, this.G.n);
        if (!full) {
          const h = Math.ceil(this.G.n / this.strips);
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(0, this.strip * h, this.G.n, h);
          this.strip = (this.strip + 1) % this.strips;
          this.pending--;
        }
        this.progG.use();
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.SCISSOR_TEST);
        if (full || this.pending === 0) this.lastDir = d.slice();
      }
    }

    // --- camera-following window: draw every occluder's top, then march it toward the light
    if (this.localEnabled && lit) {
      const size = this.winSize, snap = size / this.O.n * 8;
      const t = engine.cam.target;
      const ox = Math.round(t[0] / snap) * snap - size / 2, oz = Math.round(t[2] / snap) * snap - size / 2;
      engine.shadowWin = [ox, oz, size, 1 / size];
      engine.frameData.set(engine.shadowWin, engine.F_shadowWin);
      gl.bindBuffer(gl.UNIFORM_BUFFER, engine.ubo);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, engine.frameData);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.O.fb);
      gl.viewport(0, 0, this.O.n, this.O.n);
      gl.depthMask(true);
      gl.clearColor(-1e4, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      for (const layer of engine.layers) layer.occluders && layer.occluders(engine);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.Lmap.fb);
      gl.viewport(0, 0, this.Lmap.n, this.Lmap.n);
      bindTex(gl, UNIT.u_tex0, this.O.t);
      this.progL.use().f1('u_texels', this.O.n);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.clearColor(0, 0, 0, 0);
    } else {
      engine.shadowWin = [0, 0, 1, 0];
    }
    gl.depthMask(true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
