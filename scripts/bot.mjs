// A plain-minded gunfighter used for testing and for tuning how hard the fights are.
// It reads the same information a player sees: marked cells, odds, health, ammunition.
import { KIND, WEAPON, T } from '../src/game/data.js';
import { flow } from '../src/game/world.js';
import { cheb, dist, DIRS } from '../src/game/util.js';

export function botAct(g, goal, hunting = false) {
  const p = g.p, L = g.L, here = p.y * L.w + p.x;
  const danger = g.danger();
  const foes = g.seenFoes().filter((a) => !(a.kind === 'snake' && cheb(a.x, a.y, p.x, p.y) > 1));
  const adj = foes.filter((a) => cheb(a.x, a.y, p.x, p.y) <= 1);
  const safeStep = (pred) => {
    let best = null, bs = -1e9;
    for (const [dx, dy] of DIRS) {
      const X = p.x + dx, Y = p.y + dy;
      if (!L.inb(X, Y) || !L.canStep(p.x, p.y, dx, dy) || g.at(X, Y) || danger.has(Y * L.w + X)) continue;
      let s = 0;
      for (const a of foes) { if (a.alert === 2 && ['gun', 'rifle', 'crowe'].includes(KIND[a.kind].ai)) s += g.shotInfo(a.x, a.y, X, Y).cover === 2 ? 2 : 0; if (KIND[a.kind].melee && !KIND[a.kind].gun && cheb(a.x, a.y, X, Y) <= 1) s -= 2; }
      if (pred) s += pred(X, Y);
      if (s > bs) { bs = s; best = [dx, dy]; }
    }
    return best;
  };
  // 1. out of the marked squares
  if (danger.has(here)) {
    const gf = goal ? flow(L, goal[0], goal[1], 60) : null;
    const s = safeStep(gf ? (X, Y) => -gf[Y * L.w + X] * 0.3 : null);
    if (s) return { t: 'move', dx: s[0], dy: s[1] };
    if (!p.dashCd) for (const [dx, dy] of DIRS) {
      let x = p.x, y = p.y, n = 0;
      while (n < 3 && L.canStep(x, y, dx, dy) && !g.at(x + dx, y + dy)) { x += dx; y += dy; n++; }
      if (n && !danger.has(y * L.w + x)) return { t: 'dash', dx, dy };
    }
  }
  // 2. stop the bleeding
  if ((p.hp <= 4 || (p.poison && p.hp <= 6)) && p.items.bandage > 0 && !adj.length) return { t: 'use', k: 'bandage' };
  if (p.hp <= 3 && p.items.whiskey > 0 && !adj.length) return { t: 'use', k: 'whiskey' };
  // 3. fight
  if (foes.length) {
    const guns = p.guns.filter((k) => (p.loaded[k] || 0) > 0 || p.ammo[WEAPON[k].ammo] > 0);
    const loaded = p.guns.filter((k) => (p.loaded[k] || 0) > 0);
    if (loaded.length) {
      let best = null, bp = 0, bk = null;
      for (const k of loaded) for (const a of foes) {
        const o = g.odds(a, k);
        if (!o) continue;
        const v = o.p * (a.hp <= 3 ? 1.3 : 1) * (a.aim || a.fan || a.charge ? 1.4 : 1) * (k === 'shotgun' && o.d <= 3 ? 1.5 : 1);
        if (v > bp) { bp = v; best = a; bk = k; }
      }
      if (best && bp >= 0.32) { p.weapon = bk; return { t: 'attack', id: best.id }; }
      if (adj.length) { p.weapon = p.knife ? 'knife' : 'fists'; return { t: 'attack', id: adj[0].id }; }
      const nearest = foes.reduce((m, a) => (dist(a.x, a.y, p.x, p.y) < dist(m.x, m.y, p.x, p.y) ? a : m));
      if (best && p.aim) { p.weapon = bk; return { t: 'attack', id: best.id }; }
      const shy = ['rifle', 'dyn'].includes(KIND[nearest.kind].ai) || !best;
      if (!shy && dist(nearest.x, nearest.y, p.x, p.y) > 3) return { t: 'wait' };
      if (!shy && best) { p.weapon = bk; return { t: 'attack', id: best.id }; }
      // no clear shot at anyone: close in
      const f = flow(L, nearest.x, nearest.y, 40);
      const s = safeStep((X, Y) => -f[Y * L.w + X] * 2.5);
      if (s) return { t: 'move', dx: s[0], dy: s[1] };
      return { t: 'wait' };
    }
    if (adj.length) { p.weapon = p.knife ? 'knife' : 'fists'; return { t: 'attack', id: adj.sort((a, b) => a.hp - b.hp)[0].id }; }
    if (guns.length) { p.weapon = guns[0]; return { t: 'reload' }; }
    p.weapon = p.knife ? 'knife' : 'fists';
    const nearest = foes.reduce((m, a) => (dist(a.x, a.y, p.x, p.y) < dist(m.x, m.y, p.x, p.y) ? a : m));
    return { t: 'attack', id: nearest.id };
  }
  // 4. nobody in sight: top up, then walk on
  for (const k of p.guns) if ((p.loaded[k] || 0) < WEAPON[k].mag && p.ammo[WEAPON[k].ammo] > 0) { p.weapon = k; return { t: 'reload' }; }
  if (p.hp <= 5 && p.items.bandage > 0) return { t: 'use', k: 'bandage' };
  // loot what they dropped
  let loot = null, ld = hunting ? 4 : 13;
  for (const i of L.items.keys()) {
    const x = i % L.w, y = (i / L.w) | 0, d = cheb(x, y, p.x, p.y);
    if (L.seen[i] && d < ld) { ld = d; loot = [x, y]; }
  }
  if (loot) return { t: 'goto', x: loot[0], y: loot[1] };
  if (goal) return { t: 'goto', x: goal[0], y: goal[1] };
  return { t: 'wait' };
}

// Plays the chapter by its objectives. Returns a report.
export function playChapter(g, o = {}) {
  const log = o.log || (() => {});
  const P = g.levels.world.poi, M = g.levels.mine.poi;
  const report = { deaths: {}, turns: 0, stage: 0, won: false, notes: [] };
  let guard = 0, lastStage = -1, stuck = 0, lastKey = '';
  const want = () => {
    const S = g.S, p = g.p, st = S.stage;
    // errands in town between jobs
    if (S.lv === 'world' && st >= 6 && st <= 14 && cheb(p.x, p.y, 78, 53) < 34) {
      if (p.hp < p.max - 1 && p.money >= 4 && !S.flags['doc' + st + S.turn % 1]) return ['doc', P.doc];
      const need = shopList(g);
      if (need.length) return ['shop', P.hollis];
    }
    const ob = g.story.objective();
    // mopping up: go to whoever is left of the current fight
    const tag = { 4: 'q1', 7: 'q2', 9: 'q3', 12: 'q5', 15: 'fin' }[st];
    const left = tag ? g.L.actors.filter((a) => a.group === tag && a.hp > 0) : [];
    if (left.length && (st !== 12 || S.lv === 'world' || !S.flags.box)) { const n = left.sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0]; if (st !== 12 || dist(n.x, n.y, p.x, p.y) < 30) return ['hunt', [n.x, n.y]]; }
    if (st === 12 && S.flags.trial === undefined && o.trial && p.hp >= p.max - 2) return ['heron', [133, 21]];
    if (S.flags.trial === 1) return ['stones', P.stones];
    if (S.lv === 'mine') return ob.lv === 'mine' && ob.at ? ['obj', ob.at] : ['up', M.up];
    if (ob.lv === 'mine') return ['door', P.mineDoor];
    return ['obj', ob.at || null];
  };
  while (guard++ < 60000) {
    const S = g.S;
    if (S.stage !== lastStage) { log(`stage ${S.stage} @turn ${S.turn} hp ${g.p.hp}/${g.p.max} $${g.p.money} b${g.p.ammo.b} guns ${g.p.guns.join('+') || '-'} perks ${Object.keys(g.p.perks).join(',') || '-'}`); lastStage = S.stage; }
    if (g.over === 'won') { report.won = true; break; }
    if (g.over === 'dead') {
      report.deaths[S.stage] = (report.deaths[S.stage] || 0) + 1;
      report.by = report.by || {};
      report.by[S.stage + ':' + g.deathBy] = (report.by[S.stage + ':' + g.deathBy] || 0) + 1;
      log(`  died at stage ${S.stage} to ${g.deathBy} (turn ${S.turn})`);
      if (report.deaths[S.stage] > (o.maxDeaths || 25)) { report.notes.push('gave up at stage ' + S.stage); break; }
      g.retry();
      continue;
    }
    if (g.dialog) { answer(g); continue; }
    const [why, goal] = want();
    const a = botAct(g, goal, why === 'hunt');
    if (o.hook && o.hook(g, a, why, goal)) break;
    let took;
    if (a.t === 'goto') {
      // the bot knows the map; a player would be reading the trail and the compass
      const L = g.L, p = g.p, av = g.avoid();
      for (const k of g.danger().keys()) av.add(k);
      av.delete(a.y * L.w + a.x);
      const f = flow(L, a.x, a.y, 900, false, av);
      let best = null, bd = f[p.y * L.w + p.x];
      for (const [dx, dy] of DIRS) {
        const X = p.x + dx, Y = p.y + dy;
        if (!L.inb(X, Y) || !L.canStep(p.x, p.y, dx, dy)) continue;
        if (g.at(X, Y) && !(X === a.x && Y === a.y)) continue;
        if (f[Y * L.w + X] < bd) { bd = f[Y * L.w + X]; best = [dx, dy]; }
      }
      took = best ? g.act({ t: 'move', dx: best[0], dy: best[1] }) : false;
    } else took = g.act(a);
    const key = g.p.x + ',' + g.p.y + ',' + S.stage + ',' + g.p.hp + ',' + g.foes().length + ',' + (g.dialog ? 1 : 0);
    stuck = key === lastKey ? stuck + 1 : 0;
    if (S.stage !== report._st) { report._st = S.stage; report._t0 = S.turn; }
    if (S.turn - report._t0 > 4000) { report.notes.push(`no progress at stage ${S.stage}: at (${g.p.x},${g.p.y}) ${S.lv}, going to ${why} ${goal}, sees ${g.seenFoes().map((a) => a.kind + '@' + a.x + ',' + a.y).join(' ')}, last ${JSON.stringify(a)}`); break; }
    lastKey = key;
    if (stuck > 60) { report.notes.push(`stuck at stage ${S.stage} (${g.p.x},${g.p.y}) on ${S.lv} going to ${why} ${goal}`); break; }
    if (!took && !g.dialog) g.act({ t: 'wait' });
  }
  report.turns = g.S.turn;
  report.stage = g.S.stage;
  report.stats = g.S.stats;
  report.perks = Object.keys(g.p.perks);
  return report;
}

function shopList(g) {
  const p = g.p, out = [];
  let m = p.money;
  const buy = (k, price) => { if (m >= price) { out.push(k); m -= price; return true; } return false; };
  if (!p.guns.includes('colt')) buy('PEACEMAKER', 30);
  if (p.items.bandage < 2) buy('bandage', 4);
  if (p.ammo.b < 18) buy('.45', 3);
  if (!p.armor && m >= 40) buy('long duster', 28);
  if (g.S.stage >= 13) {
    if (!p.guns.includes('shotgun')) buy('COACH', 38);
    if (p.items.bandage < 4) buy('bandage', 4);
    if (p.ammo.b < 36) buy('.45', 3);
  }
  return out;
}
function answer(g) {
  const d = g.dialog;
  if (d.page < d.pages.length - 1 || !d.options) return g.advance();
  const list = d.who.startsWith('HOLLIS') ? shopList(g) : null;
  let i = -1;
  if (list) i = d.options.findIndex((o) => !o.off && list.some((k) => o.label.startsWith(k)));
  else if (d.who === 'DOC AVERY') i = d.options.findIndex((o) => !o.off && o.label.startsWith('Patch'));
  else if (d.who === 'MARISOL' || d.who === 'HOTEL') i = -1;
  else i = d.options.findIndex((o) => !o.off && !/^(Leave|Not|Move on)/.test(o.label));
  if (i < 0) i = d.options.findIndex((o) => /^(Leave|Not|Move on)/.test(o.label));
  if (i < 0) i = 0;
  g.choose(i);
}
