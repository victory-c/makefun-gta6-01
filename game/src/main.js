// SPDX-License-Identifier: MIT
// Sunline Heat — entry point: game loop, player control, save/load, title, screenshot scenes.
import { G, say } from './state.js';
import { generateCity, city, T, nodePos, solidPx, randomWalkPoint } from './city.js';
import { input, initInput, key, hit, endFrame } from './input.js';
import { initAudio, updateAudio, sfx } from './audio.js';
import { makePed, makeCar, driveCar, movePed, fire, updateParticles, WEAPONS } from './entities.js';
import { updateAI, spawnInitial, spawnParked, crime, setWanted, startTraffic } from './ai.js';
import { MISSIONS, startMission, failMission, missionTick, servicesTick, worldMarkers, SHOP } from './missions.js';
import { renderWorld } from './render.js';
import { buildMinimap, drawHUD, drawFullMap, drawPause, drawTitle, drawDeath, drawEnding, updateZone } from './hud.js';
import { setSeed, rand, rr, clamp, dist, lerp } from './util.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const SAVE_KEY = 'sunline-heat-save-v1';
const STEP = 1 / 60;
G.mouse = input;

function resize() {
  canvas.width = Math.max(960, innerWidth); canvas.height = Math.max(540, innerHeight);
  G.screen.w = canvas.width; G.screen.h = canvas.height;
}
addEventListener('resize', resize); resize();
initInput(canvas);
addEventListener('keydown', initAudio); addEventListener('mousedown', initAudio);

generateCity(7);
buildMinimap();

// ---------------- world setup ----------------
function resetWorld(seed) {
  setSeed(seed);
  G.cars = []; G.peds = []; G.tracers = []; G.particles = []; G.decals = []; G.skids = []; G.pickups = [];
  G.wanted = { level: 0, heat: 0, unseen: 0, flash: 0 }; G.msgs = []; G.dialog = null; G.banner = null; G.objective = null;
  G.story = { done: 0, active: null, stage: 0, timer: 0, data: {} };
  G.weapons = { fist: true, pistol: 0, smg: 0 }; G.weapon = 'fist'; G.arrestT = 0; G.endingT = 0;
}

function placePlayer(x, y) {
  const p = makePed('player', x, y, { shirt: '#ff3d7f' });
  p.hair = '#1a1a1a'; p.skin = '#c68642'; p.r = 7;
  G.player = p;
  return p;
}

function placePickups() {
  const kinds = [['health', 14], ['cash', 30], ['pistol', 6], ['armor', 4]];
  for (const [type, n] of kinds) for (let i = 0; i < n; i++) {
    const q = randomWalkPoint(50 * T, 47 * T, 100, 2300);
    if (q) G.pickups.push({ x: q.x, y: q.y, type, amount: type === 'cash' ? 100 : type === 'pistol' ? 24 : 0, static: true, respawn: 0 });
  }
}

function startGame(save) {
  resetWorld(save ? 99 : (Date.now() & 0xffff));
  const bus = city.landmarks.busstop.marker;
  const at = save ? { x: save.x, y: save.y } : bus;
  placePlayer(at.x, at.y);
  G.money = save ? save.money : 250; G.clock = save ? save.clock : 17 * 60;
  if (save) { G.story.done = save.done; G.weapons = { ...G.weapons, ...save.weapons }; G.stats = { ...G.stats, ...save.stats }; G.player.armor = save.armor || 0; }
  spawnParked(); spawnInitial(); placePickups();
  G.mode = 'play'; G.zone = '';
  if (!save) {
    // a parked car right at the bus stop so the first steal is easy
    const c = makeCar('compact', bus.x + 6, bus.y + 60, Math.PI / 2, { color: '#2a9d8f' }); c.parked = true;
    startMission(MISSIONS[0]);
  } else say('Welcome back to Sunline City.', '#9fe3d0');
}

function save(msg) {
  const P = G.player;
  const safe = city.landmarks.safehouse.marker;
  const data = { money: G.money, done: G.story.done, weapons: G.weapons, clock: G.clock, stats: G.stats, armor: P.armor, x: P.car ? safe.x : P.x, y: P.car ? safe.y : P.y };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); say(msg || 'Game saved', '#9fe3d0'); } catch { say('Could not save (storage blocked)', '#ff6b6b'); }
}
G.onSave = save;
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { return null; } }

// ---------------- player ----------------
function screenToWorld(sx, sy) { const z = G.cam.zoom; return [G.cam.x + (sx - G.screen.w / 2) / z, G.cam.y + (sy - G.screen.h / 2) / z]; }

function toggleCar() {
  const p = G.player;
  if (p.car) {
    const c = p.car;
    if (Math.hypot(c.vx, c.vy) > 140) { say('Too fast to bail out!'); return; }
    for (const side of [-1, 1]) {
      const ex = c.x + Math.sin(c.a) * side * 24, ey = c.y - Math.cos(c.a) * side * 24;
      if (!solidPx(ex, ey)) { p.x = ex; p.y = ey; break; }
    }
    c.driver = null; c.ai = null; p.car = null; sfx('door');
    return;
  }
  let best = null, bd = 1e9;
  for (const c of G.cars) {
    if (c.dead) continue;
    const d = dist(c.x, c.y, p.x, p.y);
    if (d < c.len / 2 + 26 && d < bd) { bd = d; best = c; }
  }
  if (!best) return;
  const c = best;
  if (c.driver) {
    const d = c.driver; d.car = null;
    d.x = c.x + Math.sin(c.a) * 26; d.y = c.y - Math.cos(c.a) * 26;
    if (solidPx(d.x, d.y)) { d.x = c.x - Math.sin(c.a) * 26; d.y = c.y + Math.cos(c.a) * 26; }
    if (d.role === 'civ') { d.state = 'flee'; d.fleeT = 10; d.fleeFrom = p; }
    if (c.type === 'police') { d.weapon = 'pistol'; crime(1.5, c.x, c.y); } else crime(0.75, c.x, c.y);
    say(c.type === 'police' ? 'You jacked a cop car!' : 'Carjacked!', '#ffd23f');
  } else if (!c.mission) crime(0.15, c.x, c.y);
  c.driver = p; c.ai = null; c.parked = false; p.car = c; G.stats.cars++; sfx('door');
  G.zoneT = 2.5;
}

function updatePlayer(dt) {
  const p = G.player;
  if (p.cool > 0) p.cool -= dt;
  const A = input.auto;
  if (hit('KeyQ') || hit('KeyE')) {
    const owned = ['fist', 'pistol', 'smg'].filter((w) => w === 'fist' || G.weapons[w] > 0);
    const i = owned.indexOf(G.weapon);
    G.weapon = owned[(i + (hit('KeyE') ? 1 : owned.length - 1)) % owned.length];
  }
  if (hit('KeyR')) { G.radio = !G.radio; say(G.radio ? 'Radio: Sunline FM 104.3' : 'Radio off'); }
  if (hit('KeyF')) toggleCar();
  if (G.shopOpen) for (const s of SHOP) if (hit(s.key)) {
    if (G.money >= s.cost) { G.money -= s.cost; s.buy(); sfx('cash'); say(`Bought ${s.label}`, '#7CFC9A'); if (s.key === 'Digit2') G.weapon = 'smg'; else if (s.key === 'Digit1') G.weapon = 'pistol'; }
    else say('Not enough cash', '#ff6b6b');
  }
  if (p.car) {
    const c = p.car;
    let thr = (key('KeyW') || key('ArrowUp') ? 1 : 0) - (key('KeyS') || key('ArrowDown') ? 1 : 0);
    let steer = (key('KeyD') || key('ArrowRight') ? 1 : 0) - (key('KeyA') || key('ArrowLeft') ? 1 : 0);
    let hb = key('Space');
    if (A) { thr = A.throttle ?? 0; steer = A.steer ? A.steer(c) : 0; hb = false; }
    driveCar(c, dt, thr, steer, hb);
    p.x = c.x; p.y = c.y; p.a = c.a;
    if (hit('KeyH')) { sfx('horn'); c.honk = 0.4; for (const q of G.peds) if (q.role === 'civ' && dist(q.x, q.y, c.x, c.y) < 120) { q.state = 'flee'; q.fleeT = 3; q.fleeFrom = p; } }
    if (c.dead) { p.car = null; c.driver = null; }
    return;
  }
  let [wx, wy] = screenToWorld(input.mx, input.my);
  if (A && A.aim) [wx, wy] = A.aim();
  p.a = Math.atan2(wy - p.y, wx - p.x);
  let mx = (key('KeyD') || key('ArrowRight') ? 1 : 0) - (key('KeyA') || key('ArrowLeft') ? 1 : 0);
  let my = (key('KeyS') || key('ArrowDown') ? 1 : 0) - (key('KeyW') || key('ArrowUp') ? 1 : 0);
  if (A && A.move) [mx, my] = A.move;
  const len = Math.hypot(mx, my) || 1, sp = key('ShiftLeft') || key('ShiftRight') ? 175 : 105;
  p.vx += ((mx / len) * sp - p.vx) * Math.min(1, dt * 12);
  p.vy += ((my / len) * sp - p.vy) * Math.min(1, dt * 12);
  movePed(p, p.vx * dt, p.vy * dt);
  p.walk += Math.hypot(p.vx, p.vy) * dt * 0.12;
  if ((input.mouseDown && G.mode === 'play') || (A && A.fire)) fire(p, p.a);
}

function updatePickups(dt) {
  const p = G.player, P = p.car || p;
  for (const k of G.pickups) {
    if (k.hide) { k.respawn -= dt; if (k.respawn <= 0) k.hide = false; continue; }
    if (!k.static) { k.t -= dt; if (k.t <= 0) { k.dead = true; continue; } }
    if (dist(k.x, k.y, P.x, P.y) > (p.car ? 30 : 20)) continue;
    if (k.type === 'health' && p.hp >= 100) continue;
    if (k.type === 'cash') { G.money += k.amount; sfx('cash'); }
    else if (k.type === 'health') { p.hp = 100; sfx('pickup'); say('Health restored', '#ff8fa3'); }
    else if (k.type === 'armor') { p.armor = 100; sfx('pickup'); say('Body armor', '#4dabf7'); }
    else { G.weapons[k.type] += k.amount || 24; if (G.weapon === 'fist') G.weapon = k.type; sfx('pickup'); say(`${WEAPONS[k.type].name} ammo +${k.amount || 24}`, '#ffd23f'); }
    if (k.static) { k.hide = true; k.respawn = 60; } else k.dead = true;
  }
  G.pickups = G.pickups.filter((k) => !k.dead);
}

function updateCamera(dt, snap) {
  const P = G.player.car || G.player;
  const vx = P.vx || 0, vy = P.vy || 0, sp = Math.hypot(vx, vy);
  const tx = P.x + vx * 0.45, ty = P.y + vy * 0.45;
  const tz = G.player.car ? lerp(1.05, 0.72, clamp(sp / 480, 0, 1)) : 1.15;
  const k = snap ? 1 : Math.min(1, dt * 4);
  G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k; G.cam.zoom += (tz - G.cam.zoom) * (snap ? 1 : Math.min(1, dt * 1.5));
  G.shake = Math.max(0, G.shake - dt * 30);
}

function respawn(kind) {
  const p = G.player;
  const at = city.landmarks[kind === 'wasted' ? 'hospital' : 'police'].marker;
  if (p.car) { p.car.driver = null; p.car = null; }
  p.dead = false; p.hp = 100; p.x = at.x; p.y = at.y + 10; p.vx = p.vy = 0;
  G.money = Math.max(0, G.money - 200);
  if (kind === 'busted') { G.weapons.pistol = 0; G.weapons.smg = 0; G.weapon = 'fist'; p.armor = 0; }
  setWanted(0); G.arrestT = 0;
  for (const q of G.peds) if (q.role === 'cop' && !q.car) q.gone = true;
  G.peds = G.peds.filter((q) => !q.gone);
  G.mode = 'play';
  updateCamera(0, true);
}

// ---------------- ticks ----------------
let titleSel = 0, titleSave = null;
function worldTick(dt) {
  G.t += dt; G.clock = (G.clock + dt) % 1440;
  updateAI(dt);
  updateParticles(dt);
  for (const m of G.msgs) m.t -= dt;
  G.msgs = G.msgs.filter((m) => m.t > 0);
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
}

function playTick(dt) {
  if (hit('Escape') || hit('KeyP')) { G.mode = 'pause'; return; }
  if (hit('KeyM')) { G.mode = 'map'; return; }
  if (G.dialog) {
    G.dialog.t += dt;
    if (hit('Enter') || hit('NumpadEnter') || G.dialog.t > 6) { G.dialog.i++; G.dialog.t = 0; if (G.dialog.i >= G.dialog.lines.length) G.dialog = null; }
  }
  updatePlayer(dt);
  worldTick(dt);
  missionTick(dt);
  servicesTick(dt);
  updatePickups(dt);
  updateZone(dt);
  updateCamera(dt);
  if (G.shot) { G.player.hp = Math.max(G.player.hp, 70); G.player.dead = false; }
  if (G.player.dead) { G.mode = 'wasted'; G.deadT = 0; G.stats.wasted++; if (G.story.active) failMission('You were wasted.'); sfx('fail'); }
  else if (G.mode === 'busted') { G.deadT = 0; G.stats.busted++; if (G.story.active) failMission('You were busted.'); sfx('fail'); }
  if (G.endingT > 0) G.endingT -= dt;
}

function titleTick(dt) {
  const items = titleSave ? ['continue', 'new'] : ['new'];
  if (hit('ArrowUp') || hit('KeyW')) titleSel = (titleSel + items.length - 1) % items.length;
  if (hit('ArrowDown') || hit('KeyS')) titleSel = (titleSel + 1) % items.length;
  // ambient city behind the title: a slow fly-over of Ocean Drive
  G.player.x = 13 * T + Math.sin(G.t * 0.05) * 200; G.player.y = (30 + ((G.t * 1.3) % 50)) * T;
  G.cam.x = G.player.x + 260; G.cam.y = G.player.y; G.cam.zoom = 0.9;
  worldTick(dt);
  if (hit('Enter') || hit('Space') || input.clicked) {
    initAudio();
    if (items[titleSel] === 'continue') startGame(titleSave); else startGame(null);
    updateCamera(0, true);
  }
}

function tick(dt) {
  switch (G.mode) {
    case 'title': titleTick(dt); break;
    case 'play': playTick(dt); break;
    case 'pause':
      if (hit('Escape') || hit('KeyP')) G.mode = 'play';
      if (hit('KeyS')) save('Game saved');
      if (hit('KeyM')) G.mode = 'map';
      break;
    case 'map': if (hit('KeyM') || hit('Escape')) G.mode = 'play'; break;
    case 'wasted': case 'busted':
      G.deadT += dt; worldTick(dt * 0.4); updateCamera(dt);
      if (G.deadT > 4.5 || (G.deadT > 1.5 && hit('Enter'))) respawn(G.mode);
      break;
  }
  const P = G.player;
  let siren = 0;
  if (G.wanted.level) for (const c of G.cars) if (c.type === 'police' && c.siren) siren = Math.max(siren, 1 - dist(c.x, c.y, P.x, P.y) / 900);
  updateAudio({ inCar: !!(P && P.car) && G.mode === 'play', speed: P && P.car ? clamp(Math.abs(P.car.fwd) / P.car.t.max, 0, 1) : 0, siren, radio: G.radio });
}

function draw() {
  const markers = G.mode === 'title' ? [] : worldMarkers();
  renderWorld(ctx, markers);
  if (G.mode === 'title') {
    ctx.filter = 'blur(3px) saturate(1.25)'; ctx.drawImage(canvas, 0, 0); ctx.filter = 'none';
    drawTitle(ctx, !!titleSave, titleSel); return;
  }
  drawHUD(ctx, markers);
  if (G.mode === 'map') drawFullMap(ctx, markers);
  if (G.mode === 'pause') drawPause(ctx);
  if (G.mode === 'wasted' || G.mode === 'busted') drawDeath(ctx, G.mode);
  if (G.endingT > 0) drawEnding(ctx);
}

// ---------------- screenshot scenes (?shot=name) ----------------
function laneFollow(y) { return (c) => clamp((y - c.y) * 0.012 - Math.sin(c.a) * 2.5, -1, 1); }
const SHOTS = {
  chase() {
    startGame(null); G.dialog = null; G.banner = null;
    G.clock = 18.35 * 60; G.money = 48210; G.story.done = 4; startMission(MISSIONS[4]); G.dialog = null; G.banner = null; G.story.stage = 1;
    const n = nodePos(2, 4), y = n.y + 20;
    const car = makeCar('sports', n.x + 120, y, 0, { color: '#ff006e' }); car.vx = 380;
    G.player.car = car; car.driver = G.player; G.weapons.pistol = 64; G.weapon = 'pistol';
    setWanted(3); G.wanted.flash = 0;
    for (const [dx, dy] of [[-120, -36], [-220, 4], [-330, -30]]) {
      const c = makeCar('police', car.x + dx, y + dy, 0); c.vx = 380; c.driver = makePed('cop', c.x, c.y); c.driver.car = c;
      c.ai = { mode: 'chase', cop: true, stuck: 0, rev: 0 };
    }
    input.auto = { throttle: 1, steer: laneFollow(y) };
    return 100;
  },
  shootout() {
    startGame(null); G.dialog = null; G.banner = null;
    G.clock = 16.9 * 60; G.money = 6420; G.story.done = 3; startMission(MISSIONS[3]); G.dialog = null; G.banner = null;
    const P = G.player; P.x = 8.3 * T; P.y = 66 * T; P.armor = 60;
    for (const g of G.story.data.gang) g.hostile = true;
    setWanted(1); G.wanted.flash = 0;
    const target = () => { const g = G.story.data.gang.filter((q) => !q.dead).sort((a, b) => dist(a.x, a.y, P.x, P.y) - dist(b.x, b.y, P.x, P.y))[0]; return g ? [g.x, g.y] : [P.x, P.y - 100]; };
    input.auto = { aim: target, fire: true, move: [0, -0.3] };
    return 70;
  },
  night() {
    startGame(null); G.dialog = null; G.banner = null;
    G.clock = 21.2 * 60; G.money = 12950; G.story.done = 5; startMission(MISSIONS[5]);
    G.dialog.i = 0; G.banner = null;
    const n = nodePos(5, 4);
    const car = makeCar('sedan', n.x - 140, n.y + 20, 0, { color: '#00b4d8' }); car.vx = 200;
    G.player.car = car; car.driver = G.player;
    input.auto = { throttle: 0.55, steer: laneFollow(n.y + 20) };
    return 50;
  },
  soak() { // not a screenshot: a long automated drive with the police after you, to catch runtime errors
    startGame(null); G.dialog = null; setWanted(4);
    const c = makeCar('sports', G.player.x + 30, G.player.y + 100, Math.PI / 2); G.player.car = c; c.driver = G.player;
    input.auto = { throttle: 1, steer: () => Math.sin(G.t * 0.6) * 0.8 };
    setTimeout(() => { document.title = JSON.stringify({ t: G.t.toFixed(0), mode: G.mode, cars: G.cars.length, peds: G.peds.length, cops: G.cars.filter((q) => q.type === 'police').length, stars: G.wanted.level, hp: Math.round(G.player.hp), parts: G.particles.length }); }, 0);
    return 3600;
  },
  title() {
    resetWorld(5); placePlayer(13 * T, 40 * T); G.player.hidden = true; spawnParked(); spawnInitial();
    G.clock = 18.9 * 60; G.mode = 'title'; titleSave = null;
    return 90;
  },
};

function runShot(name) {
  const scene = SHOTS[name] || SHOTS.chase;
  const steps = scene();
  updateCamera(0, true);
  for (let i = 0; i < steps; i++) { tick(STEP); endFrame(); }
  if (G.mode === 'play') updateCamera(0, true);
  G.zoneT = 0;
  draw();
  window.__shotReady = true;
}

// ---------------- boot ----------------
G.shot = new URLSearchParams(location.search).get('shot');
if (G.shot) {
  runShot(G.shot);
} else {
  titleSave = loadSave();
  SHOTS.title(); titleSave = loadSave();
  let last = performance.now(), acc = 0;
  const frame = (now) => {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    let ticked = false;
    while (acc >= STEP) { tick(STEP); acc -= STEP; if (!ticked) { endFrame(); ticked = true; } }
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
window.G = G; // handy for debugging in the console
