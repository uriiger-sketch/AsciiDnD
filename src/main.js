// SUNDOWN: boots the engine and the world once, then runs the title, the game, or the tour.

import { Engine } from './engine/engine.js';
import { EntityLayer } from './engine/batch.js';
import { TextLayer } from './engine/text.js';
import { Particles, Weather, KIND, emitFire } from './engine/particles.js';
import { generateLand, POOL } from './world/land.js';
import { buildWorld, PLACES } from './world/world.js';
import { Tumbleweeds, WindmillFan } from './world/actors.js';
import { Tour, SHOTS } from './tour.js';
import { Game, hasSave } from './game/game.js';
import { Signs } from './game/signs.js';
import { chapter1 } from './game/chapter1.js';
import { makeSfx } from './game/sfx.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) ? parseFloat(params.get(k)) : d);
const TEST = params.has('test');
const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function start() {
  const canvas = $('view'), bootLine = $('bootLine');
  const say = async (t) => { if (bootLine) bootLine.textContent = t; await nextFrame(); };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const engine = new Engine(canvas, { glyphPx: num('px', coarse ? 8 : 9), maxDpr: num('dpr', coarse ? 1.75 : 2) });
  $('px').value = engine.opts.glyphPx;
  const gl = engine.gl;

  await say('raising the land');
  const land = generateLand();
  await say('typesetting the town');
  const world = buildWorld(gl, land);
  engine.init(land);
  await say('waking the townsfolk');
  const tBoot = performance.now();

  const entities = new EntityLayer(gl);
  const particles = new Particles(gl, 7000);
  const weather = new Weather(gl);
  const text = new TextLayer(gl);
  const f = land.falls;
  weather.falls = { x: f.x, y: f.top - 1.0, z: f.z, bottom: f.bottom, dir: f.dir, width: 10 };
  weather.fireflies = { x: POOL.x - 10, z: POOL.z + 60, r: 150 };
  const weeds = new Tumbleweeds(gl, entities, 9);
  const fan = new WindmillFan(gl, entities, PLACES.windmill[0], land.heightAt(PLACES.windmill[0], PLACES.windmill[1]) + 9.5, PLACES.windmill[1]);
  engine.lights.push(...world.lights);
  engine.layers.push(world.mesh, world.statics, entities, text, particles, weather);
  window.engine = engine;

  const sfx = makeSfx();
  const game = new Game({ engine, land, world, entities, particles, weather, text, sfx });
  const chapter = chapter1(game);
  const tourSigns = new Signs(world.signs); // the tour and the title always show the town whole
  let mode = 'title';
  const tour = new Tour({ engine, land, entities, particles, onLeave: () => toTitle() });
  window.__game = game;
  console.log(`cast ${(performance.now() - tBoot).toFixed(0)} ms`);

  // ---- moving between the title, the game and the tour ----
  const fade = $('fade');
  async function dip(fn) {
    fade.classList.add('on');
    await wait(TEST ? 0 : 620);
    await fn();
    await nextFrame();
    fade.classList.remove('on');
  }
  function toTitle() {
    return dip(async () => {
      game.stop();
      chapter.leave && chapter.leave();
      tour.stop();
      mode = 'title';
      tour.start(false, 0);
      $('tContinue').hidden = !hasSave();
      $('tBegin').dataset.armed = ''; $('tBegin').textContent = 'BEGIN';
      $('title').hidden = false;
    });
  }
  async function toGame(fresh) {
    sfx('word');
    await dip(async () => {
      $('title').hidden = true;
      tour.stop();
      mode = 'game';
      if (fresh) game.clearSave();
      game.begin(chapter, fresh);
    });
    if (fresh && !game.ui.auto) {
      game.ui.show(false);
      await game.ui.card({ kick: 'Chapter one', title: 'NOBODY', lines: 'You came in off the desert at first light.\nNo horse. No hat.\nNot one letter to your name.', buttons: ['WALK INTO TOWN'] });
      game.ui.show(true);
      game.toast('Tap the ground to walk. Drag to look around.');
    }
  }
  function toTour() {
    return dip(async () => {
      $('title').hidden = true;
      mode = 'tour';
      tour.start(true, 0);
    });
  }
  game.onQuit = () => toTitle();
  $('tBegin').addEventListener('click', () => {
    const b = $('tBegin');
    if (hasSave() && b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'ERASE AND BEGIN AGAIN?'; return; }
    b.dataset.armed = ''; b.textContent = 'BEGIN';
    toGame(true);
  });
  $('tContinue').addEventListener('click', () => toGame(false));
  $('tTour').addEventListener('click', () => toTour());

  // ---- start ----
  const shotParam = SHOTS.findIndex((s) => s.id === params.get('shot'));
  if (shotParam >= 0 || params.get('ui') === '0') {
    mode = 'tour';
    tour.start(params.get('ui') !== '0', Math.max(0, shotParam));
    tour.setAuto(false);
    if (params.get('ui') === '0') { $('slate').hidden = true; $('deck').hidden = true; $('toggle').hidden = true; }
  } else {
    tour.start(false, 0);
    $('tContinue').hidden = !hasSave();
    $('title').hidden = false;
  }
  const cam = engine.cam, atmo = engine.atmo;
  if (params.has('time')) atmo.hour = num('time', atmo.hour);
  if (params.has('weather')) atmo.setWeather(params.get('weather'), true);
  for (const k of ['yaw', 'pitch', 'dist']) if (params.has(k)) cam[k] = num(k, cam[k]);
  if (params.has('tx')) cam.target = [num('tx', 0), 0, num('tz', 0)];
  $('boot').hidden = true;

  // ---- the frame ----
  function step(dt) {
    weeds.update(dt, engine);
    fan.update(dt, engine);
    for (const fire of world.fires) emitFire(particles, fire, dt);
    if (Math.random() < dt * 40) {
      const a = Math.random() * 6.283;
      particles.emit(KIND.spray, f.x - f.dir[0] * 15 + Math.cos(a) * 3.5, f.bottom + 0.3, f.z - f.dir[1] * 15 + Math.sin(a) * 3.5, Math.cos(a) * 2.5, 2 + Math.random() * 4, Math.sin(a) * 2.5, 1 + Math.random() * 1.2, 1.2);
    }
    if (mode === 'game') game.update(dt);
    else {
      tour.update(dt);
      text.begin(cam);
      tourSigns.draw(text, dt);
      text.flush();
    }
    particles.update(dt, engine);
  }
  window.__step = (dt, n = 1) => { for (let i = 0; i < n; i++) { engine.time += dt; step(dt); } };
  const warm = num('warm', TEST ? 1.5 : 0);
  for (let t = 0; t < warm; t += 1 / 30) { engine.time += 1 / 30; step(1 / 30); }

  let last = performance.now(), frames = 0, fpsT = 0, fpsN = 0, slow = 0;
  const maxFrames = num('frames', 0);
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
    if (TEST && maxFrames && frames >= maxFrames) {
      window.__stats = engine.stats;
      window.__done = true;
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  // keep progress if the page is put away
  addEventListener('pagehide', () => { if (mode === 'game') game.save(); });
  window.__mode = { toGame, toTitle, toTour, get: () => mode };
}

start().catch((e) => {
  console.error(e);
  window.__error = String((e && e.stack) || e);
  const line = document.getElementById('bootLine');
  const boot = document.getElementById('boot');
  if (boot) boot.hidden = false;
  if (line) line.textContent = 'This device could not start the engine: ' + ((e && e.message) || e);
});
