// SPDX-License-Identifier: MIT
// Top-down renderer with pseudo-3D buildings: every roof is projected away from the camera
// by its height, so towers lean like a real overhead camera. Day/night lighting on top.
import { G } from './state.js';
import { city, T, TILE, tileAt, isRoadX, isRoadY } from './city.js';
import { hash2, shade, clamp, lerp } from './util.js';

const PERSP = 1000;
let view = { x0: 0, y0: 0, x1: 0, y1: 0 };
const proj = (x, y, h) => {
  const k = PERSP / (PERSP - h);
  return [G.cam.x + (x - G.cam.x) * k, G.cam.y + (y - G.cam.y) * k];
};

// ---------------- lighting model ----------------
export function skyAt(clock) {
  const h = clock / 60;
  const keys = [ // hour, tint rgb, tint amount, night (lights)
    [0, [45, 55, 120], 0.62, 1], [5, [45, 55, 120], 0.62, 1], [6.5, [255, 170, 170], 0.3, 0.4], [8, [255, 255, 255], 0, 0],
    [16, [255, 255, 255], 0, 0], [18, [255, 160, 80], 0.3, 0.1], [19.3, [200, 90, 120], 0.42, 0.5], [20.5, [60, 60, 130], 0.58, 0.95], [24, [45, 55, 120], 0.62, 1],
  ];
  let i = 0; while (i < keys.length - 2 && h >= keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], t = (h - a[0]) / (b[0] - a[0]);
  const tint = a[1].map((v, k) => Math.round(lerp(v, b[1][k], t)));
  return { tint, amt: lerp(a[2], b[2], t), night: lerp(a[3], b[3], t) };
}

const glowCache = new Map();
function glow(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c); return c;
}

// ---------------- ground ----------------
const GROUND = { [TILE.GRASS]: '#7cb84d', [TILE.ROAD]: '#3d4148', [TILE.WALK]: '#d3cbbb', [TILE.SAND]: '#f2dea3', [TILE.BUILD]: '#5b5f66', [TILE.PARK]: '#6fc451', [TILE.DOCK]: '#a57d55', [TILE.PLAZA]: '#e8d2b6', [TILE.LOT]: '#50545b', [TILE.POOL]: '#58dcef' };
const isWater = (t) => t === TILE.WATER;

function drawGround(ctx) {
  const tx0 = Math.max(0, Math.floor(view.x0 / T)), ty0 = Math.max(0, Math.floor(view.y0 / T));
  const tx1 = Math.floor(view.x1 / T), ty1 = Math.floor(view.y1 / T);
  // deep sea background beyond the map
  ctx.fillStyle = '#1b6ea6'; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (tx >= 100 || ty >= 100) continue;
    const t = tileAt(tx, ty), x = tx * T, y = ty * T, hsh = hash2(tx, ty);
    if (t === TILE.WATER) {
      const shoreD = tx < 7 ? 7 - tx : ty >= 95 ? ty - 94 : 1;
      const d = clamp(shoreD / 6, 0, 1);
      ctx.fillStyle = `rgb(${Math.round(lerp(64, 22, d))},${Math.round(lerp(208, 112, d))},${Math.round(lerp(212, 170, d))})`;
      ctx.fillRect(x, y, T + 0.5, T + 0.5);
      const wv = Math.sin(G.t * 1.5 + tx * 0.9 + ty * 0.4);
      if (wv > 0.6) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + hsh * 20, y + 10 + wv * 8, 14, 2); }
      // foam where water meets land
      ctx.fillStyle = `rgba(255,255,255,${0.45 + 0.2 * Math.sin(G.t * 2 + ty)})`;
      if (!isWater(tileAt(tx + 1, ty)) && tx + 1 < 100) ctx.fillRect(x + T - 6 - Math.sin(G.t * 2 + ty) * 2, y, 6, T);
      if (!isWater(tileAt(tx, ty - 1)) && ty > 0) ctx.fillRect(x, y, T, 5 + Math.sin(G.t * 2 + tx) * 2);
      if (!isWater(tileAt(tx - 1, ty)) && tx > 0) ctx.fillRect(x, y, 5, T);
      continue;
    }
    ctx.fillStyle = GROUND[t];
    ctx.fillRect(x, y, T + 0.5, T + 0.5);
    switch (t) {
      case TILE.ROAD: drawRoadMarks(ctx, tx, ty, x, y); break;
      case TILE.WALK:
        ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
        ctx.fillStyle = '#b9b2a2';
        if (tileAt(tx + 1, ty) === TILE.ROAD) ctx.fillRect(x + T - 3, y, 3, T);
        if (tileAt(tx - 1, ty) === TILE.ROAD) ctx.fillRect(x, y, 3, T);
        if (tileAt(tx, ty + 1) === TILE.ROAD) ctx.fillRect(x, y + T - 3, T, 3);
        if (tileAt(tx, ty - 1) === TILE.ROAD) ctx.fillRect(x, y, T, 3);
        break;
      case TILE.GRASS: case TILE.PARK:
        if (t === TILE.PARK && tx >= 92 && (tx + ty) % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, y, T, T); }
        ctx.fillStyle = 'rgba(30,90,20,0.25)';
        for (let k = 0; k < 4; k++) ctx.fillRect(x + hash2(tx * 3 + k, ty) * 36, y + hash2(tx, ty * 5 + k) * 36, 3, 3);
        break;
      case TILE.SAND:
        ctx.fillStyle = 'rgba(180,140,80,0.25)';
        for (let k = 0; k < 5; k++) ctx.fillRect(x + hash2(tx * 7 + k, ty) * 38, y + hash2(tx, ty * 3 + k) * 38, 2, 2);
        break;
      case TILE.PLAZA:
        ctx.fillStyle = hsh > 0.5 ? '#e1c7a7' : '#ecd9c0'; ctx.fillRect(x + 2, y + 2, T / 2 - 3, T / 2 - 3); ctx.fillRect(x + T / 2 + 1, y + T / 2 + 1, T / 2 - 3, T / 2 - 3);
        break;
      case TILE.LOT:
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + T); ctx.stroke();
        break;
      case TILE.DOCK:
        ctx.strokeStyle = 'rgba(60,35,15,0.45)'; ctx.lineWidth = 1;
        for (let k = 8; k < T; k += 8) { ctx.beginPath(); ctx.moveTo(x, y + k); ctx.lineTo(x + T, y + k); ctx.stroke(); }
        break;
      case TILE.POOL:
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, T - 4, T - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 8 + Math.sin(G.t + tx) * 4, y + 14, 12, 2);
        break;
    }
  }
}

function drawRoadMarks(ctx, tx, ty, x, y) {
  const rx = isRoadX(tx), ry = isRoadY(ty);
  ctx.fillStyle = hash2(tx, ty) > 0.85 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.025)';
  ctx.fillRect(x + 6, y + 9, 12, 7);
  if (rx && ry) return;
  ctx.fillStyle = '#f2c230';
  if (rx && !ry && tx % 10 === 0 && ty % 2 === 0) ctx.fillRect(x + T - 2, y + 6, 4, T - 12);
  if (ry && !rx && ty % 10 === 0 && tx % 2 === 0) ctx.fillRect(x + 6, y + T - 2, T - 12, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  if (rx && !ry) {
    const ly = ty % 10;
    if (ly === 2) for (let k = 3; k < T; k += 8) ctx.fillRect(x + k, y + 2, 4, 12);
    if (ly === 9) for (let k = 3; k < T; k += 8) ctx.fillRect(x + k, y + T - 14, 4, 12);
  }
  if (ry && !rx) {
    const lx = tx % 10;
    if (lx === 2) for (let k = 3; k < T; k += 8) ctx.fillRect(x + 2, y + k, 12, 4);
    if (lx === 9) for (let k = 3; k < T; k += 8) ctx.fillRect(x + T - 14, y + k, 12, 4);
  }
}

// ---------------- props / buildings ----------------
const inView = (x, y, m = 120) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;

function drawShadows(ctx, night) {
  ctx.fillStyle = `rgba(20,25,60,${0.38 * (1 - night * 0.8)})`;
  for (const b of city.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, b.w + 300)) continue;
    const dx = b.height * 0.6, dy = b.height * 0.38;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w + dx, b.y + dy);
    ctx.lineTo(b.x + b.w + dx, b.y + b.h + dy); ctx.lineTo(b.x + dx, b.y + b.h + dy); ctx.lineTo(b.x, b.y + b.h);
    ctx.fill();
  }
  for (const p of city.props) {
    if (p.type !== 'palm' || !inView(p.x, p.y)) continue;
    ctx.beginPath(); ctx.ellipse(p.x + 26, p.y + 17, 20, 13, 0.6, 0, 6.28); ctx.fill();
  }
}

function drawBuilding(ctx, b, night) {
  const base = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  const roof = base.map(([x, y]) => proj(x, y, b.height));
  const cx = G.cam.x, cy = G.cam.y;
  const vis = [cy < b.y, cx > b.x + b.w, cy > b.y + b.h, cx < b.x];
  const shadeF = [0.66, 0.8, 0.94, 0.72];
  const floors = Math.max(1, Math.round(b.height / 26));
  const glass = b.kind === 'tower';
  for (let i = 0; i < 4; i++) {
    if (!vis[i]) continue;
    const a0 = base[i], a1 = base[(i + 1) % 4], r0 = roof[i], r1 = roof[(i + 1) % 4];
    ctx.fillStyle = shade(b.color, shadeF[i] * (night > 0.5 ? 0.85 : 1));
    ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(r1[0], r1[1]); ctx.lineTo(r0[0], r0[1]); ctx.fill();
    // floor bands and window columns
    ctx.strokeStyle = night > 0.4 ? `rgba(255,214,120,${0.25 + night * 0.45})` : glass ? 'rgba(200,235,255,0.35)' : 'rgba(0,0,0,0.13)';
    ctx.lineWidth = glass ? 1.2 : 1;
    ctx.beginPath();
    for (let f = 1; f < floors; f++) {
      const t = f / floors;
      ctx.moveTo(lerp(a0[0], r0[0], t), lerp(a0[1], r0[1], t)); ctx.lineTo(lerp(a1[0], r1[0], t), lerp(a1[1], r1[1], t));
    }
    if (glass || b.kind === 'hotel') {
      const cols = Math.max(2, Math.round(Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) / 14));
      for (let s = 1; s < cols; s++) {
        const t = s / cols;
        ctx.moveTo(lerp(a0[0], a1[0], t), lerp(a0[1], a1[1], t)); ctx.lineTo(lerp(r0[0], r1[0], t), lerp(r0[1], r1[1], t));
      }
    }
    ctx.stroke();
    if (night > 0.4 && b.kind !== 'container' && b.kind !== 'house') { // lit windows
      ctx.fillStyle = `rgba(255,220,130,${0.5 + night * 0.4})`;
      const cols = Math.max(2, Math.round(Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) / 12));
      for (let f = 0; f < floors; f++) for (let s2 = 0; s2 < cols; s2++) {
        if (((f * 7 + s2 * 13 + Math.floor(b.x)) % 5) > 1) continue;
        const t = (f + 0.5) / floors, u = (s2 + 0.5) / cols;
        const px = lerp(lerp(a0[0], a1[0], u), lerp(r0[0], r1[0], u), t), py = lerp(lerp(a0[1], a1[1], u), lerp(r0[1], r1[1], u), t);
        ctx.fillRect(px - 2, py - 1.5, 4, 3);
      }
    }
  }
  // roof
  const rc = b.roof || shade(b.color, 1.06);
  ctx.fillStyle = rc;
  ctx.beginPath(); roof.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = shade(b.roof || b.color, 0.7); ctx.lineWidth = 2.5; ctx.stroke();
  if (night > 0.35 && b.neon) { ctx.strokeStyle = b.neon; ctx.lineWidth = 3; ctx.shadowColor = b.neon; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0; }
  const [rx, ry] = roof[0], rw = roof[1][0] - rx, rh = roof[3][1] - ry;
  if (b.kind === 'house') { // hip roof ridge
    ctx.strokeStyle = shade(b.roof, 0.8); ctx.lineWidth = 1.5; ctx.beginPath();
    const inset = Math.min(rw, rh) / 2;
    ctx.moveTo(rx, ry); ctx.lineTo(rx + inset, ry + inset); ctx.moveTo(rx + rw, ry); ctx.lineTo(rx + rw - inset, ry + inset);
    ctx.moveTo(rx, ry + rh); ctx.lineTo(rx + inset, ry + rh - inset); ctx.moveTo(rx + rw, ry + rh); ctx.lineTo(rx + rw - inset, ry + rh - inset);
    ctx.moveTo(rx + inset, ry + inset); ctx.lineTo(rx + rw - inset, ry + rh - inset); ctx.stroke();
  }
  if (b.kind === 'container') { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; for (let k = 4; k < rw; k += 5) { ctx.beginPath(); ctx.moveTo(rx + k, ry); ctx.lineTo(rx + k, ry + rh); ctx.stroke(); } }
  for (const d of b.details) {
    const dx = rx + rw * (d.x ?? 0.5), dy = ry + rh * (d.y ?? 0.5);
    if (d.t === 'ac') { ctx.fillStyle = '#c9ccd1'; ctx.fillRect(dx - 6, dy - 5, 12, 10); ctx.fillStyle = '#8a8f96'; ctx.beginPath(); ctx.arc(dx, dy, 3.5, 0, 6.28); ctx.fill(); }
    else if (d.t === 'tank') { ctx.fillStyle = '#9b7653'; ctx.beginPath(); ctx.arc(dx, dy, 7, 0, 6.28); ctx.fill(); ctx.strokeStyle = '#6e5238'; ctx.lineWidth = 1.5; ctx.stroke(); }
    else if (d.t === 'garden') { ctx.fillStyle = '#5aa64a'; ctx.beginPath(); ctx.roundRect(dx - rw * 0.2, dy - rh * 0.2, rw * 0.4, rh * 0.4, 6); ctx.fill(); ctx.fillStyle = '#3f8a3a'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(dx - rw * 0.1 + k * rw * 0.1, dy, 5, 0, 6.28); ctx.fill(); } }
    else if (d.t === 'pool') { ctx.fillStyle = '#4fd8ee'; ctx.fillRect(dx - rw * 0.15, dy - rh * 0.12, rw * 0.3, rh * 0.24); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(dx - rw * 0.15, dy - rh * 0.12, rw * 0.3, rh * 0.24); }
    else if (d.t === 'heli') {
      const hx = rx + rw / 2, hy = ry + rh / 2, r = Math.min(rw, rh) * 0.28;
      ctx.fillStyle = '#3a3f47'; ctx.beginPath(); ctx.arc(hx, hy, r, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(r)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', hx, hy + 1);
    }
  }
  if (b.sign) {
    const size = clamp(rw / b.sign.length * 1.5, 8, 22);
    ctx.font = `900 ${size}px "Arial Black", Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const sx = rx + rw / 2, sy = ry + (b.landmark === 'tower' ? rh * 0.85 : rh / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(b.sign, sx + 1.5, sy + 1.5);
    ctx.fillStyle = night > 0.4 ? '#ff6ec7' : '#ffffff'; ctx.fillText(b.sign, sx, sy);
    if (b.landmark === 'hospital') { ctx.fillStyle = '#e63946'; ctx.fillRect(sx - 4, sy - rh * 0.3 - 12, 8, 24); ctx.fillRect(sx - 12, sy - rh * 0.3 - 4, 24, 8); }
  }
}

function drawPalm(ctx, p) {
  const h = p.h || 70, [tx, ty] = proj(p.x, p.y, h);
  ctx.strokeStyle = '#8a6a43'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(lerp(p.x, tx, 0.5) + 4, lerp(p.y, ty, 0.5), tx, ty); ctx.stroke();
  const sway = Math.sin(G.t * 0.8 + p.x * 0.01) * 0.08;
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9 + sway + p.x * 0.001;
    ctx.fillStyle = k % 2 ? '#2f8f3a' : '#43a94e';
    ctx.beginPath(); ctx.ellipse(tx + Math.cos(a) * 11, ty + Math.sin(a) * 11, 13, 4.5, a, 0, 6.28); ctx.fill();
  }
  ctx.fillStyle = '#6b4b2a'; ctx.beginPath(); ctx.arc(tx, ty, 3.5, 0, 6.28); ctx.fill();
}

function drawProps(ctx, night) {
  for (const p of city.props) {
    if (!inView(p.x, p.y)) continue;
    if (p.type === 'palm') drawPalm(ctx, p);
    else if (p.type === 'lamp') {
      const [lx, ly] = proj(p.x, p.y, 46);
      ctx.strokeStyle = '#4b5058'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.fillStyle = night > 0.3 ? '#fff3c4' : '#dfe4ea'; ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, 6.28); ctx.fill();
    } else if (p.type === 'umbrella') {
      const [ux, uy] = proj(p.x, p.y, 22);
      ctx.fillStyle = 'rgba(20,30,60,0.2)'; ctx.beginPath(); ctx.arc(p.x + 8, p.y + 6, 13, 0, 6.28); ctx.fill();
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = k % 2 ? p.c : '#ffffff';
        ctx.beginPath(); ctx.moveTo(ux, uy); ctx.arc(ux, uy, 13, (k * Math.PI) / 4, ((k + 1) * Math.PI) / 4); ctx.fill();
      }
    } else if (p.type === 'towel') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-6, -11, 12, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-6, -4, 12, 3); ctx.restore();
    }
  }
}

// ---------------- vehicles & people ----------------
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function drawCar(ctx, c, night) {
  const L = c.len, Wd = c.wid;
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
  ctx.fillStyle = 'rgba(10,20,40,0.42)'; rrect(ctx, -L / 2 + 5, -Wd / 2 + 6, L, Wd, 6); ctx.fill();
  const body = c.dead ? '#2a2a2a' : c.color;
  ctx.fillStyle = body; rrect(ctx, -L / 2, -Wd / 2, L, Wd, c.type === 'van' || c.type === 'armored' ? 3 : 6); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  if (c.driver === G.player) { ctx.strokeStyle = 'rgba(255,210,63,0.95)'; ctx.lineWidth = 2.5; rrect(ctx, -L / 2 - 3, -Wd / 2 - 3, L + 6, Wd + 6, 8); ctx.stroke(); }
  if (c.type === 'police' && !c.dead) { ctx.fillStyle = '#f4f4f4'; ctx.fillRect(-L * 0.12, -Wd / 2, L * 0.3, Wd); }
  if (c.type === 'van' || c.type === 'armored') {
    ctx.fillStyle = c.dead ? '#333' : shade(c.color.startsWith('#') ? c.color : '#888888', 1.12); ctx.fillRect(-L / 2 + 2, -Wd / 2 + 2, L * 0.68, Wd - 4);
    ctx.fillStyle = 'rgba(20,35,55,0.85)'; ctx.fillRect(L * 0.2, -Wd / 2 + 2.5, L * 0.1, Wd - 5);
    if (c.type === 'armored') { ctx.fillStyle = '#ffd23f'; ctx.fillRect(-L / 2 + 6, -2, L * 0.55, 4); }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(L * 0.22, -Wd / 2 + 3, L * 0.22, Wd - 6);
    ctx.fillStyle = 'rgba(25,40,60,0.88)';
    ctx.beginPath(); ctx.moveTo(L * 0.18, -Wd / 2 + 2.5); ctx.lineTo(L * 0.05, -Wd / 2 + 4); ctx.lineTo(L * 0.05, Wd / 2 - 4); ctx.lineTo(L * 0.18, Wd / 2 - 2.5); ctx.fill();
    ctx.fillRect(-L * 0.36, -Wd / 2 + 3.5, L * 0.1, Wd - 7);
    ctx.fillStyle = c.dead ? '#222' : shade(c.color, 1.12); ctx.fillRect(-L * 0.26, -Wd / 2 + 3, L * 0.31, Wd - 6);
    if (c.type === 'taxi') { ctx.fillStyle = '#222'; ctx.fillRect(-L * 0.12, -3, 7, 6); }
    if (c.type === 'sports') { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-L / 2 + 1, -Wd / 2 + 1, 3, Wd - 2); }
  }
  // lights
  ctx.fillStyle = night > 0.3 ? '#ffffff' : '#fff6c8';
  ctx.fillRect(L / 2 - 3, -Wd / 2 + 2, 3, 4); ctx.fillRect(L / 2 - 3, Wd / 2 - 6, 3, 4);
  ctx.fillStyle = c.brake ? '#ff2a2a' : '#a01818';
  ctx.fillRect(-L / 2, -Wd / 2 + 2, 2.5, 4); ctx.fillRect(-L / 2, Wd / 2 - 6, 2.5, 4);
  if (c.type === 'police' && !c.dead) {
    const on = c.siren && Math.floor(G.t * 8) % 2;
    ctx.fillStyle = on ? '#ff2d2d' : '#5a1010'; ctx.fillRect(-2, -Wd / 2 + 3, 5, Wd / 2 - 3);
    ctx.fillStyle = !on && c.siren ? '#2d7dff' : '#10205a'; ctx.fillRect(-2, 0, 5, Wd / 2 - 3);
  }
  ctx.restore();
}

function drawPed(ctx, p) {
  if (p.car || p.hidden) return;
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
  if (p.dead) {
    ctx.fillStyle = p.shirt; ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0.3, 0, 6.28); ctx.fill();
    ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(11, 2, 4, 0, 6.28); ctx.fill();
    ctx.restore(); return;
  }
  ctx.fillStyle = 'rgba(10,20,40,0.3)'; ctx.beginPath(); ctx.arc(3, 3, 7.5, 0, 6.28); ctx.fill();
  const s = Math.sin(p.walk * 6) * 4;
  ctx.fillStyle = '#2b2d42'; ctx.beginPath(); ctx.ellipse(s, -3, 3.5, 2, 0, 0, 6.28); ctx.ellipse(-s, 3, 3.5, 2, 0, 0, 6.28); ctx.fill();
  ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(-s * 0.8, -7, 2.2, 0, 6.28); ctx.arc(s * 0.8, 7, 2.2, 0, 6.28); ctx.fill();
  ctx.fillStyle = p.shirt; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 7.5, 0, 0, 6.28); ctx.fill();
  const armed = p === G.player ? G.weapon !== 'fist' : p.weapon;
  if (armed) { ctx.fillStyle = '#1b1b1b'; ctx.fillRect(4, 1, 9, 3); }
  ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(0.5, 0, 4.2, 0, 6.28); ctx.fill();
  ctx.fillStyle = p.role === 'cop' ? '#1d2c4a' : p.hair; ctx.beginPath(); ctx.arc(-0.5, 0, 4.3, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  if (p.role === 'cop') { ctx.fillRect(-1, -4.3, 3, 8.6); }
  if (p.role === 'gang') { ctx.fillStyle = '#0fa3b1'; ctx.fillRect(-3, -4.5, 3, 9); }
  ctx.restore();
  if (p === G.player) { ctx.strokeStyle = 'rgba(255,210,63,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 6.28); ctx.stroke(); }
}

function drawPickup(ctx, k) {
  const bob = Math.sin(G.t * 4 + k.x) * 2;
  ctx.save(); ctx.translate(k.x, k.y + bob);
  if (k.type === 'cash' || k.type === 'bag') {
    ctx.fillStyle = '#2f9e44'; ctx.fillRect(-7, -4, 14, 8); ctx.fillStyle = '#b2f2bb'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 0.5);
  } else if (k.type === 'health') {
    ctx.fillStyle = '#fff'; ctx.fillRect(-7, -7, 14, 14); ctx.fillStyle = '#e63946'; ctx.fillRect(-2, -5, 4, 10); ctx.fillRect(-5, -2, 10, 4);
  } else if (k.type === 'armor') {
    ctx.fillStyle = '#4dabf7'; ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(6, -7); ctx.lineTo(6, 1); ctx.lineTo(0, 7); ctx.lineTo(-6, 1); ctx.fill();
  } else {
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.28); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(-5, -1.5, 10, 3); ctx.fillRect(-5, -1.5, 3, 6);
  }
  ctx.restore();
}

function drawMarkers(ctx, markers) {
  for (const m of markers) {
    if (!inView(m.x, m.y)) continue;
    const pulse = 0.5 + 0.5 * Math.sin(G.t * 4);
    if (m.ent) { ctx.strokeStyle = m.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.x, m.y, 12 + pulse * 2, 0, 6.28); ctx.stroke(); continue; }
    ctx.globalAlpha = 0.35 + pulse * 0.25; ctx.fillStyle = m.c;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.svc ? 18 : 24, 0, 6.28); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = m.c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(m.x, m.y, (m.svc ? 18 : 24) + pulse * 4, 0, 6.28); ctx.stroke();
  }
}
function drawMarkerArrows(ctx, markers) {
  for (const m of markers) {
    if (!inView(m.x, m.y) || m.svc) continue;
    const [ax, ay] = proj(m.x, m.y, (m.ent ? 30 : 60) + Math.sin(G.t * 3) * 8);
    ctx.fillStyle = m.c; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax - 10, ay - 14); ctx.lineTo(ax + 10, ay - 14); ctx.lineTo(ax, ay); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function drawParticles(ctx, layer) {
  for (const p of G.particles) {
    const a = p.life / p.max;
    if (layer === 'low' && p.type === 'blood') { ctx.fillStyle = `rgba(150,10,20,${a})`; ctx.fillRect(p.x, p.y, p.size, p.size); }
    else if (layer === 'high') {
      if (p.type === 'smoke') { ctx.fillStyle = `rgba(70,70,75,${a * 0.45})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill(); }
      else if (p.type === 'fire') { ctx.fillStyle = a > 0.5 ? `rgba(255,220,90,${a})` : `rgba(255,110,30,${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.5 + (1 - a)), 0, 6.28); ctx.fill(); }
      else if (p.type === 'flash') { ctx.fillStyle = `rgba(255,245,180,${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, 7 * a + 2, 0, 6.28); ctx.fill(); }
      else if (p.type === 'spark') { ctx.fillStyle = `rgba(255,230,140,${a})`; ctx.fillRect(p.x, p.y, 2.5, 2.5); }
    }
  }
}

// ---------------- frame ----------------
export function renderWorld(ctx, markers = []) {
  const { w, h } = G.screen, z = G.cam.zoom;
  const sx = G.shake ? (Math.random() - 0.5) * G.shake : 0, sy = G.shake ? (Math.random() - 0.5) * G.shake : 0;
  view = { x0: G.cam.x - w / 2 / z, y0: G.cam.y - h / 2 / z, x1: G.cam.x + w / 2 / z, y1: G.cam.y + h / 2 / z };
  const sky = skyAt(G.clock);
  ctx.setTransform(z, 0, 0, z, w / 2 - G.cam.x * z + sx, h / 2 - G.cam.y * z + sy);
  drawGround(ctx);
  for (const d of G.decals) {
    if (!inView(d.x, d.y)) continue;
    ctx.fillStyle = d.type === 'blood' ? 'rgba(120,10,15,0.7)' : 'rgba(15,15,15,0.6)';
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.size, d.size * 0.7, d.a, 0, 6.28); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(20,20,20,0.35)'; ctx.lineWidth = 3;
  for (const s of G.skids) {
    if (!inView(s.x, s.y)) continue;
    const nx = -Math.sin(s.a) * 7, ny = Math.cos(s.a) * 7, fx = Math.cos(s.a) * 3, fy = Math.sin(s.a) * 3;
    ctx.globalAlpha = Math.min(1, s.t / 4);
    ctx.beginPath(); ctx.moveTo(s.x + nx - fx, s.y + ny - fy); ctx.lineTo(s.x + nx + fx, s.y + ny + fy); ctx.moveTo(s.x - nx - fx, s.y - ny - fy); ctx.lineTo(s.x - nx + fx, s.y - ny + fy); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawMarkers(ctx, markers);
  for (const k of G.pickups) if (!k.hide && inView(k.x, k.y)) drawPickup(ctx, k);
  drawShadows(ctx, sky.night);
  drawParticles(ctx, 'low');
  for (const p of G.peds) if (p.dead && inView(p.x, p.y)) drawPed(ctx, p);
  for (const p of G.peds) if (!p.dead && inView(p.x, p.y)) drawPed(ctx, p);
  for (const c of G.cars) if (inView(c.x, c.y)) drawCar(ctx, c, sky.night);
  ctx.lineWidth = 2.5;
  for (const t of G.tracers) { ctx.strokeStyle = `rgba(255,236,150,${t.t / 0.07})`; ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke(); }
  drawParticles(ctx, 'high');
  const vis = city.buildings.filter((b) => inView(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 260));
  vis.sort((a, b) => a.height - b.height);
  for (const b of vis) drawBuilding(ctx, b, sky.night);
  drawProps(ctx, sky.night);
  drawMarkerArrows(ctx, markers);
  // lighting
  if (sky.amt > 0.01) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    const m = sky.tint.map((v) => Math.round(lerp(255, v, sky.amt)));
    ctx.fillStyle = `rgb(${m[0]},${m[1]},${m[2]})`; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (sky.night > 0.05) {
    ctx.setTransform(z, 0, 0, z, w / 2 - G.cam.x * z + sx, h / 2 - G.cam.y * z + sy);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = sky.night * 0.75;
    const lamp = glow('rgba(255,196,96,0.95)');
    for (const p of city.props) if (p.type === 'lamp' && inView(p.x, p.y)) ctx.drawImage(lamp, p.x - 70, p.y - 70, 140, 140);
    const head = glow('rgba(255,250,215,0.5)');
    for (const c of G.cars) {
      if (c.dead || !inView(c.x, c.y)) continue;
      const fx = Math.cos(c.a), fy = Math.sin(c.a);
      for (let k = 1; k <= 3; k++) ctx.drawImage(head, c.x + fx * (c.len / 2 + k * 26) - 18 - k * 6, c.y + fy * (c.len / 2 + k * 26) - 18 - k * 6, 36 + k * 12, 36 + k * 12);
      if (c.type === 'police' && c.siren) ctx.drawImage(glow(Math.floor(G.t * 8) % 2 ? 'rgba(255,40,40,0.8)' : 'rgba(40,110,255,0.8)'), c.x - 50, c.y - 50, 100, 100);
    }
    const neon = glow('rgba(255,90,200,0.35)');
    for (const b of city.buildings) if (b.sign && inView(b.x, b.y, 200)) ctx.drawImage(neon, b.x - 30, b.y + b.h - 40, b.w + 60, 90);
    for (const p of G.particles) if (p.type === 'fire') ctx.drawImage(glow('rgba(255,140,40,0.6)'), p.x - 30, p.y - 30, 60, 60);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  if (sky.amt > 0.15 && sky.night < 0.6) { // warm sun haze from the west
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, w, h * 0.6);
    g.addColorStop(0, `rgba(255,150,70,${sky.amt * 0.35})`); g.addColorStop(1, 'rgba(255,150,70,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
