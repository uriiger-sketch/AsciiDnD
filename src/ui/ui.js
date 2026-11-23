// Everything the player sees and touches, drawn as characters in the terminal grid:
// the map, the status lines, the log, the buttons, the menus. No other drawing exists.

import { TILE, T, KIND, WEAPON, ITEM, DEED } from '../game/data.js';
import { cheb, dist, strokeChar, clamp } from '../game/util.js';
import { shade, tint, wrap } from './term.js';
import { LOGO, SUNSET, DEAD, HELP } from './art.js';

const C = { ink: 0xf2ecd8, dim: 0x9a917c, faint: 0x5c5548, gold: 0xffd060, red: 0xff5a4a, green: 0x8fd98f, blue: 0x8ac6ff, panel: 0x16120e, hot: 0x5c1612, warm: 0x3c1a0c, sel: 0x3a2e1c };
const BTN = [['fire', 'FIRE', 'f'], ['load', 'LOAD', 'r'], ['aim', 'AIM', 'space'], ['dash', 'DASH', 'x'], ['swap', 'SWAP', 'q'], ['bag', 'BAG', 'i'], ['look', 'LOOK', 'l'], ['menu', 'MENU', 'esc']];
const OCT = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const COMPASS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

export class UI {
  constructor(term, game, sfx, store) {
    this.t = term; this.g = game; this.sfx = sfx; this.store = store;
    this.mode = 'title';
    this.sub = null; // 'look' | 'throw' | 'dash'
    this.list = null; // an open menu: { title, lines: [{ text, fg, run, off, gap }], foot }
    this.fxs = [];
    this.busy = 0;
    this.travel = null;
    this.hits = []; // tappable regions of the current frame: { x, y, w, h, run }
    this.sel = 0;
    this.now = 0;
    game.onSave = (json) => store.save(json);
  }

  // ---------------------------------------------------------------- doing things
  act(a) {
    const g = this.g;
    if (this.now < this.busy || g.over || g.dialog) return false;
    const stage = g.S.stage, lv = g.S.lv;
    g.picked = false;
    const took = g.act(a);
    let hold = 0;
    for (const f of g.fx) {
      if (f.k === 'snd') { this.sfx(f.name, f.delay); continue; }
      this.fxs.push(Object.assign({ t0: this.now + f.delay, t1: this.now + f.delay + f.dur }, f));
      if (f.k !== 'float') hold = Math.max(hold, f.delay + Math.min(f.dur, 120));
    }
    g.fx.length = 0;
    this.busy = this.now + Math.min(hold, this.travel ? 0 : 260);
    if (g.S.stage !== stage || g.S.lv !== lv || g.dialog || g.over || g.picked || g.p.wasHit === g.S.turn) this.travel = null;
    if (g.dialog) this.sel = 0;
    return took;
  }
  startNew() {
    this.g.newGame((Date.now() & 0x7fffffff) | 1);
    this.mode = 'play'; this.list = null; this.sub = null; this.fxs = []; this.travel = null;
  }
  resume() {
    const json = this.store.load();
    if (!json || !this.g.restore(json)) return false;
    this.g.cp = json;
    this.mode = 'play'; this.list = null; this.sub = null; this.fxs = [];
    return true;
  }
  threat() { const p = this.g.p; return this.g.seenFoes().some((a) => a.kind !== 'snake' || cheb(a.x, a.y, p.x, p.y) <= 3); }

  // ---------------------------------------------------------------- input
  key(e) {
    const g = this.g, k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (this.mode === 'title') {
      if (k === 'Enter' || k === 'n') this.startNew();
      else if (k === 'c') this.resume();
      else if (k === 'h' || k === '?') this.openHelp();
      if (this.list && k === 'Escape') this.list = null;
      return true;
    }
    if (g.over) { if (k === 'Enter' || k === ' ') this.afterOver(0); return true; }
    if (g.dialog) {
      const d = g.dialog, last = d.page >= d.pages.length - 1, n = last && d.options ? d.options.length : 0;
      if (k === 'ArrowDown' || k === 's') this.sel = Math.min(n - 1, this.sel + 1);
      else if (k === 'ArrowUp' || k === 'w') this.sel = Math.max(0, this.sel - 1);
      else if (k >= '1' && k <= '9' && n) g.choose(+k - 1);
      else if (k === 'Enter' || k === ' ' || k === 'e') { if (n) g.choose(this.sel); else g.advance(); }
      else if (k === 'Escape' && n) { const i = d.options.findIndex((o) => !o.run); if (i >= 0) g.choose(i); }
      return true;
    }
    if (this.list) {
      if (k === 'Escape' || k === 'i' || k === 'Enter') this.list = null;
      else if (k >= '1' && k <= '9') { const runs = this.list.lines.filter((l) => l.run && !l.off); if (runs[+k - 1]) runs[+k - 1].run(); }
      return true;
    }
    const mv = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
      8: [0, -1], 2: [0, 1], 4: [-1, 0], 6: [1, 0], 7: [-1, -1], 9: [1, -1], 1: [-1, 1], 3: [1, 1], Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1] }[k];
    this.travel = null;
    if (mv) {
      if (this.sub === 'dash' || e.shiftKey) { this.sub = null; this.act({ t: 'dash', dx: mv[0], dy: mv[1] }); }
      else this.act({ t: 'move', dx: mv[0], dy: mv[1] });
      return true;
    }
    const b = { f: 'fire', r: 'load', ' ': 'aim', '.': 'aim', 5: 'aim', x: 'dash', q: 'swap', i: 'bag', l: 'look', Escape: 'menu', Tab: 'next', '?': 'help', m: 'menu' }[k];
    if (b) { this.button(b); return true; }
    return false;
  }
  button(id) {
    const g = this.g;
    this.travel = null;
    if (id !== 'dash' && id !== 'look') this.sub = null;
    switch (id) {
      case 'fire': this.act({ t: 'fire' }); break;
      case 'load': this.act({ t: 'reload' }); break;
      case 'aim': this.act({ t: 'wait' }); break;
      case 'swap': this.act({ t: 'swap' }); break;
      case 'next': this.act({ t: 'next' }); break;
      case 'dash':
        if (g.p.dashCd > 0) g.msg(`Winded. DASH in ${g.p.dashCd}.`, C.dim);
        else { this.sub = this.sub === 'dash' ? null : 'dash'; if (this.sub) g.msg('DASH: now tap or press a direction.', C.gold); }
        break;
      case 'look': this.sub = this.sub === 'look' ? null : 'look'; if (this.sub) g.msg('LOOK: tap anything to learn what it is.', C.gold); break;
      case 'bag': this.openBag(); break;
      case 'menu': this.openMenu(); break;
      case 'help': this.openHelp(); break;
    }
  }
  tap(cx, cy) {
    const g = this.g;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (cx >= h.x && cx < h.x + h.w && cy >= h.y && cy < h.y + h.h) { h.run(); return; }
    }
    if (this.mode !== 'play' || g.over) return;
    if (g.dialog) { const d = g.dialog; if (d.page < d.pages.length - 1 || !d.options) g.advance(); return; }
    if (this.list) { this.list = null; return; }
    const m = this.map;
    if (!m || cx < m.x || cy < m.y || cx >= m.x + m.w || cy >= m.y + m.h) return;
    const wx = cx - m.x + m.x0, wy = cy - m.y + m.y0, p = g.p, L = g.L, t = this.t;
    if (this.travel) { this.travel = null; return; }
    if (this.sub === 'look') { this.sub = null; g.msg(this.describe(wx, wy), C.ink); return; }
    if (this.sub === 'throw') { this.sub = null; this.act({ t: 'throw', x: wx, y: wy }); return; }
    const dir = () => {
      const dx = (wx - p.x) * t.cw, dy = (wy - p.y) * t.ch;
      return dx || dy ? OCT[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8] : null;
    };
    if (this.sub === 'dash') { this.sub = null; const d = dir(); if (d) this.act({ t: 'dash', dx: d[0], dy: d[1] }); return; }
    // an enemy under (or right beside) the finger
    let foe = null, fd = t.ch * 0.95;
    for (const a of g.seenFoes()) { const d = Math.hypot((a.x - wx) * t.cw, (a.y - wy) * t.ch); if (d < fd) { fd = d; foe = a; } }
    if (foe) { this.act({ t: 'attack', id: foe.id }); return; }
    if (wx === p.x && wy === p.y) { this.act({ t: 'wait' }); return; }
    const d = dir();
    if (cheb(wx, wy, p.x, p.y) <= 1 || this.threat() || !L.inb(wx, wy) || !L.seen[wy * L.w + wx]) { if (d) this.act({ t: 'move', dx: d[0], dy: d[1] }); return; }
    this.travel = { x: wx, y: wy, next: 0 };
  }
  afterOver(i) {
    const g = this.g;
    if (g.over === 'dead' && i === 0) { g.retry(); this.fxs = []; return; }
    this.mode = 'title';
    if (g.over === 'won') this.store.clear();
    g.over = null;
  }

  // ---------------------------------------------------------------- menus
  openBag() {
    const g = this.g, p = g.p, lines = [];
    const use = (k) => () => { this.list = null; if (k === 'dynamite') { this.sub = 'throw'; g.msg('THROW: tap where it should land (7 steps or less).', C.gold); } else this.act({ t: 'use', k }); };
    for (const k of ['bandage', 'whiskey', 'dynamite']) {
      lines.push({ text: `${ITEM[k].name.toUpperCase().padEnd(10)} x${p.items[k] || 0}   ${ITEM[k].desc}`, fg: p.items[k] ? C.ink : C.faint, run: p.items[k] ? use(k) : null, off: !p.items[k] });
    }
    lines.push({ gap: 1 }, { text: 'IN HAND (tap to change):', fg: C.dim });
    for (const k of [p.knife ? 'knife' : 'fists', ...p.guns]) {
      const w = WEAPON[k];
      lines.push({ text: `${k === p.weapon ? '>' : ' '} ${w.name.padEnd(11)} ${w.melee ? `${w.dmg[0]}-${w.dmg[1]} dmg` : `${p.loaded[k] || 0}/${w.mag}  ${w.dmg[0]}-${w.dmg[1]} dmg  reach ${w.range}`}`, fg: k === p.weapon ? C.gold : C.ink, run: () => { p.weapon = k; this.openBag(); } });
    }
    lines.push({ gap: 1 }, { text: `.45 rounds ${p.ammo.b}    shells ${p.ammo.s}    $${p.money}${p.armor ? '    duster' : ''}`, fg: C.dim });
    this.list = { title: 'BAG', lines, foot: 'tap a line to use it' };
  }
  openMenu() {
    const g = this.g;
    this.list = { title: 'SUNDOWN', lines: [
      { text: 'THE LEDGER   what you have done', fg: C.gold, run: () => this.openLedger() },
      { text: 'HOW TO PLAY', fg: C.ink, run: () => this.openHelp() },
      { text: 'SOUND: ' + (this.sfx.muted ? 'off' : 'on'), fg: C.ink, run: () => { this.sfx.muted = !this.sfx.muted; this.openMenu(); } },
      { text: 'BACK TO LAST CHECKPOINT', fg: C.ink, run: () => { this.list = null; g.retry(); this.fxs = []; } },
      { text: 'SAVE AND QUIT TO TITLE', fg: C.ink, run: () => { this.list = null; this.mode = 'title'; } },
      { gap: 1 }, { text: 'CLOSE', fg: C.dim, run: () => { this.list = null; } },
    ], foot: '' };
  }
  openLedger() {
    const g = this.g, p = g.p, S = g.S, lines = [];
    lines.push({ text: g.story.objective().text, fg: C.gold }, { gap: 1 }, { text: 'DEEDS. You are named for what you do.', fg: C.dim });
    for (const d of DEED) {
      const n = Math.min(d.need, p.deeds[d.count] || 0), has = p.perks[d.id];
      lines.push({ text: `${has ? '*' : ' '} ${d.name.padEnd(14)} ${('#'.repeat(n) + '.'.repeat(d.need - n)).slice(0, 12).padEnd(12)}`, fg: has ? C.gold : C.ink });
      lines.push({ text: `    ${has ? d.gives : d.what + ' (' + n + '/' + d.need + ')'}`, fg: has ? C.green : C.faint });
    }
    if (p.perks.wind) lines.push({ text: '* SECOND WIND    given by the stones', fg: C.gold });
    lines.push({ gap: 1 }, { text: `kills ${S.stats.kills}   shots ${S.stats.shots}   hits ${S.stats.hits}   deaths ${S.stats.deaths}   turn ${S.turn}`, fg: C.dim });
    this.list = { title: 'THE LEDGER', lines, foot: 'tap to close' };
  }
  openHelp() {
    const lines = [
      { text: 'Time only moves when you do.', fg: C.gold },
      { text: 'TAP the ground to walk. TAP an enemy to attack.', fg: C.ink },
      { text: 'RED SQUARES are about to be shot, blown up or ridden over. Do not be standing on one.', fg: C.red },
      { text: 'COVER between you and him: he misses far more.', fg: C.blue },
      { text: 'AIM (wait a turn) makes the next shot better. So does shooting a man who has not seen you.', fg: C.ink },
      { text: 'Keys: arrows or WASD move, F fire, R load, SPACE aim, X dash, Q swap, I bag, L look, TAB next target.', fg: C.dim },
      { gap: 1 },
    ];
    for (const [ch, fg, text] of HELP) lines.push(ch ? { text: ch.padEnd(8) + text, fg: C.dim, ch, chfg: fg } : { gap: 1 });
    this.list = { title: 'HOW TO PLAY', lines, foot: 'tap to close' };
  }
  describe(x, y) {
    const g = this.g, L = g.L;
    if (!L.inb(x, y) || !L.seen[y * L.w + x]) return 'You have not seen that.';
    const i = y * L.w + x, a = L.occ[i], out = [];
    if (g.danger().has(i)) out.push('MARKED: something lands here next turn.');
    if (a === g.p) out.push('You.');
    else if (a && L.vis[i] && !(a.team === 1 && g.hidden(a))) {
      const k = KIND[a.kind];
      out.push(a.team === 1 ? `${k.name.toUpperCase()} (${a.hp}/${k.hp})${a.alert < 2 ? ', has not seen you' : ''}. ${k.desc}` : `${a.name || k.name}.`);
    }
    const it = L.items.get(i);
    if (it) out.push(it.map((q) => (q.n > 1 ? q.n + ' ' : '') + ITEM[q.k].name).join(', ') + '.');
    out.push(cap(TILE[L.t[i]].desc) + '.');
    return out.join(' ');
  }

  // ---------------------------------------------------------------- frame
  frame(now) {
    this.now = now;
    const g = this.g, t = this.t;
    t.fit();
    if (this.mode === 'play' && this.travel && !g.over && !g.dialog && now >= this.travel.next && now >= this.busy) {
      const tr = this.travel, p = g.p;
      if ((p.x === tr.x && p.y === tr.y) || this.threat()) this.travel = null;
      else {
        const nx = g.danger();
        tr.next = now + 34;
        if (!this.act({ t: 'goto', x: tr.x, y: tr.y }) || nx.has(p.y * g.L.w + p.x)) this.travel = null;
        if (this.travel && this.threat()) this.travel = null;
      }
    }
    this.fxs = this.fxs.filter((f) => f.t1 > now);
    this.hits = [];
    t.clear();
    if (this.mode === 'title') this.drawTitle();
    else this.drawPlay();
    if (this.list) this.drawList();
    t.flush();
  }

  // ---------------------------------------------------------------- title
  drawTitle() {
    const t = this.t, n = this.now / 1000;
    const top = Math.max(1, Math.floor(t.rows / 2) - 13);
    const small = t.cols < 43;
    SUNSET.forEach((row, j) => {
      const x0 = Math.floor((t.cols - row.length) / 2);
      for (let i = 0; i < row.length; i++) {
        const c = row[i];
        if (c === ' ') continue;
        const ray = j < 4 && c !== '_' && c !== '-' ? 0.75 + 0.25 * Math.sin(n * 1.5 + i * 0.6 + j) : 1;
        t.put(x0 + i, top + j, c, j >= 4 && (i < 15 || i > 27) ? 0x8c4526 : shade(j < 2 ? 0xffb040 : 0xffd060, ray));
      }
    });
    const ly = top + SUNSET.length + 1;
    LOGO.forEach((row, j) => {
      const x0 = Math.floor((t.cols - row.length) / 2);
      for (let i = 0; i < row.length; i++) if (row[i] !== ' ') t.put(x0 + i, ly + j, small ? row[i] : '#', [0xffd060, 0xffb848, 0xff9838, 0xf07030, 0xd04828][j]);
    });
    t.center(ly + 6, 'L E F T   F O R   D E A D', C.dim);
    let y = ly + 9;
    const has = !!this.store.load();
    const opt = (label, run, fg = C.ink) => {
      const w = 24, x = Math.floor((t.cols - w) / 2);
      t.box(x, y, w, 3, C.faint, C.panel);
      t.center(y + 1, label, fg, C.panel);
      this.hits.push({ x, y, w, h: 3, run, name: label });
      y += 3;
    };
    if (has) opt('CONTINUE', () => this.resume(), C.gold);
    opt('NEW GAME', () => this.startNew(), has ? C.ink : C.gold);
    opt('HOW TO PLAY', () => this.openHelp());
    t.center(Math.min(t.rows - 2, y + 1), 'A western in 95 characters.', C.faint);
  }

  // ---------------------------------------------------------------- play
  drawPlay() {
    const t = this.t, g = this.g, wide = t.cols >= 88;
    let m;
    if (wide) {
      const pw = 32;
      m = { x: 0, y: 0, w: t.cols - pw - 1, h: t.rows };
      for (let y = 0; y < t.rows; y++) t.put(t.cols - pw - 1, y, '|', C.faint);
      const px = t.cols - pw + 1, w = pw - 2;
      this.drawStatus(px, 0, w, true);
      this.drawButtons(px - 1, t.rows - 12, pw, 2, 4, true);
      this.drawLog(px, 9, w, t.rows - 22);
    } else {
      m = { x: 0, y: 3, w: t.cols, h: t.rows - 12 };
      this.drawStatus(0, 0, t.cols, false);
      this.drawLog(0, t.rows - 9, t.cols, 3);
      this.drawButtons(0, t.rows - 6, t.cols, 4, 2, false);
    }
    this.drawMap(m);
    if (g.dialog) this.drawDialog();
    if (g.over) this.drawOver();
  }

  light() {
    const g = this.g;
    if (g.L.dark) return [1, 0.92, 0.8];
    const h = g.S.hour, mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const DAY = [1, 1, 1], DUSK = [1.08, 0.74, 0.5], NIGHT = [0.5, 0.6, 1.0], DAWN = [1, 0.82, 0.78];
    if (h >= 7 && h < 17) return DAY;
    if (h >= 17 && h < 19) return mix(DAY, DUSK, (h - 17) / 2);
    if (h >= 19 && h < 20) return mix(DUSK, NIGHT, h - 19);
    if (h >= 20 || h < 5) return NIGHT;
    if (h < 6) return mix(NIGHT, DAWN, h - 5);
    return mix(DAWN, DAY, h - 6);
  }

  drawMap(m) {
    const t = this.t, g = this.g, L = g.L, p = g.p, now = this.now;
    m.x0 = L.w > m.w ? clamp(p.x - (m.w >> 1), 0, L.w - m.w) : -((m.w - L.w) >> 1);
    m.y0 = L.h > m.h ? clamp(p.y - (m.h >> 1), 0, L.h - m.h) : -((m.h - L.h) >> 1);
    this.map = m;
    const amb = this.light(), danger = g.danger(), tgt = g.target(), blink = Math.floor(now / 260) % 2;
    const far = g.sight()[0], dim = g.L.dark || g.night();
    const ob = g.story.objective(), goal = ob.at && ob.lv === L.id ? ob.at : null;
    const fuse = new Map();
    for (const f of g.S.fuses) if (f.lv === L.id) fuse.set(f.y * L.w + f.x, f.t);
    for (let sy = 0; sy < m.h; sy++) for (let sx = 0; sx < m.w; sx++) {
      const x = m.x0 + sx, y = m.y0 + sy;
      if (!L.inb(x, y)) continue;
      const i = y * L.w + x;
      if (!L.seen[i]) continue;
      const tl = TILE[L.t[i]];
      let ch = L.glyph[i] || tl.ch.charCodeAt(0), fg = L.tint[i] || tl.fg, bg = 0;
      if (!L.vis[i]) { t.put(m.x + sx, m.y + sy, ch, tint(fg, [0.36, 0.36, 0.42]), 0); continue; }
      // the ground lives a little
      if (tl.id === T.WATER) { const ph = (x * 3 + y * 5 + Math.floor(now / 420)) % 7; ch = ph === 0 ? 45 : 126; fg = ph === 3 ? 0x6fb0e0 : fg; }
      else if (tl.id === T.FIRE) { const ph = (Math.floor(now / 110) + x) % 4; fg = [0xffa040, 0xffd060, 0xff7028, 0xffb848][ph]; ch = ph === 2 ? 37 : 38; }
      else if (tl.id === T.LANTERN) fg = (Math.floor(now / 190) + x * 7) % 9 === 0 ? 0xffb040 : fg;
      else if ((tl.id === T.SCRUB || tl.id === T.GRASS) && (x * 7 + y * 13 + Math.floor(now / 900)) % 23 === 0) ch = 39;
      const d = Math.hypot(x - p.x, y - p.y), lit = L.lit[i];
      let k = 1 - 0.28 * Math.min(1, d / far);
      if (dim && !lit) k *= 0.72;
      fg = tl.light ? fg : tint(fg, dim && lit ? [1, 0.9, 0.7] : amb, k);
      if (L.decal.has(i) && tl.walk) { ch = L.decal.get(i) ? 37 : 44; fg = 0x8a2a20; }
      const its = L.items.get(i);
      if (its) { const it = ITEM[its[its.length - 1].k]; ch = it.ch.charCodeAt(0); fg = it.fg; }
      const dg = danger.get(i);
      if (dg !== undefined) { bg = dg > 1 ? C.warm : blink ? C.hot : 0x7a1c14; if (ch === 32 || ch === 46 || ch === 44) { ch = 58; fg = 0xff7a60; } }
      if (fuse.has(i)) { ch = 48 + fuse.get(i); fg = 0xffffff; bg = 0xc03018; }
      if (goal && goal[0] === x && goal[1] === y && blink && !L.occ[i]) { ch = 33; fg = C.gold; }
      const a = L.occ[i];
      if (a === p) { ch = 64; fg = p.aim ? C.gold : 0xffffff; }
      else if (a && !(a.team === 1 && g.hidden(a))) {
        const kd = KIND[a.kind];
        ch = kd.ch.charCodeAt(0);
        fg = a.fg || kd.fg;
        if (a.team === 1 && a.alert < 2 && kd.ai !== 'snake') fg = shade(fg, 0.62);
        if (a === tgt) { bg = fg; fg = 0x000000; }
        else if (a.aim || a.fan || a.charge) bg = blink ? 0x6a1810 : 0;
        else if (a.team === 2 && goal && goal[0] === x && goal[1] === y && blink) { bg = C.gold; fg = 0; }
      }
      t.put(m.x + sx, m.y + sy, ch, fg, bg);
    }
    // effects
    const put = (x, y, ch, fg, bg = 0) => { const sx = x - m.x0, sy = y - m.y0; if (sx >= 0 && sy >= 0 && sx < m.w && sy < m.h) t.put(m.x + sx, m.y + sy, ch, fg, bg); };
    for (const f of this.fxs) {
      if (now < f.t0) continue;
      const u = (now - f.t0) / (f.t1 - f.t0);
      if (f.k === 'line') {
        const n = f.cells.length, head = Math.ceil(u * 1.6 * n);
        let px = f.cells[0][0], py = f.cells[0][1];
        for (let i = 0; i < n; i++) {
          const [x, y] = f.cells[i];
          const c = f.ch || strokeChar(i ? x - px : x - p.x || 1, i ? y - py : 0);
          if (i < head && i > head - 9 && L.vis[y * L.w + x]) put(x, y, f.ch || (i ? strokeChar(Math.sign(x - px), Math.sign(y - py)) : c), f.fg);
          px = x; py = y;
        }
      } else if (f.k === 'pop') { if (L.vis[f.y * L.w + f.x]) put(f.x, f.y, f.ch, f.fg, f.bg); }
      else if (f.k === 'boom') {
        const r = u < 0.3 ? 0 : u < 0.6 ? 1 : 2;
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
          const dd = Math.max(Math.abs(i), Math.abs(j));
          if (dd < r - 1) continue;
          put(f.x + i, f.y + j, dd === r ? (u < 0.6 ? '*' : '+') : '#', dd === r ? (u < 0.5 ? 0xffe080 : 0xff8030) : 0xfff0c0, u < 0.7 ? 0xa03010 : 0x501808);
        }
      }
    }
    for (const f of this.fxs) {
      if (now < f.t0 || f.k !== 'float') continue;
      const u = (now - f.t0) / (f.t1 - f.t0), x0 = f.x - (f.text.length >> 1), y = f.y - 1 - (u > 0.5 ? 1 : 0);
      for (let i = 0; i < f.text.length; i++) put(x0 + i, y, f.text[i], f.fg);
    }
    // a pointer at the edge when the goal is off the screen
    if (goal) {
      const sx = goal[0] - m.x0, sy = goal[1] - m.y0;
      if (sx < 0 || sy < 0 || sx >= m.w || sy >= m.h) {
        const ex = clamp(sx, 0, m.w - 1), ey = clamp(sy, 0, m.h - 1);
        t.put(m.x + ex, m.y + ey, sx < 0 ? '<' : sx >= m.w ? '>' : sy < 0 ? '^' : 'v', blink ? C.gold : 0x806830, 0);
      }
    }
    if (this.sub) t.write(m.x + 1, m.y, ` ${this.sub === 'look' ? 'LOOK: tap a thing' : this.sub === 'throw' ? 'THROW: tap a square' : 'DASH: tap a direction'} `, 0, C.gold);
  }

  drawStatus(x, y, w, wide) {
    const t = this.t, g = this.g, p = g.p, S = g.S;
    const hpc = p.hp <= p.max * 0.3 ? C.red : p.hp <= p.max * 0.6 ? C.gold : C.green;
    t.write(x, y, 'HP', C.dim);
    for (let i = 0; i < p.max; i++) t.put(x + 3 + i, y, i < p.hp ? '#' : '-', i < p.hp ? hpc : C.faint);
    t.write(x + 4 + p.max, y, `${p.hp}/${p.max}`, hpc);
    const hh = Math.floor(S.hour), mm = Math.floor((S.hour % 1) * 60);
    const right = `$${p.money} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const flags = (p.poison ? ' PSN' : '') + (p.numb ? ' NUMB' : '') + (p.armor ? '' : '');
    if (wide) { t.write(x, y + 1, right, C.gold); if (flags) t.write(x + right.length, y + 1, flags, C.green); }
    else { t.write(x + w - right.length, y, right, C.gold); if (flags) t.write(x + 10 + p.max, y, flags.trim().slice(0, w - right.length - 12 - p.max), C.green); }
    // what is in your hand
    const y1 = y + (wide ? 3 : 1), wk = p.weapon, wp = WEAPON[wk];
    t.write(x, y1, wp.name, C.ink);
    let cx = x + wp.name.length + 1;
    if (!wp.melee) {
      for (let i = 0; i < wp.mag; i++) t.put(cx + i, y1, i < (p.loaded[wk] || 0) ? 'o' : '.', i < (p.loaded[wk] || 0) ? C.gold : C.faint);
      cx += wp.mag + 1;
      t.write(cx, y1, '+' + p.ammo[wp.ammo], p.ammo[wp.ammo] ? C.dim : C.red);
      cx += 2 + String(p.ammo[wp.ammo]).length;
    }
    if (p.aim) t.write(cx, y1, 'AIMED', C.gold);
    // who you are pointing at
    const tg = g.target();
    let ts = '', tc = C.dim;
    if (tg) {
      const k = KIND[tg.kind], o = g.odds(tg);
      ts = `>${k.name} ${tg.hp}hp` + (wp.melee ? '' : o ? ` ${Math.round(o.p * 100)}%${o.cover === 2 ? ' cover' : ''}` : ' no shot');
      tc = !wp.melee && !o ? C.dim : C.red;
    }
    if (wide) t.write(x, y + 4, ts.slice(0, w), tc);
    else {
      const room = x + w - (cx + (p.aim ? 6 : 0));
      if (ts.length > room && tg) ts = '>' + ts.slice(ts.indexOf(' ') + 1); // no room for his name
      t.write(x + w - Math.min(ts.length, room), y1, ts.slice(0, room), tc);
    }
    // where you are going
    const ob = g.story.objective(), y2 = y + (wide ? 6 : 2);
    let way = '';
    if (ob.at && ob.lv === S.lv) {
      const dx = ob.at[0] - p.x, dy = ob.at[1] - p.y, d = Math.round(Math.hypot(dx, dy));
      if (d > 2) way = ` ${COMPASS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8]} ${d}`;
    } else if (ob.lv && ob.lv !== S.lv) way = ob.lv === 'mine' ? ' (in the mine)' : ' (outside)';
    if (wide) { const ls = wrap(ob.text + way, w); ls.slice(0, 3).forEach((l, i) => t.write(x, y2 + i, l, C.gold)); }
    else { const room = w - way.length - 2; t.write(x, y2, '>' + (ob.text.length > room ? ob.text.slice(0, room - 2) + '..' : ob.text), C.gold); t.write(x + w - way.length, y2, way, C.ink); }
    if (g.danger().has(p.y * g.L.w + p.x) && Math.floor(this.now / 200) % 2) t.write(x + (wide ? 0 : Math.floor(w / 2) - 3), wide ? y + 2 : y, ' MOVE! ', 0xffffff, 0xc02818);
  }

  drawLog(x, y, w, h) {
    const t = this.t, log = this.g.S.log, lines = [];
    for (let i = Math.max(0, log.length - h); i < log.length; i++) {
      const fresh = log[i].n >= this.g.S.turn - 1;
      for (const ln of wrap(log[i].t, w)) lines.push([ln, fresh ? log[i].fg : shade(log[i].fg, 0.55)]);
    }
    lines.slice(-h).forEach(([ln, fg], i) => t.write(x, y + i, ln, fg));
  }

  drawButtons(x, y, w, perRow, rows, wide) {
    const t = this.t, g = this.g, p = g.p, bw = Math.floor(w / perRow);
    BTN.forEach(([id, label], i) => {
      const bx = x + (i % perRow) * bw, by = y + Math.floor(i / perRow) * 3;
      let fg = C.ink, bg = C.panel, text = label;
      const wp = WEAPON[p.weapon];
      if (id === 'fire') { text = wp.melee ? (p.knife ? 'KNIFE' : 'PUNCH') : 'FIRE'; if (!g.target()) fg = C.faint; else fg = C.red; }
      if (id === 'load' && (wp.melee || (p.loaded[p.weapon] || 0) >= wp.mag)) fg = C.faint;
      if (id === 'load' && !wp.melee && !(p.loaded[p.weapon] > 0)) { fg = 0xffffff; bg = Math.floor(this.now / 300) % 2 ? 0x8a2018 : C.panel; }
      if (id === 'dash') { if (p.dashCd > 0) { text = 'DASH ' + p.dashCd; fg = C.faint; } if (this.sub === 'dash') { bg = C.gold; fg = 0; } }
      if (id === 'look' && this.sub === 'look') { bg = C.gold; fg = 0; }
      if (id === 'aim' && p.aim) fg = C.gold;
      if (id === 'bag') text = 'BAG' + (p.items.bandage ? ' +' + p.items.bandage : '');
      t.box(bx, by, bw, 3, bg === C.gold ? C.gold : C.faint, bg);
      t.write(bx + Math.max(1, Math.floor((bw - text.length) / 2)), by + 1, text.slice(0, bw - 2), fg, bg);
      this.hits.push({ x: bx, y: by, w: bw, h: 3, run: () => this.button(id), name: id });
    });
  }

  drawDialog() {
    const t = this.t, d = this.g.dialog, w = Math.min(t.cols, 62), x = Math.floor((t.cols - w) / 2);
    const last = d.page >= d.pages.length - 1, opts = last && d.options ? d.options : [];
    const text = wrap(d.pages[d.page], w - 4);
    const h = text.length + 4 + (opts.length ? opts.length * 2 : 1);
    const y = Math.max(0, t.rows - h - (t.cols >= 88 ? 1 : 0));
    t.box(x, y, w, h, C.gold, C.panel, d.who);
    text.forEach((ln, i) => t.write(x + 2, y + 2 + i, ln, C.ink, C.panel));
    let oy = y + 3 + text.length;
    if (!opts.length) { t.write(x + w - 12, y + h - 2, Math.floor(this.now / 400) % 2 ? 'tap  >>' : 'tap   >', C.dim, C.panel); return; }
    opts.forEach((o, i) => {
      const sel = i === this.sel && !o.off, bg = sel ? C.sel : C.panel;
      t.fill(x + 1, oy, w - 2, 1, ' ', C.ink, bg);
      t.write(x + 2, oy, `${i + 1}. ${o.label}`.slice(0, w - 4), o.off ? C.faint : sel ? C.gold : C.ink, bg);
      this.hits.push({ x, y: oy - (i ? 1 : 0), w, h: 2, name: 'opt' + i, run: () => { this.sel = i; this.g.choose(i); if (this.g.dialog) this.sel = 0; } });
      oy += 2;
    });
  }

  drawList() {
    const t = this.t, L = this.list, w = Math.min(t.cols, 58), x = Math.floor((t.cols - w) / 2);
    // wrap to the box, keeping a hanging indent for legend lines
    const rows = [];
    for (const ln of L.lines) {
      if (ln.gap) { rows.push({ gap: 1 }); continue; }
      const ind = ln.ch ? 8 : 0, parts = wrap(ln.text.slice(ind), w - 4 - ind);
      parts.forEach((part, k) => rows.push({ ...ln, text: ' '.repeat(ind) + part, ch: k ? null : ln.ch, first: k === 0 }));
    }
    const room = t.rows - 4, pages = Math.ceil(rows.length / room);
    L.page = Math.min(L.page || 0, pages - 1);
    const view = rows.slice(L.page * room, (L.page + 1) * room);
    const h = view.length + 4, y = Math.max(0, Math.floor((t.rows - h) / 2));
    t.box(x, y, w, h, C.gold, C.panel, L.title);
    // a tap that hits no line turns the page, or closes on the last one
    this.hits.push({ x: 0, y: 0, w: t.cols, h: t.rows, run: () => { if (L.page < pages - 1) L.page++; else this.list = null; } });
    view.forEach((ln, i) => {
      if (ln.gap) return;
      const ly = y + 2 + i;
      t.write(x + 2, ly, ln.text, ln.off ? C.faint : ln.fg || C.ink, C.panel);
      if (ln.ch) t.write(x + 2, ly, ln.ch, ln.chfg, C.panel);
      if (ln.run && !ln.off) this.hits.push({ x, y: ly, w, h: 1, run: ln.run, name: ln.first ? ln.text : '' });
    });
    const foot = pages > 1 ? (L.page < pages - 1 ? `tap for more (${L.page + 1}/${pages})` : 'tap to close') : L.foot;
    if (foot) t.write(x + w - foot.length - 3, y + h - 1, ' ' + foot + ' ', C.dim, C.panel);
  }

  drawOver() {
    const t = this.t, g = this.g, S = g.S, won = g.over === 'won';
    const w = Math.min(t.cols, 50), x = Math.floor((t.cols - w) / 2);
    const lines = won
      ? ['Silas Crowe is dead in the street he came to burn.', '', `Turns ${S.turn}   kills ${S.stats.kills}   deaths ${S.stats.deaths}`,
        'Named: ' + (DEED.filter((d) => g.p.perks[d.id]).map((d) => d.name).join(', ') || 'nobody yet'), '', 'End of chapter one.']
      : [`Killed by ${g.deathBy}.`, '', 'The desert keeps what it is given.', 'You get another try at the last checkpoint.'];
    const body = lines.flatMap((l) => (l ? wrap(l, w - 4) : ['']));
    const art = won ? [] : DEAD, h = body.length + art.length + 9, y = Math.max(0, Math.floor((t.rows - h) / 2));
    t.box(x, y, w, h, won ? C.gold : C.red, C.panel, won ? 'SUNDOWN' : '');
    art.forEach((row, j) => { const ax = x + Math.floor((w - row.length) / 2); for (let i = 0; i < row.length; i++) if (row[i] !== ' ' && ax + i > x && ax + i < x + w - 1) t.put(ax + i, y + 2 + j, '#', 0xc82818, C.panel); });
    body.forEach((ln, i) => t.write(x + Math.floor((w - ln.length) / 2), y + 3 + art.length + i, ln, i === 0 ? C.ink : C.dim, C.panel));
    const labels = won ? ['TITLE'] : ['TRY AGAIN', 'TITLE'];
    const bw = 16, total = labels.length * bw + (labels.length - 1) * 2;
    labels.forEach((lab, i) => {
      const bx = x + Math.floor((w - total) / 2) + i * (bw + 2), by = y + h - 4;
      t.box(bx, by, bw, 3, i === 0 ? C.gold : C.faint, C.panel);
      t.write(bx + Math.floor((bw - lab.length) / 2), by + 1, lab, i === 0 ? C.gold : C.ink, C.panel);
      this.hits.push({ x: bx, y: by, w: bw, h: 3, run: () => this.afterOver(won ? 1 : i), name: lab });
    });
  }
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }
