// The rule book: terrain, creatures, weapons, goods and deeds.

// ---- terrain -------------------------------------------------------------------------------
// flags: w walkable, c clear (sight and shots pass), v low cover, b breakable, x explosive, l light
export const TILE = [];
export const T = {};
function tile(name, ch, fg, f, desc) {
  T[name] = TILE.length;
  TILE.push({ id: TILE.length, name, ch, fg, desc, walk: f.includes('w'), clear: f.includes('c'), cover: f.includes('v'), brk: f.includes('b'), boom: f.includes('x'), light: f.includes('l') });
}
tile('VOID', ' ', 0, '', 'nothing');
tile('SAND', ' ', 0x6f5f44, 'wc', 'sand');
tile('DUST', '.', 0x6a5b42, 'wc', 'sand');
tile('GRIT', ',', 0x62553f, 'wc', 'gravel');
tile('ROAD', '.', 0xb59c6e, 'wc', 'a trail');
tile('SCRUB', '"', 0x7d853e, 'wc', 'dry scrub');
tile('SAGE', ';', 0x6a8860, 'wc', 'sagebrush');
tile('GRASS', '"', 0x5c9846, 'wc', 'creek grass');
tile('CACTUS', 'Y', 0x58a650, 'cv', 'a saguaro (cover)');
tile('BOULDER', '%', 0x928879, 'cv', 'a boulder (cover)');
tile('MESA', '^', 0xb85a2e, '', 'red rock');
tile('MESA2', '^', 0x8c4526, '', 'red rock');
tile('TREE', 'T', 0x4f9440, '', 'a cottonwood');
tile('WATER', '~', 0x3f86c0, 'wc', 'the creek (slow going)');
tile('WALL', '#', 0x9a7a52, '', 'a wall');
tile('WINDOW', '=', 0x6fc6d8, 'cv', 'a window (cover, you can shoot through)');
tile('DOOR', '+', 0xd9a653, 'w', 'a door');
tile('DOOR_OPEN', "'", 0xd9a653, 'wc', 'an open door');
tile('FLOOR', '.', 0x5d4a34, 'wc', 'floorboards');
tile('PLANK', '_', 0x80664a, 'wc', 'boardwalk');
tile('RAIL', '=', 0x6c6a66, 'wc', 'the railroad');
tile('FENCE', '-', 0x94733f, 'cv', 'a fence (cover)');
tile('FENCEV', '|', 0x94733f, 'cv', 'a fence (cover)');
tile('BARREL', 'o', 0xc48c44, 'cvb', 'a barrel (cover)');
tile('CRATE', 'x', 0xad884e, 'cvb', 'a crate (cover)');
tile('KEG', '0', 0xff5a40, 'cvbx', 'a POWDER KEG. Shoot it.');
tile('WAGON', '=', 0xb39262, 'cv', 'a wagon (cover)');
tile('TABLE', 'n', 0x8c6c42, 'cv', 'a table (cover)');
tile('FIRE', '&', 0xffa040, 'cl', 'a campfire. Step up to it to rest.');
tile('ASH', '&', 0x5e5e5e, 'c', 'a dead fire');
tile('LANTERN', 'i', 0xffd870, 'cl', 'a lantern');
tile('GRAVE', 't', 0x9c9c9c, 'cv', 'a grave marker');
tile('DOWN', '>', 0xffffff, 'wc', 'the way into the mine');
tile('UP', '<', 0xffffff, 'wc', 'the way out');
tile('TENT', '/', 0xd9c9a2, '', 'hide and canvas');
tile('SIGN', 'P', 0xe0b874, 'c', 'a signpost');
tile('ROCK', '#', 0x57483e, '', 'mine rock');
tile('CAVE', '.', 0x4e473f, 'wc', 'mine floor');
tile('TRACK', '=', 0x67635e, 'wc', 'ore-cart track');
tile('TROUGH', 'u', 0x6a8ea6, 'cv', 'a water trough (cover)');
tile('STONE', 'O', 0xbab2a2, 'cv', 'a standing stone');
tile('BONES', 'x', 0xd8d2c0, 'wc', 'old bones');

// ---- creatures -----------------------------------------------------------------------------
// team 1 = hostile. ai picks the behaviour in ai.js.
export const KIND = {
  coyote: { ch: 'c', fg: 0xd0a868, name: 'coyote', hp: 4, speed: 2, sight: 9, ai: 'melee', melee: [1, 2], macc: 0.7, flee: 0.45, hitrun: 1, beast: 1, desc: 'Fast. Bites and backs off. Runs when hurt.' },
  alpha: { ch: 'C', fg: 0xf0c060, name: 'pack leader', hp: 9, speed: 2, sight: 10, ai: 'melee', melee: [2, 3], macc: 0.7, beast: 1, desc: 'Big, fast and not afraid of you.' },
  snake: { ch: 's', fg: 0x9ed05a, name: 'rattlesnake', hp: 2, speed: 1, sight: 3, ai: 'snake', melee: [1, 1], macc: 0.75, beast: 1, desc: 'Does not chase. Rattles once. Its bite poisons.' },
  thug: { ch: 't', fg: 0xe0805a, name: 'knife man', hp: 5, speed: 1, sight: 10, ai: 'melee', melee: [2, 3], macc: 0.7, drop: { money: [0, 3] }, desc: 'Walks straight at you with a blade.' },
  gunman: { ch: 'g', fg: 0xf0604c, name: 'gunman', hp: 7, speed: 1, sight: 11, ai: 'gun', gun: { acc: 0.5, dmg: [2, 3], range: 9, mag: 6 }, melee: [1, 2], macc: 0.6, drop: { money: [1, 5], ammo: [2, 4] }, desc: 'Six shots, then he must reload. Likes cover.' },
  rifle: { ch: 'r', fg: 0xff8a5c, name: 'rifleman', hp: 6, speed: 1, sight: 15, ai: 'rifle', rifle: { dmg: [5, 6], range: 16 }, melee: [1, 2], macc: 0.55, drop: { money: [2, 6], ammo: [2, 4] }, desc: 'Aims along a line, then fires down it. Step off the line.' },
  dyn: { ch: 'd', fg: 0xffa23a, name: 'dynamiter', hp: 6, speed: 1, sight: 10, ai: 'dyn', melee: [1, 2], macc: 0.6, drop: { money: [1, 4], dynamite: [0, 1] }, desc: 'Throws a stick with a two-count fuse. Get out of the square.' },
  rider: { ch: 'H', fg: 0xf2704c, name: 'rider', hp: 11, speed: 2, sight: 12, ai: 'rider', melee: [2, 3], macc: 0.7, drop: { money: [3, 8], ammo: [1, 3] }, desc: 'Marks a charge, then rides it down. Do not stand on the marks.' },
  assassin: { ch: 'a', fg: 0xb478d8, name: 'assassin', hp: 8, speed: 1, sight: 12, ai: 'assassin', melee: [3, 4], macc: 0.85, drop: { money: [4, 9] }, desc: 'Unseen until three steps away, unless he stands in lantern light. Throws knives.' },
  ash: { ch: 'A', fg: 0xd890ff, name: 'Mister Ash', hp: 28, speed: 1, sight: 14, ai: 'assassin', melee: [3, 5], macc: 0.85, boss: 1, drop: { money: [25, 25] }, desc: "Crowe's knife. Vanishes in smoke when hurt. Cannot hide in the light." },
  crowe: { ch: 'S', fg: 0xff4038, name: 'Silas Crowe', hp: 38, speed: 1, sight: 16, ai: 'crowe', gun: { acc: 0.6, dmg: [2, 3], range: 11, mag: 12 }, melee: [2, 4], macc: 0.7, boss: 1, drop: { money: [60, 60] }, desc: 'Two guns. Fans three lines at once. Throws dynamite when bleeding.' },
  wolf: { ch: 'w', fg: 0x9ad6ff, name: 'spirit wolf', hp: 3, speed: 2, sight: 30, ai: 'melee', melee: [1, 2], macc: 0.55, beast: 1, spirit: 1, desc: 'Not altogether here.' },
  // friends (team 0) and townsfolk (team 2)
  deputy: { ch: '@', fg: 0x7fd0ff, name: 'deputy', hp: 12, speed: 1, sight: 12, ai: 'gun', gun: { acc: 0.55, dmg: [2, 3], range: 10, mag: 6 }, melee: [1, 2], macc: 0.6 },
  npc: { ch: '@', fg: 0x8fd98f, name: 'someone', hp: 99, speed: 0, sight: 0, ai: 'npc' },
};

// ---- weapons -------------------------------------------------------------------------------
// acc: chance at close range. fall: lost per cell beyond `near`. reload: rounds loaded per turn.
export const WEAPON = {
  fists: { name: 'FISTS', melee: 1, dmg: [1, 1], acc: 0.8 },
  knife: { name: 'KNIFE', melee: 1, dmg: [2, 3], acc: 0.9 },
  rusty: { name: 'RUSTY .45', mag: 5, dmg: [2, 4], acc: 0.72, near: 3, fall: 0.04, range: 11, reload: 3, ammo: 'b', jam: 0.08, desc: 'Five chambers. Sticks sometimes.' },
  colt: { name: 'PEACEMAKER', mag: 6, dmg: [3, 4], acc: 0.82, near: 4, fall: 0.035, range: 12, reload: 3, ammo: 'b', desc: 'Six rounds, honest sights.' },
  shotgun: { name: 'COACH GUN', mag: 2, dmg: [3, 4], acc: 0.92, near: 2, fall: 0.09, range: 7, reload: 2, ammo: 's', spread: 1, desc: 'Two barrels. Murder up close, hits the men beside him too.' },
  rifle: { name: 'WINCHESTER', mag: 5, dmg: [4, 6], acc: 0.86, near: 7, fall: 0.02, range: 18, reload: 2, ammo: 'b', long: 1, desc: 'Reaches across the valley. Clumsy at arm\'s length.' },
};

// ---- goods ---------------------------------------------------------------------------------
export const ITEM = {
  bandage: { name: 'bandage', ch: '+', fg: 0xf0f0f0, desc: 'heals 6' },
  whiskey: { name: 'whiskey', ch: '!', fg: 0xe0a040, desc: 'heals 3, dulls pain, spoils aim' },
  dynamite: { name: 'dynamite', ch: '!', fg: 0xff5040, desc: 'throw it, then be elsewhere' },
  money: { name: 'dollars', ch: '$', fg: 0xffd84a },
  b: { name: '.45 rounds', ch: ':', fg: 0xf4f4f4 },
  s: { name: 'shells', ch: ':', fg: 0xff9a4a },
  knife: { name: 'a knife', ch: '(', fg: 0xd8d8e0 },
  rusty: { name: 'a rusty revolver', ch: ')', fg: 0xc0a080 },
  box: { name: 'the payroll strongbox', ch: '*', fg: 0xffe060 },
};

export const SHOP = [
  { k: 'b', n: 6, price: 3, label: '.45 rounds x6' },
  { k: 's', n: 4, price: 4, label: 'shells x4' },
  { k: 'bandage', n: 1, price: 4, label: 'bandage' },
  { k: 'dynamite', n: 1, price: 7, label: 'dynamite' },
  { k: 'colt', gun: 1, price: 30, label: 'PEACEMAKER revolver' },
  { k: 'shotgun', gun: 1, price: 38, label: 'COACH GUN + 4 shells' },
  { k: 'rifle', gun: 1, price: 60, label: 'WINCHESTER rifle' },
  { k: 'duster', armor: 1, price: 28, label: 'long duster (-1 dmg)' },
];

// ---- deeds: you become what you do -----------------------------------------------------------
// No experience points. The ledger counts what you actually did, and names you for it.
export const DEED = [
  { id: 'quick', name: 'QUICK HANDS', need: 12, count: 'reloads', what: 'reload under fire', gives: 'A reload fills the whole gun.' },
  { id: 'close', name: 'CLOSE WORK', need: 5, count: 'knifeKills', what: 'kill with the knife', gives: 'Knife does +2.' },
  { id: 'steady', name: 'STEADY', need: 8, count: 'aimedHits', what: 'hit after taking aim', gives: 'Aiming adds twice as much.' },
  { id: 'eye', name: 'DEAD EYE', need: 8, count: 'longKills', what: 'kill from 7 or more steps', gives: 'No penalty for distance.' },
  { id: 'last', name: 'LAST ROUND', need: 4, count: 'lastKills', what: 'kill with your final round', gives: 'The last round always hits, and hits harder.' },
  { id: 'feet', name: 'LIGHT FEET', need: 10, count: 'dodges', what: 'step out of a marked attack', gives: 'DASH comes back twice as fast.' },
  { id: 'hard', name: 'HARD TO KILL', need: 3, count: 'closeCalls', what: 'win a fight at 3 health or less', gives: 'Once a fight, a killing blow leaves you at 1.' },
  { id: 'powder', name: 'POWDER MONKEY', need: 4, count: 'blastKills', what: 'kill with an explosion', gives: 'Your blasts do +2.' },
];
