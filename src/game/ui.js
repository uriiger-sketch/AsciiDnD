// The game's interface. Everything is text: UPPERCASE words are spelled from your letters,
// lowercase actions are free.

import { LEX } from './letters.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class UI {
  constructor(h) {
    this.h = h; // handlers: verb(word), listen(), speak(word), menu()
    this.compose = []; // indices into the sorted tile list
    this.tiles = [];
    this.ctxKey = '';
    this.pending = null; // { type: 'say' | 'choose', resolve, ... }
    this.auto = null; // test hook: (options) => index
    this.fresh = new Set();
    $('gmenu').addEventListener('click', () => h.menu());
    $('sayBtn').addEventListener('click', () => this._speak());
    $('clearBtn').addEventListener('click', () => { this.compose = []; this.renderCase(); });
    $('dlg').addEventListener('click', (e) => { if (!e.target.closest('button')) this.advance(); });
  }

  show(on) { $('game').hidden = !on; }
  get busy() { return !!this.pending; }

  // ---- objective ----
  objective(text, way) {
    if ($('objText').textContent !== text) $('objText').textContent = text;
    if ($('objWay').textContent !== way) $('objWay').textContent = way;
  }
  kicker(t) { $('objKick').textContent = t; }

  toast(html) {
    const t = el('div', 'toast');
    t.innerHTML = html;
    $('toasts').appendChild(t);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => t.remove(), 3300);
  }

  // ---- type case and composer ----
  setCase(tc, newOnes = '') {
    this.tc = tc;
    for (const c of newOnes) this.fresh.add(c);
    this.compose = [];
    this.renderCase();
  }
  renderCase() {
    const tc = this.tc;
    if (!tc) return;
    const sorted = tc.sorted();
    this.tiles = sorted;
    const box = $('tiles');
    box.textContent = '';
    if (!sorted.length) box.appendChild(el('span', 'hint', '(your case is empty)'));
    let money = 0;
    sorted.forEach((ch, i) => {
      if (ch === '$') { money++; return; }
      const b = el('button', 'tile' + (this.compose.includes(i) ? ' used' : '') + (/[A-Z]/.test(ch) ? '' : ' mark') + (this.fresh.has(ch) ? ' new' : ''), ch);
      b.setAttribute('aria-label', 'letter ' + ch);
      b.addEventListener('click', () => {
        const k = this.compose.indexOf(i);
        if (k >= 0) this.compose.splice(k, 1);
        else if (/[A-Z]/.test(ch)) this.compose.push(i);
        this.renderCase();
      });
      box.appendChild(b);
    });
    if (money) {
      const m = el('span', 'hint', '$' + money);
      m.style.cssText = 'align-self:center;color:var(--ember);letter-spacing:0.1em;margin-left:6px;font-size:14px';
      box.appendChild(m);
    }
    this.fresh.clear();
    const word = this.compose.map((i) => sorted[i]).join('');
    $('spell').textContent = word;
    $('spell').className = LEX[word] ? 'ok' : '';
    $('sayBtn').hidden = !word;
    $('clearBtn').hidden = !word;
    $('spellHint').textContent = word ? '' : 'tap letters to spell a word';
  }
  _speak() {
    const word = this.compose.map((i) => this.tiles[i]).join('');
    this.compose = [];
    this.renderCase();
    if (word) this.h.speak(word);
  }

  // ---- context: what is in front of you and which words apply ----
  setContext(c) {
    const key = c ? c.name + '|' + c.actions.map((a) => a.label + (a.ok ? 1 : 0) + (a.lack || '')).join(',') : '';
    if (key === this.ctxKey) return;
    this.ctxKey = key;
    const box = $('ctx');
    box.textContent = '';
    if (!c) return;
    const n = el('span', '', c.name);
    n.id = 'ctxName';
    box.appendChild(n);
    for (const a of c.actions) box.appendChild(this._verbButton(a, () => (a.free ? this.h.free(a) : this.h.verb(a.word))));
  }
  _verbButton(a, onClick) {
    const b = el('button', 'verb' + (a.free ? ' free' : '') + (a.ok === false ? ' no' : ''), a.label);
    if (a.ok === false && a.lack) b.appendChild(el('span', 'lack', 'needs ' + a.lack));
    if (a.note) b.appendChild(el('span', 'note', a.note));
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  // ---- dialogue ----
  _open(who) {
    $('dlg').hidden = false;
    $('hud').hidden = true;
    $('dlgWho').textContent = who || '';
  }
  closeDialogue() {
    $('dlg').hidden = true;
    $('hud').hidden = false;
    $('dlgOpts').textContent = '';
  }
  // Show a line; resolves when the player taps on.
  say(who, text) {
    this._open(who);
    $('dlgOpts').textContent = '';
    $('dlgMore').hidden = false;
    const box = $('dlgText');
    if (this.auto) { box.textContent = text; return Promise.resolve(); }
    return new Promise((resolve) => {
      let n = 0;
      box.textContent = '';
      const step = () => {
        n = Math.min(text.length, n + 2);
        box.textContent = text.slice(0, n);
        if (n >= text.length) { clearInterval(timer); p.done = true; }
      };
      const timer = setInterval(step, 22);
      const p = (this.pending = { type: 'say', done: false, finish: () => { clearInterval(timer); box.textContent = text; p.done = true; }, resolve: () => { clearInterval(timer); this.pending = null; resolve(); } });
    });
  }
  // options: [{ label, word?, ok, lack?, note? }]; resolves with the chosen index.
  choose(who, text, options) {
    this._open(who);
    if (text !== null) $('dlgText').textContent = text;
    $('dlgMore').hidden = true;
    if (this.auto) return Promise.resolve(this.auto(options, who, text));
    return new Promise((resolve) => {
      const box = $('dlgOpts');
      box.textContent = '';
      options.forEach((o, i) => {
        box.appendChild(this._verbButton(o, () => {
          if (o.ok === false) return;
          this.pending = null;
          box.textContent = '';
          resolve(i);
        }));
      });
      this.pending = { type: 'choose', keys: (k) => { const i = parseInt(k, 10) - 1; if (options[i] && options[i].ok !== false) { this.pending = null; box.textContent = ''; resolve(i); } } };
    });
  }
  // tap / key to move a spoken line along
  advance() {
    const p = this.pending;
    if (!p || p.type !== 'say') return false;
    if (!p.done) p.finish();
    else p.resolve();
    return true;
  }
  key(k) {
    const p = this.pending;
    if (p && p.type === 'choose') p.keys(k);
  }

  // ---- full-screen cards ----
  card({ kick, title, lines, buttons }) {
    const c = $('card');
    c.textContent = '';
    if (kick) c.appendChild(el('div', 'kick', kick));
    if (title) c.appendChild(el('div', 'word', title));
    if (lines) c.appendChild(el('div', 'lines', lines));
    c.hidden = false;
    if (this.auto) { c.hidden = true; return Promise.resolve(0); }
    return new Promise((resolve) => {
      const col = el('div', 'col');
      (buttons || ['GO ON']).forEach((b, i) => {
        const btn = el('button', '', b);
        btn.addEventListener('click', () => { c.hidden = true; resolve(i); });
        col.appendChild(btn);
      });
      c.appendChild(col);
    });
  }

  // ---- journal ----
  journal(data, actions) {
    const j = $('journal'), box = $('journalIn');
    box.textContent = '';
    const h = (t) => box.appendChild(el('h2', '', t));
    const p = (t) => box.appendChild(el('p', '', t));
    h('NOBODY');
    p(data.standing);
    h('THE DAY SO FAR');
    data.log.forEach((l) => p('- ' + l));
    if (!data.log.length) p('Nothing worth writing down yet.');
    h('WORDS YOU KNOW');
    for (const w of data.words) {
      const r = el('div', 'wordrow' + (w.ok ? '' : ' no'));
      r.appendChild(el('b', '', w.word));
      r.appendChild(el('span', '', w.tip));
      if (!w.ok) r.appendChild(el('i', '', 'needs ' + w.lack));
      box.appendChild(r);
    }
    p('Uppercase words must be spelled from the letters in your case. You can also tap your letters to try a word nobody has taught you.');
    const row = el('div', 'rowb');
    actions.forEach((a) => {
      const b = el('button', '', a.label);
      b.addEventListener('click', () => { if (a.close !== false) j.hidden = true; a.run(b); });
      row.appendChild(b);
    });
    box.appendChild(row);
    j.hidden = false;
  }
  get journalOpen() { return !$('journal').hidden; }
  closeJournal() { $('journal').hidden = true; }
}
