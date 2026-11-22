// Signs whose letters are real objects. Pry one off and the sign closes ranks around the gap,
// and (because in this country a thing is what it is called) the thing itself changes.

import { lerp } from '../engine/math.js';

export class Signs {
  constructor(specs) {
    this.list = specs.map((s) => ({
      ...s,
      have: [...s.text].map(() => true),
      caret: [...s.text].map(() => false), // the thief's mark left under a stolen letter
      slide: [...s.text].map(() => null), // animated offsets
      owner: null,
      guarded: null, // function(game) => true if someone stops you
      permit: false,
      glow: 0,
    }));
    this.byId = {};
    for (const s of this.list) this.byId[s.id] = s;
  }
  get(id) { return this.byId[id]; }

  // what the sign says right now
  reads(id) {
    const s = this.byId[id];
    return [...s.text].filter((c, i) => s.have[i]).join('').replace(/\s+/g, ' ').trim();
  }
  whole(id) { return this.byId[id].have.every(Boolean); }
  missing(id) {
    const s = this.byId[id];
    return [...s.text].map((ch, i) => ({ ch, i })).filter((o) => !s.have[o.i]);
  }
  // letters still on the sign that could be taken
  present(id) {
    const s = this.byId[id];
    return [...s.text].map((ch, i) => ({ ch, i })).filter((o) => s.have[o.i] && o.ch !== ' ');
  }
  pry(id, i, caret = false) {
    const s = this.byId[id];
    if (!s.have[i]) return null;
    s.have[i] = false;
    s.caret[i] = caret;
    return s.text[i];
  }
  // put `ch` back in the first gap it fits; returns the index or -1
  mend(id, ch) {
    const s = this.byId[id];
    const i = [...s.text].findIndex((c, k) => c === ch && !s.have[k]);
    if (i < 0) return -1;
    s.have[i] = true;
    s.caret[i] = false;
    return i;
  }
  // where a letter of the sign hangs in the world (first face)
  letterPos(id, i) {
    const s = this.byId[id], f = s.faces[0];
    const t = (i - (s.text.length - 1) / 2) * s.adv;
    return [f.c[0] + f.u[0] * t, f.c[1] + f.u[1] * t, f.c[2] + f.u[2] * t];
  }

  serialize() {
    const o = {};
    for (const s of this.list) if (!s.have.every(Boolean)) o[s.id] = { have: s.have.map((b) => (b ? 1 : 0)).join(''), caret: s.caret.map((b) => (b ? 1 : 0)).join('') };
    return o;
  }
  restore(o) {
    for (const s of this.list) {
      const d = o && o[s.id];
      s.have = [...s.text].map((c, i) => (d ? d.have[i] === '1' : true));
      s.caret = [...s.text].map((c, i) => (d ? d.caret[i] === '1' : false));
    }
  }

  draw(text, dt) {
    for (const s of this.list) {
      // layout: present characters, centred
      const idx = [];
      for (let i = 0; i < s.text.length; i++) if (s.have[i]) idx.push(i);
      // trim spaces at the ends and collapse doubles so the remaining word sits tight
      const shown = [];
      for (const i of idx) {
        const sp = s.text[i] === ' ';
        if (sp && (shown.length === 0 || s.text[shown[shown.length - 1]] === ' ')) continue;
        shown.push(i);
      }
      while (shown.length && s.text[shown[shown.length - 1]] === ' ') shown.pop();
      const n = shown.length;
      const place = new Map();
      shown.forEach((i, k) => place.set(i, (k - (n - 1) / 2) * s.adv));
      s.glow = Math.max(0, s.glow - dt * 1.5);
      const k = 1 - Math.exp(-dt * 9);
      for (const f of s.faces) {
        for (const i of shown) {
          const ch = s.text[i];
          const want = place.get(i);
          if (s.slide[i] === null) s.slide[i] = want;
          if (f === s.faces[0]) s.slide[i] = lerp(s.slide[i], want, k);
          if (ch === ' ') continue;
          const t = s.slide[i];
          text.planar(ch, [f.c[0] + f.u[0] * t, f.c[1] + f.u[1] * t, f.c[2] + f.u[2] * t], f.n, s.size, s.col, s.emis + s.glow);
        }
        // carets: under the line, pointing up at the place the letter was taken from
        for (let i = 0; i < s.text.length; i++) {
          if (s.have[i] || !s.caret[i]) continue;
          let kpos = 0;
          for (const j of shown) if (j < i) kpos++;
          const t = (kpos - 0.5 - (n - 1) / 2) * s.adv;
          const y = -s.size * 0.74;
          text.planar('^', [f.c[0] + f.u[0] * t, f.c[1] + y, f.c[2] + f.u[2] * t], f.n, s.size * 0.62, [1.0, 0.32, 0.12], 0.55, false);
        }
      }
      for (let i = 0; i < s.text.length; i++) if (!s.have[i]) s.slide[i] = null;
    }
  }
}
