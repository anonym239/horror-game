// Casino „Hollow Pines Royale“: begehbare 3D-Spielhalle für den Tag (ab Tag 2, aus dem Shop).
// Spielautomaten, Blackjack, Roulette, Glücksrad und „Doppelt oder Nichts“.
// Alle Würfe/Karten entscheidet der Host (fair im Mehrspieler), das Geld ist die gemeinsame Team-Kasse.
import * as THREE from 'three';
import { mat } from '../engine/renderer.js';
import { CollisionWorld } from '../engine/collision.js';
import { $, esc } from '../ui/ui.js';

export const CASINO_Y = -300;
const HW = 17, HD = 12, HH = 6.2;  // halbe Breite/Tiefe, Höhe der Halle

// ---------- Spielregeln (mit kleinem Hausvorteil, wie im echten Casino) ----------
const SLOT_SYMS = [['🍒', 30], ['🍋', 25], ['🔔', 18], ['🍀', 12], ['💎', 8], ['7️⃣', 4], ['💀', 10]];
const SLOT_TRIPLE = { '🍒': 4, '🍋': 7, '🔔': 12, '🍀': 25, '💎': 60, '7️⃣': 200, '💀': 0 };
const SLOT_PAIR = 1.5;
const WHEEL = [0, 0.5, 1, 0, 2, 0.5, 0, 1.5, 0, 1, 3, 0, 0.5, 1, 0, 2, 1.5, 0, 5, 1]; // 20 Felder, ~97,5 %
const WHEEL_COL = { 0: '#2a1015', 0.5: '#5a3a10', 1: '#1d4a7a', 1.5: '#2a6a3a', 2: '#7a2aaa', 3: '#c06a10', 5: '#d4a640' };
const COIN_WIN = 0.48;
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROUL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const INFO = {
  slots: { name: 'Spielautomat', ico: '🎰' }, bj: { name: 'Blackjack', ico: '🃏' }, roulette: { name: 'Roulette', ico: '🎡' },
  wheel: { name: 'Glücksrad', ico: '🎯' }, coin: { name: 'Doppelt oder Nichts', ico: '🪙' }, exit: { name: 'Ausgang', ico: '🚪' }, bar: { name: 'Bar', ico: '🍸' },
};

const pickW = (list) => { let t = list.reduce((a, x) => a + x[1], 0) * Math.random(); for (const x of list) { t -= x[1]; if (t <= 0) return x[0]; } return list[0][0]; };
const card = () => ({ r: Math.floor(Math.random() * 13), s: Math.floor(Math.random() * 4) });
const handVal = (h) => { let v = 0, a = 0; for (const c of h) { const n = c.r + 1; if (n === 1) { a++; v += 11; } else v += Math.min(10, n); } while (v > 21 && a) { v -= 10; a--; } return v; };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Casino {
  constructor(game) {
    this.g = game;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.col = new CollisionWorld(() => CASINO_Y);
    // Pseudo-Welt für LocalPlayer (Boden, Kollision, kein Wasser)
    this.world = { collision: this.col, height: () => CASINO_Y, inWater: () => false, inVanZone: () => false };
    this.stations = [];
    this.bj = new Map();     // Host: offene Blackjack-Hände pro Spieler
    this.anim = [];
    this.ui = null;          // offenes Spiel
    this.bet = 50;
    this._build();
    game.engine.scene.add(this.group);
    // konstante Lichtanzahl: Lichter existieren immer, leuchten nur im Casino
    this.lights = [
      new THREE.PointLight(0xffd8a0, 0, 34, 1.2), new THREE.PointLight(0xff40c0, 0, 22, 1.5), new THREE.PointLight(0x40d0ff, 0, 22, 1.5),
    ];
    this.lights[0].position.set(0, CASINO_Y + 5, 0); this.lights[1].position.set(-11, CASINO_Y + 4, -6); this.lights[2].position.set(11, CASINO_Y + 4, -6);
    for (const l of this.lights) game.engine.scene.add(l);
  }

  // ======================= Halle bauen =======================
  _box(m, x, y, z, w, h, d, collide = true, rotY = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, CASINO_Y + y + h / 2, z); mesh.rotation.y = rotY;
    this.group.add(mesh);
    if (collide) this.col.addBox(x, z, w / 2, d / 2, rotY, CASINO_Y + y, CASINO_Y + y + h);
    return mesh;
  }

  _build() {
    const carpet = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#4a0c14'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#b88a2a'; g.lineWidth = 3;
      for (let i = -1; i < 3; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128 + 256, 256); g.moveTo(i * 128 + 256, 0); g.lineTo(i * 128, 256); g.stroke(); }
      g.fillStyle = '#d4a640'; for (const [x, y] of [[64, 128], [192, 128], [128, 64], [128, 192]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
    });
    carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(10, 7);
    const M = {
      carpet: mat(0xffffff, { map: carpet, roughness: 1 }),
      wall: mat(0x2a1612, { roughness: 0.8 }), panel: mat(0x5a2a1a, { roughness: 0.6 }),
      gold: mat(0xd4a640, { roughness: 0.3, metalness: 0.9, emissive: 0x2a1a00, emissiveIntensity: 0.5 }),
      felt: mat(0x0f5a2a, { roughness: 1 }), wood: mat(0x3a1a10, { roughness: 0.5 }), black: mat(0x101010, { roughness: 0.4 }),
      ceiling: mat(0x140a10, { roughness: 1 }),
    };
    this.M = M;
    // Boden, Decke, Wände
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HD * 2), M.carpet);
    floor.rotation.x = -Math.PI / 2; floor.position.y = CASINO_Y + 0.01; this.group.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HD * 2), M.ceiling);
    ceil.rotation.x = Math.PI / 2; ceil.position.y = CASINO_Y + HH; this.group.add(ceil);
    this._box(M.wall, 0, 0, -HD - 0.2, HW * 2 + 0.8, HH, 0.4);
    this._box(M.wall, 0, 0, HD + 0.2, HW * 2 + 0.8, HH, 0.4);
    this._box(M.wall, -HW - 0.2, 0, 0, 0.4, HH, HD * 2);
    this._box(M.wall, HW + 0.2, 0, 0, 0.4, HH, HD * 2);
    // Holzvertäfelung + Goldleiste
    for (const [x, z, w, d] of [[0, -HD + 0.02, HW * 2, 0.06], [0, HD - 0.02, HW * 2, 0.06], [-HW + 0.02, 0, 0.06, HD * 2], [HW - 0.02, 0, 0.06, HD * 2]]) {
      this._box(M.panel, x, 0, z, w, 1.3, d, false); this._box(M.gold, x, 1.3, z, w, 0.08, d, false);
    }
    // Säulen
    for (const x of [-10.5, 10.5]) for (const z of [-9, 9]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, HH, 12), M.gold); c.position.set(x, CASINO_Y + HH / 2, z); this.group.add(c);
      this.col.addBox(x, z, 0.5, 0.5, 0, CASINO_Y, CASINO_Y + HH);
    }
    // Kronleuchter
    const glow = new THREE.MeshBasicMaterial({ color: 0xffe0a0 });
    for (const x of [-9, 0, 9]) for (const z of [-5, 5]) {
      const ch = new THREE.Group(); ch.position.set(x, CASINO_Y + HH - 0.9, z);
      ch.add(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 20), M.gold));
      for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glow); b.position.set(Math.cos(i / 8 * 6.283) * 0.7, 0.1, Math.sin(i / 8 * 6.283) * 0.7); ch.add(b); }
      ch.children[0].rotation.x = Math.PI / 2;
      this.group.add(ch);
    }
    // Neon-Schild
    const neon = canvasTex(1024, 192, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.font = 'bold 110px Creepster, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ff2ad5'; g.shadowBlur = 30; g.fillStyle = '#ff7ae8'; g.fillText('HOLLOW PINES ROYALE', w / 2, h / 2 + 6);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.06), new THREE.MeshBasicMaterial({ map: neon, transparent: true, blending: THREE.AdditiveBlending, fog: false }));
    sign.position.set(0, CASINO_Y + 5.25, -HD + 0.08); this.group.add(sign);

    this._exit();
    this._slots();
    this._blackjack();
    this._roulette();
    this._wheel();
    this._coin();
    this._bar();
  }

  _exit() {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3), new THREE.MeshBasicMaterial({ color: 0x40ff90, transparent: true, opacity: 0.35, fog: false }));
    door.position.set(0, CASINO_Y + 1.5, HD - 0.05); door.rotation.y = Math.PI; this.group.add(door);
    const t = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#062'; g.fillRect(0, 0, w, h); g.fillStyle = '#9fffc0'; g.font = 'bold 36px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('AUSGANG ↗ SHOP', w / 2, 44); });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: t, fog: false })); s.position.set(0, CASINO_Y + 3.4, HD - 0.06); s.rotation.y = Math.PI; this.group.add(s);
    this.doorMesh = door;
    this.stations.push({ type: 'exit', x: 0, z: HD - 1.4 });
  }

  _slots() {
    const body = mat(0x8a1020, { roughness: 0.4, metalness: 0.4 });
    this.slotScreens = [];
    for (let i = 0; i < 6; i++) {
      const z = -7.5 + i * 3, x = -HW + 0.9;
      this._box(body, x, 0, z, 1.2, 1.9, 1.1);
      this._box(this.M.gold, x + 0.1, 1.9, z, 1.0, 0.3, 1.0, false);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0x40ffd0, fog: false }));
      scr.position.set(x + 0.61, CASINO_Y + 1.35, z); scr.rotation.y = Math.PI / 2; this.group.add(scr);
      const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6), this.M.gold); lever.position.set(x + 0.2, CASINO_Y + 1.6, z + 0.62); this.group.add(lever);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); knob.position.set(x + 0.2, CASINO_Y + 1.92, z + 0.62); this.group.add(knob);
      this.slotScreens.push(scr);
      this.stations.push({ type: 'slots', x: x + 1.5, z, idx: i });
    }
  }

  _dealer(x, z, rot) {
    const g = new THREE.Group(); g.position.set(x, CASINO_Y, z); g.rotation.y = rot;
    const suit = mat(0x111111, { roughness: 0.7 }), skin = mat(0xc69a7a, { roughness: 0.8 });
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), suit); b.position.y = 1.0; g.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin); h.position.y = 1.75; g.add(h);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.05), new THREE.MeshBasicMaterial({ color: 0xc81e1e })); bow.position.set(0, 1.48, 0.27); g.add(bow);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color: 0x000000 })); e.position.set(sx * 0.07, 1.78, 0.18); g.add(e); }
    this.group.add(g);
    this.col.addBox(x, z, 0.35, 0.35, 0, CASINO_Y, CASINO_Y + 2);
    return g;
  }

  _blackjack() {
    const x = -6, z = -6;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.12, 32, 1, false, Math.PI / 2, Math.PI), this.M.felt);
    top.position.set(x, CASINO_Y + 0.95, z); this.group.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 6, 32, Math.PI), this.M.wood); rim.rotation.x = Math.PI / 2; rim.position.set(x, CASINO_Y + 1.0, z); this.group.add(rim);
    this._box(this.M.wood, x, 0, z + 0.9, 3.8, 0.9, 1.8);
    this._box(this.M.wood, x, 0, z - 0.25, 4.4, 1.0, 0.4);
    this._dealer(x, z - 1.2, 0);
    // ein paar Karten auf dem Tisch
    const ct = mat(0xffffff, { roughness: 0.5 });
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.005, 0.26), ct); c.position.set(x - 0.6 + i * 0.4, CASINO_Y + 1.02, z + 0.9); c.rotation.y = (i - 1.5) * 0.15; this.group.add(c); }
    this.stations.push({ type: 'bj', x, z: z + 2.6 });
  }

  _roulette() {
    const x = 6, z = -6;
    this._box(this.M.wood, x, 0, z, 4.4, 0.9, 2.2);
    const felt = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.04, 2.0), this.M.felt); felt.position.set(x, CASINO_Y + 0.92, z); this.group.add(felt);
    const wtex = canvasTex(512, 512, (g, w) => {
      const n = ROUL_ORDER.length, R = w / 2;
      for (let i = 0; i < n; i++) {
        const v = ROUL_ORDER[i], a0 = i / n * Math.PI * 2 - Math.PI / 2, a1 = (i + 1) / n * Math.PI * 2 - Math.PI / 2;
        g.fillStyle = v === 0 ? '#0a7a2a' : RED.has(v) ? '#b01818' : '#111';
        g.beginPath(); g.moveTo(R, R); g.arc(R, R, R, a0, a1); g.closePath(); g.fill();
        g.save(); g.translate(R, R); g.rotate((a0 + a1) / 2); g.fillStyle = '#fff'; g.font = 'bold 22px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(String(v), R * 0.82, 8); g.restore();
      }
      g.fillStyle = '#5a3a10'; g.beginPath(); g.arc(R, R, R * 0.55, 0, 7); g.fill();
      g.fillStyle = '#d4a640'; g.beginPath(); g.arc(R, R, R * 0.12, 0, 7); g.fill();
    });
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 40), [this.M.wood, new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.4 }), this.M.wood]);
    wheel.position.set(x + 1.1, CASINO_Y + 1.0, z); this.group.add(wheel);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    ball.position.set(x + 1.1, CASINO_Y + 1.07, z - 0.7); this.group.add(ball);
    this.rWheel = wheel; this.rBall = ball; this.rCenter = new THREE.Vector3(x + 1.1, CASINO_Y + 1.07, z);
    this._dealer(x, z - 1.5, 0);
    this.stations.push({ type: 'roulette', x, z: z + 1.9 });
  }

  _wheel() {
    const tex = canvasTex(512, 512, (g, w) => {
      const n = WHEEL.length, R = w / 2;
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI * 2 - Math.PI / 2, a1 = (i + 1) / n * Math.PI * 2 - Math.PI / 2;
        g.fillStyle = WHEEL_COL[WHEEL[i]]; g.beginPath(); g.moveTo(R, R); g.arc(R, R, R - 6, a0, a1); g.closePath(); g.fill();
        g.strokeStyle = '#d4a640'; g.lineWidth = 3; g.stroke();
        g.save(); g.translate(R, R); g.rotate((a0 + a1) / 2); g.fillStyle = '#fff'; g.font = 'bold 30px Inter, sans-serif'; g.textAlign = 'center';
        g.fillText(WHEEL[i] === 0 ? '💀' : '×' + WHEEL[i], R * 0.72, 10); g.restore();
      }
      g.fillStyle = '#d4a640'; g.beginPath(); g.arc(R, R, 34, 0, 7); g.fill();
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    disc.position.set(0, CASINO_Y + 3.0, -HD + 0.12); this.group.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.12, 8, 48), this.M.gold); ring.position.copy(disc.position); ring.position.z += 0.02; this.group.add(ring);
    const ptr = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 })); ptr.position.set(0, CASINO_Y + 5.75, -HD + 0.3); ptr.rotation.z = Math.PI; this.group.add(ptr);
    this._box(this.M.gold, 0, 0, -HD + 1.6, 3, 0.9, 0.5);
    this.wDisc = disc;
    this.stations.push({ type: 'wheel', x: 0, z: -HD + 3 });
  }

  _coin() {
    const x = 11.5, z = 4;
    this._box(this.M.gold, x, 0, z, 1.4, 1.0, 1.4);
    const faces = (txt, col) => new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g) => { g.fillStyle = col; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#3a2a00'; g.font = 'bold 54px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(txt, 64, 82); }), metalness: 0.8, roughness: 0.3 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 32), [this.M.gold, faces('K', '#e8c050'), faces('Z', '#d4a640')]);
    coin.position.set(x, CASINO_Y + 1.6, z); coin.rotation.z = Math.PI / 2; this.group.add(coin);
    this.coinMesh = coin;
    const t = canvasTex(512, 96, (g, w, h) => { g.fillStyle = '#1a0a20'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd040'; g.font = 'bold 50px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('DOPPELT ODER NICHTS', w / 2, 66); });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.56), new THREE.MeshBasicMaterial({ map: t, fog: false })); s.position.set(HW - 0.08, CASINO_Y + 3.2, z); s.rotation.y = -Math.PI / 2; this.group.add(s);
    this.stations.push({ type: 'coin', x: x - 1.6, z });
  }

  _bar() {
    this._box(this.M.wood, HW - 1.2, 0, -5, 1.0, 1.1, 6);
    this._box(this.M.gold, HW - 1.2, 1.1, -5, 1.1, 0.06, 6.1, false);
    const cols = [0x40ff90, 0xff4060, 0x40a0ff, 0xffd040, 0xc060ff];
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.36, 8), new THREE.MeshBasicMaterial({ color: cols[i % 5], transparent: true, opacity: 0.8 }));
      b.position.set(HW - 0.25, CASINO_Y + 1.7 + (i % 2) * 0.6, -7.6 + Math.floor(i / 2) * 0.75); this.group.add(b);
    }
    this.stations.push({ type: 'bar', x: HW - 2.6, z: -5 });
  }

  // ======================= Betreten / Verlassen =======================
  setActive(on) {
    this.active = on;
    this.group.visible = on;
    const I = on ? [70, 30, 30] : [0, 0, 0];
    this.lights.forEach((l, i) => { l.intensity = I[i]; });
    if (!on) this.close();
  }

  /** jedes Bild im Casino */
  update(dt) {
    const g = this.g, p = g.local, t = g.engine.time;
    // Animationen
    for (let i = this.anim.length - 1; i >= 0; i--) { const a = this.anim[i]; a.t += dt; a.fn(Math.min(1, a.t / a.dur), dt); if (a.t >= a.dur) { this.anim.splice(i, 1); if (a.done) a.done(); } }
    this.slotScreens.forEach((s, i) => s.material.color.setHSL((t * 0.15 + i * 0.13) % 1, 0.9, 0.55));
    this.doorMesh.material.opacity = 0.25 + 0.15 * Math.sin(t * 3);
    if (this.ui) return;
    // Station in der Nähe?
    let best = null, bd = 2.4;
    for (const s of this.stations) { const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z); if (d < bd) { bd = d; best = s; } }
    this.near = best;
    const prompt = !best ? '' : best.type === 'exit' ? '[E] Zurück zum Shop' : best.type === 'bar' ? '[E] 🍸 Drink bestellen (gratis)' : `[E] ${INFO[best.type].ico} ${INFO[best.type].name} spielen`;
    g.ui.set('casinoPrompt', 'html', prompt);
    g.ui.set('casinoMoney', 'text', String(g.money));
    if (best && g.input.hit('KeyE')) this.use(best);
  }

  use(s) {
    const g = this.g;
    if (s.type === 'exit') { g.exitCasino(); return; }
    if (s.type === 'bar') {
      g.audio.tone(900, 1400, 0.15, 0.08, 'sine'); g.audio.tone(1400, 900, 0.2, 0.06, 'sine', 0.15);
      const lines = ['Der Barkeeper schiebt dir wortlos ein Glas Milch hin.', '„Crane trinkt hier auch. Immer Tisch 13.“', '„Wer zu viel verzockt, fährt nachts ohne Böller raus.“', 'Das Glas ist leer. War es je voll?'];
      g.ui.toast('🍸 ' + lines[Math.floor(Math.random() * lines.length)], '#c060ff', 3);
      return;
    }
    this.open(s);
  }

  // ======================= Oberfläche =======================
  open(s) {
    const g = this.g;
    this.ui = s; this.busy = false; this.bjState = null;
    g.input.unlock();
    const box = $('casinoBody');
    $('casinoTitle').textContent = `${INFO[s.type].ico} ${INFO[s.type].name}`;
    const chips = [10, 50, 100, 500, 1000, 5000].map((v) => `<button class="chip" data-chip="${v}">${v >= 1000 ? v / 1000 + 'k' : v}</button>`).join('') + '<button class="chip" data-chip="half">½</button><button class="chip all" data-chip="all">ALL IN</button>';
    const betBar = `<div class="cas-bet"><span>Einsatz</span><input type="number" id="casBet" min="1" step="10" /><div class="chips">${chips}</div><span class="cas-money">Kasse: <b id="casMoney"></b> $</span></div>`;
    let body = '';
    if (s.type === 'slots') body = `<div class="reels"><div class="reel" id="r0">🍒</div><div class="reel" id="r1">🔔</div><div class="reel" id="r2">💎</div></div>
      <div class="cas-actions"><button class="btn primary big" id="casGo">🎰 Hebel ziehen</button></div>
      <div class="paytable">3× 🍒 ×4 · 3× 🍋 ×7 · 3× 🔔 ×12 · 3× 🍀 ×25 · 3× 💎 ×60 · 3× 7️⃣ ×200 · 2 gleiche ×1,5 · 💀💀💀 = nichts</div>`;
    else if (s.type === 'wheel') body = `<div class="cas-big" id="casShow">🎯</div><div class="cas-actions"><button class="btn primary big" id="casGo">Rad drehen</button></div>
      <div class="paytable">Felder: 💀 ×0 (7×) · ×0,5 (3×) · ×1 (4×) · ×1,5 (2×) · ×2 (2×) · ×3 · ×5</div>`;
    else if (s.type === 'coin') body = `<div class="cas-big" id="casShow">🪙</div><div class="cas-actions"><button class="btn primary big" data-pick="K">Kopf</button><button class="btn primary big" data-pick="Z">Zahl</button></div>
      <div class="paytable">Richtig geraten = doppelter Einsatz zurück. (Die Münze ist ein klein wenig gezinkt – Casino eben.)</div>`;
    else if (s.type === 'roulette') body = `<div class="cas-big" id="casShow">🎡</div>
      <div class="roul-bets">
        <button class="btn red" data-pick="red">Rot ×2</button><button class="btn blk" data-pick="black">Schwarz ×2</button>
        <button class="btn" data-pick="even">Gerade ×2</button><button class="btn" data-pick="odd">Ungerade ×2</button>
        <button class="btn" data-pick="low">1–18 ×2</button><button class="btn" data-pick="high">19–36 ×2</button>
        <button class="btn" data-pick="d1">1–12 ×3</button><button class="btn" data-pick="d2">13–24 ×3</button><button class="btn" data-pick="d3">25–36 ×3</button>
        <span class="roul-num"><input type="number" id="casNum" min="0" max="36" value="7" /><button class="btn" data-pick="num">Auf Zahl ×36</button></span>
      </div>`;
    else if (s.type === 'bj') body = `<div class="bj"><div class="bj-row"><span>Dealer <b id="bjDv"></b></span><div class="cards" id="bjD"></div></div><div class="bj-row"><span>Du <b id="bjPv"></b></span><div class="cards" id="bjP"></div></div></div>
      <div class="cas-actions"><button class="btn primary big" id="bjDeal">Karten geben</button><button class="btn big hidden" id="bjHit">Karte</button><button class="btn big hidden" id="bjStand">Halten</button><button class="btn big hidden" id="bjDouble">Verdoppeln</button></div>
      <div class="paytable">Blackjack zahlt 3:2 · Dealer zieht bis 17 · Gewinn ×2 · Unentschieden = Einsatz zurück</div>`;
    box.innerHTML = betBar + body + '<div class="cas-result" id="casRes"></div>';
    $('casBet').value = Math.min(this.bet, Math.max(1, g.money));
    this._money();
    box.onclick = (e) => this._click(e);
    g.ui.modal('casinoUI', true);
  }

  close() {
    if (!this.ui) return;
    this.ui = null;
    this.g.ui.modal('casinoUI', false);
    if (this.active && this.g.inCasino) this.g.input.lock();
  }

  _money() { const el = $('casMoney'); if (el) el.textContent = this.g.money; }
  _betVal() { const v = Math.floor(+$('casBet').value || 0); this.bet = v; return v; }
  _res(html, cls = '') { const el = $('casRes'); if (el) { el.className = 'cas-result ' + cls; el.innerHTML = html; } }

  _click(e) {
    const b = e.target.closest('button'); if (!b) return;
    const g = this.g;
    if (b.dataset.chip) {
      const c = b.dataset.chip, inp = $('casBet');
      inp.value = c === 'all' ? g.money : c === 'half' ? Math.max(1, Math.floor(g.money / 2)) : Math.min(g.money, (+inp.value === this._lastChip ? +inp.value : 0) + +c) || +c;
      this._lastChip = +inp.value;
      g.audio.tone(1200, 1500, 0.04, 0.05, 'triangle');
      return;
    }
    if (this.busy) return;
    const s = this.ui; if (!s) return;
    const bet = this._betVal();
    const send = (extra) => {
      if (s.type !== 'bj' || extra.a === 'deal') {
        if (bet <= 0) { this._res('Setz erst etwas!', 'bad'); return; }
        if (bet > g.money) { this._res('So viel ist nicht in der Kasse.', 'bad'); g.audio.denied(); return; }
      }
      this.busy = true;
      this._res('');
      g.casinoRequest({ g: s.type, bet, ...extra });
    };
    if (b.id === 'casGo') send({});
    else if (b.dataset.pick) send({ c: b.dataset.pick === 'num' ? 'n' + Math.max(0, Math.min(36, Math.floor(+$('casNum').value || 0))) : b.dataset.pick });
    else if (b.id === 'bjDeal') send({ a: 'deal' });
    else if (b.id === 'bjHit') send({ a: 'hit' });
    else if (b.id === 'bjStand') send({ a: 'stand' });
    else if (b.id === 'bjDouble') send({ a: 'double' });
  }

  // ======================= Host: Ergebnisse auswürfeln =======================
  /** gibt {r, bet, win} zurück oder null (ungültig). Geld wird vom Aufrufer gebucht. */
  hostResolve(pid, m, money) {
    const bet = Math.floor(+m.bet || 0);
    const gm = m.g;
    if (gm === 'bj') return this._hostBJ(pid, m, money);
    if (bet <= 0 || bet > money) return null;
    if (gm === 'slots') {
      const r = [pickW(SLOT_SYMS), pickW(SLOT_SYMS), pickW(SLOT_SYMS)];
      let mul = 0;
      if (r[0] === r[1] && r[1] === r[2]) mul = SLOT_TRIPLE[r[0]];
      else if ((r[0] === r[1] || r[1] === r[2] || r[0] === r[2])) { const pair = r[0] === r[1] || r[0] === r[2] ? r[0] : r[1]; mul = pair === '💀' ? 0 : SLOT_PAIR; }
      return { r, bet, win: Math.round(bet * mul), cost: bet };
    }
    if (gm === 'wheel') { const i = Math.floor(Math.random() * WHEEL.length); return { r: i, bet, win: Math.round(bet * WHEEL[i]), cost: bet }; }
    if (gm === 'coin') { const c = m.c === 'Z' ? 'Z' : 'K'; const won = Math.random() < COIN_WIN; return { r: won ? c : (c === 'K' ? 'Z' : 'K'), c, bet, win: won ? bet * 2 : 0, cost: bet }; }
    if (gm === 'roulette') {
      const n = Math.floor(Math.random() * 37), c = String(m.c || '');
      let mul = 0;
      if (n > 0) {
        if (c === 'red' && RED.has(n)) mul = 2; else if (c === 'black' && !RED.has(n)) mul = 2;
        else if (c === 'even' && n % 2 === 0) mul = 2; else if (c === 'odd' && n % 2 === 1) mul = 2;
        else if (c === 'low' && n <= 18) mul = 2; else if (c === 'high' && n >= 19) mul = 2;
        else if (c === 'd1' && n <= 12) mul = 3; else if (c === 'd2' && n >= 13 && n <= 24) mul = 3; else if (c === 'd3' && n >= 25) mul = 3;
      }
      if (c === 'n' + n) mul = 36;
      return { r: n, c, bet, win: bet * mul, cost: bet };
    }
    return null;
  }

  _hostBJ(pid, m, money) {
    let h = this.bj.get(pid);
    const pub = (st, cost, win) => ({ r: { p: st.p, d: st.done ? st.d : [st.d[0]], pv: handVal(st.p), dv: st.done ? handVal(st.d) : null, done: st.done, out: st.out, bet: st.bet, canDouble: !st.done && st.p.length === 2 }, bet: st.bet, win, cost });
    const finish = (st) => {
      st.done = true;
      const pv = handVal(st.p);
      if (pv > 21) { st.out = 'bust'; return 0; }
      while (handVal(st.d) < 17) st.d.push(card());
      const dv = handVal(st.d);
      if (dv > 21 || pv > dv) { st.out = 'win'; return st.bet * 2; }
      if (pv === dv) { st.out = 'push'; return st.bet; }
      st.out = 'lose'; return 0;
    };
    if (m.a === 'deal') {
      const bet = Math.floor(+m.bet || 0);
      if ((h && !h.done) || bet <= 0 || bet > money) return null;
      h = { p: [card(), card()], d: [card(), card()], bet, done: false };
      this.bj.set(pid, h);
      if (handVal(h.d) === 21 && handVal(h.p) !== 21) { h.done = true; h.out = 'lose'; return pub(h, bet, 0); } // Dealer schaut nach: Blackjack
      if (handVal(h.p) === 21) { // Blackjack!
        h.done = true;
        if (handVal(h.d) === 21) { h.out = 'push'; return pub(h, bet, bet); }
        h.out = 'bj'; return pub(h, bet, Math.round(bet * 2.5));
      }
      return pub(h, bet, 0);
    }
    if (!h || h.done) return null;
    if (m.a === 'hit') { h.p.push(card()); if (handVal(h.p) > 21) return pub(h, 0, finish(h)); if (handVal(h.p) === 21) return pub(h, 0, finish(h)); return pub(h, 0, 0); }
    if (m.a === 'stand') return pub(h, 0, finish(h));
    if (m.a === 'double') {
      if (h.p.length !== 2 || h.bet > money) return null;
      h.bet *= 2; h.p.push(card());
      return pub(h, h.bet / 2, finish(h));
    }
    return null;
  }

  // ======================= Ergebnis anzeigen =======================
  /** m: { id, g, r, bet, win, cost, money, name } – für alle Spieler */
  onResult(m, mine) {
    const g = this.g, a = g.audio;
    const net = m.win - m.cost;
    // 3D-Animationen sehen alle
    let dur = 0;
    if (m.g === 'wheel') dur = this._spinWheel(m.r);
    if (m.g === 'roulette') dur = this._spinRoulette(m.r);
    if (m.g === 'coin') dur = this._flipCoin(m.r);
    if (m.g === 'slots') dur = 1.7;
    const finishMine = () => {
      g.money = m.money; this._money();
      if (!this.ui || this.ui.type !== m.g) { this.busy = false; return; }
      this.busy = false;
      if (m.g === 'bj') { this._bjRender(m.r); return; }
      if (m.win > m.cost) { this._res(`🎉 Gewonnen! <b>+${m.win - m.cost} $</b>`, 'good'); if (m.win >= m.bet * 5) a.dayComplete(); else a.cash(); }
      else if (m.win === m.cost && m.win > 0) { this._res('Einsatz zurück.', ''); a.tone(600, 600, 0.15, 0.08, 'triangle'); }
      else { this._res(`Verloren … <b>−${m.cost - m.win} $</b>`, 'bad'); a.tone(300, 110, 0.5, 0.15, 'sawtooth'); }
    };
    if (mine) {
      if (m.g === 'slots') this._spinReels(m.r);
      if (m.g === 'wheel') this._show(WHEEL[m.r] === 0 ? '💀 ×0' : '×' + WHEEL[m.r], dur);
      if (m.g === 'roulette') this._show(`<span class="${m.r === 0 ? 'g' : RED.has(m.r) ? 'r' : 'b'}">${m.r}</span>`, dur);
      if (m.g === 'coin') this._show(m.r === 'K' ? 'Kopf' : 'Zahl', dur);
      if (m.g === 'bj') { if (m.r.done) a.tone(500, 700, 0.1, 0.08, 'triangle'); else a.tone(1800, 1200, 0.05, 0.05, 'square'); }
      setTimeout(finishMine, m.g === 'bj' ? 0 : dur * 1000);
    } else {
      g.money = m.money;
      if (net >= Math.max(500, m.bet * 3)) g.ui.toast(`🎰 <b>${esc(m.name)}</b> gewinnt <b>${m.win} $</b> beim ${INFO[m.g].name}!`, '#ffd040', 3);
      else if (net <= -1000) g.ui.toast(`💸 ${esc(m.name)} hat ${-net} $ verzockt …`, '#ff5a4a', 2.5);
    }
  }

  _show(html, delay) { const el = $('casShow'); if (!el) return; el.classList.add('spin'); el.innerHTML = '…'; setTimeout(() => { if (el.isConnected) { el.classList.remove('spin'); el.innerHTML = html; } }, delay * 1000); }

  _spinReels(r) {
    const syms = SLOT_SYMS.map((s) => s[0]), a = this.g.audio;
    [0, 1, 2].forEach((i) => {
      const el = $('r' + i); if (!el) return;
      el.classList.add('spin');
      const iv = setInterval(() => { if (el.isConnected) el.textContent = syms[Math.floor(Math.random() * syms.length)]; a.tone(1100 + i * 120, 1100, 0.02, 0.03, 'square'); }, 70);
      setTimeout(() => { clearInterval(iv); if (el.isConnected) { el.textContent = r[i]; el.classList.remove('spin'); } a.tone(500, 380, 0.08, 0.1, 'triangle'); }, 700 + i * 450);
    });
  }

  _spinWheel(i) {
    const disc = this.wDisc, n = WHEEL.length, start = disc.rotation.z;
    // Feld i soll oben (unter dem Zeiger) stehen
    const target = Math.ceil((start + Math.PI * 2 * 4) / (Math.PI * 2)) * Math.PI * 2 + ((i + 0.5) / n) * Math.PI * 2;
    let tick = 0;
    this.anim.push({ t: 0, dur: 3.6, fn: (k) => {
      const e = 1 - Math.pow(1 - k, 3); disc.rotation.z = start + (target - start) * e;
      const seg = Math.floor(disc.rotation.z / (Math.PI * 2 / n)); if (seg !== tick) { tick = seg; this.g.audio.tone(1600, 1400, 0.015, 0.04, 'square'); }
    } });
    return 3.6;
  }

  _spinRoulette(n) {
    const w = this.rWheel, b = this.rBall, c = this.rCenter, start = w.rotation.y;
    const idx = ROUL_ORDER.indexOf(n), seg = Math.PI * 2 / ROUL_ORDER.length;
    const spin = start + Math.PI * 2 * 3;
    this.anim.push({ t: 0, dur: 3.8, fn: (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      w.rotation.y = start + (spin - start) * e;
      // Kugel läuft gegenläufig und fällt am Ende ins richtige Fach
      const pocket = w.rotation.y - (idx + 0.5) * seg + Math.PI / 2;
      const ballA = (1 - e) * (-Math.PI * 10) + pocket;
      const r = 0.72 - 0.12 * e;
      b.position.set(c.x + Math.cos(ballA) * r, c.y, c.z - Math.sin(ballA) * r);
    } });
    return 3.8;
  }

  _flipCoin(side) {
    const coin = this.coinMesh, a = this.g.audio;
    a.tone(1800, 2400, 0.1, 0.08, 'triangle');
    const end = Math.PI * 2 * 6 + (side === 'K' ? 0 : Math.PI);
    this.anim.push({ t: 0, dur: 1.6, fn: (k) => {
      coin.rotation.x = end * (1 - Math.pow(1 - k, 2));
      coin.position.y = CASINO_Y + 1.6 + Math.sin(k * Math.PI) * 1.4;
    }, done: () => a.tone(900, 700, 0.06, 0.1, 'square') });
    return 1.6;
  }

  _bjRender(st) {
    const cardsHtml = (cs, hidden) => cs.map((c) => `<span class="pcard ${c.s === 1 || c.s === 2 ? 'red' : ''}">${RANKS[c.r]}${SUITS[c.s]}</span>`).join('') + (hidden ? '<span class="pcard back">🂠</span>' : '');
    $('bjD').innerHTML = cardsHtml(st.d, !st.done); $('bjP').innerHTML = cardsHtml(st.p, false);
    $('bjDv').textContent = st.dv != null ? st.dv : ''; $('bjPv').textContent = st.pv;
    $('bjDeal').classList.toggle('hidden', !st.done);
    for (const id of ['bjHit', 'bjStand']) $(id).classList.toggle('hidden', st.done);
    $('bjDouble').classList.toggle('hidden', !st.canDouble);
    const a = this.g.audio;
    if (st.done) {
      const msg = { bj: ['🃏 BLACKJACK! 3:2', 'good'], win: [`🎉 Gewonnen! +${st.bet} $`, 'good'], push: ['Unentschieden – Einsatz zurück', ''], lose: [`Dealer gewinnt … −${st.bet} $`, 'bad'], bust: [`Über 21! −${st.bet} $`, 'bad'] }[st.out];
      this._res(msg[0], msg[1]);
      if (st.out === 'bj' || st.out === 'win') a.cash(); else if (st.out !== 'push') a.tone(300, 110, 0.5, 0.15, 'sawtooth');
    } else this._res('Karte oder halten?');
  }

  dispose() {
    this.g.engine.scene.remove(this.group);
    for (const l of this.lights) this.g.engine.scene.remove(l);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
