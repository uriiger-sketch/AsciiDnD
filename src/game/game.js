// The game itself, with no drawing in it: state, turns, shooting, cover, explosions, items,
// deeds, saving. The UI reads `fx`, `S.log` and `dialog`; a headless bot can play it just as well.

import { TILE, T, KIND, WEAPON, ITEM, DEED } from './data.js';
import { buildWorld, buildMine, fov, flow } from './world.js';
import { line, ray, cheb, dist, clamp, DIRS } from './util.js';
import { aiStep } from './ai.js';
import { Story } from './quests.js';

const RED = 0xff5a4a, GOLD = 0xffd060, WHITE = 0xf2ecd8, DIM = 0x9a917c, GREEN = 0x8fd98f, BLUE = 0x8ac6ff;
export const COL = { RED, GOLD, WHITE, DIM, GREEN, BLUE };

export class Game {
  constructor() {
    this.fx = [];
    this.fxDelay = 0;
    this.dialog = null;
    this.over = null; // 'dead' | 'won'
    this.onSave = null;
    this.levels = {};
    this.story = new Story(this);
  }

  // ---------------------------------------------------------------- set-up
  fresh() {
    this.levels = { world: buildWorld(), mine: buildMine() };
    for (const id in this.levels) { const lv = this.levels[id]; lv.base = lv.t.slice(); lv.baseGlyph = lv.glyph.slice(); }
  }
  newGame(seed = 20261123) {
    this.fresh();
    this.S = {
      rng: seed | 0, turn: 0, hour: 16.4, lv: 'world', stage: 0, flags: {}, log: [], nextId: 1, fuses: [], frozen: 0,
      p: { id: 0, kind: 'you', team: 0, x: 0, y: 0, hp: 7, max: 12, weapon: 'fists', knife: 0, guns: [], loaded: {}, ammo: { b: 0, s: 0 },
        items: { bandage: 0, whiskey: 0, dynamite: 0 }, money: 0, armor: 0, perks: {}, deeds: {}, dashCd: 0, aim: 0, poison: 0, numb: 0, target: 0, fight: {} },
      stats: { kills: 0, shots: 0, hits: 0, deaths: 0 },
    };
    this.over = null; this.dialog = null; this.inFight = false;
    this.L = this.levels.world;
    this.p = this.S.p;
    this.story.begin();
    this.see();
    this.checkpoint();
  }
  get S_() { return this.S; }

  // ---------------------------------------------------------------- randomness (kept in the save)
  rnd() {
    const a = (this.S.rng = (this.S.rng + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  ri(a, b) { return a + Math.floor(this.rnd() * (b - a + 1)); }
  chance(p) { return this.rnd() < p; }

  // ---------------------------------------------------------------- telling the player things
  msg(text, fg = WHITE) {
    const log = this.S.log, last = log[log.length - 1];
    if (last && last.t === text && this.S.turn - last.n < 30) { last.n = this.S.turn; return; }
    log.push({ t: text, fg, n: this.S.turn });
    if (log.length > 60) log.shift();
  }
  pop(x, y, ch, fg, dur = 160, bg = 0) { this.fx.push({ k: 'pop', x, y, ch, fg, bg, delay: this.fxDelay, dur }); }
  float(x, y, text, fg) { this.fx.push({ k: 'float', x, y, text, fg, delay: this.fxDelay, dur: 520 }); }
  tracer(cells, fg, ch = null) { if (cells.length) this.fx.push({ k: 'line', cells, ch, fg, delay: this.fxDelay, dur: 90 }); }
  sound(name) { this.fx.push({ k: 'snd', name, delay: this.fxDelay }); }
  say(who, pages, options = null) { this.dialog = { who, pages: Array.isArray(pages) ? pages : [pages], options, page: 0 }; }

  // ---------------------------------------------------------------- the map
  idx(x, y) { return y * this.L.w + x; }
  at(x, y) { return this.L.inb(x, y) ? this.L.occ[y * this.L.w + x] : null; }
  free(x, y) { return this.L.walk(x, y) && !this.at(x, y); }
  put(a, x, y) {
    const L = this.L;
    if (L.occ[a.y * L.w + a.x] === a) L.occ[a.y * L.w + a.x] = null;
    a.x = x; a.y = y;
    L.occ[y * L.w + x] = a;
    if (L.t[y * L.w + x] === T.DOOR) { L.t[y * L.w + x] = T.DOOR_OPEN; if (L.vis[y * L.w + x]) this.sound('door'); }
  }
  groundFor(x, y) {
    if (this.L.id === 'mine') return T.CAVE;
    for (const [dx, dy] of DIRS) { const t = this.L.tile(x + dx, y + dy).id; if (t === T.FLOOR || t === T.PLANK || t === T.ROAD) return t; }
    return T.SAND;
  }
  near(x, y, r = 3) {
    for (let k = 0; k <= r; k++) for (let j = -k; j <= k; j++) for (let i = -k; i <= k; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) === k && this.L.inb(x + i, y + j) && this.free(x + i, y + j)) return [x + i, y + j];
    }
    return null;
  }
  spawn(kind, x, y, o = {}) {
    const c = this.near(x, y, 5);
    if (!c) return null;
    const k = KIND[kind];
    const a = Object.assign({ id: this.S.nextId++, kind, team: 1, x: c[0], y: c[1], hp: k.hp, alert: 0, cd: 0 }, o);
    if (k.gun) a.loaded = k.gun.mag;
    this.L.actors.push(a);
    this.L.occ[a.y * this.L.w + a.x] = a;
    return a;
  }
  drop(x, y, k, n = 1) {
    const i = this.idx(x, y), list = this.L.items.get(i) || [];
    const same = list.find((it) => it.k === k);
    if (same) same.n += n; else list.push({ k, n });
    this.L.items.set(i, list);
  }
  foes() { return this.L.actors.filter((a) => a.team === 1 && a.hp > 0); }
  // an assassin is unseen unless he is within three steps, has just struck, or stands in lantern light
  hidden(a) { return KIND[a.kind].ai === 'assassin' && !(a.reveal > 0) && cheb(a.x, a.y, this.p.x, this.p.y) > 3 && !this.L.lit[a.y * this.L.w + a.x]; }
  canSee(a) { return this.L.vis[a.y * this.L.w + a.x] === 1 && !this.hidden(a); }
  seenFoes() { return this.foes().filter((a) => this.canSee(a)); }
  night() { const h = this.S.hour; return h >= 19.75 || h < 5; }
  sight() { if (this.L.dark) return [16, 4]; const h = this.S.hour; return this.night() ? [16, 7] : h >= 18.5 || h < 6 ? [16, 10] : [14, 14]; }
  see() {
    const [far, nearR] = this.sight();
    fov(this.L, this.p.x, this.p.y, far, nearR);
    const p = this.p, seen = this.seenFoes();
    let t = seen.find((a) => a.id === p.target);
    if (!t) {
      let bd = 1e9;
      for (const a of seen) { if (KIND[a.kind].ai === 'snake' && a.alert < 2) continue; const d = dist(a.x, a.y, p.x, p.y); if (d < bd) { bd = d; t = a; } }
      p.target = t ? t.id : 0;
    }
  }
  target() { return this.p.target ? this.L.actors.find((a) => a.id === this.p.target && a.hp > 0) || null : null; }
  nextTarget() {
    const seen = this.seenFoes().sort((a, b) => dist(a.x, a.y, this.p.x, this.p.y) - dist(b.x, b.y, this.p.x, this.p.y));
    if (!seen.length) return;
    const i = seen.findIndex((a) => a.id === this.p.target);
    this.p.target = seen[(i + 1) % seen.length].id;
  }
  flowTo(x, y) {
    const k = x + ',' + y;
    let f = this.flows.get(k);
    if (!f) this.flows.set(k, (f = flow(this.L, x, y, 44)));
    return f;
  }
  // every cell that is about to be shot down, ridden over or blown up: idx -> turns left
  danger() {
    const m = new Map(), L = this.L;
    for (const f of this.S.fuses) {
      if (f.lv !== L.id) continue;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (L.inb(f.x + i, f.y + j)) m.set((f.y + j) * L.w + f.x + i, f.t);
    }
    for (const a of L.actors) {
      for (const cells of [a.aim && a.aim.cells, a.charge && a.charge.cells, ...(a.fan ? a.fan.lines : [])]) {
        if (cells) for (const [x, y] of cells) if (!m.has(y * L.w + x)) m.set(y * L.w + x, 1);
      }
    }
    return m;
  }

  // ---------------------------------------------------------------- shooting
  // What lies between a muzzle and a mark: a wall (no shot), or something to hide behind.
  shotInfo(ax, ay, tx, ty) {
    const cells = line(ax, ay, tx, ty), L = this.L;
    let cover = 0, coverCell = null;
    for (let i = 0; i < cells.length - 1; i++) {
      const [x, y] = cells[i], t = L.tile(x, y);
      if (!t.clear) return { blocked: true, cover: 0, cells };
      if (t.cover && i > 0) { const c = i === cells.length - 2 ? 2 : 1; if (c > cover) { cover = c; coverCell = [x, y]; } }
      const o = L.occ[y * L.w + x];
      if (o && cover < 1) { cover = 1; coverCell = null; }
    }
    return { blocked: false, cover, coverCell, cells };
  }
  // Your chance to hit `a` with the gun in your hand (null if there is no clear shot).
  odds(a, wk = this.p.weapon) {
    const p = this.p, w = WEAPON[wk];
    if (!w || w.melee) return null;
    const info = this.shotInfo(p.x, p.y, a.x, a.y);
    if (info.blocked) return null;
    const d = dist(p.x, p.y, a.x, a.y);
    if (d > w.range + 0.5) return null;
    let c = w.acc - (p.perks.eye ? 0 : Math.max(0, d - w.near) * w.fall);
    if (w.long && d < 1.6) c -= 0.25;
    c -= info.cover === 2 ? 0.35 : info.cover === 1 ? 0.15 : 0;
    if (p.aim) c += p.perks.steady ? 0.4 : 0.2;
    if (p.numb > 0) c -= 0.1;
    if (a.alert < 2) c += 0.2; // he has not seen you
    if (p.perks.last && p.loaded[wk] === 1) c = 1;
    return { p: clamp(c, 0.05, 0.97), cover: info.cover, info, d };
  }
  noise(x, y, r) {
    for (const a of this.L.actors) {
      if (a.team !== 1 || a.alert === 2 || dist(a.x, a.y, x, y) > r) continue;
      if (KIND[a.kind].ai === 'snake') continue;
      a.alert = 1;
      a.seenAt = [x, y];
    }
  }
  hitCover(c) {
    if (!c) return;
    const t = this.L.tile(c[0], c[1]);
    this.pop(c[0], c[1], '*', 0xffe0a0, 120);
    if (t.boom) this.explode(c[0], c[1], { by: this.byPlayer });
    else if (t.brk && this.chance(0.4)) { this.L.set(c[0], c[1], this.groundFor(c[0], c[1])); this.pop(c[0], c[1], '%', 0xc0a070, 200); }
  }
  playerFire(a) {
    const p = this.p, wk = p.weapon, w = WEAPON[wk];
    if (!(p.loaded[wk] > 0)) { this.msg('Click. Empty. RELOAD.', RED); this.sound('click'); return false; }
    const o = this.odds(a);
    if (!o) { this.msg(dist(p.x, p.y, a.x, a.y) > w.range ? 'Too far for this gun.' : 'No clear shot.', DIM); return false; }
    if (w.jam && this.chance(w.jam)) { this.msg('The old gun sticks. Nothing.', RED); this.sound('click'); p.aim = 0; return true; }
    const aimed = p.aim, last = p.loaded[wk] === 1, unaware = a.alert < 2;
    p.loaded[wk]--;
    p.aim = 0;
    this.S.stats.shots++;
    this.sound(wk === 'shotgun' ? 'boom2' : 'shot');
    this.noise(p.x, p.y, 17);
    this.byPlayer = true;
    if (this.chance(o.p)) {
      this.S.stats.hits++;
      this.tracer(o.info.cells, 0xfff0c0);
      let dmg = this.ri(w.dmg[0], w.dmg[1]) + (aimed ? 1 : 0) + (last && p.perks.last ? 2 : 0) + (unaware ? 2 : 0);
      if (wk === 'shotgun') dmg += o.d <= 2.5 ? 4 : o.d <= 4.5 ? 1 : -1;
      if (aimed) p.deeds.aimedHits = (p.deeds.aimedHits || 0) + 1;
      const info = { how: 'gun', d: o.d, last, aimed };
      if (w.spread) for (const [dx, dy] of DIRS) { const n = this.at(a.x + dx, a.y + dy); if (n && n.team === 1) this.hurt(n, Math.max(1, dmg >> 1), p, info); }
      this.hurt(a, Math.max(1, dmg), p, info);
    } else {
      if (o.cover && o.info.coverCell && this.chance(0.6)) {
        const c = o.info.coverCell, k = o.info.cells.findIndex((q) => q[0] === c[0] && q[1] === c[1]);
        this.tracer(o.info.cells.slice(0, k + 1), 0xfff0c0);
        this.hitCover(c);
        this.float(a.x, a.y, 'cover', DIM);
      } else {
        this.stray(p, a.x, a.y, w.range, 0xfff0c0);
        this.float(a.x, a.y, 'miss', DIM);
      }
    }
    this.byPlayer = false;
    return true;
  }
  // a bullet that missed keeps going
  stray(from, tx, ty, range, fg) {
    const cells = ray(from.x, from.y, tx, ty, range), out = [];
    let past = false;
    for (const [x, y] of cells) {
      const t = this.L.tile(x, y);
      if (!t.clear) { this.pop(x, y, '*', 0xd0c0a0, 100); if (t.boom) this.explode(x, y, { by: this.byPlayer }); break; }
      out.push([x, y]);
      if (x === tx && y === ty) { past = true; continue; }
      const o = this.at(x, y);
      if (past && o && o !== from && this.chance(0.3)) { this.hurt(o, this.ri(2, 3), this.byPlayer ? this.p : null, { how: 'gun', d: 9 }); break; }
      if (past && t.boom && this.chance(0.5)) { this.explode(x, y, { by: this.byPlayer }); break; }
    }
    this.tracer(out, fg);
  }
  // An enemy (or deputy) shoots at `tgt` with his own gun.
  npcFire(a, tgt) {
    const g = KIND[a.kind].gun, info = this.shotInfo(a.x, a.y, tgt.x, tgt.y), d = dist(a.x, a.y, tgt.x, tgt.y);
    a.loaded--;
    this.sound('shot');
    if (a.team === 0) this.noise(a.x, a.y, 14);
    let c = g.acc - Math.max(0, d - 3) * 0.04 - (info.cover === 2 ? 0.35 : info.cover === 1 ? 0.15 : 0);
    if (this.night() && !this.L.lit[tgt.y * this.L.w + tgt.x]) c -= 0.1;
    if (this.chance(clamp(c, 0.05, 0.9))) {
      this.tracer(info.cells, a.team === 1 ? 0xff9a7a : 0xa0d8ff);
      this.hurt(tgt, this.ri(g.dmg[0], g.dmg[1]), a, { how: 'gun', d });
    } else if (info.cover && info.coverCell && this.chance(0.6)) {
      const k = info.cells.findIndex((q) => q[0] === info.coverCell[0] && q[1] === info.coverCell[1]);
      this.tracer(info.cells.slice(0, k + 1), 0xff9a7a);
      this.hitCover(info.coverCell);
      if (tgt === this.p) this.float(tgt.x, tgt.y, 'cover', BLUE);
    } else this.stray(a, tgt.x, tgt.y, g.range, 0xff9a7a);
  }
  // A marked shot: goes down its line and takes the first body it meets.
  fireLine(a, cells, dmg, acc, mark) {
    const out = [];
    let hitPlayer = false;
    this.sound('rifle');
    for (let i = 0; i < cells.length; i++) {
      const [x, y] = cells[i], t = this.L.tile(x, y);
      if (!t.clear) { this.pop(x, y, '*', 0xd0c0a0, 100); break; }
      out.push([x, y]);
      const o = this.at(x, y);
      if (!o || o === a) continue;
      const behind = i > 1 && this.L.tile(cells[i - 1][0], cells[i - 1][1]).cover;
      if (this.chance(behind ? acc * 0.5 : acc)) { if (o === this.p) hitPlayer = true; this.hurt(o, this.ri(dmg[0], dmg[1]), a, { how: 'rifle' }); break; }
      if (o === this.p) this.float(x, y, behind ? 'cover' : 'miss', BLUE);
      if (behind) { this.hitCover(cells[i - 1]); break; }
    }
    this.tracer(out, 0xff7050);
    if (mark && !hitPlayer && !cells.some(([x, y]) => x === this.p.x && y === this.p.y)) this.dodged();
  }
  dodged() {
    const p = this.p;
    p.deeds.dodges = (p.deeds.dodges || 0) + 1;
    this.float(p.x, p.y, 'dodged', GREEN);
  }
  explode(x, y, o = {}) {
    const L = this.L, queue = [[x, y]], done = new Set();
    while (queue.length) {
      const [cx, cy] = queue.shift(), key = cy * L.w + cx;
      if (done.has(key)) continue;
      done.add(key);
      if (L.tile(cx, cy).boom || L.tile(cx, cy).brk) L.set(cx, cy, this.groundFor(cx, cy));
      this.fx.push({ k: 'boom', x: cx, y: cy, delay: this.fxDelay + (done.size - 1) * 90, dur: 420 });
      this.sound('boom');
      const base = (o.dmg || 5) + (o.by && this.p.perks.powder ? 2 : 0);
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const X = cx + i, Y = cy + j, r = Math.max(Math.abs(i), Math.abs(j));
        if (!L.inb(X, Y) || (r > 0 && !L.los(cx, cy, X, Y))) continue;
        const t = L.tile(X, Y);
        if (r > 0 && t.boom) queue.push([X, Y]);
        else if (r === 1 && (t.brk || t.id === T.FENCE || t.id === T.FENCEV || t.id === T.TABLE || t.id === T.DOOR)) L.set(X, Y, this.groundFor(X, Y));
        const a = L.occ[Y * L.w + X];
        if (a && a.hp > 0 && a.team !== 2) this.hurt(a, r <= 1 ? base : 2, o.by ? this.p : null, { how: 'blast', blast: true });
      }
      this.noise(cx, cy, 22);
    }
    L.computeLight();
  }
  tickFuses() {
    const keep = [];
    for (const f of this.S.fuses) {
      if (f.lv !== this.L.id) continue;
      if (--f.t <= 0) {
        const wasIn = cheb(f.x, f.y, this.p.x, this.p.y) <= 1;
        this.explode(f.x, f.y, { by: f.by === 'p' });
        if (f.mark && !wasIn && this.p.hp > 0) this.dodged();
      } else keep.push(f);
    }
    this.S.fuses = keep;
  }

  // ---------------------------------------------------------------- hurting and dying
  hurt(t, dmg, src, info = {}) {
    const p = this.p;
    if (t.hp <= 0) return;
    if (t === p) {
      if (p.armor) dmg = Math.max(1, dmg - 1);
      if (p.numb > 0 && dmg > 1) dmg--;
      p.hp -= dmg;
      p.wasHit = this.S.turn;
      this.float(p.x, p.y, '-' + dmg, RED);
      this.pop(p.x, p.y, '@', 0xffffff, 110, 0xc02020);
      this.sound('hurt');
      if (p.hp <= 0) {
        if (p.perks.hard && !p.fight.hard) { p.fight.hard = 1; p.hp = 1; this.msg('That should have killed you. HARD TO KILL.', GOLD); }
        else { p.hp = 0; this.over = 'dead'; this.S.stats.deaths++; this.deathBy = src ? (src.name || KIND[src.kind].name) : info.blast ? 'the blast' : 'the desert'; }
      } else if (p.perks.wind && p.hp <= 3 && !p.fight.wind) { p.fight.wind = 1; p.hp += 4; this.msg('Second wind. +4', GREEN); }
      return;
    }
    if (t.team === 2) return;
    t.hp -= dmg;
    this.float(t.x, t.y, '-' + dmg, t.team === 1 ? GOLD : RED);
    this.pop(t.x, t.y, KIND[t.kind].ch, 0xffffff, 110, 0x904020);
    if (t.aim) { t.aim = null; this.float(t.x, t.y - 1, 'flinch', DIM); }
    if (t.team === 1 && t.alert < 2) { t.alert = 1; if (src) t.seenAt = [src.x, src.y]; }
    if (t.reveal !== undefined || KIND[t.kind].ai === 'assassin') t.reveal = 4;
    if (t.hp <= 0) this.kill(t, src, info);
    else if (t.kind === 'ash' && this.chance(0.45)) this.smoke(t);
  }
  smoke(a) {
    const p = this.p;
    for (let n = 0; n < 60; n++) {
      const x = p.x + this.ri(-9, 9), y = p.y + this.ri(-6, 6), d = cheb(x, y, p.x, p.y);
      if (d < 4 || !this.L.inb(x, y) || !this.free(x, y)) continue;
      if (n < 40 && this.L.los(x, y, p.x, p.y)) continue;
      this.pop(a.x, a.y, '%', 0xb0b0b0, 300);
      this.put(a, x, y);
      a.reveal = 0;
      this.msg('Smoke. He is somewhere else.', 0xd890ff);
      return;
    }
  }
  kill(a, src, info) {
    const L = this.L, p = this.p, k = KIND[a.kind];
    L.actors.splice(L.actors.indexOf(a), 1);
    if (L.occ[a.y * L.w + a.x] === a) L.occ[a.y * L.w + a.x] = null;
    if (!k.spirit && L.tile(a.x, a.y).walk) L.decal.set(a.y * L.w + a.x, k.beast ? 0 : 1);
    this.sound('die');
    if (a.team === 0) { this.msg(`${a.name || 'A deputy'} is down.`, RED); return; }
    if (k.drop) {
      for (const key in k.drop) {
        const n = this.ri(k.drop[key][0], k.drop[key][1]);
        if (n > 0) this.drop(a.x, a.y, key === 'ammo' ? 'b' : key, n);
      }
    }
    if (src === p) {
      this.S.stats.kills++;
      p.fight.kills = (p.fight.kills || 0) + 1;
      const d = p.deeds, inc = (key) => (d[key] = (d[key] || 0) + 1);
      if (info.how === 'knife') inc('knifeKills');
      if (info.how === 'gun' && info.d >= 7) inc('longKills');
      if (info.how === 'gun' && info.last) inc('lastKills');
      if (info.how === 'blast') inc('blastKills');
    }
    this.msg(`${cap(k.name)} ${k.spirit ? 'comes apart like breath' : k.boss ? 'IS DEAD' : 'goes down'}.`, k.boss ? GOLD : WHITE);
    this.story.onKill(a);
  }
  checkDeeds() {
    const p = this.p;
    for (const d of DEED) {
      if (!p.perks[d.id] && (p.deeds[d.count] || 0) >= d.need) {
        p.perks[d.id] = 1;
        this.msg(`A NAME FOR YOU: ${d.name}. ${d.gives}`, GOLD);
        this.float(p.x, p.y - 1, d.name, GOLD);
        this.sound('deed');
      }
    }
  }

  // ---------------------------------------------------------------- what you can do
  // Returns true if a turn was spent.
  act(a) {
    if (this.over || this.dialog) return false;
    this.fx.length = 0;
    this.fxDelay = 0;
    const took = this.doAct(a);
    if (took) this.endTurn();
    else this.see();
    return took;
  }
  doAct(a) {
    const p = this.p;
    switch (a.t) {
      case 'move': return this.step(a.dx, a.dy);
      case 'goto': return this.stepTo(a.x, a.y, true);
      case 'dash': return this.dash(a.dx, a.dy);
      case 'attack': return this.attack(this.L.actors.find((o) => o.id === a.id));
      case 'fire': { const t = this.target(); if (!t) { this.msg('Nobody to shoot.', DIM); return false; } return this.attack(t); }
      case 'wait': p.aim = 1; return true;
      case 'reload': return this.reload();
      case 'swap': {
        const all = [p.knife ? 'knife' : 'fists', ...p.guns];
        p.weapon = all[(all.indexOf(p.weapon) + 1) % all.length];
        this.msg('In hand: ' + WEAPON[p.weapon].name + '.', DIM);
        return false;
      }
      case 'use': return this.use(a.k);
      case 'throw': return this.throwAt(a.x, a.y);
      case 'next': this.nextTarget(); return false;
    }
    return false;
  }
  step(dx, dy) {
    const p = this.p, L = this.L, x = p.x + dx, y = p.y + dy;
    if (!L.inb(x, y) || (!dx && !dy)) return false;
    const o = this.at(x, y);
    if (o) {
      if (o.team === 1) return this.melee(o);
      if (o.team === 2 || o.role) { this.story.talk(o); return false; }
      // a friend: trade places
      L.occ[p.y * L.w + p.x] = null;
      const ox = p.x, oy = p.y;
      this.put(p, x, y); this.put(o, ox, oy);
      return true;
    }
    const t = L.tile(x, y);
    if (!L.canStep(p.x, p.y, dx, dy)) {
      if (t.id === T.FIRE) this.story.restAt('fire');
      else if (t.id === T.SIGN) this.msg('The sign reads: ' + (L.signs[y * L.w + x] || '...'), GOLD);
      return false;
    }
    this.put(p, x, y);
    p.aim = 0;
    this.pickup();
    if (t.id === T.WATER) p.slow = 1;
    if (t.id === T.DOWN) this.enter('mine');
    else if (t.id === T.UP) this.enter('world');
    return true;
  }
  dash(dx, dy) {
    const p = this.p;
    if (p.dashCd > 0) { this.msg(`Winded. DASH in ${p.dashCd}.`, DIM); return false; }
    let n = 0;
    const trail = [];
    while (n < 3 && this.L.canStep(p.x, p.y, dx, dy) && !this.at(p.x + dx, p.y + dy)) { trail.push([p.x, p.y]); this.put(p, p.x + dx, p.y + dy); n++; }
    if (!n) return false;
    this.tracer(trail, 0x808080, '.');
    p.dashCd = p.perks.feet ? 3 : 6;
    p.aim = 0;
    this.pickup();
    const t = this.L.tile(p.x, p.y).id;
    if (t === T.DOWN) this.enter('mine'); else if (t === T.UP) this.enter('world');
    return true;
  }
  melee(o) {
    const p = this.p, w = WEAPON[p.knife ? 'knife' : 'fists'];
    p.aim = 0;
    if (!this.chance(w.acc)) { this.float(o.x, o.y, 'miss', DIM); this.sound('swish'); return true; }
    let dmg = this.ri(w.dmg[0], w.dmg[1]) + (p.knife && p.perks.close ? 2 : 0);
    if (o.alert < 2 && KIND[o.kind].ai !== 'snake') { dmg *= 2; this.float(o.x, o.y - 1, 'ambush', GOLD); }
    this.sound('stab');
    this.hurt(o, dmg, p, { how: 'knife', d: 1 });
    return true;
  }
  attack(o) {
    const p = this.p;
    if (!o || o.hp <= 0 || o.team !== 1) return false;
    p.target = o.id;
    const w = WEAPON[p.weapon];
    if (!w.melee) return this.playerFire(o);
    if (cheb(p.x, p.y, o.x, o.y) <= 1) return this.melee(o);
    return this.stepTo(o.x, o.y);
  }
  // cells it would be foolish to walk through: next to a rattlesnake you have seen
  avoid() {
    const s = new Set(), L = this.L;
    for (const a of L.actors) {
      if (a.kind !== 'snake' || !L.seen[a.y * L.w + a.x] || (!a.spotted && !L.vis[a.y * L.w + a.x])) continue;
      a.spotted = 1;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s.add((a.y + j) * L.w + a.x + i);
    }
    return s;
  }
  // one step along the shortest known way to (x, y); far = the whole map (for travelling)
  stepTo(x, y, far = false) {
    const p = this.p, f = far ? flow(this.L, x, y, 400, true, this.avoid()) : flow(this.L, x, y, 60);
    let best = null, bd = f[p.y * this.L.w + p.x];
    for (const [dx, dy] of DIRS) {
      const X = p.x + dx, Y = p.y + dy;
      if (!this.L.inb(X, Y) || !this.L.canStep(p.x, p.y, dx, dy)) continue;
      const d = f[Y * this.L.w + X], o = this.at(X, Y);
      if (o && !(X === x && Y === y)) continue;
      if (d < bd) { bd = d; best = [dx, dy]; }
    }
    return best ? this.step(best[0], best[1]) : false;
  }
  reload() {
    const p = this.p, w = WEAPON[p.weapon];
    if (!w || w.melee) { this.msg('Nothing to load.', DIM); return false; }
    const have = p.loaded[p.weapon] || 0;
    if (have >= w.mag) { this.msg('Already full.', DIM); return false; }
    if (!(p.ammo[w.ammo] > 0)) { this.msg(w.ammo === 's' ? 'No shells.' : 'No rounds left.', RED); return false; }
    const n = Math.min(p.perks.quick ? w.mag : w.reload, w.mag - have, p.ammo[w.ammo]);
    p.loaded[p.weapon] = have + n;
    p.ammo[w.ammo] -= n;
    p.aim = 0;
    this.sound('load');
    this.float(p.x, p.y, '+' + n, WHITE);
    if (this.inFight) p.deeds.reloads = (p.deeds.reloads || 0) + 1;
    return true;
  }
  use(k) {
    const p = this.p;
    if (!(p.items[k] > 0)) return false;
    if (k === 'bandage') {
      if (p.hp >= p.max && !p.poison) { this.msg('You are not hurt.', DIM); return false; }
      p.hp = Math.min(p.max, p.hp + 6); p.poison = 0;
      this.msg('You bind it tight. +6', GREEN);
    } else if (k === 'whiskey') {
      p.hp = Math.min(p.max, p.hp + 3); p.numb = 25;
      this.msg('It burns all the way down. +3, and you feel less.', GREEN);
    } else return false;
    p.items[k]--;
    p.aim = 0;
    this.sound('use');
    return true;
  }
  throwAt(x, y) {
    const p = this.p;
    if (!(p.items.dynamite > 0)) return false;
    if (dist(p.x, p.y, x, y) > 7.5 || !this.L.los(p.x, p.y, x, y) || !this.L.tile(x, y).clear) { this.msg('You cannot throw it there.', DIM); return false; }
    p.items.dynamite--;
    p.aim = 0;
    this.S.fuses.push({ lv: this.L.id, x, y, t: 2, by: 'p' });
    this.tracer(line(p.x, p.y, x, y), 0xff8040, '\'');
    this.msg('Fuse lit. Two.', 0xff9040);
    this.sound('fuse');
    return true;
  }
  pickup() {
    const p = this.p, i = this.idx(p.x, p.y), list = this.L.items.get(i);
    if (!list) return;
    this.L.items.delete(i);
    for (const it of list) {
      if (it.k === 'money') p.money += it.n;
      else if (it.k === 'b' || it.k === 's') p.ammo[it.k] += it.n;
      else if (it.k === 'knife') { p.knife = 1; if (p.weapon === 'fists') p.weapon = 'knife'; }
      else if (WEAPON[it.k]) this.giveGun(it.k);
      else if (it.k === 'box') this.S.flags.box = 1;
      else p.items[it.k] = (p.items[it.k] || 0) + it.n;
      this.msg(`You take ${it.k === 'money' ? '$' + it.n : (it.n > 1 ? it.n + ' ' : '') + ITEM[it.k].name}.`, GOLD);
    }
    this.sound('pick');
    this.picked = true;
  }
  giveGun(k) {
    const p = this.p;
    if (k === 'colt') { p.guns = p.guns.filter((g) => g !== 'rusty'); delete p.loaded.rusty; }
    if (!p.guns.includes(k)) p.guns.push(k);
    p.loaded[k] = WEAPON[k].mag;
    p.weapon = k;
  }
  enter(id) {
    const from = this.L;
    from.occ[this.p.y * from.w + this.p.x] = null;
    this.L = this.levels[id];
    this.S.lv = id;
    this.S.fuses = [];
    const [x, y] = id === 'mine' ? this.L.poi.up : [this.levels.world.poi.mineDoor[0], this.levels.world.poi.mineDoor[1] + 1];
    const c = this.near(x, y, 3);
    this.p.x = c[0]; this.p.y = c[1];
    this.L.occ[c[1] * this.L.w + c[0]] = this.p;
    this.msg(id === 'mine' ? 'Down into the Cinder Mine. It is dark past the lanterns.' : 'Daylight.', GOLD);
    this.entered = true;
  }

  // ---------------------------------------------------------------- talk
  advance() {
    const d = this.dialog;
    if (!d) return;
    if (d.page < d.pages.length - 1) d.page++;
    else if (!d.options) this.dialog = null;
  }
  choose(i) {
    const d = this.dialog, o = d && d.options && d.options[i];
    if (!o || o.off) return;
    this.dialog = null;
    if (o.run) o.run();
    this.see();
  }

  // ---------------------------------------------------------------- the world takes its turn
  endTurn() {
    const S = this.S, p = this.p, L0 = this.L;
    S.turn++;
    if (!S.frozen) S.hour = (S.hour + 1 / 150) % 24;
    if (p.dashCd > 0) p.dashCd--;
    if (p.numb > 0) p.numb--;
    if (p.poison > 0) { p.poison--; if (S.turn % 2 === 0) { this.hurt(p, 1, null, {}); if (this.over) this.deathBy = 'snake venom'; } }
    const rounds = p.slow ? 2 : 1;
    p.slow = 0;
    this.flows = new Map();
    for (let r = 0; r < rounds && !this.over; r++) {
      this.fxDelay = 90 + r * 60;
      if (this.L === L0 && !this.entered) {
        for (const a of [...this.L.actors]) {
          if (a.hp <= 0 || a.team === 2) continue;
          const n = KIND[a.kind].speed || 1;
          a.held = 0;
          for (let i = 0; i < n && a.hp > 0 && !a.held && !this.over; i++) aiStep(this, a);
          if (a.reveal > 0) a.reveal--;
        }
        this.fxDelay += 90;
        this.tickFuses();
      }
    }
    this.entered = false;
    if (!this.over) this.story.tick();
    const fight = this.L.actors.some((a) => a.team === 1 && a.alert === 2 && a.hp > 0 && KIND[a.kind].ai !== 'snake');
    if (this.inFight && !fight && !this.over) {
      if (p.fight.kills && p.hp <= 3) p.deeds.closeCalls = (p.deeds.closeCalls || 0) + 1;
      p.fight = {};
    }
    this.inFight = fight;
    this.checkDeeds();
    this.see();
  }

  // ---------------------------------------------------------------- saving
  serialize() {
    const levels = {};
    for (const id in this.levels) {
      const lv = this.levels[id], diff = [];
      for (let i = 0; i < lv.t.length; i++) if (lv.t[i] !== lv.base[i] || lv.glyph[i] !== lv.baseGlyph[i]) diff.push(i, lv.t[i], lv.glyph[i]);
      const runs = [];
      let cur = 0, n = 0;
      for (let i = 0; i < lv.seen.length; i++) { if (lv.seen[i] === cur) n++; else { runs.push(n); cur ^= 1; n = 1; } }
      runs.push(n);
      levels[id] = { actors: lv.actors, items: [...lv.items], decal: [...lv.decal], diff, seen: runs };
    }
    return JSON.stringify({ v: 2, S: this.S, levels });
  }
  restore(json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    if (!d || d.v !== 2) return false;
    this.fresh();
    this.S = d.S;
    this.p = this.S.p;
    for (const id in this.levels) {
      const lv = this.levels[id], s = d.levels[id];
      for (let i = 0; i < s.diff.length; i += 3) { lv.t[s.diff[i]] = s.diff[i + 1]; lv.glyph[s.diff[i]] = s.diff[i + 2]; }
      let k = 0, cur = 0;
      for (const n of s.seen) { lv.seen.fill(cur, k, k + n); k += n; cur ^= 1; }
      lv.actors = s.actors;
      lv.items = new Map(s.items);
      lv.decal = new Map(s.decal);
      for (const a of lv.actors) lv.occ[a.y * lv.w + a.x] = a;
      lv.computeLight();
    }
    this.L = this.levels[this.S.lv];
    this.L.occ[this.p.y * this.L.w + this.p.x] = this.p;
    this.over = null; this.dialog = null; this.fx.length = 0;
    this.inFight = false;
    this.flows = new Map();
    this.see();
    return true;
  }
  checkpoint() {
    if (this.over) return;
    this.cp = this.serialize();
    if (this.onSave) this.onSave(this.cp);
  }
  retry() {
    const deaths = this.S.stats.deaths;
    this.restore(this.cp);
    this.S.stats.deaths = deaths;
    this.S.rng = (this.S.rng + Math.imul(deaths + 1, 0x9e3779b9)) | 0; // the same fight, different dice
    // nobody should have to replay a fight they walked into half dead and empty
    const p = this.p;
    p.hp = Math.max(p.hp, Math.ceil(p.max * 0.7));
    p.poison = 0;
    if (p.guns.length) { const have = p.ammo.b + p.guns.reduce((n, k) => n + (WEAPON[k].ammo === 'b' ? p.loaded[k] || 0 : 0), 0); if (have < 10) p.ammo.b += 10 - have; }
  }
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }
