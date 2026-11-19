// SPDX-License-Identifier: MIT
// HUD: money, clock, health/armor, weapon, wanted stars, minimap with blips, objectives,
// dialog, banners, shop, full map, pause, title and end screens.
import { G } from './state.js';
import { city, W, H, TILE, zoneAt } from './city.js';
import { WEAPONS } from './entities.js';
import { SHOP, MISSIONS } from './missions.js';
import { fmtMoney, clamp } from './util.js';

const TILE_COL = { [TILE.GRASS]: '#79b54a', [TILE.ROAD]: '#30343a', [TILE.WALK]: '#bdb6a6', [TILE.SAND]: '#efd99b', [TILE.WATER]: '#2a8fc4', [TILE.BUILD]: '#8c8f99', [TILE.PARK]: '#5fb844', [TILE.DOCK]: '#9b7a57', [TILE.PLAZA]: '#d8c2a6', [TILE.LOT]: '#585c63', [TILE.POOL]: '#58dcef' };
let mapCanvas = null;
const MPX = 4; // minimap canvas pixels per tile

export function buildMinimap() {
  mapCanvas = document.createElement('canvas');
  mapCanvas.width = W * MPX; mapCanvas.height = H * MPX;
  const g = mapCanvas.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { g.fillStyle = TILE_COL[city.tiles[y * W + x]]; g.fillRect(x * MPX, y * MPX, MPX, MPX); }
  for (const b of city.buildings) {
    g.fillStyle = b.kind === 'tower' ? '#9aa9bb' : b.kind === 'house' ? '#e6d4bd' : '#a7a2a8';
    g.fillRect(b.x / 40 * MPX + 0.5, b.y / 40 * MPX + 0.5, b.w / 40 * MPX - 1, b.h / 40 * MPX - 1);
  }
}

function text(ctx, s, x, y, size, color, align = 'left', font = '900 ', outline = 4) {
  ctx.font = `${font}${size}px "Arial Black", Impact, "Helvetica Neue", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  if (outline) { ctx.lineWidth = outline; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.stroke();
}
function panel(ctx, x, y, w, h, a = 0.6) { ctx.fillStyle = `rgba(8,10,20,${a})`; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); }

function wrap(ctx, s, maxW) {
  const words = s.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}

function drawMinimap(ctx, markers, cx, cy, R) {
  const pl = G.player, P = pl.car || pl;
  const scale = 0.085 * MPX / 4 * 4 / MPX; // minimap px per world px
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.28); ctx.fillStyle = '#1b6ea6'; ctx.fill(); ctx.clip();
  ctx.translate(cx, cy); ctx.scale(scale * 40 / MPX, scale * 40 / MPX);
  ctx.drawImage(mapCanvas, -P.x / 40 * MPX, -P.y / 40 * MPX);
  ctx.restore();
  const toMini = (x, y) => [cx + (x - P.x) * scale, cy + (y - P.y) * scale];
  // blips
  for (const m of markers) {
    let [bx, by] = toMini(m.x, m.y);
    const d = Math.hypot(bx - cx, by - cy);
    if (d > R - 8) { bx = cx + (bx - cx) / d * (R - 8); by = cy + (by - cy) / d * (R - 8); }
    ctx.fillStyle = m.c; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, m.svc ? 6 : 8, 0, 6.28); ctx.fill(); ctx.stroke();
    if (m.icon && m.icon.length <= 2) text(ctx, m.icon, bx, by + 4, 10, '#000', 'center', '900 ', 0);
  }
  for (const c of G.cars) {
    if (c.type !== 'police' || c.dead) continue;
    const [bx, by] = toMini(c.x, c.y);
    if (Math.hypot(bx - cx, by - cy) > R - 4) continue;
    ctx.fillStyle = G.wanted.level && Math.floor(G.t * 6) % 2 ? '#ff3b3b' : '#3b82ff';
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, 6.28); ctx.fill();
  }
  for (const p of G.peds) if (p.role === 'gang' && p.hostile && !p.dead) { const [bx, by] = toMini(p.x, p.y); ctx.fillStyle = '#ff4d6d'; ctx.fillRect(bx - 2, by - 2, 4, 4); }
  // player arrow
  const a = pl.car ? pl.car.a : pl.a;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.lineWidth = 5; ctx.strokeStyle = '#111'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.28); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = G.wanted.level && Math.floor(G.t * 4) % 2 ? '#ff3b3b' : '#ffd23f'; ctx.beginPath(); ctx.arc(cx, cy, R + 3, 0, 6.28); ctx.stroke();
  text(ctx, 'N', cx, cy - R + 14, 13, '#fff', 'center', '900 ', 3);
}

export function drawHUD(ctx, markers) {
  const { w, h } = G.screen, pl = G.player;
  // top-right: clock, money, health, armor, weapon, stars
  const hh = Math.floor(G.clock / 60) % 24, mm = Math.floor(G.clock % 60);
  text(ctx, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, w - 24, 44, 30, '#ffffff', 'right');
  text(ctx, fmtMoney(G.money).replace('$', '$ '), w - 24, 84, 34, '#7CFC9A', 'right');
  const bw = 200, bx = w - 24 - bw;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 2, 96, bw + 4, 14);
  ctx.fillStyle = '#e63946'; ctx.fillRect(bx, 98, bw * clamp(pl.hp / 100, 0, 1), 10);
  if (pl.armor > 0) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 2, 112, bw + 4, 10); ctx.fillStyle = '#4dabf7'; ctx.fillRect(bx, 114, bw * pl.armor / 100, 6); }
  for (let i = 0; i < 5; i++) {
    const lit = i < G.wanted.level, blink = G.wanted.flash > 0 && Math.floor(G.t * 8) % 2;
    star(ctx, w - 36 - (4 - i) * 34, 146, 14, lit ? (blink ? '#ffffff' : '#ffd23f') : 'rgba(80,80,80,0.55)');
  }
  // weapon box
  panel(ctx, w - 270, 18, 96, 70, 0.55);
  const wn = G.weapon;
  text(ctx, WEAPONS[wn].name.toUpperCase(), w - 222, 46, 14, '#fff', 'center', '900 ', 3);
  text(ctx, wn === 'fist' ? '\u270A' : String(G.weapons[wn]), w - 222, 76, wn === 'fist' ? 22 : 22, '#ffd23f', 'center', '900 ', 3);
  // minimap
  drawMinimap(ctx, markers, 130, h - 130, 105);
  // zone / vehicle name
  if (G.zoneT > 0) {
    ctx.globalAlpha = clamp(G.zoneT, 0, 1);
    text(ctx, G.zone, w - 30, h - 70, 30, '#ffe8a3', 'right', 'italic 900 ', 5);
    ctx.globalAlpha = 1;
  }
  if (pl.car) {
    const mph = Math.round(Math.hypot(pl.car.vx, pl.car.vy) * 0.16);
    panel(ctx, w - 240, h - 128, 220, 112, 0.6);
    text(ctx, pl.car.t.name.toUpperCase(), w - 226, h - 102, 17, '#ffffff', 'left', 'italic 900 ', 0);
    if (G.radio) text(ctx, '\u266A SUNLINE FM 104.3', w - 226, h - 80, 13, '#ff9fc4', 'left', '900 ', 0);
    text(ctx, `${mph}`, w - 64, h - 30, 42, '#ffffff', 'right', '900 ', 0);
    text(ctx, 'MPH', w - 32, h - 30, 13, '#ffd23f', 'right', '900 ', 0);
    const hp = pl.car.hp / pl.car.maxHp;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(w - 226, h - 70, 80, 6);
    ctx.fillStyle = hp > 0.5 ? '#9fe3d0' : hp > 0.25 ? '#ffd23f' : '#ff4d4d'; ctx.fillRect(w - 226, h - 70, 80 * clamp(hp, 0, 1), 6);
    text(ctx, 'BODY', w - 226, h - 48, 11, 'rgba(255,255,255,0.6)', 'left', '900 ', 0);
  }
  // messages
  let my = 40;
  for (const m of G.msgs) {
    ctx.globalAlpha = clamp(m.t, 0, 1);
    ctx.font = '700 17px "Arial Black", Impact, sans-serif';
    panel(ctx, 14, my - 20, ctx.measureText(m.text).width + 22, 28, 0.55);
    text(ctx, m.text, 25, my, 17, m.color, 'left', '700 ', 0); my += 34;
  }
  ctx.globalAlpha = 1;
  // objective
  if (G.objective && !G.dialog) {
    ctx.font = '700 20px "Helvetica Neue", Arial, sans-serif';
    const s = G.objective.obj, tw = ctx.measureText(s).width;
    panel(ctx, w / 2 - tw / 2 - 18, h - 76, tw + 36, 42, 0.62);
    text(ctx, s, w / 2, h - 48, 20, '#ffffff', 'center', '700 ', 0);
    if (G.objective.bar != null) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(w / 2 - 100, h - 92, 200, 10);
      ctx.fillStyle = '#ff4d6d'; ctx.fillRect(w / 2 - 98, h - 90, 196 * G.objective.bar, 6);
    }
  }
  if (G.dialog) drawDialog(ctx);
  if (G.banner && G.banner.t > 0) {
    ctx.globalAlpha = clamp(G.banner.t, 0, 1);
    text(ctx, G.banner.title, w / 2, h * 0.3, 56, G.banner.color || '#ffd23f', 'center', 'italic 900 ', 8);
    if (G.banner.sub) text(ctx, G.banner.sub, w / 2, h * 0.3 + 44, 26, '#ffffff', 'center', '900 ', 5);
    ctx.globalAlpha = 1;
  }
  if (G.shopOpen) drawShop(ctx);
  if (pl.car && pl.car.burning > 0) text(ctx, 'YOUR CAR IS ON FIRE \u2014 PRESS F TO BAIL!', w / 2, 120, 24, '#ff6b35', 'center');
  if (!pl.car && G.mode === 'play') { // crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; const { mx, my: myy } = G.mouse;
    ctx.beginPath(); ctx.arc(mx, myy, 9, 0, 6.28); ctx.moveTo(mx - 14, myy); ctx.lineTo(mx - 5, myy); ctx.moveTo(mx + 5, myy); ctx.lineTo(mx + 14, myy); ctx.stroke();
  }
}

function drawDialog(ctx) {
  const { w, h } = G.screen, d = G.dialog, [who, line] = d.lines[d.i];
  const bw = Math.min(820, w - 540), bx = (w - bw) / 2, by = h - 140;
  panel(ctx, bx, by, bw, 112, 0.78);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(bx, by, 6, 112);
  text(ctx, who.toUpperCase(), bx + 24, by + 32, 18, who.startsWith('Nina') ? '#9fe3d0' : '#ffd23f', 'left', '900 ', 0);
  ctx.font = '600 20px "Helvetica Neue", Arial, sans-serif';
  wrap(ctx, line, bw - 48).forEach((l, i) => text(ctx, l, bx + 24, by + 62 + i * 26, 20, '#ffffff', 'left', '600 ', 0));
  text(ctx, 'ENTER \u25B6', bx + bw - 18, by + 102, 12, 'rgba(255,255,255,0.6)', 'right', '900 ', 0);
}

function drawShop(ctx) {
  const { w } = G.screen;
  panel(ctx, w / 2 - 210, 150, 420, 190, 0.82);
  text(ctx, 'LOCK & LOAD', w / 2, 190, 28, '#ff6b6b', 'center', 'italic 900 ', 0);
  SHOP.forEach((s, i) => text(ctx, `[${i + 1}]  ${s.label}  \u2014  ${fmtMoney(s.cost)}`, w / 2 - 180, 232 + i * 32, 18, G.money >= s.cost ? '#fff' : '#888', 'left', '700 ', 0));
}

export function drawFullMap(ctx, markers) {
  const { w, h } = G.screen, size = Math.min(w, h) - 80, ox = (w - size) / 2, oy = 40, k = size / (W * 40);
  ctx.fillStyle = 'rgba(5,10,25,0.92)'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(mapCanvas, ox, oy, size, size);
  const labels = [['OCEAN DRIVE', 11, 30], ['SUNLINE BEACH', 6, 75], ['DOWNTOWN', 55, 45], ['CORAL HILLS', 70, 10], ['CALLE MANGO', 82, 66], ['PORT SOLMAR', 45, 90], ['MIDTOWN', 28, 30], ['VERDE LINKS', 96, 20], ['BAYFRONT PARK', 35, 65]];
  for (const [s, tx, ty] of labels) text(ctx, s, ox + tx * 40 * k, oy + ty * 40 * k, 14, '#ffffff', 'center', '900 ', 3);
  for (const m of markers) { ctx.fillStyle = m.c; ctx.beginPath(); ctx.arc(ox + m.x * k, oy + m.y * k, 7, 0, 6.28); ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke(); if (m.label && !m.svc) text(ctx, m.label, ox + m.x * k + 10, oy + m.y * k + 5, 13, m.c, 'left', '900 ', 3); }
  const P = G.player.car || G.player;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox + P.x * k, oy + P.y * k, 6, 0, 6.28); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
  text(ctx, 'SUNLINE CITY', ox + 10, oy + 30, 26, '#ffd23f', 'left', 'italic 900 ', 4);
  text(ctx, `Story ${G.story.done}/${MISSIONS.length}   \u2022   M to close`, ox + size - 10, oy + size - 12, 15, '#fff', 'right', '700 ', 3);
}

export function drawPause(ctx) {
  const { w, h } = G.screen;
  ctx.fillStyle = 'rgba(5,10,25,0.75)'; ctx.fillRect(0, 0, w, h);
  text(ctx, 'PAUSED', w / 2, h * 0.25, 60, '#ffd23f', 'center', 'italic 900 ', 6);
  const lines = ['ESC  resume', 'S  save game', 'M  city map', '', ...CONTROLS];
  lines.forEach((l, i) => text(ctx, l, w / 2, h * 0.25 + 60 + i * 28, 18, '#fff', 'center', '700 ', 3));
  text(ctx, `Story: ${G.story.done}/${MISSIONS.length}   Cars stolen: ${G.stats.cars}   Takedowns: ${G.stats.kills}`, w / 2, h - 50, 16, '#9fe3d0', 'center', '700 ', 3);
}

export const CONTROLS = [
  'WASD / arrows  walk or drive    SHIFT  sprint    SPACE  handbrake',
  'MOUSE  aim    CLICK  shoot / punch    Q / E  switch weapon',
  'F  steal / enter / exit a car    H  horn    R  radio    M  map',
];

export function drawTitle(ctx, hasSave, sel) {
  const { w, h } = G.screen;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(40,10,60,0.55)'); g.addColorStop(0.55, 'rgba(255,90,90,0.25)'); g.addColorStop(1, 'rgba(10,10,30,0.85)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // sun with stripes
  const sx = w / 2, sy = h * 0.36, r = Math.min(w, h) * 0.2;
  const sg = ctx.createLinearGradient(0, sy - r, 0, sy + r);
  sg.addColorStop(0, '#ffe66d'); sg.addColorStop(1, '#ff3d7f');
  ctx.save(); ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.28); ctx.fillStyle = sg; ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i++) ctx.fillRect(sx - r, sy + r * 0.15 + i * r * 0.15, r * 2, 3 + i * 2);
  ctx.restore();
  text(ctx, 'SUNLINE', w / 2, h * 0.36, Math.min(130, w / 8), '#ffffff', 'center', 'italic 900 ', 12);
  text(ctx, 'HEAT', w / 2, h * 0.36 + Math.min(110, w / 9.5), Math.min(120, w / 9), '#ff3d7f', 'center', 'italic 900 ', 12);
  text(ctx, 'AN OPEN-WORLD CRIME STORY IN SIX JOBS', w / 2, h * 0.36 + Math.min(150, w / 7.5), 18, '#ffe66d', 'center', '900 ', 4);
  const items = hasSave ? ['CONTINUE', 'NEW GAME'] : ['NEW GAME'];
  items.forEach((s, i) => {
    const y = h * 0.68 + i * 46, on = i === sel;
    if (on) { panel(ctx, w / 2 - 150, y - 32, 300, 44, 0.65); }
    text(ctx, (on ? '\u25B6 ' : '') + s, w / 2, y, 28, on ? '#ffd23f' : '#ffffff', 'center', '900 ', 5);
  });
  text(ctx, 'WASD drive/walk  \u2022  MOUSE aim & shoot  \u2022  F steal car  \u2022  M map  \u2022  ESC pause', w / 2, h - 40, 14, 'rgba(255,255,255,0.8)', 'center', '700 ', 3);
  text(ctx, 'ENTER to start  \u2022  an original game: every city, name and story is made up', w / 2, h - 12, 12, 'rgba(255,255,255,0.6)', 'center', '700 ', 0);
}

export function drawDeath(ctx, kind) {
  const { w, h } = G.screen;
  ctx.fillStyle = kind === 'wasted' ? 'rgba(80,0,0,0.45)' : 'rgba(0,20,80,0.45)'; ctx.fillRect(0, 0, w, h);
  text(ctx, kind === 'wasted' ? 'WASTED' : 'BUSTED', w / 2, h / 2, 96, kind === 'wasted' ? '#ff3b3b' : '#4dabf7', 'center', 'italic 900 ', 10);
  text(ctx, kind === 'wasted' ? 'Sunline General patched you up. -$200' : 'The SCPD kept your guns and $200.', w / 2, h / 2 + 50, 22, '#fff', 'center', '700 ', 4);
}

export function drawEnding(ctx) {
  const { w, h } = G.screen;
  ctx.fillStyle = 'rgba(10,5,30,0.6)'; ctx.fillRect(0, 0, w, h);
  text(ctx, 'SUNLINE IS YOURS', w / 2, h * 0.4, 64, '#ffd23f', 'center', 'italic 900 ', 8);
  text(ctx, 'Silas Crane\u2019s empire is finished. The city keeps on rolling \u2014 free roam unlocked.', w / 2, h * 0.4 + 50, 20, '#fff', 'center', '700 ', 4);
}

export function updateZone(dt) {
  const P = G.player.car || G.player;
  const z = zoneAt(P.x, P.y);
  if (z !== G.zone) { G.zone = z; G.zoneT = 3; }
  G.zoneT -= dt;
}
