// Tastatur + Maus mit Pointer-Lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // nur in diesem Frame gedrückt
    this.mouseDX = 0; this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = new Set();
    this.clicked = new Set();
    this.locked = false;
    this.enabled = true;
    this.sensitivity = 1;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT')) return;
      if (['Tab', 'Space', 'ControlLeft'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button); this.clicked.add(e.button);
    });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.buttons.clear(); }
      this.onLockChange && this.onLockChange(this.locked);
    });
  }
  lock() {
    const plain = () => { try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* nicht erlaubt */ } };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(plain);
    } catch (e) { plain(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  click(btn) { return this.enabled && this.clicked.has(btn); }
  mouse(btn) { return this.enabled && this.buttons.has(btn); }
  consumeMouse() {
    const s = 0.0022 * this.sensitivity;
    const r = [this.mouseDX * s, this.mouseDY * s];
    this.mouseDX = 0; this.mouseDY = 0;
    return r;
  }
  endFrame() { this.pressed.clear(); this.clicked.clear(); this.wheel = 0; }
}
