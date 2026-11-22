// The tour: ten directed shots of the land, with time and weather to play with.
// (This was the engine's first showcase; it now also provides the backdrop for the title.)

import { G } from './engine/atlas.js';
import { clamp, lerp } from './engine/math.js';
import { POOL } from './world/land.js';
import { PLACES } from './world/world.js';
import { Rider } from './world/actors.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// yaw: where the camera stands (0 = south of the target, looking north).
export const SHOTS = [
  { id: 'sundown', name: 'Sundown', hour: 17.72, sky: 'clear', at: [-380, 20], yaw: 1.45, yawTall: 1.575, pitch: 0.07, dist: 260, drift: 0.006 },
  { id: 'ride', name: 'The Long Ride', hour: 17.2, sky: 'clear', follow: true, yaw: -1.05, pitch: 0.15, dist: 11.5, drift: 0.05 },
  { id: 'main', name: 'Main Street', hour: 18.72, sky: 'clear', at: [-34, 0], yaw: -1.5708, pitch: 0.055, dist: 56, drift: 0 },
  { id: 'camp', name: 'Campfire', hour: 22.6, sky: 'clear', at: PLACES.camp, yaw: 0.8, pitch: 0.2, dist: 21, drift: 0.03 },
  { id: 'falls', name: 'The Falls', hour: 11.4, sky: 'clear', at: [POOL.x + 2, POOL.z - 24], y: 60, yaw: -0.14, pitch: -0.17, dist: 185, drift: 0 },
  { id: 'storm', name: 'Storm Front', hour: 16.4, sky: 'storm', at: [-300, 60], yaw: 1.1, pitch: 0.1, dist: 190, drift: 0.008 },
  { id: 'noon', name: 'High Noon', hour: 12.4, sky: 'clear', at: [-30, 0], yaw: 0.0, pitch: 0.92, dist: 78, drift: 0.01 },
  { id: 'tipis', name: 'First Light', hour: 5.9, sky: 'mist', at: PLACES.tipis, yaw: -1.3, pitch: 0.1, dist: 36, drift: 0.012 },
  { id: 'dust', name: 'Dry Wind', hour: 15.2, sky: 'dust', at: [-430, 640], yaw: 0.6, pitch: 0.12, dist: 120, drift: 0.01 },
  { id: 'moon', name: 'Moonrise on Boot Hill', hour: 20.3, sky: 'clear', at: PLACES.church, y: 30, yaw: -1.45, pitch: -0.035, dist: 92, drift: 0 },
];
const SKIES = [['clear', 'Clear'], ['cloudy', 'Clouds'], ['dust', 'Dust'], ['storm', 'Storm'], ['mist', 'Mist']];

export class Tour {
  constructor({ engine, land, entities, particles, onLeave }) {
    this.engine = engine;
    this.land = land;
    this.particles = particles;
    this.active = false;
    this.deck = false; // false while it is only the backdrop of the title
    const gl = engine.gl;
    this.rider = new Rider(gl, entities, [[-150, 62], [-290, 128], [-470, 84], [-585, -40], [-505, -190], [-330, -172], [-215, -70], [-128, 6]], { start: 2.2 });
    this.rider2 = new Rider(gl, entities, [[-70, 210], [-260, 280], [-420, 250], [-300, 180], [-150, 160]], { start: 1, coat: 0x1e1b1a, serape: [0x2f7f7a, 0xe2d6b8, 0x23323f, 0xc98a2e], speed: 9.5 });
    engine.disturbers.push(this.rider.disturber, this.rider2.disturber);
    this.state = { shot: 0, auto: false, shotTime: 0, userCam: false, playDay: false, bolt: 3, second: 0 };
    this.following = false;
    this.cutting = false;
    this.keys = new Set();
    this._bind(onLeave);
  }

  start(deck, shot = 0) {
    this.active = true;
    this.deck = deck;
    this.rider.e.hidden = false;
    this.rider2.e.hidden = false;
    $('slate').hidden = !deck;
    $('deck').hidden = !deck;
    $('toggle').hidden = !deck;
    this.setAuto(deck);
    this.applyShot(shot);
  }
  stop() {
    this.active = false;
    this.rider.e.hidden = true;
    this.rider2.e.hidden = true;
    $('slate').hidden = true;
    $('deck').hidden = true;
    $('toggle').hidden = true;
    this.engine.atmo.dayLength = 0;
  }

  applyShot(i) {
    const s = SHOTS[i], st = this.state, eng = this.engine, cam = eng.cam;
    st.shot = i; st.shotTime = 0; st.userCam = false;
    eng.atmo.hour = s.hour;
    eng.atmo.setWeather(s.sky, true);
    const tall = eng.h > eng.w; // portrait screens see a narrower slice: re-aim
    cam.yaw = tall && s.yawTall !== undefined ? s.yawTall : s.yaw;
    cam.pitch = s.pitch;
    cam.dist = s.dist * (tall && s.follow ? 1.25 : 1);
    if (s.at) cam.target = [s.at[0], 0, s.at[1]];
    $('shotName').textContent = s.name;
    this.syncUI();
  }
  async cutTo(i) {
    if (this.cutting) return;
    this.cutting = true;
    $('fade').classList.add('on');
    await new Promise((r) => setTimeout(r, 620));
    if (this.active) this.applyShot(i);
    await nextFrame();
    $('fade').classList.remove('on');
    this.cutting = false;
  }
  setAuto(on) { this.state.auto = on; $('auto').setAttribute('aria-pressed', on ? 'true' : 'false'); }

  // lightning: a forked path of strokes from cloud to ground, and the flash it throws
  strike() {
    const cam = this.engine.cam, land = this.land, atmo = this.engine.atmo, particles = this.particles;
    const BOLT = { colors: [[9, 10, 14, 1], [5, 6, 10, 0.9], [1, 1.4, 3, 0]], size: [1, 1], gravity: 0, drag: 0, wind: 0, additive: true };
    const a = Math.random() * 6.283, d = 250 + Math.random() * 650;
    const gx = cam.target[0] + Math.cos(a) * d - cam.fwd[0] * 200, gz = cam.target[2] + Math.sin(a) * d - cam.fwd[2] * 200;
    const gy = land.heightAt(gx, gz);
    const x = gx + (Math.random() - 0.5) * 300, z = gz + (Math.random() - 0.5) * 300;
    const size = Math.max(4, Math.hypot(gx - cam.eye[0], gz - cam.eye[2]) * 0.022);
    const branch = (bx, by, bz, tx, ty, tz, n, depth) => {
      for (let i = 0; i < n; i++) {
        const k = 1 / (n - i);
        const nx = bx + (tx - bx) * k + (Math.random() - 0.5) * size * 2.2, nz = bz + (tz - bz) * k + (Math.random() - 0.5) * size * 2.2;
        const ny = by + (ty - by) * k;
        const dxs = (nx - bx) * cam.right[0] + (nz - bz) * cam.right[2];
        const kind = { ...BOLT, glyphs: [Math.abs(dxs) < size * 0.35 ? G('|') : dxs > 0 ? G('\\') : G('/')] };
        const steps = Math.max(1, Math.round(Math.hypot(nx - bx, ny - by, nz - bz) / (size * 0.7)));
        for (let s2 = 0; s2 < steps; s2++) {
          const t = s2 / steps;
          particles.emit(kind, bx + (nx - bx) * t, by + (ny - by) * t, bz + (nz - bz) * t, 0, 0, 0, 0.2 + Math.random() * 0.18, size * (depth ? 0.7 : 1));
        }
        if (!depth && Math.random() < 0.22) branch(nx, ny, nz, nx + (Math.random() - 0.5) * 300, ny - 150 - Math.random() * 150, nz + (Math.random() - 0.5) * 300, 5, 1);
        bx = nx; by = ny; bz = nz;
      }
    };
    branch(x, 820, z, gx, gy, gz, 18, 0);
    atmo.flash = 1.6;
    atmo.flashPos = [gx, gy + 300, gz];
    this.state.second = 0.09 + Math.random() * 0.1;
  }

  syncUI() {
    const st = this.state, atmo = this.engine.atmo;
    this.shotBtns.forEach((b, i) => b.setAttribute('aria-pressed', i === st.shot && !st.userCam ? 'true' : 'false'));
    this.skyBtns.forEach((b, i) => b.setAttribute('aria-pressed', SKIES[i][0] === atmo.weatherName ? 'true' : 'false'));
    $('hour').value = atmo.hour;
    const hh = Math.floor(atmo.hour) % 24, mm = Math.floor((atmo.hour % 1) * 60);
    $('clock').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  _bind(onLeave) {
    const eng = this.engine, cam = eng.cam, atmo = eng.atmo, canvas = eng.canvas, st = this.state;
    const press = (el, on) => el.setAttribute('aria-pressed', on ? 'true' : 'false');
    const live = () => this.active && this.deck;
    // pointer: drag = orbit, two fingers / right button = travel, wheel / pinch = zoom
    const pts = new Map();
    let pinch = 0;
    const grab = () => { st.userCam = true; if (st.auto) this.setAuto(false); };
    const pan = (mx, my) => {
      const k = cam.dist * 0.0016, s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
      cam.target[0] -= (c * mx + s * my) * k;
      cam.target[2] -= (-s * mx + c * my) * k;
      this.following = false;
    };
    this.pan = pan;
    this.grab = grab;
    canvas.addEventListener('pointerdown', (e) => { if (!live()) return; canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY, e.button]); grab(); });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p || !live()) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1];
      p[0] = e.clientX; p[1] = e.clientY;
      if (pts.size === 1) {
        if (p[2] === 2 || e.shiftKey) pan(dx, dy);
        else { cam.yaw -= dx * 0.005; cam.pitch = clamp(cam.pitch + dy * 0.004, -0.5, 1.5); }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) cam.dist = clamp(cam.dist * (pinch / d), 5, 1800);
        pinch = d;
        pan(dx * 0.5, dy * 0.5);
      }
    });
    canvas.addEventListener('wheel', (e) => { if (!live()) return; e.preventDefault(); grab(); cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 5, 1800); }, { passive: false });
    addEventListener('keydown', (e) => { if (!live()) return; this.keys.add(e.key.toLowerCase()); if (e.key === ' ') this.cutTo((st.shot + 1) % SHOTS.length); });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    this.shotBtns = SHOTS.map((s, i) => {
      const b = document.createElement('button');
      b.textContent = s.name;
      b.id = 'shot-' + s.id;
      b.addEventListener('click', () => { this.setAuto(false); this.cutTo(i); });
      $('shots').appendChild(b);
      return b;
    });
    this.skyBtns = SKIES.map(([id, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.id = 'sky-' + id;
      b.addEventListener('click', () => { atmo.setWeather(id); this.syncUI(); });
      $('weathers').appendChild(b);
      return b;
    });
    $('auto').addEventListener('click', () => { this.setAuto(!st.auto); st.shotTime = 0; });
    $('hour').addEventListener('input', (e) => { atmo.hour = parseFloat(e.target.value) % 24; this.syncUI(); });
    $('play').addEventListener('click', () => { st.playDay = !st.playDay; atmo.dayLength = st.playDay ? 150 : 0; press($('play'), st.playDay); });
    $('px').addEventListener('input', (e) => { eng.opts.glyphPx = parseFloat(e.target.value); eng.w = 0; });
    $('under').addEventListener('input', (e) => { eng.underglow = parseFloat(e.target.value); });
    const fx = (id, get, set) => $(id).addEventListener('click', () => { set(!get()); press($(id), get()); });
    fx('fxBloom', () => eng.post.enableBloom, (v) => (eng.post.enableBloom = v));
    fx('fxRays', () => eng.post.enableRays, (v) => (eng.post.enableRays = v));
    fx('fxShadow', () => eng.shadows.enabled !== false, (v) => eng.shadows.setEnabled(v));
    $('moreBtn').addEventListener('click', () => { const m = $('more'); m.hidden = !m.hidden; press($('moreBtn'), !m.hidden); });
    $('toggle').addEventListener('click', () => {
      const d = $('deck'), min = !d.classList.contains('min');
      d.classList.toggle('min', min);
      $('slate').hidden = min;
      $('toggle').textContent = min ? 'Controls' : 'Hide';
      press($('toggle'), !min);
    });
    $('toTitle').addEventListener('click', () => onLeave());
  }

  update(dt) {
    if (!this.active) return;
    const st = this.state, s = SHOTS[st.shot], eng = this.engine, cam = eng.cam, atmo = eng.atmo, land = this.land;
    st.shotTime += dt;
    this.rider.update(dt, eng, this.particles);
    this.rider2.update(dt, eng, this.particles);
    if (atmo.env.lightning > 0.5) {
      st.bolt -= dt;
      if (st.bolt <= 0) { this.strike(); st.bolt = 2.5 + Math.random() * 6; }
      if (st.second > 0) { st.second -= dt; if (st.second <= 0) atmo.flash = Math.max(atmo.flash, 1.1); }
    }
    if (s.follow && !st.userCam) this.following = true;
    if (!s.follow && st.shotTime < dt * 1.5) this.following = false;
    if (this.following) {
      const p = this.rider.pos, lead = eng.h > eng.w ? 0.2 : 2.5;
      cam.target[0] = p[0] + this.rider.heading[0] * lead; cam.target[2] = p[2] + this.rider.heading[1] * lead;
      if (!st.userCam) cam.yaw = s.yaw + Math.sin(st.shotTime * 0.11) * 0.45;
    } else if (!st.userCam) {
      cam.yaw += s.drift * dt;
    }
    const k = this.keys;
    const mv = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0), sd = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    if (this.deck && (mv || sd)) { this.grab(); this.pan(-sd * 14, mv * 14); }
    const wantY = s.y !== undefined && !st.userCam ? s.y : land.heightAt(cam.target[0], cam.target[2]) + (this.following ? 1.7 : 1.5);
    cam.target[1] = lerp(cam.target[1] || 0, wantY, st.shotTime < 0.1 ? 1 : Math.min(1, dt * 6));
    if (st.auto && st.shotTime > 15 && !this.cutting) this.cutTo((st.shot + 1) % SHOTS.length);
    if (st.playDay) this.syncUI();
  }
}
