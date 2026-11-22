// Sculpting with signed distance fields.
//
// Describe a shape as a union of soft primitives (capsules, boxes, cones ...), each with a
// material. bake() walks a voxel lattice, keeps exactly one voxel-thick shell of the surface,
// and emits a glyph card per shell voxel carrying position, surface normal, baked ambient
// occlusion, colour and bone. Rows of the lattice are taller than they are wide, so the
// sculpture is literally typeset in lines of text wrapped around a form.

import { GlyphBuffer, FLAG } from './batch.js';
import { RAMP } from './atlas.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class Sculpt {
  constructor() {
    this.prims = [];
  }

  _add(p, mat, bb) {
    p.mat = Object.assign({ color: [0.5, 0.5, 0.5], ramp: RAMP.FULL, flags: FLAG.RAMP | FLAG.CONTOUR, bone: 0, sway: 0, emis: 0, k: 0.05 }, mat);
    const pad = p.mat.k + 0.02;
    p.min = [bb[0] - pad, bb[1] - pad, bb[2] - pad];
    p.max = [bb[3] + pad, bb[4] + pad, bb[5] + pad];
    this.prims.push(p);
    return this;
  }

  sphere(c, r, mat) {
    return this._add({ d: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r }, mat, [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r]);
  }

  ellipsoid(c, rad, mat) {
    const [rx, ry, rz] = rad;
    return this._add({
      d: (x, y, z) => {
        const px = x - c[0], py = y - c[1], pz = z - c[2];
        const k0 = Math.hypot(px / rx, py / ry, pz / rz);
        const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
        return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
      },
    }, mat, [c[0] - rx, c[1] - ry, c[2] - rz, c[0] + rx, c[1] + ry, c[2] + rz]);
  }

  // Tapered capsule from a (radius r1) to b (radius r2).
  cone(a, b, r1, r2, mat) {
    const ba = sub(b, a), l2 = dot(ba, ba) || 1e-9, rm = Math.max(r1, r2);
    return this._add({
      d: (x, y, z) => {
        const px = x - a[0], py = y - a[1], pz = z - a[2];
        let t = (px * ba[0] + py * ba[1] + pz * ba[2]) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        return Math.hypot(px - ba[0] * t, py - ba[1] * t, pz - ba[2] * t) - (r1 + (r2 - r1) * t);
      },
    }, mat, [Math.min(a[0], b[0]) - rm, Math.min(a[1], b[1]) - rm, Math.min(a[2], b[2]) - rm, Math.max(a[0], b[0]) + rm, Math.max(a[1], b[1]) + rm, Math.max(a[2], b[2]) + rm]);
  }

  capsule(a, b, r, mat) {
    return this.cone(a, b, r, r, mat);
  }

  // Box centred at c with half extents h, corner rounding r, turned by yaw about Y.
  box(c, h, r, mat, yaw = 0) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const R = Math.hypot(h[0], h[2]) + r;
    return this._add({
      d: (x, y, z) => {
        const px = x - c[0], py = y - c[1], pz = z - c[2];
        const qx = Math.abs(px * cs - pz * sn) - h[0] + r, qy = Math.abs(py) - h[1] + r, qz = Math.abs(px * sn + pz * cs) - h[2] + r;
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
      },
    }, mat, [c[0] - R, c[1] - h[1], c[2] - R, c[0] + R, c[1] + h[1], c[2] + R]);
  }

  // Flat-ended cylinder between a and b.
  cylinder(a, b, r, mat) {
    const ba = sub(b, a), baba = dot(ba, ba) || 1e-9;
    return this._add({
      d: (x, y, z) => {
        const px = x - a[0], py = y - a[1], pz = z - a[2];
        const paba = px * ba[0] + py * ba[1] + pz * ba[2];
        const qx = Math.hypot(px * baba - ba[0] * paba, py * baba - ba[1] * paba, pz * baba - ba[2] * paba) - r * baba;
        const qy = Math.abs(paba - baba * 0.5) - baba * 0.5;
        const x2 = qx * qx, y2 = qy * qy * baba;
        const dd = Math.max(qx, qy) < 0 ? -Math.min(x2, y2) : (qx > 0 ? x2 : 0) + (qy > 0 ? y2 : 0);
        return (Math.sign(dd) * Math.sqrt(Math.abs(dd))) / baba;
      },
    }, mat, [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r]);
  }

  // Torus about a unit axis.
  torus(c, axis, R, r, mat) {
    const e = R + r;
    return this._add({
      d: (x, y, z) => {
        const px = x - c[0], py = y - c[1], pz = z - c[2];
        const h = px * axis[0] + py * axis[1] + pz * axis[2];
        const rad = Math.hypot(px - axis[0] * h, py - axis[1] * h, pz - axis[2] * h);
        return Math.hypot(rad - R, h) - r;
      },
    }, mat, [c[0] - e, c[1] - e, c[2] - e, c[0] + e, c[1] + e, c[2] + e]);
  }

  // Distance to the whole sculpture; remembers which primitive is nearest.
  dist(x, y, z) {
    let d = 1e9, best = null, bestRaw = 1e9;
    const prims = this.prims, m = this._margin || 0.4;
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i];
      if (x < p.min[0] - m || x > p.max[0] + m || y < p.min[1] - m || y > p.max[1] + m || z < p.min[2] - m || z > p.max[2] + m) continue;
      const di = p.d(x, y, z);
      if (di < bestRaw) { bestRaw = di; best = p; }
      const k = p.mat.k;
      if (k > 0 && d < 1e8) {
        const h = Math.max(k - Math.abs(d - di), 0) / k;
        d = Math.min(d, di) - h * h * k * 0.25;
      } else d = Math.min(d, di);
    }
    this._best = best;
    return d;
  }

  // res: lattice step across (metres). rows are res * rowK tall.
  bake(o = {}) {
    const res = o.res ?? 0.06, rowK = o.rowK ?? 1.5, resY = res * rowK;
    const clipY = o.clipY ?? -1e9;
    const sizeK = o.sizeK ?? 1.32;
    const out = o.into || new GlyphBuffer(4096);
    const inkOut = o.ink || null; // materials flagged ink:true are written here (bare glyphs, no backing)
    const seen = new Set();
    const eps = res * 0.45;
    const tMax = Math.max(res, resY);
    this._margin = tMax * 3 + 0.1;
    let seed = o.seed ?? 12345;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 8) / 16777216;
    };
    for (const prim of this.prims) {
      const i0 = Math.floor(prim.min[0] / res), i1 = Math.ceil(prim.max[0] / res);
      const j0 = Math.floor(Math.max(prim.min[1], clipY) / resY), j1 = Math.ceil(prim.max[1] / resY);
      const k0 = Math.floor(prim.min[2] / res), k1 = Math.ceil(prim.max[2] / res);
      for (let j = j0; j <= j1; j++) {
        const y = (j + 0.5) * resY;
        if (y < clipY) continue;
        for (let k = k0; k <= k1; k++) {
          const z = (k + 0.5) * res;
          for (let i = i0; i <= i1; i++) {
            const x = (i + 0.5) * res;
            const dp = prim.d(x, y, z);
            if (dp > tMax * 1.6 || dp < -tMax * 2.6) continue;
            const key = (i + 2048) + (j + 2048) * 4096 + (k + 2048) * 16777216;
            if (seen.has(key)) continue;
            seen.add(key);
            const d = this.dist(x, y, z);
            if (d > 0 || d < -tMax) continue;
            const mat = this._best.mat;
            let nx = this.dist(x + eps, y, z) - this.dist(x - eps, y, z);
            let ny = this.dist(x, y + eps, z) - this.dist(x, y - eps, z);
            let nz = this.dist(x, y, z + eps) - this.dist(x, y, z - eps);
            const nl = Math.hypot(nx, ny, nz) || 1;
            nx /= nl; ny /= nl; nz /= nl;
            // keep exactly one voxel along the dominant axis of the normal
            const t = Math.max(Math.abs(nx) * res, Math.abs(ny) * resY, Math.abs(nz) * res);
            if (d < -t) continue;
            const sx = x - nx * d, sy = y - ny * d, sz = z - nz * d;
            if (sy < clipY) continue;
            const a1 = this.dist(sx + nx * res * 2.5, sy + ny * res * 2.5, sz + nz * res * 2.5) / (res * 2.5);
            const a2 = this.dist(sx + nx * res * 7, sy + ny * res * 7, sz + nz * res * 7) / (res * 7);
            const ao = Math.min(1, Math.max(0.22, 0.2 + 0.8 * (0.5 * a1 + 0.5 * a2)));
            let col = typeof mat.color === 'function' ? mat.color(sx, sy, sz, nx, ny, nz) : mat.color;
            const v = (0.9 + 0.2 * rand()) * ao;
            let glyph = mat.glyph !== undefined ? mat.glyph : mat.ramp;
            let flags = mat.flags;
            if (mat.glyph !== undefined) flags &= ~FLAG.RAMP;
            if (typeof glyph === 'function') glyph = glyph(sx, sy, sz, rand);
            (mat.ink && inkOut ? inkOut : out).push(sx, sy, sz, resY * sizeK * (mat.size ?? 1), col[0] * v, col[1] * v, col[2] * v, mat.emis,
              nx, ny, nz, typeof mat.sway === 'function' ? mat.sway(sx, sy, sz) : mat.sway, glyph, flags, mat.bone, (rand() * 256) | 0);
          }
        }
      }
    }
    return out;
  }
}
