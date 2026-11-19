// SPDX-License-Identifier: MIT
// Small math + seeded random helpers shared by every module.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let gen = mulberry32(1234);
export function setSeed(s) { gen = mulberry32(s); }
export function rand() { return gen(); }
export function rr(a, b) { return a + (b - a) * gen(); }
export function ri(a, b) { return Math.floor(rr(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(gen() * arr.length)]; }
export function chance(p) { return gen() < p; }

// Stable per-tile hash (does not consume the RNG stream) for decorative noise.
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => clamp(Math.round(v * f), 0, 255);
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
export function fmtMoney(n) {
  return '$' + Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
