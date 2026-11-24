// Dark "paper" geometry behind glyph text: walls, roofs, anything that must block the view.
import { Program } from './gl.js';
import { COMMON } from './glsl.js';

const VS = COMMON + `
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_nrm;
layout(location = 2) in vec3 a_col;
out vec3 v_col;
void main(){
  vec3 v = normalize(u_camPos.xyz - a_pos);
  vec3 n = dot(a_nrm, v) < 0.0 ? -a_nrm : a_nrm;
  float sh;
  vec3 irr = irradiance(a_pos + n * 0.3, n, 0.1, sh);
  vec3 lit = a_col * irr * EXPOSURE;
  v_col = mix(lit, fogTint(-v), fogAmount(a_pos)) * UNDER;
  gl_Position = u_viewProj * vec4(a_pos, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec3 v_col; out vec4 o;
void main(){ o = vec4(v_col, 1.0); }`;

export class ProxyMesh {
  constructor(gl) {
    this.gl = gl;
    this.data = [];
    this.count = 0;
  }
  tri(a, b, c, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) this.data.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2]);
  }
  quad(a, b, c, d, col) {
    this.tri(a, b, c, col);
    this.tri(a, c, d, col);
  }
  upload() {
    const gl = this.gl;
    this.prog = new Program(gl, 'mesh', VS, FS);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.data), gl.STATIC_DRAW);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12);
    }
    gl.bindVertexArray(null);
    this.count = this.data.length / 9;
    this.data = null;
  }
  opaque() {
    if (!this.count) return;
    const gl = this.gl;
    this.prog.use();
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
  }
}
