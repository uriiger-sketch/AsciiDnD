// The land: a 4 km square of high desert, generated on the CPU into flat arrays that the
// engine uploads as textures (height + gradient + water level, albedo, masks).
//
//   x = east, z = south, y = up, metres. Origin is the middle of town.

import { fbm, gnoise, ridged } from './noise.js';
import { clamp, lerp, smoothstep, srgb } from '../engine/math.js';

export const WORLD = 4096;
export const N = 1024;
export const TEXEL = WORLD / N;

// --- Composition -------------------------------------------------------------------------

// r = radius at the foot of the cliff (talus spreads beyond it), h = height above the plain.
export const MESAS = [
  { name: 'anvil', x: 430, z: -640, r: 330, h: 150, sx: 1.3, sz: 0.86, rot: 0.25, tiers: 2 },
  { name: 'sister1', x: -820, z: -130, r: 92, h: 196, sx: 1, sz: 1.25, rot: 0.4, tiers: 1 },
  { name: 'sister2', x: -1010, z: 110, r: 70, h: 222, sx: 1.1, sz: 0.9, rot: 1.1, tiers: 1 },
  { name: 'sister3', x: -690, z: 215, r: 54, h: 150, sx: 1, sz: 1, rot: 0, tiers: 1 },
  { name: 'needle', x: -905, z: 345, r: 24, h: 132, sx: 1, sz: 1, rot: 0, tiers: 1, talus: 0.28 },
  { name: 'thumb', x: -585, z: -350, r: 21, h: 104, sx: 1, sz: 1, rot: 0, tiers: 1, talus: 0.3 },
  { name: 'westwall', x: -1230, z: -330, r: 170, h: 176, sx: 0.8, sz: 1.5, rot: -0.2, tiers: 2 },
  { name: 'southeast', x: 930, z: 760, r: 270, h: 122, sx: 1.4, sz: 0.8, rot: -0.5, tiers: 2 },
  { name: 'east', x: 1290, z: 250, r: 180, h: 142, sx: 0.9, sz: 1.2, rot: 0.2, tiers: 1 },
  { name: 'north', x: -330, z: -1340, r: 380, h: 182, sx: 1.5, sz: 0.8, rot: 0.1, tiers: 2 },
  { name: 'northeast', x: 1080, z: -1450, r: 300, h: 164, sx: 1.2, sz: 0.9, rot: -0.3, tiers: 2 },
  { name: 'south', x: -240, z: 1420, r: 330, h: 152, sx: 1.5, sz: 0.75, rot: 0.15, tiers: 2 },
  { name: 'southwest', x: -1330, z: 930, r: 240, h: 166, sx: 1, sz: 1.2, rot: 0.6, tiers: 2 },
  { name: 'fareast', x: 1620, z: -520, r: 250, h: 172, sx: 0.8, sz: 1.4, rot: 0, tiers: 2 },
  { name: 'farwest', x: -1640, z: -900, r: 280, h: 204, sx: 1.1, sz: 1.2, rot: 0.3, tiers: 2 },
  { name: 'gate1', x: 180, z: 900, r: 60, h: 118, sx: 1.3, sz: 0.8, rot: 0.2, tiers: 1 },
  { name: 'gate2', x: 420, z: 1010, r: 44, h: 136, sx: 1, sz: 1, rot: 0, tiers: 1 },
];

// Box canyon cut into the Anvil's south face; the falls drop at its head into the pool.
export const CANYON = { ax: 372, az: -318, bx: 398, bz: -486, w0: 54, w1: 30 };
export const POOL = { x: 397, z: -480, r: 26 };

// The creek leaves the pool and wanders south past the east side of town.
export const CREEK = [
  [397, -480], [386, -400], [374, -330], [330, -230], [262, -150], [276, -40], [228, 58], [168, 158],
  [186, 300], [108, 470], [150, 690], [70, 1000], [120, 1500], [90, 2200],
];
export const RAIL_Z = 118;
export const TOWN = { x: 0, z: 0, r: 125 };

export const ROADS = [
  { w: 9, pts: [[-150, 0], [150, 0]] }, // Main Street
  { w: 5, pts: [[0, 0], [0, 100], [6, RAIL_Z - 8]] }, // to the depot
  { w: 4, pts: [[-150, 0], [-260, -20], [-400, -90], [-560, -60], [-760, 40], [-1100, 40], [-2100, 160]] }, // west trail
  { w: 4, pts: [[60, 0], [90, -70], [170, -150], [250, -235], [330, -300], [364, -350]] }, // canyon trail
  { w: 4, pts: [[150, 0], [200, 20], [228, 58], [300, 80], [560, 180], [900, 300], [2100, 420]] }, // east trail (fords the creek)
  { w: 3.5, pts: [[-40, 0], [-70, -50], [-112, -88]] }, // up to Boot Hill
];
export const DUNES = { x: -520, z: 780, r: 430 };
export const SALT = { x: 760, z: 170, r: 230 };
export const PRAIRIE = { x: -330, z: -60, r: 470 };
export const BOOTHILL = { x: -118, z: -96, r: 46, h: 7.5 };

const C = {
  sand: srgb(0xc8a06a),
  sandPale: srgb(0xddc08e),
  sandRed: srgb(0xbb7444),
  rock: srgb(0xad5630),
  rockTop: srgb(0xb98c5c),
  road: srgb(0xb69468),
  prairie: srgb(0x9a8450),
  dune: srgb(0xe2c58c),
  salt: srgb(0xe6dfcc),
  riparian: srgb(0x726a3a),
  talus: srgb(0xa9663f),
};

const ss = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

function plain(x, z) {
  return 13 + 10 * fbm(x / 1150, z / 1150, 3, 11) + 2.4 * fbm(x / 230, z / 230, 3, 23);
}

// Scratch outputs (no per-call allocations: these run tens of millions of times).
let _t = 0, _i = 0;
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
  _t = t;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

function polyDist(px, pz, pts) {
  let best = 1e9, bi = 0, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) {
      best = d;
      bi = i;
      bt = _t;
    }
  }
  _i = bi;
  _t = bt;
  return best;
}

// Coarse "is anything near here" grid so most texels skip the polyline tests entirely.
function nearGrid(polys, reach) {
  const cells = 128, cs = WORLD / cells;
  const g = new Uint8Array(cells * cells);
  for (const pts of polys) {
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        if (g[j * cells + i]) continue;
        const x = (i + 0.5) * cs - WORLD / 2, z = (j + 0.5) * cs - WORLD / 2;
        if (polyDist(x, z, pts) < reach + cs) g[j * cells + i] = 1;
      }
    }
  }
  return (x, z) => g[Math.min(cells - 1, Math.max(0, Math.floor((z / WORLD + 0.5) * cells))) * cells + Math.min(cells - 1, Math.max(0, Math.floor((x / WORLD + 0.5) * cells)))];
}

function mesaProfile(u, m) {
  const H = m.h, hT = H * (m.talus ?? 0.36), wT = hT / 0.6, hC = H - hT;
  if (u <= -wT) return 0;
  if (u < 0) return hT * Math.pow((u + wT) / wT, 1.3);
  const wC = Math.min(hC / 3.1, m.r * 0.72);
  if (m.tiers === 2) {
    const c1 = 0.56, bench = 18, w1 = wC * c1, w2 = wC * (1 - c1);
    if (u < w1) return hT + hC * c1 * ss(u / w1);
    if (u < w1 + bench) return hT + hC * c1 + (2.5 * (u - w1)) / bench;
    const u2 = u - w1 - bench;
    if (u2 < w2) return hT + hC * c1 + 2.5 + (hC * (1 - c1) - 2.5) * ss(u2 / w2);
    return H;
  }
  if (u < wC) return hT + hC * ss(u / wC);
  return H;
}

// Signed "inwardness" of a mesa at a point (positive inside the cliff foot), plus reach.
function mesaU(m, mi, x, z) {
  const dx = x - m.x, dz = z - m.z;
  const reach = m.r * Math.max(m.sx, m.sz) * 1.35 + (m.h * 0.36) / 0.6 + 30;
  if (dx * dx + dz * dz > reach * reach) return -1e9;
  const c = Math.cos(m.rot), s = Math.sin(m.rot);
  let lx = (dx * c + dz * s) / m.sx, lz = (-dx * s + dz * c) / m.sz;
  const k = 1 / (m.r * 0.95), seed = 100 + mi * 7;
  lx += m.r * 0.24 * fbm(dx * k, dz * k, 3, seed);
  lz += m.r * 0.24 * fbm(dx * k + 9.1, dz * k - 4.3, 3, seed + 3);
  let u = m.r - Math.hypot(lx, lz);
  // alcoves and buttresses along the rim
  u += Math.min(m.r * 0.1, 9) * (ridged(x / 52, z / 52, 3, seed + 5) - 0.55) * 2;
  return u;
}

export function generateLand() {
  const n = N;
  const H = new Float32Array(n * n);
  const Wt = new Float32Array(n * n).fill(-1000);
  const veg = new Float32Array(n * n), rock = new Float32Array(n * n);
  const moist = new Float32Array(n * n), pack = new Float32Array(n * n);
  const col = new Float32Array(n * n * 3);

  // Creek water levels: monotone downstream so the water never climbs.
  const creekLevel = [];
  {
    let lvl = plain(CREEK[0][0], CREEK[0][1]) + 1.0;
    for (let i = 0; i < CREEK.length; i++) {
      const b = plain(CREEK[i][0], CREEK[i][1]) - 0.9;
      lvl = i === 0 ? lvl : Math.min(lvl - 0.25, b);
      creekLevel.push(lvl);
    }
  }
  const poolLevel = creekLevel[0];
  const townH = plain(TOWN.x, TOWN.z) + 0.4;
  const railH = (x) => 12.6 + 1.6 * Math.sin(x / 640) + 0.8 * Math.sin(x / 233 + 1.3);

  const nearRoad = nearGrid(ROADS.map((r) => r.pts), 16);
  const nearCreek = nearGrid([CREEK], 150);

  for (let j = 0; j < n; j++) {
    const z = (j + 0.5) * TEXEL - WORLD / 2;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * TEXEL - WORLD / 2;
      const o = j * n + i;
      let h = plain(x, z);
      const rc = Math.hypot(x, z);

      // base desert colour, mottled
      const n1 = fbm(x / 380, z / 380, 3, 41), n2 = fbm(x / 90, z / 90, 2, 43);
      let cr = lerp(C.sand[0], C.sandPale[0], clamp(0.5 + n1 * 0.9, 0, 1));
      let cg = lerp(C.sand[1], C.sandPale[1], clamp(0.5 + n1 * 0.9, 0, 1));
      let cb = lerp(C.sand[2], C.sandPale[2], clamp(0.5 + n1 * 0.9, 0, 1));
      const red = clamp(0.35 + n2 * 0.8 - n1 * 0.3, 0, 1) * 0.55;
      cr = lerp(cr, C.sandRed[0], red); cg = lerp(cg, C.sandRed[1], red); cb = lerp(cb, C.sandRed[2], red);
      let vg = clamp(0.16 + 0.22 * fbm(x / 300, z / 300, 3, 51), 0, 1);
      let rk = 0, ms = 0, pk = 0;

      // dunes
      const dd = Math.hypot(x - DUNES.x, z - DUNES.z);
      const dm = smoothstep(DUNES.r, DUNES.r * 0.55, dd + 60 * gnoise(x / 200, z / 200, 61));
      if (dm > 0) {
        const wx = x * 0.8 + z * 0.6, wz = -x * 0.6 + z * 0.8;
        const crest = ridged(wx / 95 + 0.4 * gnoise(wz / 120, wx / 240, 63), wz / 260, 3, 65);
        h += dm * (11 * crest + 2 * fbm(x / 40, z / 40, 2, 67));
        cr = lerp(cr, C.dune[0], dm); cg = lerp(cg, C.dune[1], dm); cb = lerp(cb, C.dune[2], dm);
        vg *= 1 - dm * 0.95;
      }
      // salt pan
      const sd = Math.hypot(x - SALT.x, z - SALT.z) + 50 * gnoise(x / 170, z / 170, 71);
      const sm = smoothstep(SALT.r, SALT.r * 0.7, sd);
      if (sm > 0) {
        h = lerp(h, plain(SALT.x, SALT.z) - 1.2, sm);
        cr = lerp(cr, C.salt[0], sm); cg = lerp(cg, C.salt[1], sm); cb = lerp(cb, C.salt[2], sm);
        vg *= 1 - sm;
        pk = Math.max(pk, sm * 0.5);
      }
      // prairie
      const pd = Math.hypot(x - PRAIRIE.x, z - PRAIRIE.z) + 150 * gnoise(x / 330, z / 330, 81);
      const pm = smoothstep(PRAIRIE.r, PRAIRIE.r * 0.5, pd);
      if (pm > 0) {
        vg = Math.max(vg, pm * (0.72 + 0.28 * fbm(x / 120, z / 120, 2, 83)));
        cr = lerp(cr, C.prairie[0], pm * 0.8); cg = lerp(cg, C.prairie[1], pm * 0.8); cb = lerp(cb, C.prairie[2], pm * 0.8);
        ms = Math.max(ms, pm * 0.22);
      }

      // mesas
      let mh = 0, mU = -1e9, onTop = 0;
      for (let mi = 0; mi < MESAS.length; mi++) {
        const m = MESAS[mi];
        let u = mesaU(m, mi, x, z);
        if (u < -400) continue;
        let p = mesaProfile(u, m);
        if (mi === 0) {
          // the box canyon: sheer walls straight up from a flat floor
          const dn = segDist(x, z, CANYON.ax, CANYON.az, CANYON.bx, CANYON.bz);
          const wn = lerp(CANYON.w0, CANYON.w1, _t) + 6 * gnoise(x / 33, z / 33, 91);
          const wall = m.h * ss((dn - wn) / 17);
          if (wall < p) { p = wall; u = Math.min(u, dn - wn); }
        }
        if (p > mh) {
          mh = p;
          mU = u;
          onTop = p >= m.h - 0.01 ? 1 : 0;
        }
      }
      if (mh > 0) {
        const top = onTop ? 3.5 * fbm(x / 110, z / 110, 3, 95) + 1.2 * fbm(x / 28, z / 28, 2, 97) : 0;
        h += mh + top;
        const tal = smoothstep(-70, 0, mU);
        rk = onTop ? 0.42 : clamp(0.25 + tal * 0.9, 0, 1);
        const cc = onTop ? C.rockTop : mU > 0 ? C.rock : C.talus;
        const k = onTop ? 0.8 : clamp(0.35 + tal, 0, 1);
        cr = lerp(cr, cc[0], k); cg = lerp(cg, cc[1], k); cb = lerp(cb, cc[2], k);
        vg *= onTop ? 0.8 : 1 - tal * 0.85;
      }

      // Boot Hill: a small rise for the church and the graves
      const bd = Math.hypot(x - BOOTHILL.x, z - BOOTHILL.z);
      h += BOOTHILL.h * Math.exp(-(bd * bd) / (2 * BOOTHILL.r * BOOTHILL.r * 0.42));

      // town: level ground
      const td = Math.hypot(x - TOWN.x, z - TOWN.z);
      const tm = smoothstep(TOWN.r + 70, TOWN.r - 10, td) * (1 - smoothstep(BOOTHILL.r * 1.4, BOOTHILL.r * 0.5, bd));
      if (tm > 0) {
        h = lerp(h, townH + 0.25 * fbm(x / 25, z / 25, 2, 99), tm * 0.94);
        vg *= 1 - tm * 0.75;
      }

      // railroad embankment
      const rz = Math.abs(z - RAIL_Z);
      if (rz < 40) {
        const rm = smoothstep(26, 5, rz);
        h = lerp(h, railH(x), rm);
        if (rz < 4.5) {
          pk = Math.max(pk, 0.85);
          vg = 0;
          cr = lerp(cr, 0.2, 0.55); cg = lerp(cg, 0.16, 0.55); cb = lerp(cb, 0.13, 0.55);
        }
      }

      // roads and trails
      if (nearRoad(x, z)) for (const road of ROADS) {
        const d = polyDist(x, z, road.pts);
        if (d < road.w + 4) {
          const k = smoothstep(road.w * 0.5 + 3.5, road.w * 0.5, d) * (1 - rk);
          pk = Math.max(pk, k * 0.75);
          vg *= 1 - k;
          cr = lerp(cr, C.road[0], k * 0.85); cg = lerp(cg, C.road[1], k * 0.85); cb = lerp(cb, C.road[2], k * 0.85);
        }
      }

      // creek: carve the bed, set the water level, green the banks
      if (nearCreek(x, z)) {
        const d = polyDist(x, z, CREEK), si = _i, st = _t;
        if (d < 150) {
          const lvl = lerp(creekLevel[si], creekLevel[si + 1], st);
          const wob = 1 + 0.35 * gnoise(x / 37, z / 37, 105);
          const halfW = 7.5 * wob;
          const bank = smoothstep(halfW + 14, halfW, d);
          if (bank > 0) {
            const bed = lvl - 0.35 - 1.3 * smoothstep(halfW, halfW * 0.25, d);
            h = lerp(h, Math.min(h, bed + (1 - bank) * 3), bank);
            if (d < halfW + 10) Wt[o] = lvl;
          }
          const green = smoothstep(120, 14, d + 30 * gnoise(x / 60, z / 60, 107));
          ms = Math.max(ms, green);
          vg = Math.max(vg * (1 - bank), green * (1 - smoothstep(halfW * 0.8, halfW * 0.5, d)) * (1 - pk));
          cr = lerp(cr, C.riparian[0], green * 0.75); cg = lerp(cg, C.riparian[1], green * 0.75); cb = lerp(cb, C.riparian[2], green * 0.75);
        }
      }
      // pool under the falls
      {
        const pdist = Math.hypot(x - POOL.x, z - POOL.z) + 4 * gnoise(x / 21, z / 21, 111);
        if (pdist < POOL.r + 20) {
          const k = smoothstep(POOL.r + 14, POOL.r - 4, pdist);
          const bed = poolLevel - 0.3 - 3.2 * smoothstep(POOL.r, POOL.r * 0.3, pdist);
          h = lerp(h, Math.min(h, bed), k);
          if (pdist < POOL.r + 9) Wt[o] = Math.max(Wt[o], poolLevel);
          ms = Math.max(ms, smoothstep(POOL.r + 60, POOL.r, pdist));
          rk = Math.max(rk * (1 - k * 0.5), 0);
        }
      }

      // far edge: melt into an endless plain so texture clamping is seamless
      if (rc > 1850) h = lerp(h, 13, smoothstep(1850, 2040, rc));

      H[o] = h;
      veg[o] = clamp(vg, 0, 1);
      rock[o] = clamp(rk, 0, 1);
      moist[o] = clamp(ms, 0, 1);
      pack[o] = clamp(pk, 0, 1);
      col[o * 3] = cr; col[o * 3 + 1] = cg; col[o * 3 + 2] = cb;
    }
  }

  const land = {
    n, size: WORLD, texel: TEXEL,
    height: H, water: Wt, veg, rock, moist, pack, col,
    gx: new Float32Array(n * n), gz: new Float32Array(n * n),
    poolLevel, townH, railH, creekLevel,
    falls: null,
  };

  land.heightAt = (x, z) => bilinear(H, n, x, z);
  land.waterAt = (x, z) => {
    const i = clamp(Math.floor((x / WORLD + 0.5) * n), 0, n - 1), j = clamp(Math.floor((z / WORLD + 0.5) * n), 0, n - 1);
    return Wt[j * n + i];
  };
  land.sample = (arr, x, z) => bilinear(arr, n, x, z);
  land.normalAt = (x, z) => {
    const gx = bilinear(land.gx, n, x, z), gz = bilinear(land.gz, n, x, z);
    const l = Math.hypot(gx, 1, gz);
    return [-gx / l, 1 / l, -gz / l];
  };
  // Mark ground as packed/bare under a rotated rectangle (building footprints, pads).
  land.stamp = (cx, cz, hw, hd, yaw, value = 1, arr = pack) => {
    const c = Math.cos(yaw), s = Math.sin(yaw), R = Math.hypot(hw, hd) + TEXEL;
    const i0 = Math.floor(((cx - R) / WORLD + 0.5) * n), i1 = Math.ceil(((cx + R) / WORLD + 0.5) * n);
    const j0 = Math.floor(((cz - R) / WORLD + 0.5) * n), j1 = Math.ceil(((cz + R) / WORLD + 0.5) * n);
    for (let j = Math.max(0, j0); j <= Math.min(n - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
        const x = (i + 0.5) * TEXEL - WORLD / 2 - cx, z = (j + 0.5) * TEXEL - WORLD / 2 - cz;
        const lx = x * c - z * s, lz = x * s + z * c;
        const k = smoothstep(hw + TEXEL, hw - 1, Math.abs(lx)) * smoothstep(hd + TEXEL, hd - 1, Math.abs(lz));
        if (k > 0) arr[j * n + i] = Math.max(arr[j * n + i], value * k);
      }
    }
  };
  land.recomputeGradient = () => {
    const { gx, gz } = land;
    for (let j = 0; j < n; j++) {
      const j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, n - 1);
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, n - 1);
        gx[j * n + i] = (H[j * n + i1] - H[j * n + i0]) / ((i1 - i0) * TEXEL);
        gz[j * n + i] = (H[j1 * n + i] - H[j0 * n + i]) / ((j1 - j0) * TEXEL);
      }
    }
  };
  land.recomputeGradient();

  // Find the lip of the falls: walk from the pool up the canyon axis until the rim.
  {
    const dx = CANYON.bx - CANYON.ax, dz = CANYON.bz - CANYON.az, l = Math.hypot(dx, dz);
    const ux = dx / l, uz = dz / l;
    let fx = POOL.x, fz = POOL.z, top = poolLevel, base = null;
    for (let t = 0; t < 220; t += 1) {
      const x = POOL.x + ux * t, z = POOL.z + uz * t;
      const h = land.heightAt(x, z);
      if (base === null && h > poolLevel + 6) base = [x, z];
      if (h > top) {
        top = h;
        fx = x;
        fz = z;
      }
      if (h > poolLevel + MESAS[0].h * 0.9) break;
    }
    land.falls = { x: fx, z: fz, top, base: base || [POOL.x, POOL.z], bottom: poolLevel, dir: [ux, uz] };
  }
  return land;
}

function bilinear(arr, n, x, z) {
  let u = (x / WORLD + 0.5) * n - 0.5, v = (z / WORLD + 0.5) * n - 0.5;
  u = clamp(u, 0, n - 1.001);
  v = clamp(v, 0, n - 1.001);
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const a = arr[j * n + i], b = arr[j * n + i + 1], c = arr[(j + 1) * n + i], d = arr[(j + 1) * n + i + 1];
  return a + (b - a) * fu + (c - a + (a - b - c + d) * fu) * fv;
}
