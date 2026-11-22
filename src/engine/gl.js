// Thin WebGL2 helpers: programs with a shared Frame UBO and fixed sampler units,
// textures, framebuffers. Nothing clever, just less typing.

// Fixed texture units shared by every world shader.
export const UNIT = {
  u_atlas: 0,
  u_ramps: 1,
  u_th: 2,
  u_tcol: 3,
  u_tmask: 4,
  u_noise: 5,
  u_shadowG: 6,
  u_shadowL: 7,
  u_tiles: 8,
  u_tex0: 9,
  u_tex1: 10,
  u_tex2: 11,
  u_tex3: 12,
};

export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 is not available on this device.');
  const caps = {
    colorFloat: !!gl.getExtension('EXT_color_buffer_float'),
    colorHalf: !!gl.getExtension('EXT_color_buffer_half_float'),
    floatLinear: !!gl.getExtension('OES_texture_float_linear'),
  };
  caps.hdr = caps.colorFloat || caps.colorHalf;
  gl.caps = caps;
  return gl;
}

function compile(gl, type, src, name) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const lines = src.split('\n').map((l, i) => `${String(i + 1).padStart(4)}: ${l}`);
    const m = /ERROR: \d+:(\d+)/.exec(log);
    const at = m ? +m[1] : 1;
    console.error(`[${name}] shader compile error:\n${log}\n` + lines.slice(Math.max(0, at - 6), at + 4).join('\n'));
    throw new Error(`Shader compile failed (${name}): ${log}`);
  }
  return sh;
}

export class Program {
  constructor(gl, name, vs, fs) {
    this.gl = gl;
    this.name = name;
    const p = (this.p = gl.createProgram());
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, name + '.vs'));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, name + '.fs'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Program link failed (${name}): ${gl.getProgramInfoLog(p)}`);
    }
    const bi = gl.getUniformBlockIndex(p, 'Frame');
    if (bi !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, bi, 0);
    this.loc = {};
    gl.useProgram(p);
    for (const k in UNIT) {
      const l = gl.getUniformLocation(p, k);
      if (l) gl.uniform1i(l, UNIT[k]);
    }
  }
  use() {
    this.gl.useProgram(this.p);
    return this;
  }
  u(name) {
    let l = this.loc[name];
    if (l === undefined) l = this.loc[name] = this.gl.getUniformLocation(this.p, name);
    return l;
  }
  f1(n, a) { this.gl.uniform1f(this.u(n), a); return this; }
  f2(n, a, b) { this.gl.uniform2f(this.u(n), a, b); return this; }
  f3(n, a, b, c) { this.gl.uniform3f(this.u(n), a, b, c); return this; }
  f4(n, a, b, c, d) { this.gl.uniform4f(this.u(n), a, b, c, d); return this; }
  i1(n, a) { this.gl.uniform1i(this.u(n), a); return this; }
  m4(n, m) { this.gl.uniformMatrix4fv(this.u(n), false, m); return this; }
  attrib(n) { return this.gl.getAttribLocation(this.p, n); }
}

export function texture(gl, o) {
  const target = o.target || gl.TEXTURE_2D;
  const t = gl.createTexture();
  gl.bindTexture(target, t);
  const filter = o.filter ?? gl.LINEAR;
  const mag = filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, o.mips ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, mag);
  const wrap = o.wrap ?? gl.CLAMP_TO_EDGE;
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrap);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  if (target === gl.TEXTURE_2D) {
    gl.texImage2D(target, 0, o.internal, o.w, o.h, 0, o.format, o.type, o.data ?? null);
  } else {
    gl.texImage3D(target, 0, o.internal, o.w, o.h, o.layers, 0, o.format, o.type, o.data ?? null);
  }
  if (o.mips) gl.generateMipmap(target);
  t.w = o.w;
  t.h = o.h;
  t.target = target;
  return t;
}

export function bindTex(gl, unit, tex, target) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(target || tex?.target || gl.TEXTURE_2D, tex);
}

// Framebuffer with one color texture and optional depth (texture or renderbuffer).
export function target(gl, w, h, o = {}) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const color = texture(gl, {
    w, h,
    internal: o.internal ?? gl.RGBA8,
    format: o.format ?? gl.RGBA,
    type: o.type ?? gl.UNSIGNED_BYTE,
    filter: o.filter ?? gl.LINEAR,
    wrap: o.wrap,
  });
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
  let depth = null;
  if (o.depthTexture) {
    depth = texture(gl, {
      w, h, internal: gl.DEPTH_COMPONENT24, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT, filter: gl.NEAREST,
    });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  } else if (o.depth) {
    depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  }
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) console.warn('framebuffer incomplete', st.toString(16), w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, color, depth, w, h };
}

export function freeTarget(gl, t) {
  if (!t) return;
  gl.deleteFramebuffer(t.fb);
  gl.deleteTexture(t.color);
  if (t.depth) {
    if (t.depth instanceof WebGLTexture) gl.deleteTexture(t.depth);
    else gl.deleteRenderbuffer(t.depth);
  }
}

// HDR color format choice (falls back to LDR if float targets are unavailable).
export function hdrFormat(gl) {
  if (gl.caps.hdr) return { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
  return { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
}

// Fullscreen triangle vertex shader (no attributes).
export const FS_TRI = `#version 300 es
precision highp float;
out vec2 v_uv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
