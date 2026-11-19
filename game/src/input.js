// SPDX-License-Identifier: MIT
// Keyboard + mouse. `pressed` holds keys that went down this frame (cleared each tick).
export const input = {
  down: new Set(), pressed: new Set(),
  mx: 640, my: 360, mouseDown: false, clicked: false,
  auto: null, // scripted controls for screenshot scenes
};

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    if (!input.down.has(e.code)) input.pressed.add(e.code);
    input.down.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => input.down.delete(e.code));
  addEventListener('blur', () => { input.down.clear(); input.mouseDown = false; });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mx = ((e.clientX - r.left) / r.width) * canvas.width;
    input.my = ((e.clientY - r.top) / r.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { input.mouseDown = true; input.clicked = true; } });
  addEventListener('mouseup', (e) => { if (e.button === 0) input.mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export const key = (c) => input.down.has(c);
export const hit = (c) => input.pressed.has(c);
export function endFrame() { input.pressed.clear(); input.clicked = false; }
