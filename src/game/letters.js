// The type case: every letter the player owns. It is the inventory, the skill list and the
// voice, all at once. A word can be used if (and only if) it can be spelled from the case.

export class TypeCase {
  constructor(items = []) {
    this.items = [...items];
  }
  count(ch) {
    let n = 0;
    for (const c of this.items) if (c === ch) n++;
    return n;
  }
  // letters of `word` that the case cannot supply (empty array = it can be spelled)
  missing(word) {
    const pool = [...this.items], out = [];
    for (const ch of word) {
      if (ch === ' ') continue;
      const i = pool.indexOf(ch);
      if (i >= 0) pool.splice(i, 1);
      else out.push(ch);
    }
    return out;
  }
  can(word) {
    return this.missing(word).length === 0;
  }
  add(chars) {
    for (const ch of chars) if (ch !== ' ') this.items.push(ch);
  }
  remove(ch) {
    const i = this.items.indexOf(ch);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }
  get money() {
    return this.count('$');
  }
  // letters first (in the order they were earned), then marks, then money
  sorted() {
    const isL = (c) => c >= 'A' && c <= 'Z';
    return [...this.items.filter(isL), ...this.items.filter((c) => !isL(c) && c !== '$'), ...this.items.filter((c) => c === '$')];
  }
}

// Words that carry weight in chapter one. `tip` is shown in the word book.
export const LEX = {
  NO: 'Refuse.',
  NOD: 'Agree, without a sound.',
  DO: 'Put your hands to whatever is in front of you.',
  BOO: 'Startle something.',
  BOND: 'Offer company. People and animals remember it.',
  DON: 'Put on what you find.',
  MEND: 'Set a missing letter back where it belongs.',
  PRY: 'Take a letter off a sign.',
  ROB: 'Take what is not yours.',
  READ: 'Make sense of small print.',
  DIG: 'Open the ground.',
  OPEN: 'Open what is shut.',
  RIDE: 'Go by horse.',
  RUN: 'While you can spell it, you move faster.',
  NAP: 'Sleep an hour or two away.',
  PRAY: 'Ask for nothing in particular.',
  YODEL: 'Nobody asked.',
  NAME: 'Not yet.',
  BODY: 'A grim thing to say out loud.',
  BOY: 'Every dog in town looks up.',
  NOBODY: 'What the ledger calls you.',
  BOOM: 'Loud, and brief.',
  AMEN: 'The short form.',
  MONEY: 'Saying it does not make it so.',
  POEM: 'Four lines, if you have them.',
  PONY: 'Mind who hears you.',
  DEMON: 'Do not.',
  DOOR: 'Knock.',
};
