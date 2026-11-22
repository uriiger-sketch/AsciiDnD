// SUNDOWN showcase: builds the world, runs the director and the controls.

import { Engine } from './engine/engine.js';
import { EntityLayer } from './engine/batch.js';
import { Particles, Weather, KIND, emitFire } from './engine/particles.js';
import { G } from './engine/atlas.js';
import { clamp, lerp } from './engine/math.js';
import { generateLand, POOL } from './world/land.js';
import { buildWorld, PLACES } from './world/world.js';
import { Rider, Tumbleweeds, WindmillFan } from './world/actors.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) ? parseFloat(params.get(k)) : d);
const TEST = params.has('test');
const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// Camera set-ups. yaw: where the camera stands (0 = south of the target, looking north).
const SHOTS = [
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

async function start() {
  const canvas = $('view'), bootLine = $('bootLine');
  const say = async (t) => { if (bootLine) bootLine.textContent = t; await nextFrame(); };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const engine = new Engine(canvas, { glyphPx: num('px', coarse ? 8 : 9), maxDpr: num('dpr', coarse ? 1.75 : 2) });
  $('px').value = engine.opts.glyphPx;
  const gl = engine.gl;

  await say('raising the land');
  const land = generateLand();
  let world;
  {
    const steps = [];
    world = buildWorld(gl, land, (t) => steps.push(t));
    await say('typesetting the town');
  }
  engine.init(land);
  await say('lighting the fires');

  const entities = new EntityLayer(gl);
  const particles = new Particles(gl, 7000);
  const weather = new Weather(gl);
  const f = land.falls;
  weather.falls = { x: f.x, y: f.top - 1.0, z: f.z, bottom: f.bottom, dir: f.dir, width: 10 };
  weather.fireflies = { x: POOL.x - 10, z: POOL.z + 60, r: 150 };
  const ridePath = [[-150, 62], [-290, 128], [-470, 84], [-585, -40], [-505, -190], [-330, -172], [-215, -70], [-128, 6]];
  const rider = new Rider(gl, entities, ridePath, { start: 2.2 });
  const rider2 = new Rider(gl, entities, [[-70, 210], [-260, 280], [-420, 250], [-300, 180], [-150, 160]], { start: 1, coat: 0x1e1b1a, serape: [0x2f7f7a, 0xe2d6b8, 0x23323f, 0xc98a2e], speed: 9.5 });
  const weeds = new Tumbleweeds(gl, entities, 9);
  const fan = new WindmillFan(gl, entities, PLACES.windmill[0], land.heightAt(PLACES.windmill[0], PLACES.windmill[1]) + 9.5, PLACES.windmill[1]);
  engine.disturbers.push(rider.disturber, rider2.disturber);
  engine.lights.push(...world.lights);
  // a lantern of mist-light at the falls, so the pool glows a little after dark
  engine.layers.push(world.mesh, world.statics, entities, particles, weather);
  window.engine = engine;

  const cam = engine.cam, atmo = engine.atmo;
  const state = { shot: 0, auto: !TEST && !params.has('shot'), shotTime: 0, userCam: false, playDay: false, bolt: 2 + Math.random() * 3, second: 0 };

  // --- director -------------------------------------------------------------------------
  const fade = $('fade');
  function applyShot(i, instant) {
    const s = SHOTS[i];
    state.shot = i; state.shotTime = 0; state.userCam = false;
    atmo.hour = s.hour;
    atmo.setWeather(s.sky, true);
    const tall = engine.h > engine.w; // portrait screens see a narrower slice: re-aim
    cam.yaw = tall && s.yawTall !== undefined ? s.yawTall : s.yaw;
    cam.pitch = s.pitch;
    cam.dist = s.dist * (tall && s.follow ? 1.25 : 1);
    if (s.at) cam.target = [s.at[0], 0, s.at[1]];
    $('shotName').textContent = s.name;
    syncUI();
  }
  let cutting = false;
  async function cutTo(i) {
    if (cutting) return;
    cutting = true;
    fade.classList.add('on');
    await new Promise((r) => setTimeout(r, 620));
    applyShot(i);
    await nextFrame();
    fade.classList.remove('on');
    cutting = false;
  }

  // --- lightning: a forked path of strokes from cloud to ground, and the flash it throws ---
  const BOLT = { glyphs: ['/', '\\', '|', '_'].map(G), colors: [[9, 10, 14, 1], [5, 6, 10, 0.9], [1, 1.4, 3, 0]], size: [1, 1], gravity: 0, drag: 0, wind: 0, additive: true };
  function strike() {
    const a = Math.random() * 6.283, d = 250 + Math.random() * 650;
    const gx = cam.target[0] + Math.cos(a) * d - cam.fwd[0] * 200, gz = cam.target[2] + Math.sin(a) * d - cam.fwd[2] * 200;
    const gy = land.heightAt(gx, gz);
    let x = gx + (Math.random() - 0.5) * 300, y = 820, z = gz + (Math.random() - 0.5) * 300;
    const dist = Math.hypot(gx - cam.eye[0], gz - cam.eye[2]);
    const size = Math.max(4, dist * 0.022);
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
    branch(x, y, z, gx, gy, gz, 18, 0);
    atmo.flash = 1.6;
    atmo.flashPos = [gx, gy + 300, gz];
    state.second = 0.09 + Math.random() * 0.1;
  }

  // --- controls ---------------------------------------------------------------------------
  const pts = new Map();
  let pinch = 0;
  const grab = () => { state.userCam = true; if (state.auto) setAuto(false); };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY, e.button]); grab(); });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const pan = (mx, my) => {
    const k = cam.dist * 0.0016, s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
    cam.target[0] -= (c * mx + s * my) * k;
    cam.target[2] -= (-s * mx + c * my) * k;
    following = false;
  };
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
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
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); grab(); cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 5, 1800); }, { passive: false });
  const keys = new Set();
  addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); if (e.key === ' ') cutTo((state.shot + 1) % SHOTS.length); });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  // --- on-screen deck ---------------------------------------------------------------------
  const press = (el, on) => el.setAttribute('aria-pressed', on ? 'true' : 'false');
  const shotBtns = SHOTS.map((s, i) => {
    const b = document.createElement('button');
    b.textContent = s.name;
    b.id = 'shot-' + s.id;
    b.addEventListener('click', () => { setAuto(false); cutTo(i); });
    $('shots').appendChild(b);
    return b;
  });
  const skyBtns = SKIES.map(([id, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.id = 'sky-' + id;
    b.addEventListener('click', () => { atmo.setWeather(id); syncUI(); });
    $('weathers').appendChild(b);
    return b;
  });
  function setAuto(on) { state.auto = on; press($('auto'), on); }
  function syncUI() {
    shotBtns.forEach((b, i) => press(b, i === state.shot && !state.userCam));
    skyBtns.forEach((b, i) => press(b, SKIES[i][0] === atmo.weatherName));
    $('hour').value = atmo.hour;
    const hh = Math.floor(atmo.hour) % 24, mm = Math.floor((atmo.hour % 1) * 60);
    $('clock').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  $('auto').addEventListener('click', () => { setAuto(!state.auto); state.shotTime = 0; });
  $('hour').addEventListener('input', (e) => { atmo.hour = parseFloat(e.target.value) % 24; syncUI(); });
  $('play').addEventListener('click', () => { state.playDay = !state.playDay; atmo.dayLength = state.playDay ? 150 : 0; press($('play'), state.playDay); });
  $('px').addEventListener('input', (e) => { engine.opts.glyphPx = parseFloat(e.target.value); engine.w = 0; });
  $('under').addEventListener('input', (e) => { engine.underglow = parseFloat(e.target.value); });
  const fx = (id, get, set) => $(id).addEventListener('click', () => { set(!get()); press($(id), get()); });
  fx('fxBloom', () => engine.post.enableBloom, (v) => (engine.post.enableBloom = v));
  fx('fxRays', () => engine.post.enableRays, (v) => (engine.post.enableRays = v));
  fx('fxShadow', () => engine.shadows.enabled !== false, (v) => engine.shadows.setEnabled(v));
  $('moreBtn').addEventListener('click', () => { const m = $('more'); m.hidden = !m.hidden; press($('moreBtn'), !m.hidden); });
  $('toggle').addEventListener('click', () => {
    const d = $('deck'), min = !d.classList.contains('min');
    d.classList.toggle('min', min);
    $('slate').hidden = min;
    $('toggle').textContent = min ? 'Controls' : 'Hide';
    press($('toggle'), !min);
  });
  if (params.get('ui') === '0') { $('deck').hidden = true; $('slate').hidden = true; $('toggle').hidden = true; }

  // --- start ------------------------------------------------------------------------------
  let following = false;
  const first = Math.max(0, SHOTS.findIndex((s) => s.id === params.get('shot')));
  applyShot(first, true);
  if (params.has('time')) atmo.hour = num('time', atmo.hour);
  if (params.has('weather')) atmo.setWeather(params.get('weather'), true);
  for (const k of ['yaw', 'pitch', 'dist']) if (params.has(k)) cam[k] = num(k, cam[k]);
  if (params.has('tx')) cam.target = [num('tx', 0), 0, num('tz', 0)];
  syncUI();
  $('boot').hidden = true;

  let last = performance.now(), frames = 0, fpsT = 0, fpsN = 0, slow = 0;
  const maxFrames = num('frames', 0);
  const warm = num('warm', TEST ? 1.5 : 0);
  function step(dt) {
    const s = SHOTS[state.shot];
    state.shotTime += dt;
    rider.update(dt, engine, particles);
    rider2.update(dt, engine, particles);
    weeds.update(dt, engine);
    fan.update(dt, engine);
    for (const fire of world.fires) emitFire(particles, fire, dt);
    // waterfall spray where the water lands
    if (Math.random() < dt * 40) {
      const a = Math.random() * 6.283;
      particles.emit(KIND.spray, f.x - f.dir[0] * 15 + Math.cos(a) * 3.5, f.bottom + 0.3, f.z - f.dir[1] * 15 + Math.sin(a) * 3.5, Math.cos(a) * 2.5, 2 + Math.random() * 4, Math.sin(a) * 2.5, 1 + Math.random() * 1.2, 1.2);
    }
    if (atmo.env.lightning > 0.5) {
      state.bolt -= dt;
      if (state.bolt <= 0) { strike(); state.bolt = 2.5 + Math.random() * 6; }
      if (state.second > 0) { state.second -= dt; if (state.second <= 0) atmo.flash = Math.max(atmo.flash, 1.1); }
    }
    // camera
    if (s.follow && !state.userCam) following = true;
    if (!s.follow && state.shotTime < dt * 1.5) following = false;
    if (following) {
      const p = rider.pos;
      const lead = engine.h > engine.w ? 0.2 : 2.5;
      cam.target[0] = p[0] + rider.heading[0] * lead; cam.target[2] = p[2] + rider.heading[1] * lead;
      if (!state.userCam) cam.yaw = s.yaw + Math.sin(state.shotTime * 0.11) * 0.45;
    } else if (!state.userCam) {
      cam.yaw += s.drift * dt;
    }
    const mv = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0), st = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    if (mv || st) { grab(); pan(-st * 14, mv * 14); }
    const wantY = s.y !== undefined && !state.userCam ? s.y : land.heightAt(cam.target[0], cam.target[2]) + (following ? 1.7 : 1.5);
    cam.target[1] = lerp(cam.target[1] || 0, wantY, state.shotTime < 0.1 ? 1 : Math.min(1, dt * 6));
    particles.update(dt, engine);
    if (state.auto && state.shotTime > 15 && !cutting) cutTo((state.shot + 1) % SHOTS.length);
    if (state.playDay) syncUI();
  }
  // let fires and dust settle before the first picture
  for (let t = 0; t < warm; t += 1 / 30) { engine.time += 1 / 30; step(1 / 30); }

  function tick(now) {
    if (window.__pause) { last = now; requestAnimationFrame(tick); return; } // lets tools take a still
    window.__frames = frames;
    const real = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dt = TEST ? 1 / 30 : real;
    step(dt);
    engine.render(dt);
    frames++;
    fpsT += real; fpsN++;
    if (fpsT > 0.5) {
      const fps = fpsN / fpsT;
      $('read').innerHTML = `${fps.toFixed(0)} fps<br>${(engine.stats.glyphs / 1000).toFixed(0)}k + ${(engine.stats.field / 1000).toFixed(0)}k glyphs<span class="wide"><br>${engine.w}&times;${engine.h}</span>`;
      // keep it fluid: shed resolution first, then glyph density
      if (!TEST && frames > 40) {
        slow = fps < 26 ? slow + 1 : 0;
        if (slow >= 4) {
          slow = 0;
          if (engine.opts.maxDpr > 1) { engine.opts.maxDpr = Math.max(1, engine.opts.maxDpr - 0.25); engine.w = 0; }
          else if (engine.opts.glyphPx < 11) { engine.opts.glyphPx += 1; engine.w = 0; $('px').value = engine.opts.glyphPx; }
        }
      }
      fpsT = 0; fpsN = 0;
    }
    if (TEST && frames >= maxFrames) {
      window.__stats = engine.stats;
      window.__done = true;
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

start().catch((e) => {
  console.error(e);
  window.__error = String((e && e.stack) || e);
  const line = document.getElementById('bootLine');
  const boot = document.getElementById('boot');
  if (boot) boot.hidden = false;
  if (line) line.textContent = 'This device could not start the engine: ' + ((e && e.message) || e);
});
