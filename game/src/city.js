// SPDX-License-Identifier: MIT
// Sunline City: a procedural coastal city on a 100x100 tile grid.
// West: Sunline Beach and Ocean Drive. South: Port Solmar docks. Centre: Downtown towers.
// North-east: Coral Hills villas. East: Verde Links golf course. Roads every 10 tiles.
import { setSeed, rand, rr, ri, pick, chance } from './util.js';

export const T = 40;          // tile size in world pixels
export const W = 100, H = 100; // map size in tiles
export const TILE = { GRASS: 0, ROAD: 1, WALK: 2, SAND: 3, WATER: 4, BUILD: 5, PARK: 6, DOCK: 7, PLAZA: 8, LOT: 9, POOL: 10 };

export const city = {
  tiles: new Uint8Array(W * H),
  buildings: [],
  props: [],
  landmarks: {},
  nodes: [], // road intersection centres (pixels), indexed [i][j]
};

export const isRoadX = (x) => x >= 10 && x <= 91 && x % 10 < 2;
export const isRoadY = (y) => y >= 0 && y <= 91 && y % 10 < 2;
export const NODE_I = [1, 9], NODE_J = [0, 9];
export const nodePos = (i, j) => ({ x: (10 * i + 1) * T, y: (10 * j + 1) * T });

export function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return TILE.WATER;
  return city.tiles[ty * W + tx];
}
export const tileAtPx = (x, y) => tileAt(Math.floor(x / T), Math.floor(y / T));
export function solidPx(x, y) {
  const t = tileAtPx(x, y);
  return t === TILE.BUILD || t === TILE.WATER || t === TILE.POOL;
}
const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) city.tiles[y * W + x] = t; };

export function districtOf(bx, by) {
  if (bx <= 1) return 'beach';
  if (by >= 8) return 'docks';
  if (bx >= 4 && bx <= 6 && by >= 3 && by <= 5) return 'downtown';
  if (by <= 1 && bx >= 5) return 'hills';
  if (bx === 3 && by === 6) return 'park';
  if (bx >= 7 && by >= 5) return 'calle';
  return 'midtown';
}

export const ZONE_NAMES = {
  beach: 'Ocean Drive', docks: 'Port Solmar', downtown: 'Downtown Sunline', hills: 'Coral Hills',
  park: 'Bayfront Park', calle: 'Calle Mango', midtown: 'Midtown', golf: 'Verde Links', sand: 'Sunline Beach',
  sea: 'Gulf of Solmar',
};

export function zoneAt(x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  if (tx < 7 || ty >= 95) return ZONE_NAMES.sea;
  if (tx < 10) return ZONE_NAMES.sand;
  if (tx >= 92) return ZONE_NAMES.golf;
  if (ty >= 92) return ZONE_NAMES.docks;
  return ZONE_NAMES[districtOf(Math.floor(tx / 10), Math.min(8, Math.floor(ty / 10)))];
}

const PALETTES = {
  beach: ['#f6b5c8', '#9fe3d0', '#c8b6f2', '#ffd3a5', '#fff1b8', '#a8d8f8'],
  downtown: ['#5d89a8', '#3f6f8f', '#7aa5b8', '#8e9aa6', '#4c7c84', '#2f5d7c'],
  hills: ['#f7f1e3', '#efe4cf', '#fbf7ef', '#e9dcc3'],
  docks: ['#8a8f94', '#7b6f63', '#9a8f80', '#6c7a80'],
  calle: ['#ffcf4a', '#ff8a6b', '#3fc1b0', '#ff9fc4', '#7ec8ff', '#b5e06a'],
  midtown: ['#e8c9a9', '#f0a88c', '#f4e3c6', '#d9b48f', '#c9d6df', '#f2c6b4'],
};
const ROOFS = { hills: ['#c8643c', '#b85a35', '#d27447'], docks: ['#5a6066', '#6a5d52'] };

// Landmarks: one special building per block, with a marker on its sidewalk.
const LANDMARKS = [
  { id: 'safehouse', name: 'Nina\u2019s Place', bx: 2, by: 4, color: '#f2a65a', sign: 'SAFEHOUSE' },
  { id: 'diner', name: 'Mango Diner', bx: 7, by: 6, color: '#ffcf4a', sign: 'MANGO DINER' },
  { id: 'garage', name: 'Dex\u2019s Garage', bx: 4, by: 8, color: '#7b8a96', sign: 'DEX AUTO' },
  { id: 'mansion', name: 'Crane Villa', bx: 7, by: 0, color: '#fbf7ef', sign: 'CRANE' },
  { id: 'hospital', name: 'Sunline General', bx: 3, by: 2, color: '#eef3f6', sign: 'HOSPITAL' },
  { id: 'police', name: 'SCPD Precinct', bx: 5, by: 6, color: '#5a7fb0', sign: 'POLICE' },
  { id: 'spray1', name: 'Fresh Coat', bx: 2, by: 7, color: '#3fc1b0', sign: 'FRESH COAT' },
  { id: 'spray2', name: 'Fresh Coat', bx: 8, by: 3, color: '#3fc1b0', sign: 'FRESH COAT' },
  { id: 'guns', name: 'Lock & Load', bx: 6, by: 2, color: '#a34b3a', sign: 'LOCK&LOAD' },
  { id: 'tower', name: 'Crane Tower', bx: 5, by: 4, color: '#2f5d7c', sign: 'CRANE' },
];

function addBuilding(x0, y0, w, h, height, color, opts = {}) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, TILE.BUILD);
  const b = {
    x: x0 * T, y: y0 * T, w: w * T, h: h * T, height, color,
    roof: opts.roof || null, kind: opts.kind || 'block', sign: opts.sign || null,
    details: [],
  };
  // rooftop clutter: AC boxes, water tanks, helipad, pool
  if (b.kind === 'tower' && w * h >= 9) b.details.push({ t: 'heli' });
  if (b.kind === 'hotel' && w >= 3 && h >= 3) b.details.push({ t: 'pool', x: rr(0.25, 0.45), y: rr(0.25, 0.45) });
  const n = b.kind === 'house' ? 0 : ri(1, 3);
  for (let i = 0; i < n; i++) b.details.push({ t: chance(0.5) ? 'ac' : 'tank', x: rr(0.15, 0.8), y: rr(0.15, 0.8) });
  city.buildings.push(b);
  return b;
}

function subdivide(x0, y0, w, h, min, maxArea, out) {
  const big = w * h > maxArea;
  if (big && w >= h && w >= 2 * min) {
    const s = ri(min, w - min);
    subdivide(x0, y0, s, h, min, maxArea, out); subdivide(x0 + s, y0, w - s, h, min, maxArea, out);
  } else if (big && h >= 2 * min) {
    const s = ri(min, h - min);
    subdivide(x0, y0, w, s, min, maxArea, out); subdivide(x0, y0 + s, w, h - s, min, maxArea, out);
  } else out.push([x0, y0, w, h]);
}

function fillRect(x0, y0, w, h, t) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, t); }
const prop = (type, tx, ty, extra = {}) => city.props.push({ type, x: tx * T, y: ty * T, ...extra });

function buildBlock(bx, by) {
  const x0 = bx * 10 + 3, y0 = by * 10 + 3; // 6x6 interior
  const d = districtOf(bx, by);
  const lm = LANDMARKS.find((l) => l.bx === bx && l.by === by);
  // lamps on the four sidewalk corners
  for (const [cx, cy] of [[2, 2], [9, 2], [2, 9], [9, 9]]) prop('lamp', bx * 10 + cx + 0.5, by * 10 + cy + 0.5);
  if (lm) {
    fillRect(x0, y0, 6, 6, TILE.PLAZA);
    const tall = lm.id === 'tower' ? 360 : lm.id === 'hospital' ? 120 : lm.id === 'police' ? 90 : 55;
    const kind = lm.id === 'tower' ? 'tower' : 'landmark';
    const b = addBuilding(x0 + 1, y0, 4, 4, tall, lm.color, { sign: lm.sign, kind });
    b.landmark = lm.id;
    lm.marker = { x: (bx * 10 + 5) * T + T / 2 - T / 2 + T, y: (by * 10 + 8) * T + T / 2 };
    lm.marker.x = (bx * 10 + 6) * T; // centred on the plaza in front of the door
    city.landmarks[lm.id] = { ...lm };
    prop('palm', x0 + 0.5, y0 + 5.2); prop('palm', x0 + 5.5, y0 + 5.2);
    if (lm.id === 'mansion') { fillRect(x0 + 1, y0 + 4, 2, 1, TILE.POOL); }
    return;
  }
  if (d === 'park') {
    fillRect(x0, y0, 6, 6, TILE.PARK);
    fillRect(x0 + 2, y0 + 2, 2, 2, TILE.WATER);
    for (let i = 0; i < 9; i++) prop('palm', x0 + rr(0.3, 5.7), y0 + rr(0.3, 5.7));
    return;
  }
  const cfg = {
    downtown: { min: 2, area: 12, gap: 0.12, hmin: 150, hmax: 330, kind: 'tower' },
    beach: { min: 3, area: 18, gap: 0.15, hmin: 60, hmax: 120, kind: 'hotel' },
    hills: { min: 2, area: 4, gap: 0.45, hmin: 28, hmax: 42, kind: 'house' },
    docks: { min: 2, area: 18, gap: 0.3, hmin: 38, hmax: 60, kind: 'warehouse' },
    calle: { min: 2, area: 6, gap: 0.2, hmin: 30, hmax: 75, kind: 'block' },
    midtown: { min: 2, area: 9, gap: 0.2, hmin: 50, hmax: 140, kind: 'block' },
  }[d];
  const rects = [];
  subdivide(x0, y0, 6, 6, cfg.min, cfg.area, rects);
  const groundFill = d === 'hills' ? TILE.GRASS : d === 'docks' ? TILE.LOT : TILE.PLAZA;
  fillRect(x0, y0, 6, 6, groundFill);
  for (const [rx, ry, rw, rh] of rects) {
    if (chance(cfg.gap)) {
      const t = d === 'hills' ? TILE.GRASS : chance(0.5) ? TILE.LOT : TILE.PLAZA;
      fillRect(rx, ry, rw, rh, t);
      if (t === TILE.LOT) city.lots.push({ x: rx, y: ry, w: rw, h: rh });
      else prop('palm', rx + rw / 2, ry + rh / 2);
      continue;
    }
    if (d === 'hills') {
      // a villa with a lawn and a pool beside it
      const vw = Math.max(1, rw - 1), vh = Math.max(1, rh - 1);
      addBuilding(rx, ry, vw, vh, rr(cfg.hmin, cfg.hmax), pick(PALETTES.hills), { roof: pick(ROOFS.hills), kind: 'house' });
      if (rw > 1) set(rx + rw - 1, ry + rh - 1, TILE.POOL);
      prop('palm', rx + rw - 0.4, ry + 0.4);
      continue;
    }
    if (d === 'docks' && chance(0.4)) {
      // container stacks
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x += 1) {
        if (chance(0.7)) addBuilding(x, y, 1, 1, pick([18, 18, 36]), pick(['#c0392b', '#2e6da4', '#e67e22', '#2c8c5a', '#d4ac0d']), { kind: 'container' });
      }
      continue;
    }
    const tall = d === 'downtown' && rw * rh >= 6 ? 1.15 : 1;
    addBuilding(rx, ry, rw, rh, rr(cfg.hmin, cfg.hmax) * tall, pick(PALETTES[d]), {
      roof: ROOFS[d] ? pick(ROOFS[d]) : null, kind: cfg.kind,
    });
  }
  if (d === 'beach') { prop('palm', x0 - 0.5, y0 + 1); prop('palm', x0 - 0.5, y0 + 4); }
}

export function generateCity(seed = 7) {
  setSeed(seed);
  city.tiles.fill(0); city.buildings = []; city.props = []; city.lots = []; city.landmarks = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let t;
    if (x < 7 || y >= 95) t = TILE.WATER;
    else if (x < 10) t = TILE.SAND;
    else if (y >= 92) t = TILE.DOCK;
    else if (x >= 92) t = TILE.PARK;
    else if (isRoadX(x) || isRoadY(y)) t = TILE.ROAD;
    else {
      const lx = x % 10, ly = y % 10;
      t = lx === 2 || lx === 9 || ly === 2 || ly === 9 ? TILE.WALK : TILE.GRASS;
    }
    set(x, y, t);
  }
  // piers sticking into the bay at Port Solmar
  for (const px of [18, 34, 52, 70]) fillRect(px, 95, 2, 4, TILE.DOCK);
  for (let by = 0; by <= 8; by++) for (let bx = 1; bx <= 8; bx++) buildBlock(bx, by);
  // beach life: palms, umbrellas, towels
  for (let y = 1; y < 94; y += 1) {
    if (chance(0.5)) prop('palm', 9.6, y + rr(0, 1), { h: rr(60, 80) });
    if (chance(0.35)) prop('umbrella', rr(7.4, 9), y + rr(0, 1), { c: pick(['#ff5e7e', '#ffd23f', '#3ec1d3', '#ff8c42', '#ffffff']) });
    if (chance(0.25)) prop('towel', rr(7.3, 9.2), y + rr(0, 1), { c: pick(['#ff5e7e', '#3ec1d3', '#ffd23f', '#9b5de5']), a: rr(-0.5, 0.5) });
  }
  // golf course: fairway trees and a clubhouse
  for (let i = 0; i < 70; i++) prop('palm', rr(92.5, 99.5), rr(1, 91), { h: rr(55, 80) });
  const club = addBuilding(94, 38, 4, 3, 50, '#f4efe2', { roof: '#2c6e49', kind: 'landmark', sign: 'CLUBHOUSE' });
  club.landmark = 'club';
  city.landmarks.club = { id: 'club', name: 'Verde Links Clubhouse', marker: { x: 96 * T, y: 42 * T } };
  city.landmarks.boat = { id: 'boat', name: 'Pier 3 Speedboat', marker: { x: 53 * T, y: 97.5 * T } };
  city.landmarks.busstop = { id: 'busstop', name: 'Ocean Drive Bus Stop', marker: { x: 12.5 * T, y: 45.5 * T } };
  // road graph
  city.nodes = [];
  for (let i = NODE_I[0]; i <= NODE_I[1]; i++) {
    city.nodes[i] = [];
    for (let j = NODE_J[0]; j <= NODE_J[1]; j++) city.nodes[i][j] = nodePos(i, j);
  }
  return city;
}

// Nearest road node to a world point.
export function nearestNode(x, y) {
  const i = Math.max(NODE_I[0], Math.min(NODE_I[1], Math.round((x / T - 1) / 10)));
  const j = Math.max(NODE_J[0], Math.min(NODE_J[1], Math.round((y / T - 1) / 10)));
  return { i, j };
}

// A random point on a sidewalk near (x, y) within radius r (pixels), avoiding the inner radius.
export function randomWalkPoint(x, y, rMin, rMax) {
  for (let k = 0; k < 30; k++) {
    const a = rand() * Math.PI * 2, r = rr(rMin, rMax);
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    const t = tileAtPx(px, py);
    if (t === TILE.WALK || t === TILE.PLAZA || t === TILE.SAND || t === TILE.PARK) return { x: px, y: py };
  }
  return null;
}
