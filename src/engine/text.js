// Live text in the world: glyphs written afresh every frame from game code. Used for signs
// whose letters can be pried off, names over heads, words flying between people, marks on
// the ground. Everything here is drawn by the same shaders as the rest of the glyph objects.

import { GlyphBuffer, FLAG, STRIDE, makeVAO, batchPrograms } from './batch.js';
import { G } from './atlas.js';
import { m4 } from './math.js';

export const TEXT_ADV = 0.52; // advance per character, as a fraction of glyph height

export class TextLayer {
  constructor(gl) {
    this.gl = gl;
    this.progs = batchPrograms(gl);
    this.inkBuf = new GlyphBuffer(4096);
    this.cardBuf = new GlyphBuffer(1024);
    this.inkVbo = gl.createBuffer();
    this.cardVbo = gl.createBuffer();
    this.inkVao = makeVAO(gl, this.inkVbo, 0);
    this.cardVao = makeVAO(gl, this.cardVbo, 0);
    this.identity = m4.create();
    this.cam = null;
  }

  begin(cam) {
    this.inkBuf.count = 0;
    this.cardBuf.count = 0;
    this.cam = cam;
  }

  // One glyph facing the camera. o: { emis, lit, card }
  glyph(ch, x, y, z, size, col, o = {}) {
    (o.card ? this.cardBuf : this.inkBuf).push(x, y, z, size, col[0], col[1], col[2], o.emis ?? 0, 0, 1, 0, 0,
      typeof ch === 'number' ? ch : G(ch), FLAG.TWO_SIDED | (o.lit ? 0 : FLAG.UNLIT), 0, 128);
  }

  // A line of text facing the camera, centred on (x, y, z). o.pull moves it toward the eye
  // by that many metres so nearby posts and eaves do not cut it.
  line(text, x, y, z, size, col, o = {}) {
    if (o.pull) {
      const e = this.cam.eye, dx = e[0] - x, dy = e[1] - y, dz = e[2] - z, l = Math.hypot(dx, dy, dz) || 1, k = Math.min(o.pull, l * 0.5) / l;
      x += dx * k; y += dy * k; z += dz * k; size *= 1 - k;
    }
    const r = this.cam.right, adv = size * TEXT_ADV, x0 = (-(text.length - 1) * adv) / 2;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') continue;
      const t = x0 + i * adv;
      this.glyph(text[i], x + r[0] * t, y + r[1] * t, z + r[2] * t, size, col, o);
    }
  }

  // A glyph lying in a plane with normal n (signs, marks on the ground).
  planar(ch, p, n, size, col, emis = 0, lit = true) {
    this.inkBuf.push(p[0], p[1], p[2], size, col[0], col[1], col[2], emis, n[0], n[1], n[2], 0, G(ch),
      FLAG.PLANAR | (lit ? 0 : FLAG.UNLIT), 0, 128);
  }

  flush() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inkVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.inkBuf.u8.subarray(0, Math.max(1, this.inkBuf.count) * STRIDE), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cardVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.cardBuf.u8.subarray(0, Math.max(1, this.cardBuf.count) * STRIDE), gl.DYNAMIC_DRAW);
  }

  _draw(prog, vao, n) {
    if (!n) return;
    const gl = this.gl;
    prog.use().m4('u_model', this.identity).f4('u_lodP', 1e12, 1, 0, 0);
    gl.bindVertexArray(vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }
  opaque() { this._draw(this.progs.card, this.cardVao, this.cardBuf.count); }
  ink() { this._draw(this.progs.ink, this.inkVao, this.inkBuf.count); }
}
