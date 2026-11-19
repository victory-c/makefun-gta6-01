// SPDX-License-Identifier: MIT
// Traffic, pedestrians, police and gangs, plus the wanted level that drives the police.
import { G, say } from './state.js';
import { city, T, TILE, NODE_I, NODE_J, nodePos, nearestNode, tileAtPx, randomWalkPoint, solidPx } from './city.js';
import { makeCar, makePed, driveCar, movePed, fire, hooks, updateCarCommon, collideCars } from './entities.js';
import { rand, rr, pick, chance, clamp, dist, angDiff } from './util.js';
import { sfx } from './audio.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const LANE = 20;
const validNode = (i, j) => i >= NODE_I[0] && i <= NODE_I[1] && j >= NODE_J[0] && j <= NODE_J[1];

// ---------------- wanted level ----------------
export function crime(amount, x, y) {
  if (G.mode !== 'play' || amount <= 0) return;
  const before = G.wanted.level;
  G.wanted.heat = Math.min(5.4, G.wanted.heat + amount);
  G.wanted.level = Math.max(G.wanted.level, Math.min(5, Math.floor(G.wanted.heat + 0.3)));
  if (G.wanted.level > before) { G.wanted.flash = 2; G.wanted.unseen = 0; sfx('star'); }
}
export function setWanted(level) {
  G.wanted.level = level; G.wanted.heat = level; G.wanted.unseen = 0; G.wanted.flash = level ? 2 : 0;
}
hooks.crime = crime;
hooks.killed = (p, by) => {
  if (by !== G.player || p === G.player) return;
  G.stats.kills++;
  crime(p.role === 'cop' ? 1.5 : p.role === 'civ' ? 1 : 0.3, p.x, p.y);
};

function updateWanted(dt) {
  const w = G.wanted;
  if (w.flash > 0) w.flash -= dt;
  if (w.level === 0) { w.heat = Math.max(0, w.heat - dt * 0.05); return; }
  const pl = G.player;
  let seen = false;
  for (const c of G.cars) if (c.type === 'police' && !c.dead && dist(c.x, c.y, pl.x, pl.y) < 420) { seen = true; break; }
  if (!seen) for (const p of G.peds) if (p.role === 'cop' && !p.dead && dist(p.x, p.y, pl.x, pl.y) < 360) { seen = true; break; }
  if (seen) w.unseen = 0; else w.unseen += dt;
  if (w.unseen > 7 + w.level * 2.5) {
    w.level--; w.heat = w.level; w.unseen = 0; w.flash = 1.2;
    if (w.level === 0) say('You lost the cops.', '#9fe3d0');
  }
}

// ---------------- traffic ----------------
function laneTarget(node, d) { const p = nodePos(node.i, node.j); return { x: p.x - d[1] * LANE, y: p.y + d[0] * LANE }; }

export function startTraffic(c, i, j, d) {
  c.ai = { mode: 'traffic', from: { i, j }, to: { i: i + d[0], j: j + d[1] }, d, stuck: 0, rev: 0, angry: 0, cruise: rr(150, 210) };
}

function pickNext(ai) {
  const opts = [];
  for (const d of DIRS) {
    if (d[0] === -ai.d[0] && d[1] === -ai.d[1]) continue;
    const n = { i: ai.to.i + d[0], j: ai.to.j + d[1] };
    if (!validNode(n.i, n.j)) continue;
    const straight = d[0] === ai.d[0] && d[1] === ai.d[1];
    opts.push(d); if (straight) opts.push(d, d);
  }
  const d = opts.length ? pick(opts) : [-ai.d[0], -ai.d[1]];
  ai.from = ai.to; ai.to = { i: ai.to.i + d[0], j: ai.to.j + d[1] }; ai.d = d;
}

function blockedAhead(c, range) {
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  for (const o of G.cars) {
    if (o === c) continue;
    const dx = o.x - c.x, dy = o.y - c.y;
    const along = dx * fx + dy * fy;
    if (along <= 0 || along > range) continue;
    if (Math.abs(-dx * fy + dy * fx) >= 18) continue;
    // cross traffic only blocks when it is right in front of the bumper
    const facing = Math.cos(o.a) * fx + Math.sin(o.a) * fy;
    if (Math.abs(facing) < 0.5 && along > c.len / 2 + 22) continue;
    return o;
  }
  for (const p of G.peds) {
    if (p.dead || p.car) continue;
    const dx = p.x - c.x, dy = p.y - c.y, along = dx * fx + dy * fy;
    if (along > 0 && along < 55 && Math.abs(-dx * fy + dy * fx) < 14) return p;
  }
  return null;
}

function steerTo(c, tx, ty) { return clamp(angDiff(c.a, Math.atan2(ty - c.y, tx - c.x)) * 2.2, -1, 1); }

function unstick(c, dt, wantMove) {
  const ai = c.ai;
  if (ai.rev > 0) { ai.rev -= dt; driveCar(c, dt, -0.8, ai.revSteer, false); return true; }
  if (wantMove && Math.abs(c.fwd) < 18) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt);
  if (ai.stuck > 1.4) { ai.stuck = 0; ai.rev = 0.9; ai.revSteer = chance(0.5) ? 1 : -1; }
  return false;
}

function updateTraffic(c, dt) {
  const ai = c.ai;
  const A = laneTarget(ai.from, ai.d), B = laneTarget(ai.to, ai.d);
  const sx = B.x - A.x, sy = B.y - A.y, L = Math.hypot(sx, sy) || 1;
  const t = ((c.x - A.x) * sx + (c.y - A.y) * sy) / (L * L);
  if (t > 1 - 26 / L || dist(c.x, c.y, B.x, B.y) < 26) { pickNext(ai); return; }
  const look = Math.min(1, t + 70 / L);
  const tx = A.x + sx * look, ty = A.y + sy * look;
  let want = ai.angry > 0 ? ai.cruise * 1.6 : ai.cruise;
  if ((1 - t) * L < 90) want = Math.min(want, 110);
  let block = blockedAhead(c, 75);
  // impatience: after waiting a while, nose forward anyway (breaks intersection gridlock)
  if (block && !(block === G.player || block.driver === G.player)) { ai.wait = (ai.wait || 0) + dt; if (ai.wait > 2.5 && ai.wait < 4) block = null; if (ai.wait >= 4) ai.wait = 0; }
  else if (!block) ai.wait = 0;
  if (block) {
    want = 0;
    if (block === G.player || block.driver === G.player) { if (chance(0.01)) { c.honk = 0.5; sfx('horn', 0.4); } }
  }
  if (ai.angry > 0) ai.angry -= dt;
  if (unstick(c, dt, want > 0 && !block)) return;
  const throttle = clamp((want - c.fwd) / 60, -1, 1);
  driveCar(c, dt, throttle, steerTo(c, tx, ty), false);
}

// ---------------- police ----------------
function updateCop(c, dt) {
  const ai = c.ai, pl = G.player;
  if (G.wanted.level === 0) { c.siren = false; if (ai.mode !== 'traffic') { const n = nearestNode(c.x, c.y); startTraffic(c, n.i, n.j, pick(DIRS)); ai.cop = true; } return updateTraffic(c, dt); }
  c.siren = true;
  ai.mode = 'chase';
  const tx = pl.car ? pl.car.x : pl.x, ty = pl.car ? pl.car.y : pl.y;
  const d = dist(c.x, c.y, tx, ty);
  if (unstick(c, dt, true)) return;
  if (!pl.car && d < 110) {
    driveCar(c, dt, -1, 0, true);
    if (Math.abs(c.fwd) < 30 && !ai.deployed) {
      ai.deployed = true;
      for (const side of [-1, 1]) {
        const ex = c.x - Math.sin(c.a) * side * 20, ey = c.y + Math.cos(c.a) * side * 20;
        if (!solidPx(ex, ey)) makePed('cop', ex, ey, { weapon: 'pistol' });
      }
    }
    return;
  }
  if (d > 70) ai.deployed = false;
  let gx = tx, gy = ty;
  if (d > 280) {
    // follow the road grid greedily toward the player
    if (!ai.goal || dist(c.x, c.y, ai.goal.x, ai.goal.y) < 50) {
      const n = nearestNode(c.x, c.y);
      let best = null, bd = 1e9;
      for (const dd of [[0, 0], ...DIRS]) {
        const ni = n.i + dd[0], nj = n.j + dd[1];
        if (!validNode(ni, nj)) continue;
        const p = nodePos(ni, nj);
        if (dist(c.x, c.y, p.x, p.y) < 60) continue;
        const score = dist(p.x, p.y, tx, ty);
        if (score < bd) { bd = score; best = p; }
      }
      ai.goal = best;
    }
    if (ai.goal) { gx = ai.goal.x; gy = ai.goal.y; }
  } else ai.goal = null;
  const steer = steerTo(c, gx, gy);
  const turnHard = Math.abs(angDiff(c.a, Math.atan2(gy - c.y, gx - c.x))) > 1.2;
  const throttle = turnHard && c.fwd > 160 ? -0.6 : 1;
  driveCar(c, dt, throttle * (G.wanted.level >= 3 ? 1 : 0.85), steer, turnHard && c.fwd > 200);
}

function updateCopOnFoot(p, dt) {
  const pl = G.player;
  const tx = pl.car ? pl.car.x : pl.x, ty = pl.car ? pl.car.y : pl.y;
  const d = dist(p.x, p.y, tx, ty);
  if (G.wanted.level === 0) { wander(p, dt, 40); return; }
  p.a = Math.atan2(ty - p.y, tx - p.x);
  if (G.wanted.level >= 2 && d < 330 && d > 40) {
    p.cool -= dt;
    if (p.cool <= 0) { fire(p, p.a + rr(-0.12, 0.12)); p.cool = rr(0.6, 1.2) / (G.wanted.level >= 4 ? 1.6 : 1); }
    if (d > 160) stepPed(p, Math.cos(p.a), Math.sin(p.a), 95, dt);
  } else if (d > 14) stepPed(p, Math.cos(p.a), Math.sin(p.a), 115, dt);
  // arrest: a cop holding a slow or on-foot player at 1-2 stars
  const slow = !pl.car || Math.hypot(pl.car.vx, pl.car.vy) < 30;
  if (G.wanted.level <= 2 && d < (pl.car ? 34 : 18) && slow) { G.arrestT += dt; if (G.arrestT > 1.3) G.mode = 'busted'; }
}

// ---------------- pedestrians & gangs ----------------
const PED_OK = new Set([TILE.WALK, TILE.PLAZA, TILE.PARK, TILE.SAND, TILE.DOCK]);
function stepPed(p, dx, dy, speed, dt) {
  p.vx += (dx * speed - p.vx) * Math.min(1, dt * 8);
  p.vy += (dy * speed - p.vy) * Math.min(1, dt * 8);
  movePed(p, p.vx * dt, p.vy * dt);
  p.walk += Math.hypot(p.vx, p.vy) * dt * 0.12;
}
function wander(p, dt, speed) {
  const nx = p.x + Math.cos(p.a) * 14, ny = p.y + Math.sin(p.a) * 14;
  if (!PED_OK.has(tileAtPx(nx, ny)) || chance(dt * 0.15)) {
    // turn to a walkable direction (prefer 90-degree turns, as on sidewalks)
    const base = Math.round(p.a / (Math.PI / 2)) * (Math.PI / 2);
    const opts = [base + Math.PI / 2, base - Math.PI / 2, base + Math.PI, base].sort(() => rand() - 0.5);
    for (const a of opts) if (PED_OK.has(tileAtPx(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16))) { p.a = a; break; }
  }
  stepPed(p, Math.cos(p.a), Math.sin(p.a), speed, dt);
}

function updatePed(p, dt) {
  if (p.dead) { p.deadT += dt; p.vx *= 1 - 5 * dt; p.vy *= 1 - 5 * dt; movePed(p, p.vx * dt, p.vy * dt); return; }
  if (p.cool > 0 && p.role !== 'cop') p.cool -= dt;
  if (p.role === 'cop') return updateCopOnFoot(p, dt);
  const pl = G.player;
  if (p.role === 'gang') {
    const d = dist(p.x, p.y, pl.x, pl.y);
    if (p.hostile && d < 380 && !pl.dead) {
      p.a = Math.atan2(pl.y - p.y, pl.x - p.x);
      if (p.weapon) { if (d > 120) stepPed(p, Math.cos(p.a), Math.sin(p.a), 70, dt); else stepPed(p, -Math.sin(p.a), Math.cos(p.a), 60, dt); if (p.cool <= 0) { fire(p, p.a + rr(-0.15, 0.15)); p.cool = rr(0.7, 1.3); } }
      else if (d > 16) stepPed(p, Math.cos(p.a), Math.sin(p.a), 120, dt); else if (p.cool <= 0) fire(p, p.a);
      return;
    }
    if (p.home && dist(p.x, p.y, p.home.x, p.home.y) > 60) { p.a = Math.atan2(p.home.y - p.y, p.home.x - p.x); stepPed(p, Math.cos(p.a), Math.sin(p.a), 40, dt); }
    else { stepPed(p, 0, 0, 0, dt); if (chance(dt * 0.4)) p.a += rr(-1, 1); }
    return;
  }
  if (p.state === 'flee') {
    p.fleeT -= dt;
    const f = p.fleeFrom || pl;
    const a = Math.atan2(p.y - f.y, p.x - f.x) + Math.sin(G.t * 3 + p.id * 9) * 0.5;
    p.a = a; stepPed(p, Math.cos(a), Math.sin(a), 125, dt);
    if (p.fleeT <= 0) p.state = 'walk';
    return;
  }
  wander(p, dt, p.speed || 38);
}

// ---------------- spawning ----------------
const CIV_TYPES = ['compact', 'compact', 'sedan', 'sedan', 'sedan', 'taxi', 'van', 'sports'];
function spawnTrafficAt(i, j, type, d) {
  d = d || pick(DIRS.filter((dd) => validNode(i + dd[0], j + dd[1])));
  const p = laneTarget({ i, j }, d), q = nodePos(i + d[0], j + d[1]);
  const f = rr(0.25, 0.75);
  const x = p.x + (q.x - d[1] * LANE - p.x) * f, y = p.y + (q.y + d[0] * LANE - p.y) * f;
  for (const o of G.cars) if (dist(o.x, o.y, x, y) < 60) return null;
  const c = makeCar(type, x, y, Math.atan2(d[1], d[0]));
  startTraffic(c, i, j, d);
  const sp = c.ai.cruise * 0.7; c.vx = Math.cos(c.a) * sp; c.vy = Math.sin(c.a) * sp;
  if (type === 'police') { c.ai.cop = true; c.driver = makePed('cop', x, y); c.driver.car = c; }
  else { c.driver = makePed('civ', x, y); c.driver.car = c; }
  return c;
}

function randomNodeNear(x, y, rMin, rMax) {
  for (let k = 0; k < 20; k++) {
    const i = Math.floor(rr(NODE_I[0], NODE_I[1] + 1)), j = Math.floor(rr(NODE_J[0], NODE_J[1] + 1));
    const p = nodePos(i, j), d = dist(p.x, p.y, x, y);
    if (d >= rMin && d <= rMax) return { i, j };
  }
  return null;
}

export function spawnParked() {
  for (const l of city.lots) {
    if (!chance(0.8)) continue;
    const vertical = l.h > l.w;
    const c = makeCar(pick(CIV_TYPES), (l.x + l.w / 2) * T, (l.y + l.h / 2) * T, vertical ? Math.PI / 2 : 0);
    c.parked = true;
  }
}

function populate(dt) {
  const pl = G.player;
  const px = pl.car ? pl.car.x : pl.x, py = pl.car ? pl.car.y : pl.y;
  const far = 1700;
  // despawn
  for (const c of G.cars) {
    if (c === pl.car || c.mission || c.parked) continue;
    if (dist(c.x, c.y, px, py) > far) { c.gone = true; if (c.driver) c.driver.gone = true; }
  }
  for (const p of G.peds) {
    if (p === pl || p.mission || p.car) continue;
    const d = dist(p.x, p.y, px, py);
    if (d > 1400 || (p.dead && p.deadT > 25)) p.gone = true;
  }
  G.cars = G.cars.filter((c) => !c.gone);
  G.peds = G.peds.filter((p) => !p.gone);
  // traffic
  let traffic = 0, cops = 0;
  for (const c of G.cars) if (c.ai && !c.dead) { if (c.type === 'police') cops++; else traffic++; }
  if (traffic < 24 && chance(dt * 6)) {
    const n = randomNodeNear(px, py, 750, 1350);
    if (n) spawnTrafficAt(n.i, n.j, pick(CIV_TYPES));
  }
  const wantCops = [1, 2, 3, 4, 5, 7][G.wanted.level];
  if (cops < wantCops && chance(dt * (G.wanted.level ? 1.5 : 0.3))) {
    const n = randomNodeNear(px, py, 650, 1100);
    if (n) spawnTrafficAt(n.i, n.j, 'police');
  }
  let walkers = 0;
  for (const p of G.peds) if (p.role === 'civ' && !p.car && !p.dead) walkers++;
  if (walkers < 42 && chance(dt * 10)) {
    const q = randomWalkPoint(px, py, 650, 1100);
    if (q) makePed('civ', q.x, q.y);
  }
}

export function spawnInitial() {
  const pl = G.player;
  for (let k = 0; k < 60; k++) {
    const n = randomNodeNear(pl.x, pl.y, 0, 1300);
    if (n) spawnTrafficAt(n.i, n.j, k % 12 === 0 ? 'police' : pick(CIV_TYPES));
  }
  for (let k = 0; k < 55; k++) { const q = randomWalkPoint(pl.x, pl.y, 30, 1000); if (q) makePed('civ', q.x, q.y); }
}

// ---------------- per-frame ----------------
export function updateAI(dt) {
  const pl = G.player;
  const px = pl.car ? pl.car.x : pl.x, py = pl.car ? pl.car.y : pl.y;
  G.arrestT = G.arrestT || 0;
  const arrest0 = G.arrestT;
  for (const c of G.cars) {
    const near = dist(c.x, c.y, px, py) < 1600;
    if (!near) continue;
    if (c.driver && c.driver !== pl && c.ai && !c.dead) {
      if (c.type === 'police' && c.ai.cop) updateCop(c, dt); else updateTraffic(c, dt);
      c.driver.x = c.x; c.driver.y = c.y;
    } else if (c !== pl.car) {
      // nobody at the wheel: coast to a stop
      driveCar(c, dt, 0, 0, Math.hypot(c.vx, c.vy) > 5);
    }
    updateCarCommon(c, dt);
  }
  collideCars();
  for (const p of G.peds) {
    if (p === pl || p.car) continue;
    if (dist(p.x, p.y, px, py) > 1500) continue;
    updatePed(p, dt);
  }
  if (G.arrestT === arrest0) G.arrestT = Math.max(0, G.arrestT - dt);
  // a car whose driver died stops being driven
  for (const c of G.cars) if (c.driver && c.driver !== pl && c.driver.dead) { c.driver.car = null; c.driver = null; c.ai = null; }
  updateWanted(dt);
  populate(dt);
}
