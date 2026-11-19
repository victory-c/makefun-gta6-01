// SPDX-License-Identifier: MIT
// Cars, people, weapons and the physics that binds them.
import { G, say } from './state.js';
import { solidPx, T } from './city.js';
import { rand, rr, pick, clamp, dist, chance } from './util.js';
import { sfx } from './audio.js';

export const hooks = { crime: () => {}, killed: () => {} };

export const CAR_TYPES = {
  compact: { name: 'Pelican', len: 34, wid: 18, max: 330, acc: 260, turn: 2.7, hp: 80, colors: ['#e84a5f', '#2a9d8f', '#f4a261', '#8ecae6', '#e9c46a', '#b5179e'] },
  sedan: { name: 'Marlin', len: 40, wid: 20, max: 370, acc: 280, turn: 2.4, hp: 100, colors: ['#f1faee', '#457b9d', '#1d3557', '#6d6875', '#c1121f', '#bfc0c0'] },
  sports: { name: 'Vexa GT', len: 42, wid: 20, max: 540, acc: 430, turn: 2.9, hp: 90, colors: ['#ff006e', '#fb5607', '#00b4d8', '#ffbe0b', '#8338ec'] },
  taxi: { name: 'Cab', len: 40, wid: 20, max: 360, acc: 270, turn: 2.4, hp: 100, colors: ['#ffc300'] },
  van: { name: 'Gullwing Van', len: 50, wid: 22, max: 280, acc: 200, turn: 2.0, hp: 150, colors: ['#ffffff', '#d8e2dc', '#ffb4a2', '#9cadce'] },
  police: { name: 'Interceptor', len: 42, wid: 20, max: 490, acc: 400, turn: 2.8, hp: 140, colors: ['#18202f'] },
  armored: { name: 'Bullion Truck', len: 58, wid: 25, max: 300, acc: 190, turn: 1.8, hp: 420, colors: ['#5c6b73'] },
};
export const WEAPONS = {
  fist: { name: 'Fists', dmg: 22, range: 26, rate: 0.4, spread: 0 },
  pistol: { name: 'Pistol', dmg: 36, range: 540, rate: 0.26, spread: 0.04 },
  smg: { name: 'SMG', dmg: 19, range: 480, rate: 0.085, spread: 0.11 },
};

export function makeCar(type, x, y, a, opts = {}) {
  const t = CAR_TYPES[type];
  const c = {
    kind: 'car', type, t, x, y, a, vx: 0, vy: 0, fwd: 0, lat: 0,
    len: t.len, wid: t.wid, color: opts.color || pick(t.colors), hp: t.hp, maxHp: t.hp,
    driver: null, ai: null, burning: 0, dead: false, brake: false, siren: type === 'police', honk: 0, id: Math.random(),
  };
  G.cars.push(c);
  return c;
}

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673c'];
const SHIRT = ['#ff5e7e', '#3ec1d3', '#ffd23f', '#ffffff', '#9b5de5', '#f15bb5', '#00f5d4', '#fee440', '#ff8c42', '#2ec4b6'];
export function makePed(role, x, y, opts = {}) {
  const p = {
    kind: 'ped', role, x, y, a: rand() * 6.28, vx: 0, vy: 0, r: 7, hp: opts.hp || 100, maxHp: opts.hp || 100,
    skin: pick(SKIN), shirt: opts.shirt || (role === 'cop' ? '#23395b' : role === 'gang' ? '#0fa3b1' : pick(SHIRT)),
    hair: pick(['#222', '#4a2f1b', '#8b5a2b', '#e6c27a', '#111']), walk: 0, state: 'walk', target: null,
    weapon: opts.weapon || null, cool: rr(0, 1), car: null, dead: false, deadT: 0, fleeT: 0, armor: 0, id: Math.random(),
  };
  G.peds.push(p);
  return p;
}

// --- particles & decals ---
export function puff(x, y, type, n = 1, spd = 60) {
  for (let i = 0; i < n; i++) {
    const a = rand() * 6.28, s = rr(0.2, 1) * spd;
    const life = type === 'flash' ? 0.06 : type === 'smoke' ? rr(0.8, 1.8) : type === 'fire' ? rr(0.3, 0.7) : rr(0.15, 0.5);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, type, size: type === 'smoke' ? rr(6, 14) : rr(2, 5) });
  }
  if (G.particles.length > 700) G.particles.splice(0, G.particles.length - 700);
}
export function decal(x, y, type, size = 10) {
  G.decals.push({ x, y, type, size, a: rand() * 6.28 });
  if (G.decals.length > 160) G.decals.shift();
}

// --- collision helpers ---
function circleFree(x, y, r) {
  return !solidPx(x - r, y - r) && !solidPx(x + r, y - r) && !solidPx(x - r, y + r) && !solidPx(x + r, y + r);
}
export function movePed(p, dx, dy) {
  if (circleFree(p.x + dx, p.y, p.r)) p.x += dx; else p.vx = 0;
  if (circleFree(p.x, p.y + dy, p.r)) p.y += dy; else p.vy = 0;
}
function carPoints(c, x, y, a) {
  const fx = Math.cos(a), fy = Math.sin(a), hl = c.len / 2, hw = c.wid / 2;
  const pts = [];
  for (const [l, w] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [0, hw], [0, -hw], [hl, 0], [-hl, 0]]) {
    pts.push(x + fx * l - fy * w, y + fy * l + fx * w);
  }
  return pts;
}
function carFree(c, x, y, a) {
  const p = carPoints(c, x, y, a);
  for (let i = 0; i < p.length; i += 2) if (solidPx(p[i], p[i + 1])) return false;
  return true;
}
export function pointInCar(c, px, py, pad = 0) {
  const dx = px - c.x, dy = py - c.y, fx = Math.cos(c.a), fy = Math.sin(c.a);
  return Math.abs(dx * fx + dy * fy) < c.len / 2 + pad && Math.abs(-dx * fy + dy * fx) < c.wid / 2 + pad;
}

export function damageCar(c, amount, by) {
  if (c.dead) return;
  c.hp -= amount;
  if (c.hp <= 0 && !c.burning) { c.burning = 3; c.hp = 0; if (by === G.player) hooks.crime(0.5, c.x, c.y); }
}

// Arcade car model: forward speed + lateral slip with grip, handbrake drifts.
export function driveCar(c, dt, throttle, steer, handbrake = false) {
  const t = c.t;
  let fx = Math.cos(c.a), fy = Math.sin(c.a);
  let fwd = c.vx * fx + c.vy * fy, lat = -c.vx * fy + c.vy * fx;
  c.brake = false;
  if (c.dead || c.burning) { throttle = 0; steer *= 0.3; }
  if (throttle > 0) fwd += (fwd < 0 ? t.acc * 2.2 : t.acc) * throttle * dt * (1 - Math.max(0, fwd) / t.max * 0.6);
  else if (throttle < 0) {
    if (fwd > 15) { fwd += t.acc * 2.0 * throttle * dt; c.brake = true; } else fwd += t.acc * 0.7 * throttle * dt;
  } else fwd *= 1 - 0.9 * dt;
  fwd = clamp(fwd, -t.max * 0.35, t.max);
  const turnF = clamp(fwd / 140, -1, 1) * (1 - Math.min(0.45, Math.abs(fwd) / t.max * 0.45));
  c.a += steer * t.turn * dt * turnF * (handbrake ? 1.35 : 1);
  lat *= Math.exp(-dt * (handbrake ? 1.2 : 8.5));
  if (handbrake) { fwd *= 1 - 1.4 * dt; c.brake = true; }
  c.fwd = fwd; c.lat = lat;
  fx = Math.cos(c.a); fy = Math.sin(c.a);
  c.vx = fx * fwd - fy * lat; c.vy = fy * fwd + fx * lat;
  if (Math.abs(lat) > 90 && Math.abs(fwd) > 60) {
    G.skids.push({ x: c.x - fx * c.len * 0.35, y: c.y - fy * c.len * 0.35, a: c.a, t: 14 });
    if (G.skids.length > 400) G.skids.shift();
    if (chance(0.3)) puff(c.x - fx * c.len * 0.4, c.y - fy * c.len * 0.4, 'smoke', 1, 20);
  }
  if (throttle > 0.9 && fwd > 20 && fwd < t.max * 0.35 && chance(0.35)) puff(c.x - fx * c.len * 0.45, c.y - fy * c.len * 0.45, 'smoke', 1, 25);
  moveCar(c, dt);
}

export function moveCar(c, dt) {
  const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
  if (carFree(c, nx, ny, c.a)) { c.x = nx; c.y = ny; return; }
  const sp = Math.hypot(c.vx, c.vy);
  if (carFree(c, nx, c.y, c.a)) { c.x = nx; c.vy *= -0.2; }
  else if (carFree(c, c.x, ny, c.a)) { c.y = ny; c.vx *= -0.2; }
  else { c.vx *= -0.3; c.vy *= -0.3; }
  if (!carFree(c, c.x, c.y, c.a)) { // rotated into a wall: nudge out
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      if (carFree(c, c.x + Math.cos(a) * 4, c.y + Math.sin(a) * 4, c.a)) { c.x += Math.cos(a) * 4; c.y += Math.sin(a) * 4; break; }
    }
  }
  if (sp > 90) {
    damageCar(c, (sp - 80) * 0.07, c.driver);
    puff(c.x + Math.cos(c.a) * c.len / 2, c.y + Math.sin(c.a) * c.len / 2, 'spark', 6, 140);
    if (c.driver === G.player) { sfx('crash', Math.min(1, sp / 400)); G.shake = Math.min(12, sp / 40); }
  }
}

// Two-circle bodies for car-vs-car contact.
function circles(c) {
  const fx = Math.cos(c.a) * c.len * 0.25, fy = Math.sin(c.a) * c.len * 0.25;
  return [[c.x + fx, c.y + fy], [c.x - fx, c.y - fy]];
}
export function collideCars() {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (Math.abs(a.x - b.x) > 70 || Math.abs(a.y - b.y) > 70) continue;
    const r = (a.wid + b.wid) * 0.5;
    for (const [ax, ay] of circles(a)) for (const [bx, by] of circles(b)) {
      const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
      if (d >= r || d === 0) continue;
      const nx = dx / d, ny = dy / d, ov = (r - d) / 2;
      const ma = a.t.hp, mb = b.t.hp, wa = mb / (ma + mb), wb = ma / (ma + mb);
      a.x -= nx * ov * wa * 2; a.y -= ny * ov * wa * 2; b.x += nx * ov * wb * 2; b.y += ny * ov * wb * 2;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const jimp = -1.3 * vn;
        a.vx -= nx * jimp * wa; a.vy -= ny * jimp * wa; b.vx += nx * jimp * wb; b.vy += ny * jimp * wb;
        if (-vn > 70) {
          damageCar(a, -vn * 0.05, b.driver); damageCar(b, -vn * 0.05, a.driver);
          puff((ax + bx) / 2, (ay + by) / 2, 'spark', 5, 120);
          if (a.driver === G.player || b.driver === G.player) {
            sfx('crash', Math.min(1, -vn / 300)); G.shake = Math.min(10, -vn / 40);
            const other = a.driver === G.player ? b : a;
            if (other.type === 'police') hooks.crime(0.25, other.x, other.y);
            else if (other.ai && -vn > 140) { other.ai.angry = 4; other.honk = 1; }
          }
        }
      }
    }
  }
}

// Cars run people over.
export function carHitsPeds(c) {
  const sp = Math.hypot(c.vx, c.vy);
  if (sp < 50) return;
  for (const p of G.peds) {
    if (p.dead || p.car || p.hidden || !pointInCar(c, p.x, p.y, p.r)) continue;
    if (p === G.player && c.driver === G.player) continue;
    const dmg = sp * 0.35;
    p.vx += c.vx * 0.8; p.vy += c.vy * 0.8;
    hurtPed(p, dmg, c.driver, 'car');
  }
}

export function hurtPed(p, dmg, by, how) {
  if (p.dead) return;
  if (p.armor > 0) { const a = Math.min(p.armor, dmg * 0.7); p.armor -= a; dmg -= a; }
  p.hp -= dmg;
  puff(p.x, p.y, 'blood', 4, 70);
  if (p.role === 'civ' || p.role === 'gang') { p.state = 'flee'; p.fleeT = 8; p.fleeFrom = by; }
  if (p.role === 'gang' && by === G.player) p.hostile = true;
  if (p.hp <= 0) {
    p.dead = true; p.deadT = 0; p.hp = 0;
    decal(p.x, p.y, 'blood', rr(9, 15));
    if (p !== G.player) {
      if (chance(0.7)) G.pickups.push({ x: p.x + rr(-8, 8), y: p.y + rr(-8, 8), type: 'cash', amount: Math.floor(rr(10, 60)), t: 30 });
      if (p.weapon && chance(0.5)) G.pickups.push({ x: p.x + 6, y: p.y, type: p.weapon, amount: p.weapon === 'smg' ? 60 : 24, t: 30 });
    }
    hooks.killed(p, by, how);
  } else if (by === G.player && p !== G.player) {
    hooks.crime(p.role === 'cop' ? 0.8 : p.role === 'civ' ? 0.3 : 0, p.x, p.y);
  }
}

export function explodeCar(c) {
  c.dead = true; c.burning = 0; c.fwd = 0;
  sfx('boom', clamp(1 - dist(c.x, c.y, G.cam.x, G.cam.y) / 900, 0.1, 1));
  G.shake = Math.max(G.shake, 14 - Math.min(12, dist(c.x, c.y, G.cam.x, G.cam.y) / 60));
  puff(c.x, c.y, 'fire', 40, 220); puff(c.x, c.y, 'smoke', 25, 90);
  decal(c.x, c.y, 'scorch', 34);
  for (const p of G.peds) {
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < 100 && !p.dead) {
      if (p === G.player && G.player.car && G.player.car !== c) continue;
      hurtPed(p, (100 - d) * 1.6, c.lastHit || null, 'boom');
    }
  }
  if (c.driver && c.driver !== G.player) { const d = c.driver; d.car = null; d.x = c.x; d.y = c.y; c.driver = null; hurtPed(d, 999, c.lastHit, 'boom'); }
  for (const o of G.cars) if (o !== c && !o.dead && dist(o.x, o.y, c.x, c.y) < 90) damageCar(o, 60, c.lastHit);
}

// Hitscan weapons. Returns true when it fired.
export function fire(shooter, angle) {
  const wname = shooter === G.player ? G.weapon : shooter.weapon || 'pistol';
  const w = WEAPONS[wname];
  if (shooter.cool > 0) return false;
  if (shooter === G.player && wname !== 'fist') {
    if (G.weapons[wname] <= 0) { G.weapon = 'fist'; say('Out of ammo'); return false; }
    G.weapons[wname]--;
  }
  shooter.cool = w.rate;
  const a = angle + rr(-w.spread, w.spread);
  const dx = Math.cos(a), dy = Math.sin(a);
  if (wname === 'fist') {
    sfx('punch', 0.6);
    for (const p of G.peds) {
      if (p === shooter || p.dead || p.car) continue;
      if (dist(p.x, p.y, shooter.x + dx * 14, shooter.y + dy * 14) < 16) { hurtPed(p, w.dmg, shooter, 'fist'); p.vx += dx * 160; p.vy += dy * 160; return true; }
    }
    return true;
  }
  const near = dist(shooter.x, shooter.y, G.cam.x, G.cam.y);
  if (near < 900) sfx(wname, clamp(1 - near / 900, 0.15, 1));
  const sx = shooter.x + dx * 10, sy = shooter.y + dy * 10;
  let ex = sx, ey = sy;
  for (let s = 0; s < w.range; s += 6) {
    ex = sx + dx * s; ey = sy + dy * s;
    if (solidPx(ex, ey)) { puff(ex, ey, 'spark', 3, 80); break; }
    let hitSomething = false;
    for (const p of G.peds) {
      if (p === shooter || p.dead || p.car || p.hidden) continue;
      if (Math.abs(p.x - ex) < 9 && Math.abs(p.y - ey) < 9 && dist(p.x, p.y, ex, ey) < p.r + 2) {
        hurtPed(p, w.dmg, shooter, 'gun'); p.vx += dx * 60; p.vy += dy * 60; hitSomething = true; break;
      }
    }
    if (hitSomething) break;
    for (const c of G.cars) {
      if (c.dead || c === shooter.car) continue;
      if (Math.abs(c.x - ex) < 34 && Math.abs(c.y - ey) < 34 && pointInCar(c, ex, ey)) {
        damageCar(c, w.dmg * 0.4, shooter); c.lastHit = shooter; puff(ex, ey, 'spark', 3, 90); hitSomething = true;
        if (c.driver && c.driver !== G.player && chance(0.25)) hurtPed(c.driver, w.dmg * 0.5, shooter, 'gun');
        break;
      }
    }
    if (hitSomething) break;
  }
  G.tracers.push({ x1: sx, y1: sy, x2: ex, y2: ey, t: 0.07 });
  G.particles.push({ x: sx, y: sy, vx: 0, vy: 0, life: 0.06, max: 0.06, type: 'flash', size: 6 });
  puff(sx, sy, 'spark', 2, 50);
  if (shooter === G.player) hooks.crime(0.12, sx, sy, 'shots');
  // gunfire scares everyone nearby
  for (const p of G.peds) if (p.role === 'civ' && !p.dead && dist(p.x, p.y, sx, sy) < 300) { p.state = 'flee'; p.fleeT = 6; p.fleeFrom = shooter; }
  return true;
}

export function updateParticles(dt) {
  for (const p of G.particles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const drag = p.type === 'smoke' ? 1.5 : 4; p.vx *= 1 - drag * dt; p.vy *= 1 - drag * dt;
    if (p.type === 'smoke') { p.size += dt * 10; p.vy -= 8 * dt; }
  }
  G.particles = G.particles.filter((p) => p.life > 0);
  for (const t of G.tracers) t.t -= dt;
  G.tracers = G.tracers.filter((t) => t.t > 0);
  for (const s of G.skids) s.t -= dt;
  while (G.skids.length && G.skids[0].t <= 0) G.skids.shift();
}

export function updateCarCommon(c, dt) {
  if (c.burning > 0) {
    c.burning -= dt;
    if (chance(0.6)) puff(c.x + rr(-8, 8), c.y + rr(-8, 8), 'fire', 1, 30);
    if (chance(0.4)) puff(c.x, c.y, 'smoke', 1, 25);
    if (c.burning <= 0) explodeCar(c);
  } else if (!c.dead && c.hp < c.maxHp * 0.35 && chance(0.25)) puff(c.x + Math.cos(c.a) * c.len * 0.4, c.y + Math.sin(c.a) * c.len * 0.4, 'smoke', 1, 15);
  if (c.dead) { c.vx *= 1 - 3 * dt; c.vy *= 1 - 3 * dt; moveCar(c, dt); }
  carHitsPeds(c);
  if (c.honk > 0) c.honk -= dt;
}

export { T };
