// Things that move: a rider at full gallop, tumbleweeds, the windmill's fan.

import { Sculpt } from '../engine/sculpt.js';
import { Template, FLAG, MAX_BONES } from '../engine/batch.js';
import { RAMP } from '../engine/atlas.js';
import { m4, srgb, TAU, clamp } from '../engine/math.js';
import { KIND } from '../engine/particles.js';
import * as P from './props.js';

const SOLID = FLAG.RAMP | FLAG.CONTOUR;
const B = { body: 0, neck: 1, head: 2, tail: 3, flU: 4, flL: 5, frU: 6, frL: 7, hlU: 8, hlL: 9, hrU: 10, hrL: 11, torso: 12, rhead: 13, laU: 14, laL: 15, raU: 16, raL: 17 };
const PIV = {
  body: [0, 1.25, 0], neck: [0.62, 1.42, 0], head: [1.1, 2.0, 0], tail: [-0.94, 1.45, 0],
  flU: [0.58, 1.15, 0.2], flL: [0.6, 0.62, 0.2], frU: [0.58, 1.15, -0.2], frL: [0.6, 0.62, -0.2],
  hlU: [-0.6, 1.2, 0.21], hlL: [-0.74, 0.66, 0.21], hrU: [-0.6, 1.2, -0.21], hrL: [-0.74, 0.66, -0.21],
  torso: [0, 1.62, 0], rhead: [0.03, 2.32, 0], laU: [0.02, 2.2, 0.25], laL: [0.18, 1.95, 0.3], raU: [0.02, 2.2, -0.25], raL: [0.18, 1.95, -0.3],
};

export function horseAndRider(coatHex = 0x7d4c2c, serape = [0xa33a2a, 0xd9c08a, 0x2f7f7a, 0xc98a2e]) {
  const s = new Sculpt();
  const coat = srgb(coatHex), black = [0.02, 0.018, 0.016];
  const h = (bone, k = 0.1) => ({ color: coat, ramp: RAMP.HIDE, flags: SOLID, bone, k });
  const hair = (bone, sway) => ({ color: black, ramp: RAMP.LEAF, flags: FLAG.RAMP | FLAG.TWO_SIDED | FLAG.SWAY, sway, bone, k: 0.03 });
  // --- horse
  s.capsule([-0.5, 1.28, 0], [0.45, 1.3, 0], 0.33, h(B.body, 0.2));
  s.sphere([0.55, 1.3, 0], 0.35, h(B.body, 0.2));
  s.sphere([-0.62, 1.33, 0], 0.37, h(B.body, 0.2));
  s.cone([0.62, 1.42, 0], [1.12, 2.0, 0], 0.26, 0.15, h(B.neck, 0.16));
  s.cone([1.1, 2.05, 0], [1.52, 1.72, 0], 0.15, 0.09, h(B.head, 0.08));
  s.sphere([1.2, 1.93, 0], 0.14, h(B.head, 0.08));
  for (const z of [0.075, -0.075]) s.cone([1.08, 2.18, z], [1.02, 2.36, z * 1.3], 0.055, 0.04, h(B.head, 0.02));
  s.capsule([0.62, 1.66, 0], [1.05, 2.18, 0], 0.075, hair(B.neck, 0.45));
  s.cone([-0.95, 1.45, 0], [-1.2, 1.02, 0], 0.11, 0.08, hair(B.tail, 0.5));
  s.cone([-1.2, 1.02, 0], [-1.3, 0.55, 0], 0.08, 0.055, hair(B.tail, 0.9));
  const leg = (z, front, u, l) => {
    if (front) {
      s.cone([0.58, 1.15, z], [0.6, 0.62, z], 0.12, 0.075, h(u, 0.12));
      s.cone([0.6, 0.62, z], [0.6, 0.12, z], 0.065, 0.055, h(l, 0.03));
      s.cylinder([0.6, 0.0, z], [0.6, 0.13, z], 0.08, { color: black, ramp: RAMP.ROCK, flags: SOLID, bone: l, k: 0 });
    } else {
      s.cone([-0.6, 1.2, z], [-0.74, 0.66, z], 0.16, 0.085, h(u, 0.14));
      s.cone([-0.74, 0.66, z], [-0.68, 0.12, z], 0.065, 0.055, h(l, 0.03));
      s.cylinder([-0.68, 0.0, z], [-0.68, 0.13, z], 0.08, { color: black, ramp: RAMP.ROCK, flags: SOLID, bone: l, k: 0 });
    }
  };
  leg(0.2, true, B.flU, B.flL); leg(-0.2, true, B.frU, B.frL);
  leg(0.21, false, B.hlU, B.hlL); leg(-0.21, false, B.hrU, B.hrL);
  // --- tack
  const stripes = serape.map(srgb);
  s.box([-0.05, 1.63, 0], [0.4, 0.06, 0.36], 0.03, { color: (x) => stripes[Math.abs(Math.floor(x * 9)) % stripes.length], ramp: RAMP.CLOTH, flags: SOLID, bone: B.body, k: 0.02 });
  s.box([-0.05, 1.7, 0], [0.28, 0.06, 0.24], 0.04, { color: srgb(0x4a2c1a), ramp: RAMP.HIDE, flags: SOLID, bone: B.body, k: 0.03 });
  // --- rider
  const jeans = { color: srgb(0x2c3a5a), ramp: RAMP.CLOTH, flags: SOLID, bone: B.body, k: 0.05 };
  const boot = { color: srgb(0x2a1a12), ramp: RAMP.HIDE, flags: SOLID, bone: B.body, k: 0.02 };
  for (const z of [1, -1]) {
    s.cone([0.0, 1.76, 0.15 * z], [0.3, 1.44, 0.38 * z], 0.11, 0.09, jeans);
    s.cone([0.3, 1.44, 0.38 * z], [0.22, 0.98, 0.42 * z], 0.08, 0.07, jeans);
    s.cone([0.22, 0.98, 0.42 * z], [0.36, 0.88, 0.42 * z], 0.075, 0.065, boot);
  }
  s.cone([0, 1.72, 0], [0.02, 2.24, 0], 0.2, 0.19, { color: srgb(0x8a7a62), ramp: RAMP.CLOTH, flags: SOLID, bone: B.torso, k: 0.05 });
  // serape: a striped cone of cloth that flutters
  s.cone([0.0, 1.78, 0], [0.02, 2.3, 0], 0.46, 0.22, {
    color: (x, y) => stripes[Math.abs(Math.floor(y * 11)) % stripes.length],
    ramp: RAMP.CLOTH, flags: FLAG.RAMP | FLAG.CONTOUR | FLAG.SWAY, sway: (x, y) => clamp((2.3 - y) * 0.5, 0, 0.3), bone: B.torso, k: 0,
  });
  const skin = { color: srgb(0xb9805a), ramp: RAMP.HIDE, flags: SOLID, bone: B.rhead, k: 0.03 };
  s.sphere([0.04, 2.5, 0], 0.13, skin);
  s.sphere([0.05, 2.36, 0], 0.15, { color: srgb(0xa3271e), ramp: RAMP.CLOTH, flags: SOLID, bone: B.rhead, k: 0.02 });
  const hat = { color: srgb(0x2e2218), ramp: RAMP.HIDE, flags: SOLID, bone: B.rhead, k: 0.02 };
  s.cylinder([0.04, 2.58, 0], [0.04, 2.67, 0], 0.33, hat);
  s.cylinder([0.04, 2.66, 0], [0.04, 2.84, 0], 0.15, hat);
  const sleeve = (bone) => ({ color: srgb(0x8a7a62), ramp: RAMP.CLOTH, flags: SOLID, bone, k: 0.03 });
  for (const [z, u, l] of [[1, B.laU, B.laL], [-1, B.raU, B.raL]]) {
    s.cone([0.02, 2.2, 0.25 * z], [0.18, 1.95, 0.3 * z], 0.08, 0.07, sleeve(u));
    s.cone([0.18, 1.95, 0.3 * z], [0.45, 1.9, 0.13 * z], 0.07, 0.06, sleeve(l));
    s.sphere([0.47, 1.9, 0.12 * z], 0.065, { ...skin, bone: l });
  }
  return s.bake({ res: 0.06, seed: 99 });
}

const _r = m4.create(), _t = m4.create();
function setBone(bones, i, parent, pivot, angle, ax = 0, ay = 0, az = 1) {
  m4.rotationAbout(_r, pivot, ax, ay, az, angle);
  const out = bones.subarray(i * 16, i * 16 + 16);
  if (parent < 0) out.set(_r);
  else m4.mul(out, bones.subarray(parent * 16, parent * 16 + 16), _r);
}

// Pose the skeleton. phase: stride 0..1, gait: 0 standing .. 1 full gallop.
export function poseHorse(bones, phase, gait, time) {
  const s = (o) => Math.sin(TAU * (phase + o));
  const idle = 1 - gait;
  // body: pitch and bob, baked into the root bone
  m4.rotationAbout(_r, PIV.body, 0, 0, 1, 0.07 * gait * s(0.05));
  m4.translation(_t, 0, gait * 0.1 * s(0.2) + idle * 0.008 * Math.sin(time * 1.6), 0);
  m4.mul(bones.subarray(0, 16), _t, _r);
  setBone(bones, B.neck, B.body, PIV.neck, gait * (-0.28 + 0.13 * s(0.3)) + idle * 0.06 * Math.sin(time * 0.7));
  setBone(bones, B.head, B.neck, PIV.head, gait * (0.2 - 0.1 * s(0.3)) + idle * 0.1 * Math.sin(time * 0.9 + 1));
  setBone(bones, B.tail, B.body, PIV.tail, gait * (-1.0 + 0.2 * s(0.1)) + idle * 0.1 * Math.sin(time * 2.3));
  const legs = [[B.flU, B.flL, PIV.flU, PIV.flL, 0.5, 1], [B.frU, B.frL, PIV.frU, PIV.frL, 0.62, 1], [B.hlU, B.hlL, PIV.hlU, PIV.hlL, 0.0, 0], [B.hrU, B.hrL, PIV.hrU, PIV.hrL, 0.12, 0]];
  for (const [u, l, pu, pl, off, front] of legs) {
    const sw = s(off), lift = Math.max(0, Math.sin(TAU * (phase + off) + 1.25));
    setBone(bones, u, B.body, pu, gait * (front ? 0.78 * sw + 0.12 : 0.66 * sw - 0.1));
    setBone(bones, l, u, pl, gait * (front ? -1.35 * lift : 0.95 * lift - 0.25 * Math.max(0, -sw)));
  }
  setBone(bones, B.torso, B.body, PIV.torso, gait * (-0.3 - 0.08 * s(0.45)));
  setBone(bones, B.rhead, B.torso, PIV.rhead, gait * (0.22 + 0.06 * s(0.45)) + idle * 0.15 * Math.sin(time * 0.4), 0, idle, gait);
  for (const [u, l, pu, pl] of [[B.laU, B.laL, PIV.laU, PIV.laL], [B.raU, B.raL, PIV.raU, PIV.raL]]) {
    setBone(bones, u, B.torso, pu, gait * (0.25 + 0.1 * s(0.3)));
    setBone(bones, l, u, pl, gait * 0.12 * s(0.35));
  }
}

// Closed Catmull-Rom loop through 2D points.
function spline(pts, t) {
  const n = pts.length, i = Math.floor(t) % n, f = t - Math.floor(t);
  const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
  const c = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * f + (2 * a - 5 * b + 4 * cc - d) * f * f + (-a + 3 * b - 3 * cc + d) * f * f * f);
  return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
}

export class Rider {
  constructor(gl, layer, path, opts = {}) {
    this.template = new Template(gl, horseAndRider(opts.coat, opts.serape), 3);
    this.e = layer.add({ template: this.template });
    this.path = path;
    this.u = opts.start || 0;
    this.speed = opts.speed ?? 11.5;
    this.phase = 0;
    this.pos = [0, 0, 0];
    this.heading = [1, 0];
    this.disturber = { x: 0, z: 0, radius: 3.4, strength: 1.5 };
    this.dustAcc = 0;
  }
  update(dt, engine, particles) {
    const land = engine.land;
    const a = spline(this.path, this.u), b = spline(this.path, this.u + 0.01);
    const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.01;
    this.u += (this.speed * dt) / Math.max(dl, 1);
    const p = spline(this.path, this.u), q = spline(this.path, this.u + 0.004);
    let hx = q[0] - p[0], hz = q[1] - p[1];
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl; hz /= hl;
    const y = land.heightAt(p[0], p[1]);
    const slope = (land.heightAt(p[0] + hx * 1.2, p[1] + hz * 1.2) - land.heightAt(p[0] - hx * 1.2, p[1] - hz * 1.2)) / 2.4;
    this.pos = [p[0], y, p[1]];
    this.heading = [hx, hz];
    const gait = clamp(this.speed / 9, 0, 1);
    this.phase = (this.phase + dt * (0.9 + this.speed * 0.125)) % 1;
    poseHorse(this.e.bones, this.phase, gait, engine.time);
    const m = this.e.model;
    m4.rotation(m, 0, 1, 0, Math.atan2(-hz, hx));
    m4.rotation(_r, 0, 0, 1, Math.atan(slope) * 0.8);
    m4.mul(m, m, _r);
    m[12] = p[0]; m[13] = y + 0.02; m[14] = p[1];
    this.disturber.x = p[0]; this.disturber.z = p[1];
    // hooves strike twice a stride: kick up dust behind
    if (particles && gait > 0.3) {
      this.dustAcc += dt * 26 * gait;
      while (this.dustAcc > 1) {
        this.dustAcc -= 1;
        const side = (Math.random() - 0.5) * 0.7, back = -0.4 - Math.random() * 1.2;
        particles.emit(KIND.dust, p[0] + hx * back - hz * side, y + 0.1, p[1] + hz * back + hx * side,
          -hx * (1 + Math.random() * 2) + (Math.random() - 0.5), 0.6 + Math.random() * 1.6, -hz * (1 + Math.random() * 2) + (Math.random() - 0.5), 1.2 + Math.random() * 1.6, 0.8 + Math.random() * 0.9);
      }
    }
  }
}

export class Tumbleweeds {
  constructor(gl, layer, count = 9) {
    const tpl = [new Template(gl, P.tumbleweed(1), 1), new Template(gl, P.tumbleweed(2), 2)];
    this.items = [];
    for (let i = 0; i < count; i++) {
      this.items.push({ e: layer.add({ template: tpl[i % 2] }), x: 0, z: 0, y: 0, vy: 0, spin: Math.random() * 6, scale: 0.8 + Math.random() * 0.8, live: false, sp: 0.6 + Math.random() * 0.6 });
    }
  }
  update(dt, engine) {
    const land = engine.land, wd = engine.atmo.windDir, ws = 2 + engine.atmo.env.wind * 9;
    const c = engine.cam.target;
    for (const t of this.items) {
      const far = Math.hypot(t.x - c[0], t.z - c[2]);
      if (!t.live || far > 260) {
        // respawn upwind of where we are looking
        const side = (Math.random() - 0.5) * 300, up = 60 + Math.random() * 170;
        t.x = c[0] - wd[0] * up - wd[1] * side;
        t.z = c[2] - wd[1] * up + wd[0] * side;
        t.y = land.heightAt(t.x, t.z) + 0.5;
        t.live = true;
      }
      const v = ws * t.sp;
      t.x += wd[0] * v * dt; t.z += wd[1] * v * dt;
      const g = land.heightAt(t.x, t.z) + 0.46 * t.scale;
      t.vy -= 9 * dt; t.y += t.vy * dt;
      if (t.y < g) { t.y = g; t.vy = Math.random() < 0.3 ? 1.5 + Math.random() * 2.5 : 0.6; }
      t.spin += (v / (0.48 * t.scale)) * dt;
      const m = t.e.model;
      m4.rotation(m, wd[1], 0, -wd[0], t.spin);
      for (let i = 0; i < 12; i++) m[i] *= t.scale;
      m[12] = t.x; m[13] = t.y; m[14] = t.z;
      t.e.hidden = land.sample(land.pack, t.x, t.z) > 0.95;
    }
  }
}

export class WindmillFan {
  constructor(gl, layer, x, y, z) {
    this.e = layer.add({ template: new Template(gl, P.windmillFan(), 5) });
    this.pos = [x, y, z];
    this.angle = 0;
  }
  update(dt, engine) {
    const wd = engine.atmo.windDir;
    this.angle += dt * (0.6 + engine.atmo.env.wind * 5);
    const m = this.e.model;
    // fan's own z axis points into the wind
    m4.rotation(m, 0, 1, 0, Math.atan2(wd[0], wd[1]));
    m4.rotation(_r, 0, 0, 1, this.angle);
    m4.mul(m, m, _r);
    m[12] = this.pos[0] + wd[0] * 0.5; m[13] = this.pos[1]; m[14] = this.pos[2] + wd[1] * 0.5;
  }
}
