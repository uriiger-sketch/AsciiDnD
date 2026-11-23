// How everything that is not you decides what to do. One call = one action.
// Dangerous attacks are announced a turn ahead (a line, a square, a path) so they can be read.

import { KIND, T } from './data.js';
import { ray, line, cheb, dist, DIRS } from './util.js';

const WARN = 0xff5a4a;

function sees(g, a, o) {
  const k = KIND[a.kind], L = g.L;
  let s = k.sight;
  const lit = L.lit[o.y * L.w + o.x];
  if (L.dark && !lit) s = Math.min(s, 5);
  else if (g.night() && !lit) s = Math.min(s, 7);
  if (o.alert !== undefined && g.hidden(o) && a.team === 0) return false;
  return dist(a.x, a.y, o.x, o.y) <= s && L.los(a.x, a.y, o.x, o.y);
}
function pickTarget(g, a) {
  const pool = a.team === 1 ? [g.p, ...g.L.actors.filter((o) => o.team === 0)] : g.L.actors.filter((o) => o.team === 1);
  let best = null, bd = 1e9;
  for (const o of pool) {
    if (o.hp <= 0) continue;
    const d = dist(a.x, a.y, o.x, o.y);
    if (d < bd && sees(g, a, o)) { best = o; bd = d; }
  }
  return best;
}
function stepToward(g, a, x, y) {
  const f = g.flowTo(x, y), L = g.L;
  let best = null, bd = f[a.y * L.w + a.x];
  for (const [dx, dy] of DIRS) {
    const X = a.x + dx, Y = a.y + dy;
    if (!L.inb(X, Y) || !L.canStep(a.x, a.y, dx, dy) || L.occ[Y * L.w + X]) continue;
    const d = f[Y * L.w + X];
    if (d < bd) { bd = d; best = [X, Y]; }
  }
  if (best) g.put(a, best[0], best[1]);
  return !!best;
}
function stepAway(g, a, x, y) {
  const L = g.L;
  let best = null, bd = dist(a.x, a.y, x, y);
  for (const [dx, dy] of DIRS) {
    const X = a.x + dx, Y = a.y + dy;
    if (!L.inb(X, Y) || !L.canStep(a.x, a.y, dx, dy) || L.occ[Y * L.w + X]) continue;
    const d = dist(X, Y, x, y) + (L.los(X, Y, x, y) ? 0 : 0.7);
    if (d > bd) { bd = d; best = [X, Y]; }
  }
  if (best) g.put(a, best[0], best[1]);
  return !!best;
}
function wander(g, a) {
  if (!g.chance(0.25)) return;
  const [dx, dy] = DIRS[g.ri(0, 7)];
  if (g.L.canStep(a.x, a.y, dx, dy) && !g.at(a.x + dx, a.y + dy) && (!a.home || cheb(a.x + dx, a.y + dy, a.home[0], a.home[1]) <= 4)) g.put(a, a.x + dx, a.y + dy);
}
function strike(g, a, t) {
  const k = KIND[a.kind];
  g.sound('swish');
  if (!g.chance(k.macc || 0.7)) { g.float(t.x, t.y, 'miss', 0x8ac6ff); return; }
  let dmg = g.ri(k.melee[0], k.melee[1]);
  if (a.backstab) { dmg += 2; a.backstab = 0; }
  g.hurt(t, dmg, a, { how: 'melee' });
  if (a.kind === 'snake' && t === g.p && g.p.hp > 0) { g.p.poison = 4; g.msg('Snakebite. The venom is in you. A bandage draws it.', WARN); }
}
// Is `a` standing behind something, as seen from (x, y)?
function covered(g, a, x, y) { return g.shotInfo(x, y, a.x, a.y).cover === 2; }
function seekCover(g, a, t) {
  const L = g.L;
  let best = null, bd = 1e9;
  for (let j = -3; j <= 3; j++) for (let i = -4; i <= 4; i++) {
    const X = a.x + i, Y = a.y + j;
    if (!L.inb(X, Y) || !L.walk(X, Y) || L.occ[Y * L.w + X]) continue;
    const s = g.shotInfo(t.x, t.y, X, Y);
    if (s.blocked || s.cover !== 2) continue;
    const d = cheb(a.x, a.y, X, Y) + dist(X, Y, t.x, t.y) * 0.1;
    if (d < bd) { bd = d; best = [X, Y]; }
  }
  return best ? stepToward(g, a, best[0], best[1]) : false;
}
function throwStick(g, a, t) {
  g.S.fuses.push({ lv: g.L.id, x: t.x, y: t.y, t: 2, by: 'e', mark: t === g.p });
  g.tracer(line(a.x, a.y, t.x, t.y), 0xff8040, "'");
  g.sound('fuse');
  if (t === g.p) g.msg('DYNAMITE at your feet. Two.', WARN);
}
// flee a lit fuse if you have the wits
function mindFuse(g, a) {
  for (const f of g.S.fuses) {
    if (f.lv === g.L.id && cheb(f.x, f.y, a.x, a.y) <= 1 && g.chance(KIND[a.kind].boss ? 0.95 : KIND[a.kind].beast ? 0.2 : 0.55)) return stepAway(g, a, f.x, f.y);
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
export function aiStep(g, a) {
  const k = KIND[a.kind];
  if (k.ai === 'npc') return;
  if (a.cd > 0) a.cd--;
  if (k.ai === 'snake') return snake(g, a);
  let t = pickTarget(g, a);
  if (a.team === 1) {
    if (t) {
      a.seenAt = [t.x, t.y];
      a.lost = 0;
      if (a.alert < 2) {
        const first = !g.L.actors.some((o) => o.team === 1 && o.alert === 2);
        a.alert = 2;
        g.pop(a.x, a.y, '!', WARN, 380);
        if (first && g.L.vis[a.y * g.L.w + a.x]) { g.msg(`${k.name[0].toUpperCase() + k.name.slice(1)} has seen you!`, WARN); g.sound('alert'); }
        for (const o of g.L.actors) if (o.team === 1 && o.alert < 2 && KIND[o.kind].ai !== 'snake' && dist(o.x, o.y, a.x, a.y) <= 9) { o.alert = Math.max(o.alert, 1); o.seenAt = [t.x, t.y]; }
        if (!a.hunt) return; // the moment it takes to shout and draw
      }
    } else if (a.alert === 2 && ++a.lost > 8 && !a.hunt) a.alert = 1;
    if (a.hunt && !t) a.seenAt = [g.p.x, g.p.y];
  }
  if (mindFuse(g, a)) return;
  switch (k.ai) {
    case 'melee': return melee(g, a, t, k);
    case 'gun': return gun(g, a, t, k);
    case 'rifle': return rifle(g, a, t, k);
    case 'dyn': return dyn(g, a, t, k);
    case 'rider': return rider(g, a, t, k);
    case 'assassin': return assassin(g, a, t, k);
    case 'crowe': return crowe(g, a, t, k);
  }
}

function search(g, a) {
  if (a.team === 0) { if (a.home && cheb(a.x, a.y, a.home[0], a.home[1]) > 1) stepToward(g, a, a.home[0], a.home[1]); return; }
  if (a.alert >= 1 && a.seenAt) {
    if (cheb(a.x, a.y, a.seenAt[0], a.seenAt[1]) <= 1 || !stepToward(g, a, a.seenAt[0], a.seenAt[1])) { if (!a.hunt) { a.alert = 0; a.seenAt = null; } }
  } else if (KIND[a.kind].beast) wander(g, a);
}

function snake(g, a) {
  const p = g.p, d = cheb(a.x, a.y, p.x, p.y);
  if (d <= 1) { a.alert = 2; strike(g, a, p); return; }
  if (d <= 2 && !a.warned) { a.warned = 1; g.pop(a.x, a.y, '!', 0xd0e060, 400); g.msg('A dry rattle. Rattlesnake. Go round it.', 0xd0e060); g.sound('rattle'); }
  if (d > 3) a.warned = 0;
}

function melee(g, a, t, k) {
  if (!t) return search(g, a);
  if (k.flee && !a.fled && a.hp <= k.hp * k.flee) { a.fled = 1; a.fleeing = 7; }
  if (a.fleeing > 0) { a.fleeing--; stepAway(g, a, t.x, t.y); return; }
  if (cheb(a.x, a.y, t.x, t.y) <= 1) {
    if (a.backoff) { a.backoff = 0; stepAway(g, a, t.x, t.y); return; }
    strike(g, a, t);
    if (k.hitrun && g.chance(0.5)) a.backoff = 1;
    a.held = 1; // one bite a turn, however fast
    return;
  }
  stepToward(g, a, t.x, t.y);
}

function gun(g, a, t, k) {
  if (!t) { if (a.loaded < k.gun.mag && g.chance(0.5)) a.loaded = k.gun.mag; return search(g, a); }
  const d = dist(a.x, a.y, t.x, t.y);
  if (a.loaded <= 0) {
    if (!covered(g, a, t.x, t.y) && g.chance(0.5) && seekCover(g, a, t)) return;
    a.loaded = k.gun.mag;
    g.float(a.x, a.y, 'reload', 0xb0a090);
    return;
  }
  if (d > k.gun.range) { stepToward(g, a, t.x, t.y); return; }
  if (d < 1.6 && a.team === 1 && g.chance(0.5) && stepAway(g, a, t.x, t.y)) return;
  if (a.team === 1 && !covered(g, a, t.x, t.y) && g.chance(0.3) && seekCover(g, a, t)) return;
  g.npcFire(a, t);
}

function rifle(g, a, t, k) {
  if (a.aim) {
    const cells = a.aim.cells, mark = a.aim.mark;
    a.aim = null;
    a.cd = 1;
    g.fireLine(a, cells, k.rifle.dmg, 0.9, mark);
    return;
  }
  if (!t) return a.post ? undefined : search(g, a);
  const d = cheb(a.x, a.y, t.x, t.y);
  if (d <= 1) { if (g.chance(0.5) && stepAway(g, a, t.x, t.y)) return; strike(g, a, t); return; }
  if (a.cd > 0) return;
  const cells = [];
  for (const [x, y] of ray(a.x, a.y, t.x, t.y, k.rifle.range)) { if (!g.L.tile(x, y).clear) break; cells.push([x, y]); }
  a.aim = { cells, mark: t === g.p };
  g.pop(a.x, a.y, '!', WARN, 300);
  g.sound('cock');
}

function dyn(g, a, t, k) {
  if (!t) return search(g, a);
  const d = dist(a.x, a.y, t.x, t.y);
  if (d < 2.5) { if (!stepAway(g, a, t.x, t.y)) strike(g, a, t); return; }
  if (a.cd <= 0 && d <= 7.5) { throwStick(g, a, t); a.cd = 4; return; }
  if (d > 6) stepToward(g, a, t.x, t.y);
  else if (g.chance(0.3)) wander(g, a);
}

function rider(g, a, t, k) {
  if (a.charge) {
    const cells = a.charge.cells, mark = a.charge.mark;
    a.charge = null;
    a.cd = 1;
    a.held = 1;
    let hit = false;
    const trail = [];
    g.sound('hooves');
    for (const [x, y] of cells) {
      if (!g.L.walk(x, y)) break;
      const o = g.at(x, y);
      if (o) {
        if (o.team !== a.team) { g.hurt(o, g.ri(4, 5), a, { how: 'trample' }); if (o === g.p) hit = true; }
        break;
      }
      trail.push([a.x, a.y]);
      g.put(a, x, y);
    }
    g.tracer(trail, 0xc0a070, '.');
    if (mark && !hit && !cells.some(([x, y]) => x === g.p.x && y === g.p.y)) g.dodged();
    return;
  }
  if (!t) return search(g, a);
  const d = cheb(a.x, a.y, t.x, t.y);
  if (d <= 1) { strike(g, a, t); a.held = 1; return; }
  if (a.cd <= 0 && d <= 9) {
    const cells = [];
    for (const [x, y] of ray(a.x, a.y, t.x, t.y, d + 3)) { if (!g.L.walk(x, y)) break; cells.push([x, y]); }
    if (cells.length >= d) {
      a.charge = { cells, mark: t === g.p };
      a.held = 1;
      g.pop(a.x, a.y, '!', WARN, 300);
      g.sound('neigh');
      return;
    }
  }
  stepToward(g, a, t.x, t.y);
}

function assassin(g, a, t, k) {
  const p = g.p;
  if (a.alert < 1 && !t) return;
  if (!t) t = a.alert >= 1 ? p : null;
  if (!t) return;
  const d = cheb(a.x, a.y, t.x, t.y), wasHidden = g.hidden(a);
  if (a.withdraw > 0) { a.withdraw--; stepAway(g, a, t.x, t.y); return; }
  if (d <= 1) {
    if (wasHidden || !(a.reveal > 0)) a.backstab = 1;
    a.reveal = 4;
    strike(g, a, t);
    a.withdraw = k.boss ? 1 : 2;
    return;
  }
  if (d <= 5 && a.cd <= 0 && g.L.los(a.x, a.y, t.x, t.y) && g.chance(k.boss ? 0.55 : 0.45)) {
    a.reveal = 4;
    a.cd = 2;
    g.tracer(line(a.x, a.y, t.x, t.y), 0xd0b0ff, "'");
    g.sound('swish');
    if (g.chance(0.62 - (g.shotInfo(a.x, a.y, t.x, t.y).cover === 2 ? 0.3 : 0))) g.hurt(t, g.ri(2, 3), a, { how: 'knife' });
    else g.float(t.x, t.y, 'miss', 0x8ac6ff);
    return;
  }
  stepToward(g, a, t.x, t.y);
}

function crowe(g, a, t, k) {
  if (a.fan) {
    const lines = a.fan.lines, mark = a.fan.mark;
    a.fan = null;
    a.cd = 5;
    let any = false;
    for (const cells of lines) { const hp = g.p.hp; g.fireLine(a, cells, [3, 3], 0.85, false); if (g.p.hp < hp) any = true; }
    if (mark && !any && !lines.some((c) => c.some(([x, y]) => x === g.p.x && y === g.p.y))) g.dodged();
    return;
  }
  if (!a.p2 && a.hp <= k.hp / 2) {
    a.p2 = 1;
    g.msg('Crowe spits blood and whistles. More of them!', WARN);
    g.story.reinforce();
  }
  if (!t) return search(g, a);
  const d = dist(a.x, a.y, t.x, t.y);
  if (a.p2 && (a.dcd = (a.dcd || 0) - 1) <= 0 && d > 2.5 && d <= 8) { throwStick(g, a, t); a.dcd = 5; return; }
  if (a.cd <= 0 && d <= 10 && d > 1.5) {
    const dx = t.x - a.x, dy = t.y - a.y, px = Math.abs(dx) > Math.abs(dy) ? 0 : 1, py = px ? 0 : 1;
    const lines = [];
    for (const s of [0, 1, -1]) {
      const cells = [];
      for (const [x, y] of ray(a.x, a.y, t.x + px * s * 2, t.y + py * s * 2, 12)) { if (!g.L.tile(x, y).clear) break; cells.push([x, y]); }
      lines.push(cells);
    }
    a.fan = { lines, mark: t === g.p };
    g.pop(a.x, a.y, '!', WARN, 300);
    g.sound('cock');
    g.msg('Crowe thumbs both hammers back.', WARN);
    return;
  }
  gun(g, a, t, k);
  if (a.loaded > 0 && a.hp > 0 && g.L.los(a.x, a.y, t.x, t.y) && t.hp > 0 && dist(a.x, a.y, t.x, t.y) <= k.gun.range) g.npcFire(a, t);
}
