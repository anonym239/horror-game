// Easter Eggs – versteckte Kleinigkeiten für Neugierige. (Nicht weitererzählen.)
import * as THREE from 'three';

// ↑ ↑ ↓ ↓ ← → ← → Enter (ohne B/A, weil B im Spiel einen Böller wirft)
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'Enter'];

export class EasterEggs {
  constructor(game) {
    this.g = game;
    this.seq = [];
    this.typed = '';
    this.done = new Set();   // pro Spiel / pro Nacht nur einmal
    this.fireT = 0;
    this._onKey = (e) => this._key(e);
    addEventListener('keydown', this._onKey);
  }

  _key(e) {
    const g = this.g;
    if (g.phase !== 'play' || !g.local.alive) return;
    this.seq.push(e.code);
    if (this.seq.length > KONAMI.length) this.seq.shift();
    if (this.seq.join() === KONAMI.join()) { this.seq.length = 0; this._konami(); }
    if (e.key && e.key.length === 1) {
      this.typed = (this.typed + e.key.toLowerCase()).slice(-10);
      if (this.typed.endsWith('crane')) { this.typed = ''; this._crane(); }
    }
  }

  /** Konami-Code: einmal pro Spiel ein Polenböller „aus Cranes Handschuhfach“. */
  _konami() {
    const g = this.g;
    if (this.done.has('konami')) { g.ui.toast('Crane: „Einmal reicht.“', '#888', 2); return; }
    this.done.add('konami');
    g.audio.dayComplete();
    if (g.isHost) { g.polen++; g.ui.toast('🎮 ↑↑↓↓←→←→ – im Handschuhfach lag ein <b>Polenböller</b>!', '#ffd040', 4); }
    else g.ui.toast('🎮 Netter Versuch. Nur der Host hat den Schlüssel fürs Handschuhfach.', '#ffd040', 3);
  }

  /** „crane“ tippen: Er meldet sich. */
  _crane() {
    const g = this.g;
    g.audio.radioStatic(null, 0.8);
    g.audio.tone(1318, 1318, 0.08, 0.12, 'sine', 0.9); g.audio.tone(1760, 1760, 0.12, 0.12, 'sine', 1.02);
    const lines = ['Ich sehe euch.', 'Hört auf, meinen Namen zu sagen. Er hört mit.', 'Weiterarbeiten.', 'Ihr habt noch nicht alles gefunden.'];
    setTimeout(() => !g.disposed && g.ui.toast(`📱 <b>Mr. Crane:</b> ${lines[Math.floor(Math.random() * lines.length)]}`, '#6ad1ff', 4), 900);
  }

  /** Zusatz für die Intro-Karte einer Nacht. */
  introHint(n) {
    const name = (this.g.app.name || '').toLowerCase();
    if (name === 'crane' || name === 'elias') return 'Du trägst seinen Namen. Sie werden dich zuerst suchen.';
    if (n === 13) return '🕯️ NACHT 13 – Heute Nacht ist der Wald besonders still.';
    return '';
  }

  update(dt) {
    const g = this.g, p = g.local;
    if (g.phase !== 'play' || !p.alive || g.paused) { this.fireT = 0; return; }
    // 03:33 Uhr: irgendwo lacht ein Kind
    const mins = Math.floor((1 - g.timeLeft / g.nightLen) * 360);
    const k333 = '333-' + g.night;
    if (mins >= 333 && !this.done.has(k333)) {
      this.done.add(k333);
      const at = new THREE.Vector3(p.pos.x + Math.sin(p.yaw) * 6, p.pos.y + 1.2, p.pos.z + Math.cos(p.yaw) * 6); // hinter dir
      for (let i = 0; i < 5; i++) g.audio.tone(900 + i * 60, 1300 + i * 40, 0.12, 0.06, 'triangle', i * 0.16, at);
      g.audio.whisper(at);
      g.ui.toast('🕒 03:33 – irgendwo hinter dir lacht ein Kind …', '#c0a0ff', 3.5);
    }
    // Am Lagerfeuer hocken: zwölf kleine Schatten
    const cf = g.world.clearing;
    const kFire = 'fire-' + g.night;
    if (!this.done.has(kFire) && p.crouch && Math.hypot(p.pos.x - cf.x, p.pos.z - cf.z) < 3) {
      this.fireT += dt;
      if (this.fireT > 5) {
        this.done.add(kFire);
        g.audio.whisper(new THREE.Vector3(cf.x, p.pos.y + 1, cf.z));
        g.scares.flicker = 1.2;
        g.ui.toast('🔥 Um das Feuer sitzen zwölf kleine Schatten. Einer winkt dir zu.', '#ff9a50', 4);
      }
    } else this.fireT = 0;
  }

  dispose() { removeEventListener('keydown', this._onKey); }
}
