// SUNDOWN engine core: owns the GL context, the per-frame uniform block and the pass order.
//
//   sky cells -> [scene HDR target] sky stamp, proxies + backed glyph cards (opaque, depth),
//   ink (lighten blend, depth-tested), light (additive) -> bloom / shafts / grade -> screen

import { createGL, texture, bindTex, UNIT } from './gl.js';
import { buildAtlas } from './atlas.js';
import { F, MAX_LIGHTS, MAX_DISTURB } from './glsl.js';
import { Camera } from './camera.js';
import { Atmosphere } from './atmosphere.js';
import { Terrain, S0 } from './terrain.js';
import { Sky } from './sky.js';
import { Post } from './post.js';
import { Shadows } from './shadows.js';
import { noiseTextureData } from '../world/noise.js';

export class Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const gl = (this.gl = createGL(canvas));
    this.opts = Object.assign({ glyphPx: 8, maxDpr: 2, sizeFactor: 1.8 }, opts);
    this.cam = new Camera();
    this.atmo = new Atmosphere();
    this.time = 0;
    this.frameData = new Float32Array(F.SIZE);
    this.ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, this.frameData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);
    this.lights = []; // {pos:[x,y,z], radius, color:[r,g,b], flicker}
    this.disturbers = []; // {x, z, radius, strength}
    this.layers = []; // objects with draw hooks: opaque(), ink(), light(), occluders()
    this.underglow = 0.11;
    this.inkGamma = 0.72;
    this.levelGamma = 0.46;
    this.stats = { field: 0, proxies: 0, glyphs: 0 };
  }

  init(land) {
    const gl = this.gl;
    this.land = land;
    this.atlas = buildAtlas(gl);
    this.noiseTex = texture(gl, {
      w: 256, h: 256, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE,
      data: noiseTextureData(256, 8), wrap: gl.REPEAT, mips: true,
    });
    // "no shadow" stand-ins until the shadow system provides real maps
    const none = new Float32Array([-1e4, 0, 0, 0]);
    this.noShadow = texture(gl, { w: 1, h: 1, internal: gl.RGBA16F, format: gl.RGBA, type: gl.FLOAT, data: none, filter: gl.NEAREST });
    this.shadowG = this.noShadow;
    this.shadowL = this.noShadow;
    this.shadowWin = [0, 0, 1, 0];
    this.terrain = new Terrain(gl, land);
    this.sky = new Sky(gl);
    this.post = new Post(gl);
    this.F_shadowWin = F.shadowWin;
    this.shadows = new Shadows(gl, this);
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr);
    const w = Math.max(2, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(2, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = w;
    this.canvas.height = h;
    this.post.resize(w, h);
    this.sky.resize(w, h, Math.round(this.opts.glyphPx * dpr * 1.15));
  }

  bindShared() {
    const gl = this.gl;
    bindTex(gl, UNIT.u_atlas, this.atlas.tex, gl.TEXTURE_2D_ARRAY);
    bindTex(gl, UNIT.u_ramps, this.atlas.ramps);
    bindTex(gl, UNIT.u_noise, this.noiseTex);
    bindTex(gl, UNIT.u_shadowG, this.shadowG);
    bindTex(gl, UNIT.u_shadowL, this.shadowL);
    this.terrain.bind();
  }

  writeFrame() {
    const f = this.frameData, cam = this.cam, e = this.atmo.env, atmo = this.atmo;
    const focal = this.h / 2 / Math.tan(cam.fovY / 2);
    this.focal = focal;
    this.lodC = (this.opts.glyphPx * this.dpr) / focal;
    f.set(cam.viewProj, F.viewProj);
    f.set(cam.view, F.view);
    const put = (o, a, b, c, d) => { f[o] = a; f[o + 1] = b; f[o + 2] = c; f[o + 3] = d; };
    put(F.camPos, cam.eye[0], cam.eye[1], cam.eye[2], this.time);
    put(F.camRight, cam.right[0], cam.right[1], cam.right[2], focal);
    put(F.camUp, cam.up[0], cam.up[1], cam.up[2], 0);
    put(F.camFwd, cam.fwd[0], cam.fwd[1], cam.fwd[2], e.exposure);
    put(F.viewport, this.w, this.h, 1 / this.w, 1 / this.h);
    put(F.sunDir, e.keyDir[0], e.keyDir[1], e.keyDir[2], e.keyInt);
    put(F.sunColor, e.keyCol[0], e.keyCol[1], e.keyCol[2], 0);
    put(F.ambSky, e.ambSky[0], e.ambSky[1], e.ambSky[2], this.underglow);
    put(F.ambGround, e.ambGnd[0], e.ambGnd[1], e.ambGnd[2], e.wet);
    put(F.fogColor, e.fogCol[0], e.fogCol[1], e.fogCol[2], e.fogDensity);
    put(F.fogParams, 0.006, 10, 0.5, e.dust);
    put(F.wind, atmo.windDir[0], atmo.windDir[1], e.wind, atmo.windPhase);
    put(F.misc, atmo.flash, e.night, e.cloud, e.heat);
    put(F.shadowWin, this.shadowWin[0], this.shadowWin[1], this.shadowWin[2], this.shadowWin[3]);
    put(F.world, this.land.size, 1 / this.land.size, this.inkGamma, this.levelGamma);
    put(F.sunDisk, e.sun[0], e.sun[1], e.sun[2], e.sunVis);
    put(F.moonDir, e.moon[0], e.moon[1], e.moon[2], e.moonVis);
    put(F.skyZenith, e.zenith[0], e.zenith[1], e.zenith[2], e.stars);
    put(F.skyHorizon, e.horizon[0], e.horizon[1], e.horizon[2], 0);
    put(F.flash, atmo.flashPos[0], atmo.flashPos[1], atmo.flashPos[2], atmo.flash);
    put(F.lod, this.lodC, S0, this.opts.sizeFactor, 5 * this.dpr);
    // nearest lights first; the rest are dropped
    const L = this.lights;
    if (L.length > MAX_LIGHTS) {
      const t = cam.target;
      L.sort((a, b) => Math.hypot(a.pos[0] - t[0], a.pos[2] - t[2]) - a.radius - (Math.hypot(b.pos[0] - t[0], b.pos[2] - t[2]) - b.radius));
    }
    const nl = Math.min(L.length, MAX_LIGHTS);
    for (let i = 0; i < nl; i++) {
      const l = L[i];
      let k = l.intensity ?? 1;
      if (l.flicker) {
        const ph = this.time * 9 + (l.seed || 0);
        k *= 1 - l.flicker * (0.5 + 0.25 * Math.sin(ph) + 0.15 * Math.sin(ph * 2.7 + 1.3) + 0.1 * Math.sin(ph * 6.1));
      }
      if (l.nightOnly) k *= e.night;
      put(F.lightPos + i * 4, l.pos[0], l.pos[1], l.pos[2], l.radius);
      put(F.lightCol + i * 4, l.color[0] * k, l.color[1] * k, l.color[2] * k, 0);
    }
    const D = this.disturbers, nd = Math.min(D.length, MAX_DISTURB);
    for (let i = 0; i < nd; i++) put(F.disturb + i * 4, D[i].x, D[i].z, D[i].radius, D[i].strength);
    put(F.counts, nl, nd, 900, 0);
    const gl = this.gl;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, f);
  }

  render(dt) {
    const gl = this.gl;
    this.time += dt;
    this.resize();
    this.atmo.update(dt);
    const env = this.atmo.env, cam = this.cam;
    cam.update(this.w / this.h, this.land);
    for (const l of this.layers) l.update && l.update(dt, this);
    this.writeFrame();
    this.bindShared();
    this.terrain.cull(cam, this.lodC);
    this.stats.field = this.terrain.instances;
    this.stats.proxies = this.terrain.nProxy;
    this.stats.glyphs = 0;

    this.shadows.update(this);
    for (const l of this.layers) l.prepass && l.prepass(this);
    this.bindShared();

    this.sky.update(env, this.time);
    this.post.begin();
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    this.sky.draw();

    // opaque: the dark "paper" of the land and every backed glyph card
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    this.terrain.drawProxies();
    for (const l of this.layers) l.opaque && l.opaque(this);

    // ink: order-independent lighten blend, tested against depth but never writing it
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.terrain.drawGround();
    this.terrain.drawStrokes();
    for (const l of this.layers) l.ink && l.ink(this);

    // light: additive glyphs (fire, rain, sparks, lightning)
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (const l of this.layers) l.light && l.light(this);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.bindVertexArray(null);

    let sunUV = null, sunStrength = 0;
    if (env.sunVis > 0.01) {
      const s = env.sun;
      const p = cam.project([cam.eye[0] + s[0] * 1000, cam.eye[1] + s[1] * 1000, cam.eye[2] + s[2] * 1000]);
      if (p && p[0] > -0.4 && p[0] < 1.4 && p[1] > -0.4 && p[1] < 1.4) {
        sunUV = p;
        sunStrength = env.sunVis * (0.35 + 0.65 * Math.max(0, 1 - s[1] * 2.2)) * (1 - this.atmo.w.dim * 0.8);
      }
    }
    this.post.end(sunUV, sunStrength, cam.near, cam.far);
  }
}
