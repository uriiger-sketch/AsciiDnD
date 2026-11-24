// Puts everything on the land: the town of Sundown, the railroad, two camps, and a few
// thousand plants and rocks. Returns the render layers and the lights.

import { GlyphBuffer, StaticBatch, FLAG } from '../engine/batch.js';
import { ProxyMesh } from '../engine/mesh.js';
import { RAMP, G } from '../engine/atlas.js';
import { rng, srgb, TAU } from '../engine/math.js';
import { Builder, buildTown } from './town.js';
import * as P from './props.js';
import { RAIL_Z, BOOTHILL, CREEK, POOL } from './land.js';

// Where the first chapter happens.
export const SPOT = {
  well: [5, 1.5],
  hay: [-89.6, -23.5],
  sacks: [-86, -30],
  anvil: [-76.6, -7.0],
  grave: [-99, -67],
  dig: [-131, -61],
};

export const PLACES = {
  town: [0, 0],
  saloon: [-44, -11],
  church: [BOOTHILL.x, BOOTHILL.z],
  depot: [-12, RAIL_Z - 13],
  tipis: [268, 126],
  camp: [-196, -154],
  windmill: [84, 50],
};

export function buildWorld(gl, land, step = () => {}) {
  const cards = new GlyphBuffer(1 << 17), ink = new GlyphBuffer(1 << 17), text = new GlyphBuffer(1 << 16);
  const mesh = new ProxyMesh(gl);
  const B = new Builder(ink, cards, mesh, land, text);
  const lights = [], fires = [];
  const r = rng(20261122);
  const H = (x, z) => land.heightAt(x, z);
  const place = (tpl, x, z, yaw = r() * TAU, scale = 1, tint = null) => {
    const y = H(x, z) - 0.03;
    if (tpl.cards) { cards.append(tpl.cards, x, y, z, yaw, scale, tint); ink.append(tpl.ink, x, y, z, yaw, scale, tint); }
    else cards.append(tpl, x, y, z, yaw, scale, tint);
  };

  // --- town -------------------------------------------------------------------------------
  step('raising the town');
  buildTown(B, land);
  B.church(BOOTHILL.x, BOOTHILL.z, -0.75);
  B.building({ x: PLACES.depot[0], z: PLACES.depot[1], yaw: 0, w: 19, d: 8, h: 4.6, wall: srgb(0xa5553a), sign: 'SUNDOWN', falseFront: false, pitch: 0.42, seed: 77, roof: srgb(0x4a3a32), signSize: 1.2 });
  const barrel = P.barrel(), crate = P.crate();
  for (const [x, z] of [[-50, -8.4], [-51.2, -8.6], [-38, -8.3], [-60, -8.5], [-68.5, -8.4], [-67.4, -8.7], [14, -8.5], [-17, 8.5], [-25.5, 8.4], [33, 8.6], [-90, 8.5]]) {
    place(r() < 0.6 ? barrel : crate, x, z, r() * TAU, 0.9 + r() * 0.2);
  }
  // hitching rails
  for (const [x, z] of [[-44, -6.6], [-23, -6.6], [-64, -6.6], [-20, 6.6], [30, 6.6], [11, -6.6]]) {
    P.fence(ink, cards, [[x - 2.4, z], [x + 2.4, z]], land, P.COL.woodDark);
  }
  // corral behind the livery
  P.fence(ink, cards, [[-112, -34], [-88, -34], [-88, -56], [-112, -56], [-112, -34]], land, P.COL.wood);
  // Boot Hill: crosses and stones
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU, d = 9 + r() * 22;
    const x = BOOTHILL.x + 14 + Math.cos(a) * d * 1.2, z = BOOTHILL.z + 22 + Math.sin(a) * d * 0.8;
    const stone = r() < 0.35;
    if (Math.hypot(x - SPOT.grave[0], z - SPOT.grave[1]) < 4) continue;
    cards.push(x, H(x, z) + 0.62, z, 1.35, stone ? 0.5 : 0.55, stone ? 0.5 : 0.45, stone ? 0.48 : 0.34, 0, 0, 0.5, 0.86, 0, G(stone ? 'n' : r() < 0.5 ? 't' : '+'), FLAG.TWO_SIDED);
  }
  // water tower, windmill
  const wt = P.waterTower();
  place(wt, 30, RAIL_Z - 14, 0.3);
  land.stamp(30, RAIL_Z - 14, 2.6, 2.6, 0, 1);
  const wm = P.windmill();
  place(wm, PLACES.windmill[0], PLACES.windmill[1], 0);
  land.stamp(PLACES.windmill[0], PLACES.windmill[1], 2, 2, 0, 0.9);
  // --- the well, and the small furniture of the first chapter -----------------------------
  {
    const [wx, wz] = SPOT.well, wy = H(wx, wz);
    place(P.well(), wx, wz, Math.PI / 2);
    land.stamp(wx, wz, 1.6, 1.6, 0, 0.9);
    const cream = srgb(0xf0e2c0), board = [0.05, 0.035, 0.025];
    for (const s of [1, -1]) {
      const xc = wx + s * 0.83;
      mesh.quad([xc - s * 0.02, wy + 1.86, wz - 0.95], [xc - s * 0.02, wy + 1.86, wz + 0.95], [xc - s * 0.02, wy + 2.5, wz + 0.95], [xc - s * 0.02, wy + 2.5, wz - 0.95], board);
      B.signAt('WELL', 'WELL', [xc, wy + 2.17, wz], [0, 0, -s], [s, 0, 0], 0.6, cream, [wx + 3.0, wz]);
    }
    const bale = P.hayBale(), sack = P.sack();
    const [hx, hz] = SPOT.hay;
    for (const [dx, dy, dz, yw] of [[0, 0, 0, 0.1], [1.35, 0, 0.1, -0.05], [0.6, 0.62, 0.05, 0.2], [0.1, 0, 0.8, 0.0], [1.4, 0, 0.9, 0.12], [0.7, 0.62, 0.85, -0.1], [0.65, 1.24, 0.45, 0.3]]) {
      cards.append(bale, hx + dx, H(hx, hz) + dy, hz + dz, yw, 1, null);
    }
    const [sx, sz] = SPOT.sacks;
    for (const [dx, dz] of [[0, 0], [0.7, 0.2], [0.3, 0.75], [-0.5, 0.5], [1.1, 0.9]]) cards.append(sack, sx + dx, H(sx, sz), sz + dz, r() * TAU, 1, null);
    place(P.anvil(), SPOT.anvil[0], SPOT.anvil[1], 0.4);
    lights.push({ pos: [SPOT.anvil[0] - 2.2, H(...SPOT.anvil) + 1.2, SPOT.anvil[1] - 1.6], radius: 9, color: [2.2, 0.8, 0.25], intensity: 0.7, flicker: 0.5, seed: 9 });
    const [gx, gz] = SPOT.grave, gy = H(gx, gz);
    place(P.headstone(), gx, gz, 0);
    B.signAt('WALT', 'WALT', [gx, gy + 0.78, gz + 0.13], [1, 0, 0], [0, 0, 1], 0.34, srgb(0xe8e2d4), [gx, gz + 2.2], 0.05);
    B.signAt('WREN', 'WREN', [gx, gy + 0.42, gz + 0.13], [1, 0, 0], [0, 0, 1], 0.26, srgb(0xcfc8b8), [gx, gz + 2.2], 0.03);
  }
  lights.push(...B.lights);

  // --- railroad: the track is a line of # laid flat, and wires hum beside it --------------
  step('laying rail');
  const iron = [0.34, 0.26, 0.2];
  for (let x = -2040; x <= 2040; x += 1.48) {
    ink.push(x, land.railH(x) + 0.12, RAIL_Z, 2.3, iron[0], iron[1], iron[2], 0, 0, 1, 0, 0, G('#'), FLAG.PLANAR);
  }
  let prev = null;
  for (let x = -2016; x <= 2016; x += 48) {
    const z = RAIL_Z - 7, y = H(x, z);
    P.post(cards, x, y, z, 7.2, 0.62, P.COL.woodDark, 0, RAMP.WOOD);
    P.strand(ink, [x, y + 6.6, z - 1.1], [x, y + 6.6, z + 1.1], 0.5, P.COL.woodDark, G('='), { gap: 0.6 });
    if (prev) {
      for (const dz of [-0.9, 0.9]) {
        P.strand(ink, [prev[0], prev[1] + 6.7, z + dz], [x, y + 6.7, z + dz], 0.42, [0.2, 0.2, 0.22], G('-'), { gap: 0.85, sag: 1.3, sway: 0.5 });
      }
    }
    prev = [x, y];
  }

  // --- camps ------------------------------------------------------------------------------
  step('pitching camp');
  const tipis = [P.tipi(1), P.tipi(2), P.tipi(3)];
  const [tx, tz] = PLACES.tipis;
  for (let i = 0; i < 6; i++) {
    const a = 0.5 + (i / 6) * 4.6, d = 13 + (i % 2) * 3;
    const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
    // doors face the fire
    place(tipis[i % 3], x, z, Math.atan2(tx - x, tz - z), 0.9 + r() * 0.2);
    land.stamp(x, z, 2.2, 2.2, 0, 0.9);
  }
  fires.push({ pos: [tx, H(tx, tz) + 0.2, tz], size: 1.25 });
  land.stamp(tx, tz, 3, 3, 0, 0.8);
  const [cx, cz] = PLACES.camp;
  place(P.wagon(), cx + 5.5, cz - 2.5, 0.5);
  place(P.deadTree(41), cx - 4.5, cz - 4, 1.0, 1.3);
  place(barrel, cx + 3.2, cz + 2.2); place(crate, cx + 4.3, cz + 1.2); place(crate, cx + 4.1, cz + 2.4, 0.6);
  fires.push({ pos: [cx, H(cx, cz) + 0.2, cz], size: 1.0 });
  land.stamp(cx, cz, 4, 4, 0, 0.8);
  // logs around both fires
  for (const f of fires) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      P.strand(cards, [f.pos[0] + Math.cos(a) * 0.15, f.pos[1], f.pos[2] + Math.sin(a) * 0.15], [f.pos[0] + Math.cos(a) * 0.8, f.pos[1] + 0.1, f.pos[2] + Math.sin(a) * 0.8], 0.36, [0.13, 0.09, 0.06], G('='), { gap: 0.7 });
    }
    lights.push({ pos: [f.pos[0], f.pos[1] + 1.1, f.pos[2]], radius: 26 * f.size, color: [2.6, 1.15, 0.36], intensity: 1.0 * f.size, flicker: 0.42, seed: f.pos[0] });
  }

  // --- flora and stone --------------------------------------------------------------------
  step('seeding the desert');
  const T = {
    saguaro: [1, 2, 3, 4, 5, 6].map((s) => P.saguaro(s * 13)),
    barrel: [1, 2, 3].map((s) => P.barrelCactus(s * 7)),
    pear: [1, 2, 3].map((s) => P.pricklyPear(s * 11)),
    sage: [1, 2, 3, 4].map((s) => P.sagebrush(s * 5)),
    rock: [1, 2, 3, 4].map((s) => P.rock(s * 3, 0.7)),
    boulder: [1, 2, 3].map((s) => P.rock(s * 19, 2.4)),
    dead: [1, 2, 3].map((s) => P.deadTree(s * 23)),
    tree: [1, 2, 3].map((s) => P.cottonwood(s * 29)),
  };
  const pick = (a) => a[(r() * a.length) | 0];
  const S = (arr, x, z) => land.sample(arr, x, z);
  const scatter = (count, radius, test, emit, tries = 30) => {
    let placed = 0;
    for (let i = 0; i < count * tries && placed < count; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * radius;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (S(land.pack, x, z) > 0.2 || land.waterAt(x, z) > H(x, z) - 0.2) continue;
      if (Math.hypot(x - PLACES.tipis[0], z - PLACES.tipis[1]) < 48 || Math.hypot(x - PLACES.camp[0], z - PLACES.camp[1]) < 16) continue;
      if (Math.hypot(x - SPOT.grave[0], z - SPOT.grave[1]) < 5 || Math.hypot(x - SPOT.dig[0], z - SPOT.dig[1]) < 4) continue;
      const n = land.normalAt(x, z);
      if (n[1] < 0.93) continue;
      if (!test(x, z)) continue;
      emit(x, z);
      placed++;
    }
  };
  const tintV = () => { const k = 0.82 + r() * 0.3; return [k, k, k * (0.95 + r() * 0.1)]; };
  scatter(300, 1750, (x, z) => S(land.rock, x, z) < 0.25 && S(land.veg, x, z) < 0.6 && S(land.veg, x, z) > 0.06 && S(land.moist, x, z) < 0.5 && r() < 0.35 + S(land.veg, x, z),
    (x, z) => place(pick(T.saguaro), x, z, r() * TAU, 0.75 + r() * 0.55, tintV()));
  scatter(330, 1500, (x, z) => S(land.rock, x, z) < 0.4 && S(land.veg, x, z) > 0.05 && S(land.moist, x, z) < 0.6,
    (x, z) => place(r() < 0.5 ? pick(T.barrel) : pick(T.pear), x, z, r() * TAU, 0.8 + r() * 0.6, tintV()));
  scatter(2600, 1750, (x, z) => S(land.rock, x, z) < 0.5 && S(land.veg, x, z) > 0.08 && r() < 0.3 + S(land.veg, x, z) * 0.8,
    (x, z) => place(pick(T.sage), x, z, r() * TAU, 0.7 + r() * 0.8, tintV()));
  scatter(420, 1750, () => true, (x, z) => place(pick(T.rock), x, z, r() * TAU, 0.5 + r() * 1.2, tintV()));
  scatter(260, 1900, (x, z) => { const k = S(land.rock, x, z); return k > 0.12 && k < 0.75; },
    (x, z) => place(pick(T.boulder), x, z, r() * TAU, 0.6 + r() * 1.0, tintV()));
  scatter(70, 1500, (x, z) => S(land.veg, x, z) < 0.5 && S(land.moist, x, z) < 0.3,
    (x, z) => place(pick(T.dead), x, z, r() * TAU, 0.8 + r() * 0.7));
  scatter(85, 1400, (x, z) => S(land.moist, x, z) > 0.72, (x, z) => place(pick(T.tree), x, z, r() * TAU, 0.8 + r() * 0.5, tintV()), 400);

  step('typesetting');
  const statics = new StaticBatch(gl, 128);
  statics.add('card', cards, 11);
  statics.add('ink', ink, 13);
  statics.add('text', text, 17);
  mesh.upload();
  return { statics, mesh, lights, fires, signs: B.signs, rects: B.rects, counts: { cards: cards.count, ink: ink.count + text.count } };
}
