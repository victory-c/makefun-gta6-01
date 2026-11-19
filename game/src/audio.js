// SPDX-License-Identifier: MIT
// All sound is synthesised live with WebAudio: no audio files, no network.
// Engine drone, two-tone siren, gunshots, crashes, pickups and "Sunline FM", a little synthwave radio.
let ac = null, master = null, engOsc = null, engGain = null, sirenOsc = null, sirenGain = null, musicGain = null;
let noiseBuf = null, musicNext = 0, musicStep = 0;
export const audio = { enabled: true };

export function initAudio() {
  if (ac || !audio.enabled) return;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  engOsc = ac.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 40;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  engGain = ac.createGain(); engGain.gain.value = 0;
  engOsc.connect(lp).connect(engGain).connect(master); engOsc.start();
  sirenOsc = ac.createOscillator(); sirenOsc.type = 'square'; sirenOsc.frequency.value = 700;
  sirenGain = ac.createGain(); sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain).connect(master); sirenOsc.start();
  musicGain = ac.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
  musicNext = ac.currentTime + 0.1;
}

function tone(freq, dur, type = 'square', vol = 0.2, slide = 0, dest = master, at = ac.currentTime) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), at + dur);
  g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(dest); o.start(at); o.stop(at + dur + 0.02);
}
function noise(dur, vol, freq = 1200, at = ac.currentTime) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  s.connect(f).connect(g).connect(master); s.start(at); s.stop(at + dur);
}

export function sfx(name, vol = 1) {
  if (!ac) return;
  switch (name) {
    case 'pistol': noise(0.12, 0.5 * vol, 2500); tone(180, 0.08, 'square', 0.15 * vol, -120); break;
    case 'smg': noise(0.07, 0.35 * vol, 3000); break;
    case 'punch': noise(0.06, 0.3 * vol, 600); break;
    case 'crash': noise(0.35, 0.6 * vol, 700); tone(90, 0.25, 'triangle', 0.3 * vol, -40); break;
    case 'boom': noise(1.2, 0.9 * vol, 400); tone(60, 0.9, 'sine', 0.6 * vol, -35); break;
    case 'pickup': tone(880, 0.08, 'square', 0.12); tone(1320, 0.12, 'square', 0.12, 0, master, ac.currentTime + 0.08); break;
    case 'door': tone(220, 0.08, 'triangle', 0.2, -80); break;
    case 'horn': tone(392, 0.35, 'sawtooth', 0.12); tone(494, 0.35, 'sawtooth', 0.1); break;
    case 'pass': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'square', 0.12, 0, master, ac.currentTime + i * 0.12)); break;
    case 'fail': [392, 330, 262].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.12, 0, master, ac.currentTime + i * 0.18)); break;
    case 'star': tone(660, 0.15, 'square', 0.1, 200); break;
    case 'cash': tone(1567, 0.06, 'square', 0.1); tone(2093, 0.1, 'square', 0.08, 0, master, ac.currentTime + 0.06); break;
  }
}

// Per-frame continuous sounds.
const BASS = [41.2, 41.2, 55, 49], CHORD = [[164.8, 196, 246.9], [164.8, 196, 246.9], [220, 261.6, 329.6], [196, 246.9, 293.7]];
export function updateAudio(state) {
  if (!ac) return;
  const now = ac.currentTime;
  engGain.gain.setTargetAtTime(state.inCar ? 0.09 + state.speed * 0.08 : 0, now, 0.1);
  engOsc.frequency.setTargetAtTime(38 + state.speed * 110, now, 0.08);
  sirenGain.gain.setTargetAtTime(state.siren ? 0.035 * state.siren : 0, now, 0.2);
  sirenOsc.frequency.setValueAtTime(Math.floor(now * 2) % 2 ? 960 : 720, now);
  musicGain.gain.setTargetAtTime(state.inCar && state.radio ? 0.22 : 0, now, 0.4);
  // schedule Sunline FM a little ahead: 16th notes at 104 bpm
  const step = 60 / 104 / 4;
  while (musicNext < now + 0.2) {
    const bar = Math.floor(musicStep / 16) % 4, s = musicStep % 16;
    if (s % 4 === 0) tone(BASS[bar], step * 3.5, 'sawtooth', 0.35, 0, musicGain, musicNext);
    if (s % 2 === 1) tone(BASS[bar] * 2, step, 'square', 0.12, 0, musicGain, musicNext);
    const ch = CHORD[bar];
    tone(ch[(s * 7) % 3] * 2, step * 0.9, 'triangle', 0.12, 0, musicGain, musicNext);
    if (s === 4 || s === 12) {
      const sn = ac.createBufferSource(); sn.buffer = noiseBuf;
      const g = ac.createGain(); g.gain.setValueAtTime(0.25, musicNext); g.gain.exponentialRampToValueAtTime(0.001, musicNext + 0.15);
      sn.connect(g).connect(musicGain); sn.start(musicNext); sn.stop(musicNext + 0.15);
    }
    musicNext += step; musicStep++;
  }
}
