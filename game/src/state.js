// SPDX-License-Identifier: MIT
// The single shared game state. Every system reads and writes G.
export const G = {
  mode: 'title',      // title | play | pause | map | wasted | busted | ending
  t: 0,               // seconds of simulation
  clock: 17 * 60,     // in-game minutes since midnight
  money: 250,
  player: null,
  cars: [], peds: [], tracers: [], particles: [], decals: [], skids: [], pickups: [],
  wanted: { level: 0, heat: 0, unseen: 0, flash: 0 },
  weapons: { fist: true, pistol: 0, smg: 0 }, // ammo counts
  weapon: 'fist',
  story: { done: 0, active: null, stage: 0, timer: 0, data: {} },
  msgs: [],           // { text, t, color }
  dialog: null,       // { who, lines, i, t }
  banner: null,       // { title, sub, t }
  zone: '', zoneT: 0,
  cam: { x: 0, y: 0, zoom: 1 },
  screen: { w: 1280, h: 720 },
  stats: { cars: 0, kills: 0, busted: 0, wasted: 0 },
  radio: true,
  shot: null,         // screenshot scene name when ?shot= is set
  shake: 0,
  deadT: 0,
};

export function say(text, color = '#fff') {
  G.msgs.push({ text, t: 4, color });
  if (G.msgs.length > 4) G.msgs.shift();
}
