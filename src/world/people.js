// People, typeset. One sculpted figure with a ten-bone skeleton, dressed by options.

import { Sculpt } from '../engine/sculpt.js';
import { FLAG } from '../engine/batch.js';
import { RAMP, G } from '../engine/atlas.js';
import { m4, srgb, TAU } from '../engine/math.js';

const SOLID = FLAG.RAMP | FLAG.CONTOUR;
export const HB = { body: 0, head: 1, laU: 2, laL: 3, raU: 4, raL: 5, llU: 6, llL: 7, rlU: 8, rlL: 9 };
const HP = {
  body: [0, 0.95, 0], head: [0, 1.5, 0],
  laU: [0, 1.4, 0.24], laL: [0, 1.13, 0.27], raU: [0, 1.4, -0.24], raL: [0, 1.13, -0.27],
  llU: [0, 0.93, 0.1], llL: [0, 0.5, 0.11], rlU: [0, 0.93, -0.1], rlL: [0, 0.5, -0.11],
};

// o: { skin, shirt, pants, boots, hair, hat: 'wide'|'bowler'|'bonnet'|null, hatCol, dress, apron,
//      coat, bandana, star, beard }  (colours are sRGB hex)
export function person(o = {}) {
  const s = new Sculpt();
  const c = (hex, d) => srgb(hex ?? d);
  const cloth = (col, bone, k = 0.04, extra = {}) => ({ color: col, ramp: RAMP.CLOTH, flags: SOLID, bone, k, ...extra });
  const skin = { color: c(o.skin, 0xb9805a), ramp: RAMP.HIDE, flags: SOLID, bone: HB.head, k: 0.03 };
  const shirt = c(o.shirt, 0xb8ab90), pants = c(o.pants, 0x8a7458), boots = c(o.boots, 0x4a3424);
  // trunk
  s.cone([0, 0.96, 0], [0, 1.42, 0], 0.17, 0.2, cloth(shirt, HB.body, 0.06));
  s.sphere([0, 0.95, 0], 0.175, cloth(pants, HB.body, 0.05));
  if (o.dress) {
    s.cone([0, 1.02, 0], [0, 0.12, 0], 0.2, 0.4, cloth(c(o.dress), HB.body, 0, { flags: SOLID | FLAG.SWAY, sway: (x, y) => Math.max(0, (0.9 - y) * 0.12) }));
  }
  if (o.coat) {
    s.cone([0, 1.44, 0], [0, 0.55, 0], 0.22, 0.33, cloth(c(o.coat), HB.body, 0, { flags: SOLID | FLAG.SWAY, sway: (x, y) => Math.max(0, (1.2 - y) * 0.14) }));
  }
  if (o.apron) s.box([0.14, 1.02, 0], [0.06, 0.34, 0.17], 0.03, cloth(c(o.apron), HB.body, 0));
  if (o.star) s.sphere([0.2, 1.3, 0.09], 0.065, { color: [1.0, 0.8, 0.25], glyph: G('*'), flags: 0, bone: HB.body, k: 0, emis: 0.5, size: 1.3 });
  // head
  s.sphere([0.01, 1.62, 0], 0.125, skin);
  if (o.hair !== null) s.sphere([-0.03, 1.66, 0], 0.125, cloth(c(o.hair, 0x2a2019), HB.head, 0.01));
  if (o.beard) s.sphere([0.06, 1.54, 0], 0.095, cloth(c(o.beard), HB.head, 0.01));
  if (o.bandana) s.sphere([0.02, 1.47, 0], 0.115, cloth(c(o.bandana), HB.head, 0.02));
  const hat = cloth(c(o.hatCol, 0x3a2a1e), HB.head, 0.02, { ramp: RAMP.HIDE });
  if (o.hat === 'wide') {
    s.cylinder([0, 1.7, 0], [0, 1.78, 0], 0.29, hat);
    s.cylinder([0, 1.77, 0], [0, 1.93, 0], 0.135, hat);
  } else if (o.hat === 'bowler') {
    s.cylinder([0, 1.71, 0], [0, 1.78, 0], 0.19, hat);
    s.sphere([0, 1.79, 0], 0.13, hat);
  } else if (o.hat === 'bonnet') {
    s.sphere([-0.03, 1.66, 0], 0.16, hat);
    s.cylinder([0.02, 1.6, 0], [0.1, 1.7, 0], 0.17, hat);
  }
  // limbs
  for (const [z, u, l] of [[1, HB.laU, HB.laL], [-1, HB.raU, HB.raL]]) {
    s.cone([0, 1.41, 0.24 * z], [0, 1.13, 0.27 * z], 0.075, 0.065, cloth(shirt, u));
    s.cone([0, 1.13, 0.27 * z], [0.03, 0.88, 0.27 * z], 0.065, 0.06, cloth(shirt, l));
    s.sphere([0.03, 0.84, 0.27 * z], 0.065, { ...skin, bone: l });
  }
  if (!o.dress) {
    for (const [z, u, l] of [[1, HB.llU, HB.llL], [-1, HB.rlU, HB.rlL]]) {
      s.cone([0, 0.93, 0.1 * z], [0, 0.5, 0.11 * z], 0.095, 0.08, cloth(pants, u, 0.05));
      s.cone([0, 0.5, 0.11 * z], [0, 0.1, 0.11 * z], 0.075, 0.065, cloth(pants, l));
      s.capsule([0, 0.06, 0.11 * z], [0.13, 0.05, 0.11 * z], 0.07, { color: boots, ramp: RAMP.HIDE, flags: SOLID, bone: l, k: 0.02 });
    }
  }
  return s.bake({ res: o.res ?? 0.062, clipY: 0.0, seed: o.seed ?? 5 });
}

const _r = m4.create(), _t = m4.create(), _y = m4.create();
function bone(bones, i, parent, pivot, angle, ax = 0, ay = 0, az = 1) {
  m4.rotationAbout(_r, pivot, ax, ay, az, angle);
  m4.mul(bones.subarray(i * 16, i * 16 + 16), bones.subarray(parent * 16, parent * 16 + 16), _r);
}

// p: { phase 0..1, gait 0..1, time, look (head yaw), gesture: 'talk'|'work'|'boo'|'sit'|null, seed }
export function posePerson(bones, p) {
  const ph = TAU * p.phase, g = p.gait || 0, t = p.time + (p.seed || 0) * 7.3, idle = 1 - g;
  const sw = Math.sin(ph);
  m4.rotationAbout(_r, HP.body, 0, 0, 1, -0.09 * g + idle * 0.012 * Math.sin(t * 1.3));
  m4.translation(_t, 0, g * 0.035 * Math.abs(Math.cos(ph)) - (p.gesture === 'sit' ? 0.42 : 0), 0);
  m4.mul(bones.subarray(0, 16), _t, _r);
  // head: look where asked, and breathe
  m4.rotationAbout(_r, HP.head, 0, 1, 0, p.look || 0);
  m4.rotationAbout(_y, HP.head, 0, 0, 1, idle * 0.04 * Math.sin(t * 0.8) + g * 0.05);
  m4.mul(_r, _r, _y);
  m4.mul(bones.subarray(16, 32), bones.subarray(0, 16), _r);
  // legs
  const sit = p.gesture === 'sit';
  bone(bones, HB.llU, HB.body, HP.llU, sit ? 1.35 : g * 0.62 * sw);
  bone(bones, HB.llL, HB.llU, HP.llL, sit ? -1.35 : -g * 1.0 * Math.max(0, Math.sin(ph - 1.2)));
  bone(bones, HB.rlU, HB.body, HP.rlU, sit ? 1.3 : -g * 0.62 * sw);
  bone(bones, HB.rlL, HB.rlU, HP.rlL, sit ? -1.3 : -g * 1.0 * Math.max(0, Math.sin(ph - 1.2 + Math.PI)));
  // arms
  let lu = -g * 0.5 * sw + idle * 0.03 * Math.sin(t * 1.1), ll = g * 0.35 + 0.08;
  let ru = g * 0.5 * sw - idle * 0.03 * Math.sin(t * 1.1), rl = g * 0.35 + 0.08;
  if (p.gesture === 'talk') { ru = 0.55 + 0.18 * Math.sin(t * 4.2); rl = 1.0 + 0.25 * Math.sin(t * 5.1 + 1); }
  else if (p.gesture === 'work') { ru = 1.25 + 0.75 * Math.sin(t * 6.5); rl = 0.55; lu = 0.5; ll = 0.7; }
  else if (p.gesture === 'boo') { ru = 2.7 + 0.3 * Math.sin(t * 16); lu = 2.7 + 0.3 * Math.cos(t * 16); rl = 0.2; ll = 0.2; }
  else if (p.gesture === 'sit') { ru = 0.5; lu = 0.5; rl = 0.6; ll = 0.6; }
  bone(bones, HB.laU, HB.body, HP.laU, lu);
  bone(bones, HB.laL, HB.laU, HP.laL, ll);
  bone(bones, HB.raU, HB.body, HP.raU, ru);
  bone(bones, HB.raL, HB.raU, HP.raL, rl);
}
