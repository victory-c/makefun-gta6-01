// SPDX-License-Identifier: MIT
// The story of Sunline Heat: Nina Reyes comes home to Sunline City and takes it back from
// Silas "Saltwater" Crane. Six story missions, plus side services (Fresh Coat, Lock & Load, safehouse).
import { G, say } from './state.js';
import { city, T } from './city.js';
import { makeCar, makePed, puff } from './entities.js';
import { setWanted } from './ai.js';
import { sfx } from './audio.js';
import { dist, fmtMoney } from './util.js';

const L = (id) => city.landmarks[id].marker;
const near = (p, q, r = 40) => dist(p.x, p.y, q.x, q.y) < r;
const pos = () => (G.player.car ? G.player.car : G.player);

export const MISSIONS = [
  {
    id: 'homecoming', title: 'Homecoming', giver: 'busstop', reward: 500,
    intro: [
      ['Nina', 'Six years upstate, and Sunline still smells like sunscreen and gasoline.'],
      ['Tio Ramon (phone)', 'Nina! Come to the Mango Diner on Calle Mango. Take any car \u2014 nobody walks in this town.'],
    ],
    setup() { G.story.stage = 0; },
    update() {
      const P = pos();
      if (G.story.stage === 0) {
        if (!G.player.car) return { obj: 'Get a car: walk up to one and press F', targets: [] };
        G.story.stage = 1;
      }
      if (near(P, L('diner'), 50)) return 'pass';
      return { obj: 'Drive to the Mango Diner on Calle Mango', targets: [{ ...L('diner'), c: '#ffd23f', label: 'Diner' }] };
    },
    outro: [['Tio Ramon', 'Look at you! Eat something. Then we talk about Silas Crane \u2014 he owns half this city now.']],
  },
  {
    id: 'wheels', title: 'Golden Wheels', giver: 'diner', reward: 1500,
    intro: [
      ['Tio Ramon', 'Dex at Port Solmar owes me. He wants Crane\u2019s gold Vexa GT, parked up at Crane Villa in Coral Hills.'],
      ['Nina', 'Steal from the man who runs the city. Sounds like a reunion.'],
    ],
    setup() {
      const m = L('mansion');
      const c = makeCar('sports', m.x + 60, m.y + 2, 0, { color: '#ffbe0b' });
      c.mission = true; c.parked = true; G.story.data.car = c; G.story.stage = 0;
    },
    update() {
      const c = G.story.data.car;
      if (!c || c.dead || c.burning) return 'fail:The Vexa was wrecked.';
      if (G.story.stage === 0) {
        if (G.player.car === c) { G.story.stage = 1; setWanted(2); say('Crane\u2019s security called the cops!', '#ff6b6b'); }
        else return { obj: 'Steal the gold Vexa GT at Crane Villa', targets: [{ x: c.x, y: c.y, c: '#ffbe0b', label: 'Vexa' }] };
      }
      if (G.player.car !== c) return { obj: 'Get back in the Vexa', targets: [{ x: c.x, y: c.y, c: '#ffbe0b', label: 'Vexa' }] };
      if (G.wanted.level > 0) return { obj: 'Lose the cops before delivering (try a Fresh Coat garage)', targets: sprays() };
      if (near(c, L('garage'), 60)) { c.mission = false; G.player.car = null; exitCarAt(c); c.parked = true; return 'pass'; }
      return { obj: 'Deliver the Vexa to Dex Auto at Port Solmar', targets: [{ ...L('garage'), c: '#ffd23f', label: 'Dex' }] };
    },
    outro: [['Dex', 'Not a scratch. Ramon said you were good. Come see me when you want real work.']],
  },
  {
    id: 'collections', title: 'Collection Day', giver: 'garage', reward: 2000,
    intro: [
      ['Dex', 'Crane\u2019s boys squeeze every shop on Calle Mango on Fridays. Today we get there first.'],
      ['Dex', 'Three drops. Two and a half minutes. Go.'],
    ],
    setup() {
      G.story.data.drops = [
        { x: 72 * T, y: 69.5 * T }, { x: 85.5 * T, y: 79 * T }, { x: 62.5 * T, y: 85.5 * T },
      ].map((d) => ({ ...d, got: false }));
      G.story.timer = 150;
    },
    update(dt) {
      G.story.timer -= dt;
      if (G.story.timer <= 0) return 'fail:Too slow. Crane\u2019s men got there first.';
      const left = G.story.data.drops.filter((d) => !d.got);
      for (const d of left) if (near(pos(), d, 40)) { d.got = true; G.money += 400; sfx('cash'); say('+$400 collected', '#7CFC9A'); }
      if (left.length === 0) return 'pass';
      return { obj: `Collect from the shops (${3 - left.length}/3)  \u23F1 ${Math.ceil(G.story.timer)}s`, targets: left.map((d) => ({ ...d, c: '#7CFC9A', label: '$' })) };
    },
    outro: [['Dex', 'Crane is going to notice that. Good. I want him nervous.']],
  },
  {
    id: 'sharks', title: 'Shark Bait', giver: 'diner', reward: 3000,
    intro: [
      ['Tio Ramon', 'Los Tiburones deal on Sunline Beach for Crane. Tourists, kids, nobody cares.'],
      ['Tio Ramon', 'Take my old pistol. Clear the beach, mija.'],
    ],
    setup() {
      G.weapons.pistol += 48; G.weapon = 'pistol';
      say('Got a Pistol (Q/E to switch weapons)', '#ffd23f');
      G.story.data.gang = [];
      for (let k = 0; k < 6; k++) {
        const g = makePed('gang', 8.2 * T + (k % 2) * 30, 58 * T + k * 34, { weapon: k % 3 === 0 ? 'smg' : 'pistol', hp: 80 });
        g.mission = true; g.hostile = false; g.home = { x: g.x, y: g.y }; G.story.data.gang.push(g);
      }
    },
    update() {
      const left = G.story.data.gang.filter((g) => !g.dead);
      for (const g of left) if (dist(g.x, g.y, G.player.x, G.player.y) < 260) g.hostile = true;
      if (left.length === 0) return 'pass';
      return { obj: `Take out Los Tiburones on Sunline Beach (${left.length} left)`, targets: left.map((g) => ({ x: g.x, y: g.y, c: '#ff4d6d', label: '' })) };
    },
    outro: [['Tio Ramon', 'The beach is ours again. Crane will send someone. Let him.']],
  },
  {
    id: 'delivery', title: 'Special Delivery', giver: 'garage', reward: 5000,
    intro: [
      ['Dex', 'A friend inside Crane Tower left a briefcase at the front desk: Crane\u2019s ledgers.'],
      ['Dex', 'Get it to the Verde Links Clubhouse. Every cop on his payroll will be on you.'],
    ],
    setup() { G.story.stage = 0; },
    update() {
      if (G.story.stage === 0) {
        if (near(pos(), L('tower'), 45)) { G.story.stage = 1; setWanted(3); sfx('pickup'); say('Briefcase grabbed. The SCPD is coming!', '#ff6b6b'); }
        else return { obj: 'Pick up the briefcase at Crane Tower, Downtown', targets: [{ ...L('tower'), c: '#ffd23f', label: 'Case' }] };
      }
      if (near(pos(), L('club'), 55)) return 'pass';
      return { obj: 'Deliver the ledgers to the Verde Links Clubhouse', targets: [{ ...L('club'), c: '#ffd23f', label: 'Club' }] };
    },
    outro: [['Dex', 'The ledgers name every cop Crane owns. One job left, Nina. The big one.']],
  },
  {
    id: 'finale', title: 'Armored Sunset', giver: 'diner', reward: 25000,
    intro: [
      ['Tio Ramon', 'Crane moves his cash out of Downtown in an armored truck at sunset. Tonight he is short a driver.'],
      ['Nina', 'Stop the truck, take the money, boat out from Pier 3. Easy.'],
    ],
    setup() {
      const n = city.nodes[5][4];
      const c = makeCar('armored', n.x + 120, n.y + 20, 0);
      c.mission = true; c.driver = makePed('civ', c.x, c.y, { shirt: '#333' }); c.driver.car = c; c.driver.mission = true;
      c.ai = { mode: 'traffic', from: { i: 5, j: 4 }, to: { i: 6, j: 4 }, d: [1, 0], stuck: 0, rev: 0, angry: 0, cruise: 190 };
      G.story.data.truck = c; G.story.stage = 0;
    },
    update() {
      const c = G.story.data.truck;
      if (G.story.stage === 0) {
        if (c.hp < c.maxHp * 0.35 || c.dead || c.burning) {
          c.burning = 0; c.ai = null; if (c.driver) { c.driver.car = null; c.driver.x = c.x + 30; c.driver.y = c.y; c.driver.state = 'flee'; c.driver.fleeT = 20; c.driver = null; }
          G.story.stage = 1; setWanted(4); puff(c.x, c.y, 'smoke', 20, 60);
          G.story.data.bag = { x: c.x - Math.sin(c.a) * 30, y: c.y + Math.cos(c.a) * 30 };
          say('The truck is down! Grab the cash!', '#ffd23f');
        } else return { obj: 'Ram or shoot the armored truck until it stops', targets: [{ x: c.x, y: c.y, c: '#ff4d6d', label: 'Truck' }], bar: c.hp / c.maxHp };
      }
      if (G.story.stage === 1) {
        if (near(G.player, G.story.data.bag, 30) || (G.player.car && near(G.player.car, G.story.data.bag, 40))) { G.story.stage = 2; sfx('cash'); say('Got the money bags!', '#7CFC9A'); }
        else return { obj: 'Grab the money bags', targets: [{ ...G.story.data.bag, c: '#7CFC9A', label: '$' }] };
      }
      if (near(pos(), L('boat'), 70)) return 'pass';
      return { obj: 'Escape to the speedboat at Pier 3, Port Solmar', targets: [{ ...L('boat'), c: '#ffd23f', label: 'Boat' }] };
    },
    outro: [['Nina', 'Crane\u2019s money, Crane\u2019s ledgers, and the whole Gulf ahead of us. Sunline is ours.']],
  },
];

function exitCarAt(c) {
  const p = G.player;
  p.car = null; c.driver = null; p.x = c.x - Math.sin(c.a) * 26; p.y = c.y + Math.cos(c.a) * 26; p.hidden = false;
}

function sprays() { return ['spray1', 'spray2'].map((id) => ({ ...L(id), c: '#3fc1b0', label: 'Spray' })); }

export function nextMission() { return MISSIONS[G.story.done] || null; }

export function startMission(m) {
  G.story.active = m; G.story.stage = 0; G.story.timer = 0; G.story.data = {};
  G.banner = { title: m.title, sub: `Mission ${G.story.done + 1} of ${MISSIONS.length}`, t: 3, color: '#ffd23f' };
  G.dialog = { lines: m.intro, i: 0, t: 0 };
  m.setup();
}

export function failMission(reason) {
  const m = G.story.active; if (!m) return;
  G.story.active = null; G.objective = null;
  for (const c of G.cars) c.mission = false;
  for (const p of G.peds) p.mission = false;
  G.banner = { title: 'MISSION FAILED', sub: reason || '', t: 4, color: '#ff4d6d' };
  sfx('fail');
}

function passMission() {
  const m = G.story.active;
  G.story.active = null; G.story.done++; G.money += m.reward; G.objective = null;
  for (const p of G.peds) p.mission = false;
  G.banner = { title: 'MISSION PASSED', sub: `+${fmtMoney(m.reward)}`, t: 4, color: '#7CFC9A' };
  G.dialog = { lines: m.outro, i: 0, t: 0 };
  sfx('pass');
  if (G.story.done >= MISSIONS.length) { G.endingT = 6; }
  G.onSave && G.onSave('Autosaved');
}

export function missionTick(dt) {
  const m = G.story.active;
  if (m) {
    const r = m.update(dt);
    if (r === 'pass') passMission();
    else if (typeof r === 'string' && r.startsWith('fail')) failMission(r.slice(5));
    else G.objective = r;
    return;
  }
  G.objective = null;
  const nm = nextMission();
  if (nm && G.wanted.level === 0 && !G.dialog && near(pos(), L(nm.giver), 36)) startMission(nm);
}

// Markers that show while free roaming: next story mission and services.
export function worldMarkers() {
  const out = [];
  const nm = nextMission();
  if (!G.story.active && nm) out.push({ ...L(nm.giver), c: '#ffd23f', label: nm.title, icon: '!' });
  if (G.objective) for (const t of G.objective.targets) out.push({ ...t, icon: t.label || '\u25BC' });
  out.push({ ...L('spray1'), c: '#3fc1b0', label: 'Fresh Coat', icon: 'S', svc: true });
  out.push({ ...L('spray2'), c: '#3fc1b0', label: 'Fresh Coat', icon: 'S', svc: true });
  out.push({ ...L('guns'), c: '#ff6b6b', label: 'Lock & Load', icon: 'G', svc: true });
  out.push({ ...L('safehouse'), c: '#ffffff', label: 'Safehouse', icon: 'H', svc: true });
  return out;
}

// Services: respray (clears stars), gun shop, safehouse save.
export function servicesTick(dt) {
  const P = pos();
  G.shopOpen = false;
  for (const id of ['spray1', 'spray2']) {
    if (G.player.car && near(P, L(id), 46) && G.sprayCool <= 0) {
      G.sprayCool = 4;
      if (G.wanted.level === 0) { say('Fresh Coat: come back when you are hot.', '#3fc1b0'); continue; }
      if (G.money < 100) { say('Fresh Coat: $100 for a new coat. You are broke.', '#ff6b6b'); continue; }
      const c = G.player.car;
      G.money -= 100; setWanted(0); c.hp = c.maxHp; c.color = ['#ff006e', '#00b4d8', '#ffbe0b', '#8338ec', '#2ec4b6', '#f1faee'][Math.floor(G.t) % 6];
      sfx('pass'); say('New paint, new plates. Stars cleared. -$100', '#3fc1b0');
    }
  }
  G.sprayCool = (G.sprayCool || 0) - dt;
  if (!G.player.car && near(P, L('guns'), 40)) G.shopOpen = true;
  if (!G.player.car && near(P, L('safehouse'), 36)) {
    if (!G.savedHere) { G.savedHere = true; G.player.hp = 100; G.onSave && G.onSave('Game saved at the safehouse. Health restored.'); }
  } else G.savedHere = false;
}

export const SHOP = [
  { key: 'Digit1', label: 'Pistol ammo x36', cost: 200, buy: () => { G.weapons.pistol += 36; } },
  { key: 'Digit2', label: 'SMG + 120 rounds', cost: 650, buy: () => { G.weapons.smg += 120; } },
  { key: 'Digit3', label: 'Body armor', cost: 300, buy: () => { G.player.armor = 100; } },
];
