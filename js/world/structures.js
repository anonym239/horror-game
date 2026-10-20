// Gebäude & Props des verlassenen Camps „Hollow Pines".
import { gableGeo } from './builder.js';

const F = 0.35;   // Fußbodenhöhe über Fundament
const T = 0.16;   // Wandstärke

function wallWithWindow(b, x, along, len, H, key, win = 1.2) {
  // Wand entlang lokaler z-Achse bei x (along='z') oder entlang x bei z (along='x')
  const seg = (len - win) / 2;
  const put = (o, y, l, h) => {
    if (along === 'z') b.box(key, x, y, o, T, h, l);
    else b.box(key, o, y, x, l, h, T);
  };
  put(0, F, len, 1.0);
  put(0, F + 1.9, len, H - 1.9);
  put(-(win / 2 + seg / 2), F + 1.0, seg, 0.9);
  put(win / 2 + seg / 2, F + 1.0, seg, 0.9);
}

function wallWithDoor(b, z, W, H, key, dw = 1.2, offset = 0) {
  const l1 = W / 2 + offset - dw / 2, l2 = W / 2 - offset - dw / 2;
  b.box(key, -W / 2 + l1 / 2, F, z, l1, H, T);
  b.box(key, W / 2 - l2 / 2, F, z, l2, H, T);
  b.box(key, offset, F + 2.1, z, dw, H - 2.1, T);
}

function roof(b, W, D, H, key = 'roof') {
  const pitch = 0.5;
  const run = D / 2 + 0.45;
  const rise = Math.tan(pitch) * (D / 2);
  const slab = run / Math.cos(pitch);
  for (const s of [-1, 1]) {
    b.box(key, 0, F + H + rise / 2 - 0.05, s * (D / 4 + 0.12), W + 0.7, 0.14, slab + 0.1, { rx: s * pitch, collide: false });
  }
  for (const s of [-1, 1]) b.geo('wood', gableGeo(D, rise, T), s * (W / 2 - T / 2), F + H, 0);
  // Dachkollider (damit geworfene Sachen nicht durchfallen)
  b.collider(0, F + H, 0, W, rise * 0.6, D, 0, 'roof');
}

function bed(b, x, z, rot = 0) {
  b.box('woodDark', x, F, z, 0.95, 0.42, 1.95, { rot });
  b.box('cloth', x, F + 0.42, z, 0.85, 0.14, 1.8, { rot, collide: false });
  b.collider(x, F + 0.42, z, 0.85, 0.14, 1.8, rot);
  b.box('cloth2', x, F + 0.56, z - 0.65, 0.6, 0.12, 0.35, { rot, collide: false });
  b.loot(x, F + 0.9, z + 0.2);
}

function table(b, x, z, rot = 0, w = 1.4, d = 0.8) {
  b.box('wood', x, F + 0.72, z, w, 0.06, d, { rot, collide: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    b.box('woodDark', x + sx * (w / 2 - 0.08), F, z + sz * (d / 2 - 0.08), 0.07, 0.72, 0.07, { rot, collide: false });
  b.collider(x, F, z, w, 0.78, d, rot);
  b.loot(x, F + 1.0, z);
}

function chair(b, x, z, rot = 0, toppled = false) {
  if (toppled) {
    b.box('woodDark', x, F, z, 0.45, 0.05, 0.45, { rot, rx: 1.4, collide: false });
    b.box('woodDark', x, F, z + 0.3, 0.45, 0.45, 0.05, { rot, rx: 1.4, collide: false });
    return;
  }
  b.box('woodDark', x, F + 0.42, z, 0.45, 0.05, 0.45, { rot, collide: false });
  b.box('woodDark', x, F + 0.47, z - 0.2, 0.45, 0.5, 0.05, { rot, collide: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('woodDark', x + sx * 0.19, F, z + sz * 0.19, 0.04, 0.42, 0.04, { collide: false });
  b.collider(x, F, z, 0.45, 0.47, 0.45, rot);
}

function shelf(b, x, z, rot = 0) {
  for (const sx of [-1, 1]) b.box('woodDark', x + sx * 0.7, F, z, 0.05, 1.8, 0.36, { rot, collide: false });
  for (const y of [0.15, 0.8, 1.4]) {
    b.box('wood', x, F + y, z, 1.45, 0.04, 0.36, { rot, collide: false });
    b.collider(x, F + y - 0.02, z, 1.45, 0.06, 0.36, rot);
  }
  b.collider(x, F, z - 0.2, 1.5, 1.8, 0.04, rot);
  b.loot(x - 0.3, F + 1.0, z);
  b.loot(x + 0.3, F + 1.6, z);
}

/** Hütte: Tür auf lokaler +z Seite. */
export function cabin(b, x, z, rot, base, rnd, opts = {}) {
  const W = opts.W || 6, D = opts.D || 5, H = 2.6;
  b.setFrame(x, base, z, rot);
  b.box('woodDark', 0, -0.9, 0, W + 0.3, 0.9 + F, D + 0.3);
  b.box('woodDark', 0, -0.7, D / 2 + 0.75, 2.0, 0.7 + F * 0.5, 1.2);
  b.box('wood', 0, F, -D / 2 + T / 2, W, H, T);
  wallWithWindow(b, -W / 2 + T / 2, 'z', D, H, 'wood');
  wallWithWindow(b, W / 2 - T / 2, 'z', D, H, 'wood');
  wallWithDoor(b, D / 2 - T / 2, W, H, 'wood', 1.2, opts.doorOffset || 0);
  roof(b, W, D, H);
  // Bretter vor den Fenstern (vernagelt)
  for (const s of [-1, 1]) {
    b.box('woodDark', s * (W / 2 + 0.02), F + 1.15, 0, 0.05, 0.12, 1.5, { rx: 0.5, collide: false });
    if (rnd() < 0.6) b.box('woodDark', s * (W / 2 + 0.02), F + 1.55, 0, 0.05, 0.12, 1.5, { rx: -0.35, collide: false });
  }
  // umgefallene Tür auf der Veranda
  b.box('woodDark', 0.4, 0.2, D / 2 + 1.0, 1.0, 0.06, 2.0, { rot: 0.4, rz: 0.12, collide: false });
  // Teppich
  b.box('rug', 0.3, F, 0.2, 2.2, 0.01, 1.6, { collide: false });
  // Einrichtung
  const v = Math.floor(rnd() * 3);
  if (opts.lodge) {
    const segL = (D - 1.2) / 2;
    b.box('wood', 0, F, -(0.6 + segL / 2), T, H, segL);
    b.box('wood', 0, F, 0.6 + segL / 2, T, H, segL);
    b.box('wood', 0, F + 2.1, 0, T, H - 2.1, 1.2);
    bed(b, -W / 2 + 0.7, -D / 2 + 1.2); bed(b, -W / 2 + 1.9, -D / 2 + 1.2);
    bed(b, -W / 2 + 3.1, -D / 2 + 1.2);
    table(b, W / 4, 0, 0, 2.2, 1.0); chair(b, W / 4 - 0.7, 0.8, Math.PI); chair(b, W / 4 + 0.7, -0.8, 0, true);
    shelf(b, W / 2 - 1.2, -D / 2 + 0.35); shelf(b, -W / 2 + 1.2, D / 2 - 0.45, Math.PI);
    b.loot(W / 2 - 1, F + 0.3, D / 2 - 1); b.loot(-W / 4, F + 0.3, 0.6);
  } else {
    bed(b, -W / 2 + 0.65, -D / 2 + 1.15);
    if (v !== 1) table(b, W / 2 - 1.1, -0.3, Math.PI / 2, 1.3, 0.75);
    chair(b, W / 2 - 1.8, -0.3, Math.PI / 2, v === 2);
    shelf(b, 0.6, -D / 2 + 0.35);
    if (v === 1) { b.box('woodDark', W / 2 - 0.8, F, -1.2, 0.9, 0.7, 0.6); b.loot(W / 2 - 0.8, F + 1, -1.2); }
    b.loot(W / 2 - 0.8, F + 0.3, D / 2 - 0.9);
  }
  if (rnd() < 0.6) b.box('glowLamp', -W / 2 + 0.4, F + 0.42 + 0.56, -D / 2 + 0.25, 0.12, 0.2, 0.12, { collide: false });
}

export function chapel(b, x, z, rot, base, rnd) {
  const W = 8, D = 12;
  b.setFrame(x, base, z, rot);
  b.box('stone', 0, -0.9, 0, W + 0.4, 0.9 + 0.25, D + 0.4, { tex: 3 });
  const seg = 1.0;
  // Seitenwände: Ruine mit unterschiedlich hohen Abschnitten und Fensterlücken
  for (const s of [-1, 1]) for (let i = 0; i < D / seg; i++) {
    const zz = -D / 2 + seg / 2 + i * seg;
    const h = 1.2 + rnd() * 3.6;
    if (i % 4 === 2 && h > 2.5) {
      b.box('stone', s * (W / 2 - 0.25), 0.25, zz, 0.5, 1.1, seg, { tex: 3 });
      b.box('stone', s * (W / 2 - 0.25), 2.6, zz, 0.5, h - 2.4 + 0.5, seg, { tex: 3 });
    } else b.box('stone', s * (W / 2 - 0.25), 0.25, zz, 0.5, h, seg, { tex: 3 });
  }
  b.box('stone', 0, 0.25, -D / 2 + 0.25, W, 5.5, 0.5, { tex: 3 });
  for (const s of [-1, 1]) b.box('stone', s * (W / 4 + 0.5), 0.25, D / 2 - 0.25, W / 2 - 1, 3 + rnd() * 1.5, 0.5, { tex: 3 });
  b.box('stone', 0, 3.0, D / 2 - 0.25, 2.2, 1.2, 0.5, { tex: 3 });
  // Glockengiebel
  b.geo('stone', gableGeo(W, 2.2, 0.5), 0, 5.75, -D / 2 + 0.25, Math.PI / 2);
  // Dachbalken
  for (let i = 0; i < 4; i++) b.box('woodDark', 0, 4.2 + rnd() * 0.4, -D / 2 + 2 + i * 2.6, W, 0.25, 0.25, { rz: (rnd() - 0.5) * 0.3, collide: false });
  b.box('woodDark', 2.2, 0.25, 2.5, 4.8, 0.25, 0.25, { rot: 0.6, rz: 0.4, collide: false });
  // Altar + Kreuz
  b.box('stone', 0, 0.25, -D / 2 + 1.6, 2.4, 1.0, 1.0, { tex: 2 });
  b.loot(0, 1.5, -D / 2 + 1.6, 'altar');
  b.box('woodDark', 0, 0.25, -D / 2 + 0.6, 0.2, 3.5, 0.2);
  b.box('woodDark', 0, 2.6, -D / 2 + 0.6, 1.6, 0.2, 0.2, { rz: 0.15, collide: false });
  // Bänke
  for (let r = 0; r < 4; r++) for (const s of [-1, 1]) {
    if (rnd() < 0.2) continue;
    const zz = -1.5 + r * 1.6, xx = s * 2;
    const tilt = rnd() < 0.25;
    b.box('woodDark', xx, 0.25, zz, 2.6, 0.45, 0.45, { rz: tilt ? 0.35 : 0, forceCollide: true });
    b.box('woodDark', xx, 0.7, zz - 0.2, 2.6, 0.5, 0.06, { collide: false, rz: tilt ? 0.35 : 0 });
    if (rnd() < 0.35) b.loot(xx, 1.0, zz);
  }
  b.loot(2.5, 0.5, 4, 'inside');
  b.loot(-2.8, 0.5, -3.5, 'inside');
}

export function graveyard(b, x, z, rot, heightFn, rnd) {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
    if (rnd() < 0.15) continue;
    b.setFrame(x, 0, z, rot);
    const lx = -4 + j * 2 + (rnd() - 0.5) * 0.5, lz = -3 + i * 2.2 + (rnd() - 0.5) * 0.4;
    const [wx, wz] = b.toWorld(lx, lz);
    const h = heightFn(wx, wz);
    const tall = 0.6 + rnd() * 0.6;
    b.box('stone', lx, h - 0.2, lz, 0.6, tall + 0.2, 0.16, { rx: (rnd() - 0.5) * 0.35, rz: (rnd() - 0.5) * 0.3, forceCollide: true, tex: 1 });
    if (rnd() < 0.3) { b.box('stone', lx, h + tall - 0.05, lz, 0.2, 0.5, 0.12, { collide: false, tex: 1 }); b.box('stone', lx, h + tall + 0.2, lz, 0.5, 0.12, 0.12, { collide: false, tex: 1 }); }
    b.box('dirt', lx, h - 0.25, lz + 0.9, 0.8, 0.3, 1.6, { collide: false });
  }
}

export function watchtower(b, x, z, base, rnd) {
  b.setFrame(x, base, z, rnd() * 6);
  const hgt = 6.5, s = 1.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('woodDark', sx * s, -0.5, sz * s, 0.25, hgt + 0.5, 0.25);
  for (const y of [1.8, 3.8]) for (const r of [0, Math.PI / 2]) {
    b.box('woodDark', 0, y, 0, 3.2, 0.12, 0.12, { rot: r + 0.78, rz: 0.55, collide: false });
  }
  b.box('wood', 0, hgt, 0, 3.6, 0.2, 3.6);
  for (const r of [0, 1, 2, 3]) {
    const a = r * Math.PI / 2;
    b.setFrame(x, base, z, b.f.rot);
    const lx = Math.sin(a) * 1.75, lz = Math.cos(a) * 1.75;
    b.box('woodDark', lx, hgt + 0.9, lz, 3.6, 0.1, 0.1, { rot: a + Math.PI / 2, collide: false });
  }
  b.box('roof', 0, hgt + 2.4, 0, 4.2, 0.15, 4.2, { collide: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('woodDark', sx * 1.7, hgt, sz * 1.7, 0.12, 2.4, 0.12, { collide: false });
  // Leiter
  for (const sx of [-0.25, 0.25]) b.box('woodDark', sx, -0.2, s + 0.4, 0.06, hgt + 0.2, 0.06, { rx: -0.08, collide: false });
  for (let i = 0; i < 12; i++) b.box('woodDark', 0, 0.4 + i * 0.52, s + 0.4 - i * 0.04, 0.55, 0.05, 0.05, { collide: false });
  b.loot(0.5, 0.4, -0.3, 'outside');
}

export function outhouse(b, x, z, rot, base) {
  b.setFrame(x, base, z, rot);
  const W = 1.3, H = 2.3;
  b.box('woodDark', 0, -0.4, 0, W, 0.55, W);
  b.box('wood', 0, 0.15, -W / 2 + 0.06, W, H, 0.12);
  b.box('wood', -W / 2 + 0.06, 0.15, 0, 0.12, H, W);
  b.box('wood', W / 2 - 0.06, 0.15, 0, 0.12, H, W);
  b.box('wood', 0.42, 0.15, W / 2 - 0.06, 0.45, H, 0.12);
  b.box('roof', 0, H + 0.15, 0, W + 0.3, 0.1, W + 0.4, { rx: 0.15, collide: false });
  b.box('woodDark', -0.2, 0.15, W / 2 + 0.5, 0.7, 0.05, 1.9, { rot: -0.3, rx: 1.45, collide: false });
  b.loot(0, 0.5, 0, 'inside');
}

export function van(b, x, z, rot, base) {
  b.setFrame(x, base, z, rot);
  // Fahrgestell & begehbarer Laderaum (Front zeigt lokal +z) – Safe-Zone mit Party-Lights
  b.box('metal', 0, 0.45, -0.6, 2.1, 0.1, 3.6);                          // Boden (Oberkante 0.55)
  b.box('white', 0, 2.4, -0.6, 2.1, 0.1, 3.6, { tex: 2.2 });             // Dach
  b.box('white', -1.0, 0.55, -0.6, 0.1, 1.85, 3.6, { tex: 2.2 });        // linke Wand
  b.box('white', 0, 0.55, -2.35, 2.1, 1.85, 0.1, { tex: 2.2 });          // Hecktür
  b.box('white', 0, 0.55, 1.15, 2.1, 1.85, 0.1, { tex: 2.2 });           // Trennwand zum Fahrerhaus
  b.box('white', 1.0, 0.55, -1.9, 0.1, 1.85, 1.0, { tex: 2.2 });         // rechte Wand hinten
  b.box('white', 1.0, 0.55, 0.7, 0.1, 1.85, 1.0, { tex: 2.2 });          // rechte Wand vorn (dazwischen offene Schiebetür)
  b.box('metal', 1.3, 0, -0.6, 0.45, 0.28, 1.2);                         // Trittstufe zur Tür
  b.box('white', 0, 0.55, 1.65, 2.1, 1.2, 1.0, { tex: 2.2 });
  b.box('white', 0, 1.75, 1.35, 2.1, 0.7, 0.4, { rx: 0.5, collide: false, tex: 2.2 });
  b.collider(0, 1.75, 1.3, 2.1, 0.7, 0.6);
  b.box('glass', 0, 1.78, 1.5, 1.95, 0.55, 0.05, { rx: 0.5, collide: false });
  for (const s of [-1, 1]) b.box('glass', s * 1.06, 1.6, 1.1, 0.03, 0.55, 0.8, { collide: false });
  b.box('metal', 0, 0.3, -0.4, 2.15, 0.15, 4.9, { collide: false });
  for (const sz of [-1.7, 1.4]) for (const sx of [-1, 1]) b.cyl('tire', sx * 0.98, 0.42, sz, 0.42, 0.42, 0.3, 12, { rz: Math.PI / 2 });
  for (const s of [-1, 1]) {
    b.box('glowHead', s * 0.75, 0.95, 2.16, 0.32, 0.18, 0.03, { collide: false });
    b.box('glowRed', s * 0.85, 1.2, -2.42, 0.15, 0.35, 0.03, { collide: false });
  }
  b.box('metal', 0, 0.55, 2.18, 2.2, 0.22, 0.12, { collide: false });
  // Einrichtung im Laderaum: Kühlbox mit Energy-Drinks (füllt Ausdauer auf) und Sitzbank
  b.box('white', -0.7, 0.55, -1.95, 0.45, 0.4, 0.5, { collide: false, tex: 2.2 });
  b.box('glowHead', -0.7, 0.96, -1.95, 0.47, 0.04, 0.52, { collide: false });
  b.box('metal', -0.78, 0.55, -0.4, 0.35, 0.42, 1.4, { collide: false });
  // offene Schiebetür: Ladezone rechts (+x)
  b.box('white', 1.12, 0.55, -1.9, 0.06, 1.85, 1.0, { collide: false, tex: 2.2 }); // aufgeschobene Tür
  // Markierung der Abgabezone
  const zx = 3.4, zz = -0.6, zw = 3.2, zd = 4.2;
  for (const s of [-1, 1]) {
    b.box('glowZone', zx + s * zw / 2, 0.02, zz, 0.12, 0.04, zd, { collide: false });
    b.box('glowZone', zx, 0.02, zz + s * zd / 2, zw, 0.04, 0.12, { collide: false });
  }
  const [wx, wz] = b.toWorld(zx, zz);
  return { x: wx, z: wz, hx: zw / 2, hz: zd / 2, rot, y: base };
}

export function carWreck(b, x, z, rot, base) {
  b.setFrame(x, base, z, rot);
  b.box('rust', 0, 0.3, 0, 1.8, 0.7, 4.2, { rz: 0.06, forceCollide: true, tex: 2 });
  b.box('rust', 0, 1.0, -0.3, 1.6, 0.6, 2.0, { rz: 0.06, forceCollide: true, tex: 2 });
  b.box('glass', 0, 1.05, 0.71, 1.5, 0.5, 0.03, { rx: 0.3, collide: false });
  for (const sz of [-1.3, 1.3]) b.cyl('tire', 0.92, 0.36, sz, 0.36, 0.36, 0.25, 10, { rz: Math.PI / 2 });
  b.loot(-1.6, 0.2, 0.8, 'outside');
}

export function campfire(b, x, z, base) {
  b.setFrame(x, base, z, 0);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    b.box('stone', Math.cos(a) * 0.85, -0.05, Math.sin(a) * 0.85, 0.35, 0.25, 0.28, { rot: -a, collide: false, tex: 0.8 });
  }
  for (let i = 0; i < 4; i++) b.box('woodDark', 0, 0.05, 0, 0.14, 0.14, 1.1, { rot: i * 0.8, rx: 0.25, collide: false });
  b.box('glowEmber', 0, -0.02, 0, 0.9, 0.06, 0.9, { collide: false });
  b.collider(0, -0.1, 0, 1.6, 0.35, 1.6);
  // Baumstämme zum Sitzen
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.4;
    b.cyl('bark', Math.cos(a) * 3.2, 0.25, Math.sin(a) * 3.2, 0.25, 0.25, 2.2, 7, { rot: -a, rx: Math.PI / 2 });
    b.collider(Math.cos(a) * 3.2, -0.1, Math.sin(a) * 3.2, 0.5, 0.6, 2.2, -a);
  }
}

export function picnicTable(b, x, z, rot, base) {
  b.setFrame(x, base, z, rot);
  b.box('wood', 0, 0.72, 0, 1.9, 0.06, 0.8, { collide: false });
  for (const s of [-1, 1]) {
    b.box('wood', 0, 0.42, s * 0.7, 1.9, 0.05, 0.3, { collide: false });
    b.box('woodDark', s * 0.75, -0.1, 0, 0.08, 0.85, 1.6, { collide: false });
  }
  b.collider(0, -0.1, 0, 1.9, 0.88, 1.7);
  b.loot(0, 1.0, 0, 'outside');
}

export function well(b, x, z, base) {
  b.setFrame(x, base, z, 0.3);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    b.box('stone', Math.cos(a) * 0.75, -0.2, Math.sin(a) * 0.75, 0.62, 1.0, 0.3, { rot: -a + Math.PI / 2, collide: false, tex: 1 });
  }
  b.collider(0, -0.2, 0, 1.8, 1.0, 1.8);
  for (const s of [-1, 1]) b.box('woodDark', s * 0.9, 0, 0, 0.12, 2.2, 0.12, { collide: false });
  b.box('woodDark', 0, 2.0, 0, 2.0, 0.1, 0.1, { collide: false });
  b.box('roof', 0, 2.2, 0, 2.3, 0.08, 1.6, { collide: false });
}

export function stickFigure(b, x, y, z, rot, rnd) {
  b.setFrame(x, y, z, rot);
  b.box('stick', 0, 0, 0, 0.04, 0.9, 0.04, { collide: false });
  b.box('stick', 0, 0.55, 0, 0.6, 0.04, 0.04, { rz: 0.1, collide: false });
  b.box('stick', -0.12, -0.35, 0, 0.04, 0.5, 0.04, { rz: 0.35, collide: false });
  b.box('stick', 0.12, -0.35, 0, 0.04, 0.5, 0.04, { rz: -0.35, collide: false });
  b.box('stick', 0, 0.9, 0, 0.012, 1.2 + rnd(), 0.012, { collide: false });
}

export function fence(b, x0, z0, x1, z1, heightFn, rnd) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.floor(len / 2.4);
  const rot = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (rnd() < 0.15) continue;
    const h = heightFn(x, z);
    b.setFrame(x, h, z, rot);
    b.box('woodDark', 0, -0.3, 0, 0.12, 1.4, 0.12, { rz: (rnd() - 0.5) * 0.2, collide: false });
    if (i < n && rnd() > 0.25) {
      b.box('wood', 0, 0.75, 1.2, 0.06, 0.12, 2.4, { rx: (rnd() - 0.5) * 0.15, collide: false });
      b.box('wood', 0, 0.35, 1.2, 0.06, 0.12, 2.4, { rx: (rnd() - 0.5) * 0.3, collide: false });
    }
  }
}
