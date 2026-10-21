// Touch-Steuerung fürs Handy: Joystick links (laufen, ganz nach vorn = sprinten),
// rechte Bildschirmhälfte wischen = umsehen, Knöpfe für alle Aktionen.
// Die Knöpfe drücken intern dieselben Tasten wie die Tastatur (Standard-Codes), das Spiel merkt keinen Unterschied.

export const isTouchDevice = () => (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
  || (matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window);

// [Code, Symbol, Beschriftung, Gruppe] – 'hold' = gedrückt halten (z. B. Abfahren, Springen)
const BUTTONS = [
  ['Space', '⤒', 'Springen', 'main', 'hold'],
  ['KeyE', '✋', 'Nehmen', 'main'],
  ['Mouse0', '🎯', 'Werfen', 'main'],
  ['KeyC', '⇩', 'Ducken', 'main'],
  ['KeyG', '⤓', 'Ablegen', 'main'],
  ['KeyF', '🔦', 'Licht', 'main'],
  ['KeyQ', '📡', 'Scanner', 'gadget'],
  ['KeyB', '🧨', 'Böller', 'gadget'],
  ['KeyV', '💥', 'Polen', 'gadget'],
  ['KeyX', '👁️', 'Brille', 'gadget'],
  ['KeyT', '💉', 'Adrenalin', 'gadget'],
  ['KeyU', '🫥', 'Umhang', 'gadget'],
  ['KeyK', '🌀', 'Teleport', 'gadget'],
  ['KeyJ', '📯', 'Hupe', 'van'],
  ['KeyR', '📻', 'Radio', 'van'],
  ['KeyH', '🚐', 'Abfahren', 'van', 'hold'],
];

export class TouchControls {
  constructor(app) {
    this.app = app;
    this.input = app.input;
    this.enabled = isTouchDevice();
    this.sens = 2.4;
    if (!this.enabled) return;
    document.documentElement.classList.add('touch');
    this.input.touchMode = true;
    this._build();
  }

  _build() {
    const root = this.root = document.createElement('div');
    root.id = 'touch';
    root.className = 'touch hidden';
    root.innerHTML = `
      <div class="t-look"></div>
      <div class="t-stick-zone"><div class="t-stick"><div class="t-knob"></div></div></div>
      <button class="t-pause" data-pause>⏸</button>
      <div class="t-btns t-gadgets">${BUTTONS.filter((b) => b[3] !== 'main').map((b) => this._btn(b)).join('')}</div>
      <div class="t-btns t-main">${BUTTONS.filter((b) => b[3] === 'main').map((b) => this._btn(b)).join('')}</div>`;
    document.body.appendChild(root);
    this.stick = root.querySelector('.t-stick');
    this.knob = root.querySelector('.t-knob');
    this.move = { id: null, x0: 0, y0: 0 };
    this.look = { id: null, x: 0, y: 0 };

    // Knöpfe
    for (const el of root.querySelectorAll('[data-code]')) {
      const code = el.dataset.code;
      const down = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('on'); this._press(code, true); };
      const up = (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('on'); this._press(code, false); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    }
    root.querySelector('[data-pause]').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.input.unlock(); }, { passive: false });

    // Joystick (linke Hälfte) und Umsehen (rechte Hälfte)
    const zone = root.querySelector('.t-stick-zone'), lookZ = root.querySelector('.t-look');
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (this.move.id !== null) return;
      this.move = { id: t.identifier, x0: t.clientX, y0: t.clientY };
      this.stick.style.left = t.clientX + 'px'; this.stick.style.top = t.clientY + 'px';
      this.stick.classList.add('on');
    }, { passive: false });
    lookZ.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (this.look.id === null) this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }, { passive: false });
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.move.id) this._stick(t.clientX - this.move.x0, t.clientY - this.move.y0);
        if (t.identifier === this.look.id) {
          this.input.mouseDX += (t.clientX - this.look.x) * this.sens;
          this.input.mouseDY += (t.clientY - this.look.y) * this.sens;
          this.look.x = t.clientX; this.look.y = t.clientY;
        }
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.move.id) { this.move.id = null; this._stick(0, 0); this.stick.classList.remove('on'); }
        if (t.identifier === this.look.id) this.look.id = null;
      }
    };
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);

    // Hotbar-Slots antippen = Slot wählen
    document.getElementById('hotbar').addEventListener('touchstart', (e) => {
      const slot = e.target.closest('.slot'); if (!slot) return;
      const i = [...slot.parentElement.children].indexOf(slot);
      this._press('Digit' + (i + 1), true); setTimeout(() => this._press('Digit' + (i + 1), false), 60);
    }, { passive: true });
  }

  _btn([code, ico, label, group, mode]) {
    return `<button class="t-btn t-${group}" data-code="${code}" data-mode="${mode || ''}"><span>${ico}</span><small>${label}</small></button>`;
  }

  _press(code, on) {
    const inp = this.input;
    if (code === 'Mouse0') { if (on) { inp.clicked.add(0); inp.buttons.add(0); } else inp.buttons.delete(0); return; }
    if (on) { if (!inp.keys.has(code)) inp.pressed.add(code); inp.keys.add(code); } else inp.keys.delete(code);
  }

  _stick(dx, dy) {
    const R = 55, len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const nx = dx / R, ny = dy / R, dead = 0.28;
    const set = (code, v) => { if (v) this.input.keys.add(code); else this.input.keys.delete(code); };
    set('KeyW', ny < -dead); set('KeyS', ny > dead); set('KeyA', nx < -dead); set('KeyD', nx > dead);
    set('ShiftLeft', ny < -1.05); // ganz nach vorn ziehen = sprinten
  }

  /** jedes Bild: Steuerung nur zeigen, wenn wirklich gespielt wird */
  update() {
    if (!this.enabled) return;
    const g = this.app.game;
    const playing = !!g && (g.phase === 'play' || g.inCasino) && this.input.locked && !document.querySelector('.modal.show');
    this.root.classList.toggle('hidden', !playing);
    if (!playing && this.move.id !== null) { this.move.id = null; this._stick(0, 0); }
    if (playing) this.root.classList.toggle('casino', !!g.inCasino);
    if (playing && (this._visT = (this._visT || 0) - 1) <= 0) { this._visT = 15; this._visibility(g); }
  }

  /** Nur Knöpfe zeigen, die gerade Sinn ergeben (gekaufte Gadgets, Vorrat, am Van) */
  _visibility(g) {
    const u = g.upg || {}, p = g.local.pos;
    const atVan = g.world && g.world.inVanZone(p.x, p.z, 3);
    const show = {
      KeyQ: u.scanner > 0, KeyB: g.boellers > 0, KeyV: g.polen > 0, KeyX: u.xray > 0, KeyT: g.adren > 0,
      KeyU: g.cloak > 0, KeyK: u.teleport > 0, KeyJ: atVan, KeyR: atVan, KeyH: atVan,
    };
    for (const el of this.root.querySelectorAll('.t-gadgets [data-code]')) el.classList.toggle('gone', !show[el.dataset.code]);
  }
}
