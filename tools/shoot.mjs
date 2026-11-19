// SPDX-License-Identifier: MIT
// Takes the screenshots listed in shots.json by rendering the real game in headless Chrome.
// Usage: CHROME=/path/to/chrome node tools/shoot.mjs [name ...]
// Each scene is the game's own code (?shot=<scene>) simulated deterministically, then captured as JPEG.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const root = new URL('..', import.meta.url).pathname;
const chrome = process.env.CHROME || 'google-chrome';
const PORT = 8099, DBG = 9339;
const only = process.argv.slice(2);
const shots = JSON.parse(readFileSync(root + 'shots.json', 'utf8')).filter((s) => !only.length || only.includes(s.name));

const server = spawn(process.execPath, [root + 'serve.ts', String(PORT)], { stdio: 'ignore' });
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${DBG}`, '--window-size=1280,720', '--hide-scrollbars',
  '--no-first-run', '--no-sandbox', '--mute-audio', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/shoot-profile`, 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('chrome did not start');
}

try {
  const ws = new WebSocket(await target());
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const waiting = new Map(); const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  mkdirSync(root + 'screenshots', { recursive: true });
  for (const s of shots) {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${s.query}` });
    let ok = false;
    for (let i = 0; i < 100 && !ok; i++) {
      await sleep(150);
      const r = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
      ok = r.result?.result?.value === true;
    }
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: Number(process.env.Q || 80) });
    const buf = Buffer.from(shot.result.data, 'base64');
    writeFileSync(root + 'screenshots/' + s.name, buf);
    console.log(`${s.name}: ${ok ? 'ready' : 'TIMEOUT'} ${(buf.length / 1024).toFixed(0)} KiB`);
  }
  if (errors.length) console.log('page errors:\n' + [...new Set(errors)].slice(0, 10).join('\n'));
  ws.close();
} finally {
  browser.kill(); server.kill();
}
