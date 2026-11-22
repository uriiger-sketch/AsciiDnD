// Frontier architecture, typeset. A building is a set of wall and roof panels; each panel is a
// grid of glyphs lying in its plane (so a facade is literally a page of text) over a dark
// proxy quad. Windows glow after dark. Signs are real words.

import { FLAG } from '../engine/batch.js';
import { RAMP, G } from '../engine/atlas.js';
import { srgb, rng } from '../engine/math.js';
import { COL, post, strand } from './props.js';

const WARM = [1.0, 0.62, 0.26];

export class Builder {
  constructor(ink, cards, mesh, land, text) {
    this.text = text;
    this.ink = ink;
    this.cards = cards;
    this.mesh = mesh;
    this.land = land;
    this.lights = [];
    this.signs = []; // { id, text, faces: [{ c, u, n }], size, adv, col, emis, at }
    this.rects = []; // wall footprints for collision: { x, z, hw, hd, yaw }
  }

  frame(x, z, yaw, y = null) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const y0 = y ?? this.land.heightAt(x, z);
    return {
      p: (lx, ly, lz) => [x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c],
      d: (lx, ly, lz) => [lx * c + lz * s, ly, -lx * s + lz * c],
    };
  }

  // A rectangle of text. o = origin (bottom-left), u/v = unit axes, n = outward normal.
  // fn(um, vm, i, j, cols, rows) may return null (leave blank) or overrides.
  panel(F, o, u, v, n, w, h, mat, fn, proxy = true) {
    const O = F.p(...o), U = F.d(...u), V = F.d(...v), Nn = F.d(...n);
    // three sizes of type for the same wall: fine, 2x and 4x (the shader shows the legible one)
    for (let L = 0; L < 3; L++) {
      const k = 1 << L;
      const cw = (mat.cw ?? 0.31) * k, ch = (mat.ch ?? 0.46) * k;
      if (L > 0 && (w < cw * 1.5 || h < ch * 0.8)) break;
      const cols = Math.max(1, Math.round(w / cw)), rows = Math.max(1, Math.round(h / ch));
      const sw = w / cols, sh = h / rows;
      const size = sh * 1.12;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const um = (i + 0.5) * sw, vm = (j + 0.5) * sh;
          let col = mat.color, glyph = mat.ramp, flags = FLAG.PLANAR | FLAG.RAMP, emis = 0;
          if (fn) {
            const r = fn(um, vm, i, j, cols, rows, sw, sh);
            if (r === null) continue;
            if (r) {
              if (r.color) col = r.color;
              if (r.glyph !== undefined) { glyph = r.glyph; flags = FLAG.PLANAR; }
              if (r.ramp !== undefined) { glyph = r.ramp; flags = FLAG.PLANAR | FLAG.RAMP; }
              if (r.emis) { emis = r.emis; flags |= r.always ? 0 : FLAG.NIGHT; }
              if (r.shade) col = [col[0] * r.shade, col[1] * r.shade, col[2] * r.shade];
            }
          }
          this.text.push(O[0] + U[0] * um + V[0] * vm, O[1] + U[1] * um + V[1] * vm, O[2] + U[2] * um + V[2] * vm,
            size, col[0], col[1], col[2], emis, Nn[0], Nn[1], Nn[2], 0, glyph, flags);
          this.text.cls(L + 1);
        }
      }
    }
    if (proxy) {
      const a = O, b = [O[0] + U[0] * w, O[1] + U[1] * w, O[2] + U[2] * w];
      const c = [b[0] + V[0] * h, b[1] + V[1] * h, b[2] + V[2] * h], d = [O[0] + V[0] * h, O[1] + V[1] * h, O[2] + V[2] * h];
      const pc = mat.proxy || [mat.color[0] * 0.8, mat.color[1] * 0.8, mat.color[2] * 0.8];
      if (mat.tri) this.mesh.tri(a, b, [(d[0] + c[0]) / 2, (d[1] + c[1]) / 2, (d[2] + c[2]) / 2], pc);
      else this.mesh.quad(a, b, c, d, pc);
    }
  }

  // Big planar lettering centred at local (cx, cy, cz).
  sign(F, text, cx, cy, cz, u, n, size, col, emis = 0) {
    const U = F.d(...u), Nn = F.d(...n), C = F.p(cx, cy, cz);
    const face = { c: [C[0] + Nn[0] * 0.06, C[1] + Nn[1] * 0.06, C[2] + Nn[2] * 0.06], u: U, n: Nn };
    let spec = this.signs.find((s) => s.id === text);
    if (spec) spec.faces.push(face);
    else this.signs.push((spec = { id: text, text, faces: [face], size, adv: size * 0.62, col, emis, at: null }));
    return spec;
  }

  // A sign that stands on its own (a well, a headstone). Same id again adds another face.
  signAt(id, text, c, u, n, size, col, at, emis = 0.1) {
    const face = { c, u, n };
    let spec = this.signs.find((s) => s.id === id);
    if (spec) spec.faces.push(face);
    else this.signs.push((spec = { id, text, faces: [face], size, adv: size * 0.62, col, emis, at }));
    return spec;
  }

  // The classic frontier building: box, gable hidden behind a false front, porch, sign.
  building(o) {
    const { x, z, yaw, w, d, h } = o;
    const r = rng(o.seed || (x * 31 + z * 17) | 0);
    const F = this.frame(x, z, yaw, o.y);
    const wall = { color: o.wall, ramp: o.ramp ?? RAMP.WOOD };
    const trim = o.trim || [o.wall[0] * 1.35, o.wall[1] * 1.35, o.wall[2] * 1.35];
    const roofMat = { color: o.roof || COL.woodDark, ramp: RAMP.SHINGLE, ch: 0.42 };
    const rise = o.flat ? 0 : (w / 2) * (o.pitch ?? 0.5);
    const hf = o.falseFront === false ? h : h + rise + (o.crown ?? 1.0);
    const stories = o.stories || 1;
    const plank = (i) => (i % 3 === 0 ? { shade: 0.72 } : undefined);

    // windows and doors: computed from wall metres
    const openings = (width, opts = {}) => (um, vm, i, j, cols, rows, sw, sh) => {
      if (opts.door) {
        const du = um - width / 2;
        if (Math.abs(du) < 0.75 && vm < 2.35) {
          if (o.batwing && vm > 0.7 && vm < 1.75) return { glyph: du < 0 ? G('}') : G('{'), color: trim };
          if (Math.abs(du) > 0.75 - sw || vm > 2.35 - sh) return { glyph: G(vm > 1.9 ? '=' : '|'), color: trim };
          return { glyph: G(':'), color: WARM, emis: 0.55 };
        }
      }
      for (let s = 0; s < stories; s++) {
        const v0 = 1.15 + s * 3.2, v1 = v0 + 1.45;
        if (vm < v0 || vm > v1) continue;
        const nwin = opts.count ?? Math.max(1, Math.floor(width / 3.2));
        for (let k = 0; k < nwin; k++) {
          const uc = (width * (k + 0.5)) / nwin;
          if (opts.door && s === 0 && Math.abs(uc - width / 2) < 1.4) continue;
          const du = um - uc;
          if (Math.abs(du) < 0.62) {
            const lit = ((k * 7 + s * 13 + (o.seed || 0)) % 5) !== 0;
            const edgeU = sw < 0.5 && Math.abs(du) > 0.62 - sw, edgeV = sh < 0.6 && (vm - v0 < sh || v1 - vm < sh);
            if (edgeU && edgeV) return { glyph: G('+'), color: trim };
            if (edgeU) return { glyph: G('|'), color: trim };
            if (edgeV) return { glyph: G('='), color: trim };
            return lit ? { glyph: G('#'), color: WARM, emis: 0.85 } : { ramp: RAMP.GLASS, color: [0.1, 0.16, 0.22] };
          }
        }
      }
      if (hf > h + 0.2 && vm > hf - 0.5 && opts.front) return { glyph: G('='), color: trim };
      return plank(i);
    };

    // walls
    this.panel(F, [-w / 2, 0, d / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], w, hf, wall, openings(w, { door: true, front: true }));
    this.panel(F, [w / 2, 0, -d / 2], [-1, 0, 0], [0, 1, 0], [0, 0, -1], w, h, wall, openings(w, { count: 1 }));
    this.panel(F, [w / 2, 0, d / 2], [0, 0, -1], [0, 1, 0], [1, 0, 0], d, h, wall, openings(d, { count: Math.max(1, Math.floor(d / 5)) }));
    this.panel(F, [-w / 2, 0, -d / 2], [0, 0, 1], [0, 1, 0], [-1, 0, 0], d, h, wall, openings(d, { count: Math.max(1, Math.floor(d / 5)) }));
    // roof
    if (rise > 0) {
      const sl = Math.hypot(w / 2 + 0.35, rise * (1 + 0.7 / w)), ux = (w / 2) / Math.hypot(w / 2, rise), uy = rise / Math.hypot(w / 2, rise);
      this.panel(F, [-w / 2 - 0.3, h - 0.3 * uy / ux, -d / 2 - 0.3], [0, 0, 1], [ux, uy, 0], [-uy, ux, 0], d + 0.6, sl, roofMat);
      this.panel(F, [w / 2 + 0.3, h - 0.3 * uy / ux, d / 2 + 0.3], [0, 0, -1], [-ux, uy, 0], [uy, ux, 0], d + 0.6, sl, roofMat);
      // gable ends
      const gable = (um, vm) => (vm > rise * (1 - Math.abs(um - w / 2) / (w / 2)) ? null : undefined);
      this.panel(F, [w / 2, h, -d / 2], [-1, 0, 0], [0, 1, 0], [0, 0, -1], w, rise, { ...wall, tri: true }, gable);
      if (o.falseFront === false) this.panel(F, [-w / 2, h, d / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], w, rise, { ...wall, tri: true }, gable);
    } else {
      this.panel(F, [-w / 2, h, d / 2], [1, 0, 0], [0, 0, -1], [0, 1, 0], w, d, roofMat);
    }
    // porch: boardwalk, posts, awning
    if (o.porch !== false) {
      const pd = 2.6, ph = 3.05;
      this.panel(F, [-w / 2, 0.28, d / 2 + pd], [1, 0, 0], [0, 0, -1], [0, 1, 0], w, pd, { color: COL.woodPale, ramp: RAMP.STRATA, ch: 0.4 });
      const l = Math.hypot(pd + 0.3, 0.45);
      this.panel(F, [-w / 2 - 0.2, ph - 0.1, d / 2 + pd + 0.3], [1, 0, 0], [0, 0.45 / l, -(pd + 0.3) / l], [0, (pd + 0.3) / l, 0.45 / l], w + 0.4, l, roofMat);
      const np = Math.max(2, Math.round(w / 3.4));
      for (let i = 0; i <= np; i++) {
        const p = F.p(-w / 2 + 0.15 + ((w - 0.3) * i) / np, 0.28, d / 2 + pd - 0.1);
        post(this.cards, p[0], p[1], p[2], ph - 0.4, 0.5, trim, 0, RAMP.WOOD);
      }
      if (o.balcony && stories > 1) {
        const p0 = F.p(-w / 2, ph + 1.0, d / 2 + pd), p1 = F.p(w / 2, ph + 1.0, d / 2 + pd);
        strand(this.ink, p0, p1, 0.5, trim, G('#'), { gap: 0.62 });
      }
      if (o.lantern !== false) {
        const lp = F.p(o.lanternX ?? w * 0.22, 2.45, d / 2 + pd - 0.25);
        this.ink.push(lp[0], lp[1], lp[2], 0.55, WARM[0], WARM[1], WARM[2], 1, 0, 1, 0, 0, G('o'), FLAG.NIGHT | FLAG.TWO_SIDED);
        this.lights.push({ pos: [lp[0], lp[1] - 0.2, lp[2]], radius: 15, color: [1.5, 0.82, 0.34], intensity: 1.0, flicker: 0.16, seed: x + z, nightOnly: true });
      }
    }
    if (o.sign) {
      const maxSize = ((w - 1.0) / o.sign.length) / 0.62;
      const size = Math.min(o.signSize ?? 1.15, maxSize);
      const sy = hf > h + 0.5 ? Math.max(h + 0.7, hf - 0.55 - size * 0.55) : h - 0.9;
      const bw = o.sign.length * size * 0.62 + 0.6;
      // signboard
      const board = [o.wall[0] * 0.35, o.wall[1] * 0.33, o.wall[2] * 0.3];
      this.mesh.quad(F.p(-bw / 2, sy - size * 0.62, d / 2 + 0.04), F.p(bw / 2, sy - size * 0.62, d / 2 + 0.04), F.p(bw / 2, sy + size * 0.62, d / 2 + 0.04), F.p(-bw / 2, sy + size * 0.62, d / 2 + 0.04), board);
      const spec = this.sign(F, o.sign, 0, sy, d / 2 + 0.05, [1, 0, 0], [0, 0, 1], size, o.signColor || srgb(0xf0e2c0), 0.12);
      const ap = F.p(0, 0, d / 2 + (o.porch !== false ? 5.2 : 3.2));
      spec.at = [ap[0], ap[2]];
    }
    this.rects.push({ x, z, hw: w / 2 + 0.25, hd: d / 2 + 0.25, yaw, h: hf + 0.6, porch: o.porch !== false ? 3.0 : 0 });
    this.land.stamp(x, z, w / 2 + 0.6, d / 2 + (o.porch !== false ? 1.9 : 0.6), yaw, 1);
    return F;
  }

  // Whitewashed adobe mission church with a bell tower and a cross.
  church(x, z, yaw) {
    const F = this.frame(x, z, yaw);
    const white = srgb(0xddd2bc), tile = srgb(0x9a4a30), dark = [0.03, 0.025, 0.02];
    const wall = { color: white, ramp: RAMP.ADOBE };
    const w = 8, d = 15, h = 6.2, rise = 3.2;
    const door = (um, vm) => {
      const du = um - w / 2;
      if (Math.abs(du) < 1.0 && vm < 3.0 - du * du * 0.7) return { glyph: G(Math.abs(du) > 0.6 ? '|' : ':'), color: WARM, emis: 0.5 };
      if (Math.hypot(du, vm - 5.0) < 0.75) return { glyph: G('O'), color: [0.7, 0.75, 1.0], emis: 0.5 };
      return undefined;
    };
    const slit = (width) => (um, vm) => {
      const k = Math.round(um / 3.6);
      if (k > 0 && Math.abs(um - k * 3.6) < 0.35 && vm > 2.2 && vm < 4.4 && um < width - 1) return { glyph: G('|'), color: WARM, emis: 0.7 };
      return undefined;
    };
    this.panel(F, [-w / 2, 0, d / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], w, h, wall, door);
    this.panel(F, [w / 2, 0, -d / 2], [-1, 0, 0], [0, 1, 0], [0, 0, -1], w, h, wall);
    this.panel(F, [w / 2, 0, d / 2], [0, 0, -1], [0, 1, 0], [1, 0, 0], d, h, wall, slit(d));
    this.panel(F, [-w / 2, 0, -d / 2], [0, 0, 1], [0, 1, 0], [-1, 0, 0], d, h, wall, slit(d));
    const L = Math.hypot(w / 2, rise), ux = w / 2 / L, uy = rise / L;
    const rm = { color: tile, ramp: RAMP.SHINGLE, ch: 0.42 };
    this.panel(F, [-w / 2 - 0.3, h - 0.2, -d / 2 - 0.3], [0, 0, 1], [ux, uy, 0], [-uy, ux, 0], d + 0.6, L + 0.3, rm);
    this.panel(F, [w / 2 + 0.3, h - 0.2, d / 2 + 0.3], [0, 0, -1], [-ux, uy, 0], [uy, ux, 0], d + 0.6, L + 0.3, rm);
    const gable = (um, vm) => (vm > rise * (1 - Math.abs(um - w / 2) / (w / 2)) ? null : undefined);
    this.panel(F, [-w / 2, h, d / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], w, rise, { ...wall, tri: true }, gable);
    this.panel(F, [w / 2, h, -d / 2], [-1, 0, 0], [0, 1, 0], [0, 0, -1], w, rise, { ...wall, tri: true }, gable);
    // bell tower at the front-left corner
    const tw = 3.6, th = 12.5, tx = -w / 2 - tw / 2 + 0.4, tz = d / 2 - tw / 2 + 0.6;
    const belfry = (um, vm) => {
      if (vm > th - 3.4 && vm < th - 1.3 && Math.abs(um - tw / 2) < 0.75 - Math.max(0, vm - (th - 2.0)) * 0.6) return { glyph: G('A'), color: dark };
      return undefined;
    };
    const sides = [[[tx - tw / 2, 0, tz + tw / 2], [1, 0, 0], [0, 0, 1]], [[tx + tw / 2, 0, tz - tw / 2], [-1, 0, 0], [0, 0, -1]],
      [[tx + tw / 2, 0, tz + tw / 2], [0, 0, -1], [1, 0, 0]], [[tx - tw / 2, 0, tz - tw / 2], [0, 0, 1], [-1, 0, 0]]];
    for (const [o, u, n] of sides) this.panel(F, o, u, [0, 1, 0], n, tw, th, wall, belfry);
    // pyramid cap
    const cl = Math.hypot(tw / 2 + 0.2, 2.4), cx = (tw / 2 + 0.2) / cl, cy = 2.4 / cl;
    const cap = (um, vm) => (Math.abs(um - (tw + 0.4) / 2) > ((tw + 0.4) / 2) * (1 - vm / cl) ? null : undefined);
    this.panel(F, [tx - tw / 2 - 0.2, th, tz + tw / 2 + 0.2], [1, 0, 0], [0, cy, -cx], [0, cx, cy], tw + 0.4, cl, { ...rm, tri: true }, cap);
    this.panel(F, [tx + tw / 2 + 0.2, th, tz - tw / 2 - 0.2], [-1, 0, 0], [0, cy, cx], [0, cx, -cy], tw + 0.4, cl, { ...rm, tri: true }, cap);
    this.panel(F, [tx + tw / 2 + 0.2, th, tz + tw / 2 + 0.2], [0, 0, -1], [-cx, cy, 0], [cy, cx, 0], tw + 0.4, cl, { ...rm, tri: true }, cap);
    this.panel(F, [tx - tw / 2 - 0.2, th, tz - tw / 2 - 0.2], [0, 0, 1], [cx, cy, 0], [-cy, cx, 0], tw + 0.4, cl, { ...rm, tri: true }, cap);
    const cp = F.p(tx, th + 3.3, tz);
    this.cards.push(cp[0], cp[1], cp[2], 2.2, 0.95, 0.92, 0.85, 0.25, 0, 0.4, 0.9, 0, G('+'), FLAG.TWO_SIDED);
    const lp = F.p(0, 3.4, d / 2 + 1.2);
    this.lights.push({ pos: lp, radius: 16, color: [1.4, 0.8, 0.36], intensity: 0.9, flicker: 0.12, seed: 3, nightOnly: true });
    this.land.stamp(x, z, w / 2 + 2.5, d / 2 + 1, yaw, 1);
    this.rects.push({ x, z, hw: w / 2 + 0.3, hd: d / 2 + 0.3, yaw, h: h + rise });
    { const tp = F.p(tx, 0, tz); this.rects.push({ x: tp[0], z: tp[2], hw: tw / 2 + 0.2, hd: tw / 2 + 0.2, yaw, h: th + 2.4 }); }
    return F;
  }
}

const PAINT = [0xa98a64, 0xb89a70, 0x94785a, 0xc0a682, 0xa85c48, 0xd6cdbb, 0x8f9a7c, 0x8090a0, 0xc8aa60, 0x8a735e];

export const TOWN_PLAN = [
  // north side of Main Street, fronts facing south (+z)
  { side: 'n', x: -100, w: 16, d: 18, h: 6.2, sign: 'LIVERY', falseFront: false, porch: false, paint: 4, pitch: 0.62 },
  { side: 'n', x: -80, w: 10, d: 11, h: 4.4, sign: 'SMITHY', paint: 9 },
  { side: 'n', x: -64, w: 14, d: 13, h: 4.8, sign: 'GENERAL STORE', paint: 1 },
  { side: 'n', x: -44, w: 16, d: 15, h: 7.6, sign: 'SALOON', stories: 2, batwing: true, balcony: true, paint: 0, crown: 1.6, signSize: 1.5 },
  { side: 'n', x: -23, w: 14, d: 14, h: 7.6, sign: 'HOTEL', stories: 2, balcony: true, paint: 5 },
  { side: 'n', x: -5, w: 11, d: 12, h: 5.0, sign: 'BANK', paint: 7, flat: true, crown: 0.9 },
  { side: 'n', x: 11, w: 9, d: 11, h: 4.3, sign: 'SHERIFF', paint: 2 },
  { side: 'n', x: 26, w: 9, d: 10, h: 4.3, sign: 'ASSAY', paint: 6 },
  { side: 'n', x: 42, w: 10, d: 12, h: 4.5, sign: 'UNDERTAKER', paint: 9 },
  // south side, fronts facing north (-z)
  { side: 's', x: -98, w: 13, d: 14, h: 5.0, sign: 'FEED & GRAIN', paint: 8 },
  { side: 's', x: -80, w: 9, d: 10, h: 4.3, sign: 'SADDLERY', paint: 3 },
  { side: 's', x: -66, w: 8, d: 9, h: 4.2, sign: 'BARBER', paint: 5 },
  { side: 's', x: -52, w: 9, d: 11, h: 4.4, sign: 'GUNSMITH', paint: 2 },
  { side: 's', x: -37, w: 9, d: 10, h: 4.3, sign: 'TELEGRAPH', paint: 6 },
  { side: 's', x: -20, w: 13, d: 13, h: 7.4, sign: 'DRY GOODS', stories: 2, paint: 1 },
  { side: 's', x: -3, w: 8, d: 10, h: 4.2, sign: 'DOCTOR', paint: 5 },
  { side: 's', x: 12, w: 10, d: 11, h: 4.4, sign: 'LAND OFFICE', paint: 7 },
  { side: 's', x: 30, w: 13, d: 12, h: 4.6, sign: 'CANTINA', paint: 4, flat: true, ramp: RAMP.ADOBE, wallHex: 0xc89868, batwing: true },
];

export function buildTown(B, land) {
  let seed = 1;
  for (const b of TOWN_PLAN) {
    const north = b.side === 'n';
    const z = north ? -11 - b.d / 2 : 11 + b.d / 2;
    B.building({
      ...b, z, yaw: north ? 0 : Math.PI, wall: srgb(b.wallHex ?? PAINT[b.paint]), seed: seed++,
      roof: b.flat ? srgb(0x9a8468) : srgb([0x8a7a6c, 0x94836e, 0x7c7a78, 0x9a6a54][seed % 4]),
    });
  }
}
