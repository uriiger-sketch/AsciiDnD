// Chapter one: LEFT FOR DEAD. Stages, people, fights and the words that join them.

import { KIND, WEAPON, SHOP, T } from './data.js';
import { dist, cheb } from './util.js';

const GOLD = 0xffd060, RED = 0xff5a4a, GREEN = 0x8fd98f, DIM = 0x9a917c;

const PEOPLE = {
  odalys: { name: 'Odalys Vane', fg: 0x8fd98f, at: 'odalys' },
  pike: { name: 'Sheriff Pike', fg: 0x7fd0ff, at: 'sheriff' },
  marisol: { name: 'Marisol', fg: 0xff8fb0, at: 'marisol' },
  hollis: { name: 'Hollis Reed', fg: 0xe0c070, at: 'hollis' },
  doc: { name: 'Doc Avery', fg: 0xd8d8d8, at: 'doc' },
  clerk: { name: 'the hotel clerk', fg: 0xc0b090, at: 'clerk' },
  heron: { name: 'Grey Heron', fg: 0xd8b070, at: [133, 21] },
  runner: { name: 'Dawn Runner', fg: 0xb8d8a0, at: [136, 19] },
};
const TIPS = [
  'A rifleman shows you his line before he fires down it. Step off the line.',
  'Stand so a barrel or a trough is between you and them. They miss a lot more.',
  'Wait a turn before you shoot and the shot is better. Hit a man who has not seen you and it is better still.',
  'A gunman has six. Count them. Then walk up while he fumbles.',
  'Powder kegs. Red zeros. Shoot one when they stand close to it.',
  'DASH carries you three steps at once. Save it for the dynamite.',
  'The ledger in your MENU counts what you do, and what you do is what you become.',
];

export class Story {
  constructor(g) { this.g = g; }
  get S() { return this.g.S; }
  get W() { return this.g.levels.world; }

  begin() {
    const g = this.g, W = this.W, [sx, sy] = W.poi.start;
    g.put(g.p, sx, sy);
    const hold = g.L;
    for (const role in PEOPLE) {
      const P = PEOPLE[role], [x, y] = Array.isArray(P.at) ? P.at : W.poi[P.at];
      g.spawn('npc', x, y, { team: 2, role, name: P.name, fg: P.fg });
    }
    g.L = hold;
    g.drop(W.poi.knife[0], W.poi.knife[1], 'knife');
    W.set(25, 82, T.BONES);
    g.drop(25, 82, 'bandage'); g.drop(25, 82, 'money', 2);
    g.spawn('snake', 38, 70, {});
    g.spawn('snake', 47, 60, {});
    for (const [x, y] of [[88, 40], [112, 62], [58, 74], [100, 34], [40, 56], [128, 44], [20, 62]]) g.spawn('snake', x, y, {});
    g.say('', [
      "Silas Crowe's men took your horse, your gun and your name,\nand left you out here for the buzzards.",
      'They forgot your boots.\n\nSomething glints in the sand, a little way east.',
    ]);
  }

  // where to go, in one line
  objective() {
    const S = this.S, P = this.W.poi, st = S.stage, inMine = S.lv === 'mine';
    const at = (c, text) => ({ text, at: c, lv: 'world' });
    // a hunt: once the shooting has started, say how many are left; point at the last two
    const hunt = (tag, c, text, flag = true) => {
      const left = this.W.actors.filter((a) => a.group === tag && a.hp > 0);
      if (!flag || !left.length || !left.some((a) => a.alert) && left.length > 2) return at(c, text);
      const p = this.g.p, n = left.sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
      return { text: `${left.length} left. ${left.length <= 2 ? 'Hunt them down.' : 'Finish it.'}`, at: left.length <= 2 ? [n.x, n.y] : c, lv: 'world' };
    };
    switch (st) {
      case 0: return at(P.knife, 'Take what glints in the sand.');
      case 1: return { text: 'Coyotes. Kill them or be eaten.' };
      case 2: return at(P.townW, 'Follow the trail east to SUNDOWN.');
      case 3: return at(P.odalys, 'Find work. Ask at the LIVERY.');
      case 4: return hunt('q1', P.yard, 'Kill the coyote pack at the stockyard, west of town.', S.flags.yard);
      case 5: return at(P.odalys, 'Tell Odalys the pack is dead.');
      case 6: return at(P.sheriff, 'The sheriff wants a word.');
      case 7: return hunt('q2', P.camp, 'Rustlers, camped east across the creek. Five men.');
      case 8: return at(P.sheriff, 'Tell the sheriff the rustlers are finished.');
      case 9: return hunt('q3', P.wreck, 'Find the overdue stage in RED CANYON, north.');
      case 10: return at(P.fenn, 'Someone is alive in the wreck.');
      case 11: return at(P.sheriff, 'Tell the sheriff what Fenn said.');
      case 12: return S.flags.box ? at(P.sheriff, 'Carry the strongbox back to the sheriff.')
        : inMine ? { text: 'Find the payroll strongbox. Deep in, past the cavern.', at: this.g.levels.mine.poi.box, lv: 'mine' } : at(P.mineDoor, 'The CINDER MINE, north-west. Bring back the payroll.');
      case 13: return at(P.sheriff, 'Carry the strongbox back to the sheriff.');
      case 14: return at(P.sheriff, 'Buy what you need. Then tell the sheriff you are ready.');
      case 15: return { text: S.flags.wave === 3 ? 'SILAS CROWE.' : 'Hold the street. Wave ' + (S.flags.wave || 1) + ' of 3.' };
      default: return { text: 'Sundown is quiet.' };
    }
  }
  stage(n, note) {
    this.S.stage = n;
    if (note) this.g.msg(note, GOLD);
    this.g.sound('quest');
    this.g.checkpoint();
  }
  group(tag) { return this.g.L.actors.filter((a) => a.group === tag && a.hp > 0).length; }
  party(tag, list, o = {}) { for (const [kind, x, y, extra] of list) this.g.spawn(kind, x, y, Object.assign({ group: tag }, o, extra || {})); }
  nearP(c, r) { return this.S.lv === 'world' && dist(this.g.p.x, this.g.p.y, c[0], c[1]) <= r; }
  once(flag) { if (this.S.flags[flag]) return false; this.S.flags[flag] = 1; return true; }

  // called at the end of every turn
  tick() {
    const g = this.g, S = this.S, p = g.p, P = this.W.poi, F = S.flags;
    switch (S.stage) {
      case 0:
        if (p.knife) {
          this.party('q0', [['coyote', p.x + 9, p.y - 3], ['coyote', p.x + 10, p.y + 2]], { alert: 1, seenAt: [p.x, p.y], hunt: 1 });
          this.stage(1, 'A knife. And, from the scrub, yipping. They have smelled you.');
        }
        break;
      case 1: if (!this.group('q0')) this.stage(2, 'Quiet. There is a trail east, and old bones on it with a saddlebag.'); break;
      case 2: if (S.lv === 'world' && p.x >= 50 && p.x <= 106 && p.y >= 44 && p.y <= 62) this.stage(3, 'SUNDOWN. Eight buildings and a church.'); break;
      case 4:
        if (this.nearP(P.yard, 13) && this.once('yard')) {
          this.party('q1', [['coyote', 39, 45], ['coyote', 43, 47], ['coyote', 45, 45], ['alpha', 42, 46]], { home: P.yard });
          g.msg('Shapes among the hay. A pack, and a big one leading it.', RED);
          g.checkpoint();
        }
        if (F.yard && !this.group('q1')) this.stage(5, 'The pack is dead.');
        break;
      case 7:
        if (this.nearP(P.campEdge, 5) && this.once('campCp')) { g.checkpoint(); g.msg('Smoke ahead. Their camp. They have not seen you yet.', GOLD); }
        if (!this.group('q2')) this.stage(8, 'The camp is silent.');
        break;
      case 9:
        if (this.nearP(P.canyonMouth, 4) && this.once('canyonCp')) { g.checkpoint(); g.msg('Red Canyon. Too quiet. Watch the high pockets.', GOLD); }
        if (!this.group('q3')) {
          g.spawn('npc', P.fenn[0], P.fenn[1], { team: 2, role: 'fenn', name: 'Tobias Fenn', fg: 0xe0d0a0 });
          this.stage(10, 'A voice from under the wagon: "Is it over?"');
        }
        break;
      case 12:
        if (this.nearP(P.mineEdge, 4) && this.once('mineCp')) { g.checkpoint(); g.msg('The mine mouth. Guards.', GOLD); }
        if (S.lv === 'mine' && this.once('mineIn')) g.checkpoint();
        if (S.lv === 'mine' && cheb(p.x, p.y, 35, 19) <= 2 && this.once('ashCp')) { g.checkpoint(); g.msg('The shaft opens on a cavern. Something moves that you cannot quite see.', 0xd890ff); }
        if (F.box && this.once('boxNote')) {
          g.say('', ['The payroll. And under the lid, a note in a neat hand:', '"S.C.  We burn it tonight.\nSUNDOWN, AT SUNDOWN."']);
          this.stage(13);
        }
        break;
      case 15: this.finale(); break;
    }
    // the trial at the standing stones
    if (F.trial === 1 && S.lv === 'world' && cheb(p.x, p.y, P.stones[0], P.stones[1]) <= 2) this.trialStart();
    if (F.trial >= 2 && F.trial <= 4 && !this.group('trial')) {
      if (F.trial === 4) {
        F.trial = 5; S.frozen = 0; S.hour = F.trialHour;
        p.perks.wind = 1; p.hp = p.max;
        g.msg('The stones go quiet. You are given SECOND WIND: at 3 health, once a fight, +4.', GOLD);
        g.checkpoint();
      } else { F.trial++; this.wolves(F.trial === 3 ? 4 : 4); }
    }
  }
  onKill(a) {
    const g = this.g;
    if (a.kind === 'crowe') {
      for (const o of [...g.L.actors]) if (o.team === 1 && o.hp > 0) { o.fled = 0; o.hp = 0; g.L.occ[o.y * g.L.w + o.x] = null; g.L.actors.splice(g.L.actors.indexOf(o), 1); }
      g.msg('The rest of them see him fall, and run.', GOLD);
      this.S.stage = 16;
      g.over = 'won';
    }
  }

  // ---------------------------------------------------------------- fights
  campFight() {
    this.party('q2', [['thug', 131, 60], ['thug', 135, 62], ['thug', 130, 63], ['gunman', 134, 60], ['gunman', 138, 62]], { home: this.W.poi.camp });
  }
  canyonFight() {
    this.party('q3', [['rifle', 65, 21, { post: 1 }], ['rifle', 83, 14, { post: 1 }], ['gunman', 71, 11], ['gunman', 76, 9], ['gunman', 74, 13], ['gunman', 78, 23], ['dyn', 68, 12], ['thug', 73, 15], ['thug', 76, 27]]);
  }
  mineFight() {
    const g = this.g, hold = g.L;
    this.party('q5', [['gunman', 23, 29], ['gunman', 26, 30], ['rifle', 24, 28, { post: 1 }]]);
    g.L = g.levels.mine;
    this.party('q5', [['thug', 30, 32], ['thug', 40, 30], ['gunman', 37, 33], ['dyn', 8, 30], ['dyn', 11, 33], ['thug', 7, 32],
      ['gunman', 57, 30], ['gunman', 62, 32], ['gunman', 60, 28], ['thug', 55, 34], ['assassin', 35, 24], ['ash', 35, 9], ['assassin', 28, 12], ['assassin', 43, 10], ['dyn', 42, 14], ['gunman', 59, 10], ['gunman', 61, 8]]);
    g.drop(g.L.poi.box[0], g.L.poi.box[1], 'box');
    g.drop(9, 28, 'dynamite', 2); g.drop(63, 34, 'b', 8); g.drop(61, 13, 'money', 20); g.drop(60, 12, 'bandage', 1);
    g.L = hold;
  }
  wolves(n) {
    const g = this.g, [cx, cy] = this.W.poi.stones;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + this.S.turn;
      g.spawn('wolf', Math.round(cx + Math.cos(a) * 9), Math.round(cy + Math.sin(a) * 5), { group: 'trial', alert: 1, hunt: 1, seenAt: [cx, cy] });
    }
    g.msg(n === 3 ? 'The stones hum. Blue shapes come out of the dark.' : 'More of them.', 0x9ad6ff);
  }
  trialStart() {
    const S = this.S;
    this.g.checkpoint();
    S.flags.trial = 2; S.flags.trialHour = S.hour;
    S.hour = 23.5; S.frozen = 1;
    this.wolves(3);
  }
  finaleStart() {
    const g = this.g, S = this.S, P = this.W.poi;
    S.hour = 18.9; S.frozen = 1;
    S.flags.wave = 0;
    for (const a of g.L.actors) {
      if (a.role === 'pike') Object.assign(a, { kind: 'deputy', team: 0, hp: 14, loaded: 6, alert: 0, home: [86, 52] });
      if (a.role === 'odalys') Object.assign(a, { kind: 'deputy', team: 0, hp: 11, loaded: 6, alert: 0, home: [69, 54] });
    }
    this.stage(15, 'The street empties. The light goes the colour of rust. Hoofbeats, west.');
  }
  finale() {
    const g = this.g, F = this.S.flags, hunt = { alert: 1, hunt: 1, seenAt: [g.p.x, g.p.y] };
    if (F.wave === 0) { F.wave = 1; this.party('fin', [['thug', 50, 52], ['thug', 50, 54], ['thug', 51, 53], ['thug', 52, 53], ['gunman', 49, 52], ['gunman', 49, 54], ['gunman', 48, 53]], hunt); }
    else if (!this.group('fin')) {
      if (F.wave < 3) g.checkpoint(); // a death now restarts at the next wave, not the first
      if (F.wave === 1) {
        F.wave = 2;
        this.party('fin', [['rider', 107, 52], ['rider', 107, 54], ['rifle', 106, 53], ['gunman', 105, 52], ['dyn', 76, 43], ['dyn', 78, 43], ['gunman', 77, 42], ['gunman', 75, 42]], hunt);
        g.msg('Riders from the east! And more coming down the canyon road.', RED);
      } else if (F.wave === 2) {
        F.wave = 3;
        this.party('fin', [['crowe', 51, 53], ['gunman', 50, 52], ['gunman', 50, 54], ['assassin', 52, 55]], hunt);
        g.msg('A tall man walks his horse in from the west and gets down. SILAS CROWE.', RED);
      }
      g.sound('quest');
    }
  }
  reinforce() {
    this.party('fin', [['gunman', 106, 52], ['gunman', 106, 54]], { alert: 1, hunt: 1, seenAt: [this.g.p.x, this.g.p.y] });
  }

  // ---------------------------------------------------------------- people
  restAt(where) {
    const g = this.g, p = g.p;
    if (g.foes().some((a) => a.alert === 2 || (dist(a.x, a.y, p.x, p.y) < 10 && KIND[a.kind].ai !== 'snake'))) { g.msg('Not with them about.', DIM); return; }
    if (where === 'fire') {
      g.say('', 'A fire. You could sit a while.', [
        { label: 'Rest (heal to two thirds, time passes)', run: () => { p.hp = Math.max(p.hp, Math.ceil(p.max * 0.67)); p.poison = 0; this.S.hour = (this.S.hour + 2) % 24; g.msg('You sit until your hands stop shaking.', GREEN); g.checkpoint(); } },
        { label: 'Move on' },
      ]);
    }
  }
  talk(a) {
    const fn = this['talk_' + a.role];
    if (fn) fn.call(this, a);
  }
  talk_odalys() {
    const g = this.g, S = this.S, p = g.p, who = 'ODALYS VANE';
    if (S.stage < 3) return g.say(who, 'Mind the horses.');
    if (S.stage === 3) {
      return g.say(who, ['You look like something the buzzards sent back.', 'Crowe did that? Then you and I want the same man dead.',
        'Coyotes are in my stockyard, west end. A whole pack. Clear them and there is money in it.', 'Take this. It is old and it sticks, but it shoots. Five in it and six more.'], [
        { label: 'Take the revolver', run: () => { g.giveGun('rusty'); p.ammo.b += 6; g.msg('RUSTY .45. Tap an enemy to shoot. LOAD to reload.', GOLD); this.stage(4); } }]);
    }
    if (S.stage === 4) return g.say(who, 'West end. Use the fence. They can only come at you through the gate.');
    if (S.stage === 5) {
      return g.say(who, ['All of them? Even the big one?', 'Ten dollars, a box of rounds, and something for those bites.', 'Sheriff Pike was asking who the stranger is. Go and tell him.'], [
        { label: 'Take it', run: () => { p.money += 10; p.ammo.b += 12; p.items.bandage++; this.stage(6); } }]);
    }
    if (p.ammo.b + (p.loaded.rusty || 0) + (p.loaded.colt || 0) < 4 && p.money < 3 && p.guns.length) {
      return g.say(who, 'Out of rounds and out of money. Here. Six. Do not make a habit of it.', [{ label: 'Take them', run: () => { p.ammo.b += 6; } }]);
    }
    g.say(who, S.stage >= 14 ? 'I can shoot. I will be in the street when they come.' : 'Still breathing. Good.');
  }
  talk_pike() {
    const g = this.g, S = this.S, p = g.p, who = 'SHERIFF PIKE';
    const pay = (n) => { p.money += n; g.msg('$' + n + '.', GOLD); };
    switch (S.stage) {
      case 6: return g.say(who, ['So you are the one Crowe left in the flats.', 'I have one deputy and he is my left hand. I could use a right.',
        'Rustlers. Crowe\'s. Camped east across the creek, five of them, two with guns.', 'Do not walk in the front. Come at them from the trees, and shoot the kegs if they have any.'], [
        { label: 'I will do it', run: () => { this.campFight(); this.stage(7); } }]);
      case 7: return g.say(who, 'East, over the bridge. Five men.');
      case 8: return g.say(who, ['Five. Alone.', 'Twenty five dollars. Hollis at the STORE sells better iron than that relic.',
        'One thing more. The stage is a day late. It comes down RED CANYON, north of town.', 'If it is Crowe, there will be rifles up in the rock. A rifle shows you where it will shoot. Do not be there.'], [
        { label: 'I will find it', run: () => { pay(25); this.canyonFight(); this.stage(9); } }]);
      case 9: case 10: return g.say(who, 'North road. Red Canyon.');
      case 11: return g.say(who, ['The Cinder Mine. Of course. It has one door.', 'Forty dollars for the stage. Now the hard one.',
        'Go into that mine and bring back the payroll. There is a man in there called Ash. You will not see him until he is on you. Stay by the lanterns: he cannot hide in the light.', 'The mesa people north-east have no love for Crowe either. Go as a guest and they may help.'], [
        { label: 'I will go', run: () => { pay(40); this.mineFight(); this.stage(12); } }]);
      case 12: return g.say(who, S.flags.box ? 'You have it?' : 'North-west. The mine. Bring dynamite.');
      case 13: return g.say(who, ['The payroll. All of it.', '"Sundown, at sundown." Tonight, then.', 'Eighty dollars. Spend every cent of it at the store. Then come and tell me you are ready.'], [
        { label: 'Take the money', run: () => { pay(80); this.stage(14); } }]);
      case 14: return g.say(who, 'They will come in three bunches, I think. Riders, then the man himself. Are you ready?', [
        { label: 'READY. Let them come.', run: () => this.finaleStart() },
        { label: 'Not yet' }]);
      default: return g.say(who, S.stage < 6 ? 'Keep your hands where I can see them, stranger.' : 'Keep shooting.');
    }
  }
  talk_fenn() {
    const g = this.g;
    if (this.S.stage !== 10) return g.say('TOBIAS FENN', 'I will walk back. Slowly. Go.');
    g.say('TOBIAS FENN', ['Tobias Fenn. Telegraph. I was riding with the payroll.', "Crowe's Sundowners. They took the strongbox to the CINDER MINE.",
      'I heard them. The town would not pay him, so he means to burn it.', 'Tell Pike. And take this, it is all they left me.'], [
      { label: 'Take it', run: () => { g.p.money += 6; g.p.items.bandage++; this.stage(11); } }]);
  }
  talk_marisol() {
    const g = this.g, p = g.p, S = this.S;
    S.flags.tip = ((S.flags.tip || 0) + 1) % TIPS.length;
    g.say('MARISOL', TIPS[S.flags.tip], [
      { label: 'Whiskey  $2', off: p.money < 2, run: () => { p.money -= 2; p.items.whiskey++; g.msg('A bottle of whiskey.', GOLD); } },
      { label: 'Leave' }]);
  }
  talk_doc() {
    const g = this.g, p = g.p;
    g.say('DOC AVERY', p.hp < p.max || p.poison ? 'Sit down before you fall down.' : 'Nothing wrong with you that I can charge for.', [
      { label: 'Patch me up  $4', off: p.money < 4 || (p.hp >= p.max && !p.poison), run: () => { p.money -= 4; p.hp = p.max; p.poison = 0; g.msg('Stitched, splinted and scolded. Full health.', GREEN); g.checkpoint(); } },
      { label: 'Bandage  $4', off: p.money < 4, run: () => { p.money -= 4; p.items.bandage++; } },
      { label: 'Leave' }]);
  }
  talk_clerk() {
    const g = this.g, p = g.p;
    g.say('HOTEL', 'A bed is three dollars. Clean sheets are extra and we have none.', [
      { label: 'Sleep till morning  $3', off: p.money < 3, run: () => { p.money -= 3; p.hp = p.max; p.poison = 0; if (!this.S.frozen) this.S.hour = 7; g.msg('You sleep like the dead, and get up anyway. Full health.', GREEN); g.checkpoint(); } },
      { label: 'Leave' }]);
  }
  talk_hollis() { this.shop(); }
  shop() {
    const g = this.g, p = g.p;
    const opts = SHOP.filter((it) => !(it.gun && p.guns.includes(it.k)) && !(it.armor && p.armor) && !(it.k === 'rusty')).map((it) => ({
      label: it.label.padEnd(24) + ('$' + it.price).padStart(4), off: p.money < it.price,
      run: () => {
        p.money -= it.price;
        if (it.gun) { g.giveGun(it.k); if (it.k === 'shotgun') p.ammo.s += 4; }
        else if (it.armor) p.armor = 1;
        else if (it.k === 'b' || it.k === 's') p.ammo[it.k] += it.n;
        else p.items[it.k] = (p.items[it.k] || 0) + it.n;
        g.msg('Bought: ' + it.label + '.', GOLD);
        g.sound('pick');
        this.shop();
      },
    }));
    opts.push({ label: 'Leave' });
    g.say('HOLLIS REED  -  you have $' + p.money, 'Cash on the counter.', opts);
  }
  talk_heron() {
    const g = this.g, S = this.S, F = S.flags;
    const who = 'GREY HERON';
    if (F.trial === 5) return g.say(who, 'You stood. The stones remember it. Go and finish Crowe.');
    if (F.trial >= 1) return g.say(who, 'The stones are east of the fire. Stand among them.');
    if (S.stage < 6) return g.say(who, 'You are a long way from your own fire. Rest at ours, then go.');
    g.say(who, ["Crowe's men fouled our spring and took nine horses. We know who you hunt.", 'We do not lend our strength to strangers. We lend it to people the stones have seen.',
      'Stand in the ring east of here. It will be night, and you will not be alone. Three times.', 'If you are still standing, you will not fall so easily again.'], [
      { label: 'I will stand in the stones', run: () => { F.trial = 1; g.msg('The standing stones, east of the camp.', GOLD); } },
      { label: 'Not now' }]);
  }
  talk_runner() {
    const g = this.g, p = g.p, F = this.S.flags;
    if (F.trial === 5 && !F.runner) {
      return g.say('DAWN RUNNER', 'Sit. This will sting, and then it will not.', [{ label: 'Sit', run: () => { F.runner = 1; p.hp = p.max; p.poison = 0; p.items.bandage += 2; g.msg('Full health, and two bandages for the road.', GREEN); } }]);
    }
    g.say('DAWN RUNNER', F.trial === 5 ? 'Walk well.' : 'Grey Heron decides who is a guest.');
  }
}
