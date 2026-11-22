// The game core: the player, the townsfolk, the things you can face and the words you can
// use on them. Chapter content lives in chapter1.js; this file knows nothing of the story.

import { TypeCase, LEX } from './letters.js';
import { Signs } from './signs.js';
import { UI } from './ui.js';
import { Template } from '../engine/batch.js';
import { person, posePerson } from '../world/people.js';
import { m4, clamp, lerp, TAU } from '../engine/math.js';

const SAVE_KEY = 'sundown.chapter1.v1';
const EMBER = [1.0, 0.55, 0.18], CREAM = [0.94, 0.88, 0.74];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // engine, land, world, entities, particles, weather, text, sfx
    this.signs = new Signs(ctx.world.signs);
    this.tc = new TypeCase();
    this.things = [];
    this.npcs = {};
    this.floaters = [];
    this.barks = [];
    this.active = false;
    this.busy = false;
    this.focus = null;
    this.cam = { yaw: Math.PI / 2, pitch: 0.4, dist: 17 };
    this.keys = new Set();
    this.target = null;
    this.timeRate = 1 / 110; // game hours per second
    this.hourCap = 24;
    this.S = null;
    this.ui = new UI({
      verb: (w) => this.speak(w),
      speak: (w) => this.speak(w),
      free: (a) => { if (!this.busy) this.run(() => a.run(this, this.target)); },
      menu: () => this.openJournal(),
    });
    const gl = this.engine.gl;
    const look = { shirt: 0xe6dcc2, pants: 0x7a6248, bandana: 0xc8362c, hair: 0x2a2019 };
    this.tplBare = new Template(gl, person({ ...look, seed: 1 }), 21);
    this.tplHat = new Template(gl, person({ ...look, hat: 'wide', hatCol: 0x5a4632, seed: 1 }), 22);
    this.player = { x: 0, z: 0, y: 0, yaw: 0, phase: 0, gait: 0, dest: null, destThing: null, gesture: null, gestureT: 0, stuck: 0,
      ent: this.entities.add({ template: this.tplBare, fill: 0.34, minPx: 7 }), disturber: { x: 0, z: 0, radius: 1.5, strength: 1.0 } };
    this.player.ent.hidden = true;
    this.engine.disturbers.push(this.player.disturber);
    this._bindInput();
  }

  // ------------------------------------------------------------------ building the cast
  addNpc(o) {
    const n = Object.assign({ yaw: 0, phase: 0, gait: 0, gesture: null, idle: null, path: null, speaking: 0, seed: this.things.length, r: 3.4, label: 2.1 }, o);
    n.template = new Template(this.engine.gl, person({ ...o.look, seed: 30 + this.things.length }), 40 + this.things.length);
    n.ent = this.entities.add({ template: n.template, fill: 0.2, minPx: 7 });
    n.ent.hidden = true;
    n.home = [n.x, n.z, n.yaw];
    n.npc = true;
    this.npcs[n.id] = n;
    this.things.push(n);
    return n;
  }
  addThing(o) {
    const t = Object.assign({ r: 3.2, label: 1.4 }, o);
    this.things.push(t);
    return t;
  }
  thing(id) { return this.things.find((t) => t.id === id); }

  // ------------------------------------------------------------------ state
  newState() {
    return { ch: 0, flags: {}, known: [], log: [], standing: 0, hour: 6.7, pos: null, yaw: 0, hat: false, pried: [] };
  }
  begin(chapter, fresh) {
    this.chapter = chapter;
    let data = null;
    if (!fresh) {
      try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { data = null; }
    }
    this.S = data ? Object.assign(this.newState(), data.S) : this.newState();
    this.tc = new TypeCase(data ? data.letters : []);
    this.signs.restore(data ? data.signs : null);
    chapter.enter(!data);
    const p = this.player;
    if (this.S.pos) { p.x = this.S.pos[0]; p.z = this.S.pos[1]; p.yaw = this.S.yaw; }
    p.y = this.land.heightAt(p.x, p.z);
    p.ent.hidden = false;
    this.setHat(this.S.hat);
    this.ui.setCase(this.tc);
    this.ui.show(true);
    this.active = true;
    const t = this.engine.cam.target;
    t[0] = p.x; t[1] = p.y + 1.5; t[2] = p.z;
    this.engine.atmo.dayLength = 0;
  }
  stop() {
    this.active = false;
    this.ui.show(false);
    this.ui.closeDialogue();
    this.player.ent.hidden = true;
    for (const id in this.npcs) this.npcs[id].ent.hidden = true;
  }
  save() {
    if (!this.S) return;
    this.S.pos = [this.player.x, this.player.z];
    this.S.yaw = this.player.yaw;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ S: this.S, letters: this.tc.items, signs: this.signs.serialize() }));
    } catch (e) { /* storage may be unavailable; the game still plays */ }
  }
  clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ } }
  setHat(on) {
    this.S.hat = on;
    this.player.ent.template = on ? this.tplHat : this.tplBare;
  }
  // move the story on; `note` goes in the journal
  stage(n, note) {
    this.S.ch = n;
    if (note) this.S.log.push(note);
    this.chapter.onStage && this.chapter.onStage(n);
    this.save();
  }
  flag(k, v = 1) { this.S.flags[k] = v; }
  stand(d) { this.S.standing += d; }

  // ------------------------------------------------------------------ script helpers
  async run(fn) {
    if (this.busy) return;
    this.busy = true;
    this.player.dest = null;
    try { await fn(); } catch (e) { console.error(e); window.__error = String((e && e.stack) || e); }
    this.ui.closeDialogue();
    for (const id in this.npcs) this.npcs[id].speaking = 0;
    this.focus = null;
    this.busy = false;
    this.save();
  }
  // a line of speech; `who` is an npc (or its id), or a plain string for narration
  async say(who, text) {
    const n = typeof who === 'string' ? this.npcs[who] : who;
    for (const id in this.npcs) this.npcs[id].speaking = 0;
    if (n) { n.speaking = 1; this.frame(n); }
    await this.ui.say(n ? n.name : who || '', text);
  }
  // words: 'NOD' (spelled), or { label, key, free: true, note }. Returns the key chosen.
  async choose(who, text, words) {
    const n = typeof who === 'string' ? this.npcs[who] : who;
    const opts = words.map((w) => {
      if (typeof w === 'string') {
        const lack = this.tc.missing(w);
        return { label: w, word: w, key: w, ok: lack.length === 0, lack: lack.join(' ') };
      }
      return { label: w.label, key: w.key ?? w.label, free: !w.bold, ok: w.ok !== false, note: w.note, lack: w.lack };
    });
    if (!opts.some((o) => o.ok)) opts.push({ label: '...', key: '...', free: true, ok: true });
    const i = await this.ui.choose(n ? n.name : who || '', text, opts);
    const o = opts[i];
    if (o.word) { this.fxSpeak(o.word); this.sfx && this.sfx('word'); }
    return o.key;
  }
  // camera: a two-shot of the player and whoever is talking
  frame(n) {
    const p = this.player, mx = (p.x + n.x) / 2, mz = (p.z + n.z) / 2;
    const side = Math.atan2(n.x - p.x, n.z - p.z) + Math.PI / 2;
    const y = this.land.heightAt(mx, mz) + 1.35;
    // stand the camera on whichever side is more open (not under a porch or inside a wall)
    const clear = (yw) => { let c = 0; for (let t = 1.5; t <= 8.5; t += 0.7) { if (this.blocked(mx + Math.sin(yw) * t, y + 0.2 * t, mz + Math.cos(yw) * t, true)) break; c++; } return c; };
    const a = clear(side), b = clear(side + Math.PI);
    const yaw = a !== b ? (a > b ? side : side + Math.PI) : Math.abs(angDiff(side, this.engine.cam.yaw)) < Math.PI / 2 ? side : side + Math.PI;
    this.focus = { x: mx, y, z: mz, dist: 8.5, pitch: 0.2, yaw };
  }
  // letters arrive: they fly from `from` to the player and drop into the case
  async give(chars, from) {
    const p = this.player, src = from ? [from.x ?? from[0], (from.y ?? this.land.heightAt(from.x ?? from[0], from.z ?? from[2])) + (from.label ?? 1.6), from.z ?? from[2]] : [p.x, p.y + 4, p.z];
    if (Array.isArray(from) && from.length === 3) { src[0] = from[0]; src[1] = from[1]; src[2] = from[2]; }
    [...chars].forEach((ch, i) => {
      this.floaters.push({ ch, x: src[0], y: src[1], z: src[2], home: true, t: -i * 0.13, life: 0.75, size: 0.6, col: EMBER, arc: 1.3 + (i % 3) * 0.3 });
    });
    if (!this.ui.auto) await wait(650 + chars.length * 130);
    this.tc.add(chars);
    this.ui.setCase(this.tc, chars);
    this.ui.toast('+ <b>' + [...chars].join(' ') + '</b>');
    this.sfx && this.sfx('letter');
    this.save();
  }
  // a letter leaves the case and flies to a place in the world
  lose(ch, to) {
    if (!this.tc.remove(ch)) return false;
    const p = this.player;
    this.floaters.push({ ch, x: p.x, y: p.y + 1.9, z: p.z, to, t: 0, life: 0.6, size: 0.6, col: EMBER, arc: 1.2 });
    this.ui.setCase(this.tc);
    return true;
  }
  learn(word) {
    if (this.S.known.includes(word)) return;
    this.S.known.push(word);
    this.ui.toast('new word: <b>' + word + '</b>');
    this.ui.ctxKey = '';
  }
  toast(t) { this.ui.toast(t); }
  // a word shouted into the world as big glyphs
  bark(from, text, col = CREAM, size = 0.75, life = 2.4) {
    const y = (from.y ?? this.land.heightAt(from.x, from.z)) + (from.label ?? 2.0) + 0.7;
    this.barks.push({ text, x: from.x, y, z: from.z, t: 0, life, size, col });
  }
  fxSpeak(word) {
    const p = this.player, t = this.target;
    const dx = t ? t.x - p.x : Math.cos(-p.yaw), dz = t ? t.z - p.z : Math.sin(-p.yaw), l = Math.hypot(dx, dz) || 1;
    [...word].forEach((ch, i) => {
      this.floaters.push({ ch, x: p.x, y: p.y + 2.0, z: p.z, vx: (dx / l) * 3.2 + (Math.random() - 0.5), vy: 1.6 + Math.random(), vz: (dz / l) * 3.2 + (Math.random() - 0.5), t: -i * 0.07, life: 1.0, size: 0.55, col: CREAM });
    });
    p.gesture = word === 'BOO' ? 'boo' : 'talk';
    p.gestureT = 0.9;
  }
  async lapse(toHour, seconds) {
    const from = this.S.hour;
    if (this.ui.auto) { this.S.hour = toHour; return; }
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        this.S.hour = from + (toHour - from) * k * k * (3 - 2 * k);
        if (k < 1) requestAnimationFrame(tick); else res();
      };
      tick();
    });
  }
  async pause(ms) { if (!this.ui.auto) await wait(ms); }

  // ------------------------------------------------------------------ words
  verbsOf(t) {
    const v = typeof t.verbs === 'function' ? t.verbs(this, t) : t.verbs;
    return v || {};
  }
  // say a word: to whatever is in front of you, or to the air
  speak(word) {
    if (this.busy || !this.active) return;
    const lack = this.tc.missing(word);
    if (lack.length) { this.toast('You lack <b>' + lack.join(' ') + '</b>'); return; }
    const t = this.target, verbs = t ? this.verbsOf(t) : {};
    this.fxSpeak(word);
    this.sfx && this.sfx('word');
    const known = LEX[word];
    if (verbs[word]) { if (known) this.learn(word); return this.run(() => verbs[word](this, t)); }
    const g = this.chapter.words && this.chapter.words[word];
    if (g) { if (known) this.learn(word); return this.run(() => g(this, t)); }
    this.toast(known ? '<b>' + word + '</b>. Nothing here answers to it.' : word + '. Just noise.');
  }
  refreshContext() {
    const t = this.target;
    if (!t || this.busy) { this.ui.setContext(null); return; }
    const actions = [];
    const listen = typeof t.listen === 'function' ? t.listen : null;
    if (listen) actions.push({ label: t.npc ? 'listen' : 'look', free: true, ok: true, run: (g) => listen(g, t) });
    const verbs = this.verbsOf(t);
    for (const w in verbs) {
      if (!this.S.known.includes(w)) continue;
      const lack = this.tc.missing(w);
      actions.push({ label: w, word: w, ok: lack.length === 0, lack: lack.join(' ') });
    }
    this.ui.setContext({ name: typeof t.name === 'function' ? t.name(this) : t.name, actions });
  }
  openJournal() {
    if (this.busy) return;
    const S = this.S;
    const words = S.known.map((w) => { const lack = this.tc.missing(w); return { word: w, tip: LEX[w] || '', ok: !lack.length, lack: lack.join(' ') }; });
    const standing = S.standing >= 4 ? 'The town says: Nobody is all right.' : S.standing >= 1 ? 'The town says: Nobody is useful.' : S.standing >= -1 ? 'The town has no opinion of you yet.' : 'The town says: watch your signs around Nobody.';
    this.ui.journal({ standing, log: S.log, words }, [
      { label: 'BACK', run: () => {} },
      { label: this.sfx && this.sfx.muted ? 'SOUND: OFF' : 'SOUND: ON', close: false, run: (b) => { this.sfx.muted = !this.sfx.muted; b.textContent = this.sfx.muted ? 'SOUND: OFF' : 'SOUND: ON'; } },
      { label: 'SAVE AND LEAVE', run: () => { this.save(); this.onQuit && this.onQuit(); } },
    ]);
  }

  // ------------------------------------------------------------------ input
  _bindInput() {
    const canvas = this.engine.canvas, pts = new Map();
    let pinch = 0, moved = 0, downT = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { moved = 0; downT = performance.now(); }
    });
    const up = (e) => {
      if (!this.active) return;
      const had = pts.delete(e.pointerId);
      pinch = 0;
      if (had && pts.size === 0 && moved < 9 && performance.now() - downT < 400) this.tap(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = 0; });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p || !this.active) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1];
      p[0] = e.clientX; p[1] = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1) {
        if (moved < 9) return;
        this.cam.yaw -= dx * 0.006;
        this.cam.pitch = clamp(this.cam.pitch + dy * 0.004, 0.08, 1.35);
        this.lastLook = performance.now();
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) this.cam.dist = clamp(this.cam.dist * (pinch / d), 6, 90);
        pinch = d;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.cam.dist = clamp(this.cam.dist * Math.exp(e.deltaY * 0.0012), 6, 90);
    }, { passive: false });
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      const k = e.key.toLowerCase();
      if (this.ui.journalOpen) { if (k === 'escape') this.ui.closeJournal(); return; }
      if (k === 'enter' || k === ' ' || k === 'e') {
        e.preventDefault();
        if (this.ui.advance()) return;
        if (!this.busy && this.target && typeof this.target.listen === 'function') this.run(() => this.target.listen(this, this.target));
        return;
      }
      if (k >= '1' && k <= '9') this.ui.key(k);
      if (k === 'escape' || k === 'j') this.openJournal();
      this.keys.add(k);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  // a tap on the world: move there, or go to whatever was tapped
  tap(px, py) {
    if (this.ui.advance() || this.busy) return;
    const eng = this.engine, cam = eng.cam, rect = eng.canvas.getBoundingClientRect();
    const u = (px - rect.left) / rect.width, v = 1 - (py - rect.top) / rect.height;
    let best = null, bd = 48;
    for (const t of this.things) {
      if (!t.r || (t.show && !t.show(this))) continue;
      const s = cam.project(t.tap || [t.x, this.land.heightAt(t.x, t.z) + (t.npc ? 1.1 : 0.8), t.z]);
      if (!s) continue;
      const d = Math.hypot((s[0] - u) * rect.width, (s[1] - v) * rect.height);
      if (d < bd) { bd = d; best = t; }
    }
    const p = this.player;
    if (best) {
      p.destThing = best;
      p.dest = [best.x, best.z];
      return;
    }
    // ray against the land
    const ty = Math.tan(cam.fovY / 2), tx = ty * (eng.w / eng.h);
    const nx = (u * 2 - 1) * tx, ny = (v * 2 - 1) * ty;
    const d = [cam.fwd[0] + cam.right[0] * nx + cam.up[0] * ny, cam.fwd[1] + cam.right[1] * nx + cam.up[1] * ny, cam.fwd[2] + cam.right[2] * nx + cam.up[2] * ny];
    let t = 1, hit = null;
    for (let i = 0; i < 400 && t < 600; i++) {
      const x = cam.eye[0] + d[0] * t, y = cam.eye[1] + d[1] * t, z = cam.eye[2] + d[2] * t;
      if (y < this.land.heightAt(x, z)) { hit = [x, z]; break; }
      t += 0.4 + t * 0.02;
    }
    if (hit) { p.dest = hit; p.destThing = null; this.marker = { x: hit[0], z: hit[1], t: 0 }; }
  }

  // ------------------------------------------------------------------ simulation
  collide(x, z, r) {
    for (const b of this.world.rects) {
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      const dx = x - b.x, dz = z - b.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const ox = b.hw + r - Math.abs(lx), oz = b.hd + r - Math.abs(lz);
      if (ox > 0 && oz > 0) {
        let nlx = lx, nlz = lz;
        if (ox < oz) nlx = Math.sign(lx || 1) * (b.hw + r); else nlz = Math.sign(lz || 1) * (b.hd + r);
        x = b.x + nlx * c + nlz * s;
        z = b.z - nlx * s + nlz * c;
      }
    }
    for (const t of this.things) {
      if (!t.solid || (t.show && !t.show(this))) continue;
      const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz), m = t.solid + r;
      if (d < m && d > 1e-4) { x = t.x + (dx / d) * m; z = t.z + (dz / d) * m; }
    }
    return [x, z];
  }

  // is this point inside a building?
  blocked(x, y, z, porches = false) {
    for (const b of this.world.rects) {
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z;
      const lz = dx * s + dz * c, front = porches && b.porch ? b.porch : 0;
      if (Math.abs(dx * c - dz * s) < b.hw + 0.4 && lz > -b.hd - 0.4 && lz < b.hd + 0.4 + front && y < this.land.heightAt(b.x, b.z) + (b.h || 8)) return true;
    }
    return false;
  }

  update(dt) {
    if (!this.active) return;
    const S = this.S, p = this.player, land = this.land, eng = this.engine, text = this.text;
    const time = eng.time;
    // time of day
    if (!this.busy && !this.ui.journalOpen && S.hour < this.hourCap) S.hour = Math.min(this.hourCap, S.hour + dt * this.timeRate);
    eng.atmo.hour = S.hour;
    this.chapter.update && this.chapter.update(dt);

    // --- the player walks
    let mx = 0, mz = 0;
    const k = this.keys;
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const sd = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    if (!this.busy && !this.ui.journalOpen && (f || sd)) {
      const cy = eng.cam.yaw, fx = -Math.sin(cy), fz = -Math.cos(cy);
      mx = fx * f - fz * sd; mz = fz * f + fx * sd;
      p.dest = null; p.destThing = null;
    } else if (p.dest && !this.busy) {
      const dx = p.dest[0] - p.x, dz = p.dest[1] - p.z, d = Math.hypot(dx, dz);
      const stopAt = p.destThing ? Math.max(1.2, p.destThing.r * 0.62) : 0.35;
      if (d <= stopAt) {
        const t = p.destThing;
        p.dest = null; p.destThing = null;
        if (t) {
          p.yaw = Math.atan2(-(t.z - p.z), t.x - p.x);
          if (t.npc && typeof t.listen === 'function') { this.target = t; this.run(() => t.listen(this, t)); }
        }
      } else { mx = dx / d; mz = dz / d; }
    }
    const ml = Math.hypot(mx, mz);
    const speed = (this.tc.can('RUN') ? 7.6 : 5.6) * (this.S.riding ? 0 : 1);
    if (ml > 0.01) {
      mx /= ml; mz /= ml;
      let nx = p.x + mx * speed * dt, nz = p.z + mz * speed * dt;
      [nx, nz] = this.collide(nx, nz, 0.42);
      // too steep to climb
      if (land.normalAt(nx, nz)[1] < 0.62 && land.heightAt(nx, nz) > p.y) { nx = p.x; nz = p.z; }
      const movedD = Math.hypot(nx - p.x, nz - p.z);
      p.stuck = movedD < speed * dt * 0.25 ? p.stuck + dt : 0;
      if (p.stuck > 1.2) { p.dest = null; p.destThing = null; p.stuck = 0; }
      p.x = nx; p.z = nz;
      const want = Math.atan2(-mz, mx);
      p.yaw += angDiff(want, p.yaw) * Math.min(1, dt * 12);
      p.gait = lerp(p.gait, 1, Math.min(1, dt * 8));
      p.phase = (p.phase + dt * (speed > 7 ? 2.1 : 1.75)) % 1;
      // the camera drifts round to look where you are going (never a full about-face), unless you have just set it yourself
      if (performance.now() - (this.lastLook || 0) > 2500) this.cam.yaw += Math.sin(angDiff(Math.atan2(-mx, -mz), this.cam.yaw)) * 0.8 * dt;
    } else {
      p.gait = lerp(p.gait, 0, Math.min(1, dt * 9));
    }
    p.y = land.heightAt(p.x, p.z);
    p.disturber.x = p.x; p.disturber.z = p.z;
    p.gestureT -= dt;
    if (p.gestureT <= 0 && p.gesture !== 'sit' && p.gesture !== 'work') p.gesture = null;
    posePerson(p.ent.bones, { phase: p.phase, gait: p.gait, time, gesture: p.gesture, seed: 0 });
    m4.rotation(p.ent.model, 0, 1, 0, p.yaw);
    p.ent.model[12] = p.x; p.ent.model[13] = p.y; p.ent.model[14] = p.z;

    // --- townsfolk
    for (const id in this.npcs) {
      const n = this.npcs[id];
      n.ent.hidden = !!(n.show && !n.show(this));
      if (n.ent.hidden) continue;
      let gait = 0;
      if (n.path) {
        const dx = n.path.x - n.x, dz = n.path.z - n.z, d = Math.hypot(dx, dz);
        if (d < 0.3) { const done = n.path.done; n.path = null; done && done(); }
        else {
          const sp = n.path.speed * dt;
          n.x += (dx / d) * Math.min(sp, d); n.z += (dz / d) * Math.min(sp, d);
          n.yaw += angDiff(Math.atan2(-dz, dx), n.yaw) * Math.min(1, dt * 10);
          gait = 1;
          n.phase = (n.phase + dt * 1.7) % 1;
        }
      } else {
        const dx = p.x - n.x, dz = p.z - n.z, d = Math.hypot(dx, dz);
        const want = d < 9 || n.speaking ? Math.atan2(-dz, dx) : n.home[2];
        n.yaw += angDiff(want, n.yaw) * Math.min(1, dt * 4);
      }
      n.gait = lerp(n.gait, gait, Math.min(1, dt * 8));
      n.y = land.heightAt(n.x, n.z);
      posePerson(n.ent.bones, { phase: n.phase, gait: n.gait, time, gesture: n.speaking ? 'talk' : n.gesture || n.idle, seed: n.seed });
      m4.rotation(n.ent.model, 0, 1, 0, n.yaw);
      n.ent.model[12] = n.x; n.ent.model[13] = n.y; n.ent.model[14] = n.z;
    }

    // --- what is in front of you
    if (!this.busy) {
      let best = null, bd = 1e9;
      for (const t of this.things) {
        if (t.show && !t.show(this)) continue;
        const d = Math.hypot(t.x - p.x, t.z - p.z);
        const score = (d / t.r) * (t.npc ? 0.55 : 1); // people come first when you stand close to them
        if (d < t.r && score < bd) { bd = score; best = t; }
      }
      this.target = best;
    }
    this.refreshContext();

    // --- camera
    const cam = eng.cam, fo = this.focus;
    const kc = 1 - Math.exp(-dt * (fo ? 3.2 : 7));
    const gx = fo ? fo.x : p.x, gy = fo ? fo.y : p.y + 1.5, gz = fo ? fo.z : p.z;
    cam.target[0] = lerp(cam.target[0], gx, kc); cam.target[1] = lerp(cam.target[1], gy, kc); cam.target[2] = lerp(cam.target[2], gz, kc);
    cam.pitch = lerp(cam.pitch, fo ? fo.pitch : this.cam.pitch, kc);
    cam.yaw += angDiff(fo ? fo.yaw : this.cam.yaw, cam.yaw) * kc;
    let wantD = fo ? fo.dist : this.cam.dist;
    {
      const cp = Math.cos(cam.pitch), dx = Math.sin(cam.yaw) * cp, dy = Math.sin(cam.pitch), dz = Math.cos(cam.yaw) * cp;
      for (let t = 1.5; t < wantD; t += 0.7) {
        if (this.blocked(cam.target[0] + dx * t, cam.target[1] + dy * t, cam.target[2] + dz * t)) { wantD = Math.max(3.2, t - 1.2); break; }
      }
    }
    cam.dist = lerp(cam.dist, wantD, wantD < cam.dist ? Math.min(1, kc * 2.5) : kc * 0.6);

    // --- objective and its compass
    const ob = this.chapter.objective();
    let way = '';
    if (ob.at) {
      const dx = ob.at[0] - p.x, dz = ob.at[1] - p.z, d = Math.hypot(dx, dz);
      if (d > 6) {
        const rel = angDiff(Math.atan2(dx, -dz), -cam.yaw); // bearing relative to where the camera looks
        const arrows = ['^', '^>', '>', 'v>', 'v', '<v', '<', '<^'];
        way = arrows[((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8] + '  ' + Math.round(d * 1.09) + ' yd';
      }
    }
    this.ui.objective(ob.text, way);

    // --- words in the world
    text.begin(cam);
    this.signs.draw(text, dt);
    const eye = cam.eye;
    for (const t of this.things) {
      if (t.show && !t.show(this)) continue;
      const ty = land.heightAt(t.x, t.z);
      const d = Math.hypot(t.x - eye[0], ty - eye[1], t.z - eye[2]);
      const isOb = ob.thing === t.id;
      if (t.npc && (d < 24 || t.speaking)) {
        const sz = clamp(d * 0.017, 0.2, 0.55);
        text.line(t.name, t.x, ty + t.label + sz * 0.5, t.z, sz, t.speaking || t === this.target ? [0.8, 0.74, 0.62] : [0.5, 0.46, 0.38], { pull: 3 });
      }
      if (isOb && d < 420) {
        const sz = clamp(d * 0.04, 0.5, 9);
        text.line('!', t.x, ty + (t.npc ? t.label + 0.5 : t.label) + sz * (0.9 + 0.18 * Math.sin(time * 4)), t.z, sz, EMBER, { emis: 0.9, pull: 2 });
      }
      t.draw && t.draw(this, text, time, d);
    }
    if (this.marker) {
      const m = this.marker;
      m.t += dt;
      if (m.t < 0.8) text.planar('x', [m.x, land.heightAt(m.x, m.z) + 0.08, m.z], [0, 1, 0], 0.7 * (1 - m.t / 0.8) + 0.25, EMBER, 0.6, false);
      else this.marker = null;
    }
    // flying letters
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const fl = this.floaters[i];
      fl.t += dt;
      if (fl.t < 0) continue;
      const u = fl.t / fl.life;
      if (u >= 1) { this.floaters.splice(i, 1); continue; }
      let x, y, z;
      if (fl.home || fl.to) {
        const tx = fl.home ? p.x : fl.to[0], ty2 = fl.home ? p.y + 1.5 : fl.to[1], tz = fl.home ? p.z : fl.to[2];
        const e = u * u * (3 - 2 * u);
        x = lerp(fl.x, tx, e); z = lerp(fl.z, tz, e); y = lerp(fl.y, ty2, e) + Math.sin(u * Math.PI) * fl.arc;
      } else {
        x = fl.x + fl.vx * fl.t; z = fl.z + fl.vz * fl.t; y = fl.y + fl.vy * fl.t - 1.2 * fl.t * fl.t;
      }
      const dd = Math.hypot(x - eye[0], y - eye[1], z - eye[2]);
      text.glyph(fl.ch, x, y, z, Math.max(fl.size, dd * 0.03) * (fl.home || fl.to ? 1 : 1 - u * 0.5), fl.col, { emis: 1.1 * (1 - u * (fl.home || fl.to ? 0.2 : 0.9)) });
    }
    for (let i = this.barks.length - 1; i >= 0; i--) {
      const b = this.barks[i];
      b.t += dt;
      const u = b.t / b.life;
      if (u >= 1) { this.barks.splice(i, 1); continue; }
      const dd = Math.hypot(b.x - eye[0], b.y - eye[1], b.z - eye[2]);
      const sz = Math.max(b.size, dd * 0.034) * (0.8 + 0.4 * Math.min(1, u * 8));
      text.line(b.text, b.x, b.y + u * 1.6, b.z, sz, b.col, { emis: 1.2 * (1 - u * u) });
    }
    text.flush();
  }
}
