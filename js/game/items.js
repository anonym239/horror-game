// Fundstücke: Wert, Gewicht, Zerbrechlichkeit und prozedurale 3D-Modelle.
import * as THREE from 'three';
import { mat } from '../engine/renderer.js';

// rarity: Gewicht für Zufallsauswahl, where: bevorzugte Spawn-Orte
export const LOOT = {
  vase:    { name: 'Alte Vase', val: [55, 100], mass: 2, fragile: 1.0, sound: 'glass', shape: { type: 'cyl', r: 0.17, h: 0.45 }, rarity: 10 },
  radio:   { name: 'Kofferradio', val: [40, 75], mass: 3, fragile: 0.5, sound: 'metal', shape: { type: 'box', x: 0.45, y: 0.28, z: 0.16 }, rarity: 10 },
  teddy:   { name: 'Teddybär', val: [15, 35], mass: 0.6, fragile: 0, sound: 'soft', shape: { type: 'sphere', r: 0.2 }, rarity: 12 },
  lantern: { name: 'Petroleumlampe', val: [30, 60], mass: 1.4, fragile: 0.7, sound: 'glass', shape: { type: 'cyl', r: 0.12, h: 0.38 }, rarity: 10 },
  camera:  { name: 'Alte Kamera', val: [70, 120], mass: 1.2, fragile: 0.85, sound: 'metal', shape: { type: 'box', x: 0.24, y: 0.17, z: 0.14 }, rarity: 7 },
  skull:   { name: 'Hirschschädel', val: [45, 90], mass: 2.2, fragile: 0.4, sound: 'wood', shape: { type: 'box', x: 0.35, y: 0.3, z: 0.5 }, rarity: 7 },
  tv:      { name: 'Röhrenfernseher', val: [130, 210], mass: 16, fragile: 0.6, sound: 'metal', shape: { type: 'box', x: 0.6, y: 0.5, z: 0.5 }, rarity: 4, heavy: true },
  jewels:  { name: 'Schmuckkästchen', val: [90, 160], mass: 1.5, fragile: 0.3, sound: 'wood', shape: { type: 'box', x: 0.3, y: 0.16, z: 0.22 }, rarity: 6 },
  jar:     { name: 'Einmachglas', val: [20, 45], mass: 1, fragile: 1.2, sound: 'glass', shape: { type: 'cyl', r: 0.1, h: 0.25 }, rarity: 10 },
  doll:    { name: 'Porzellanpuppe', val: [60, 110], mass: 1, fragile: 1.0, sound: 'glass', shape: { type: 'box', x: 0.2, y: 0.42, z: 0.14 }, rarity: 7 },
  clock:   { name: 'Taschenuhr', val: [80, 140], mass: 0.3, fragile: 0.6, sound: 'metal', shape: { type: 'cyl', r: 0.07, h: 0.04 }, rarity: 5 },
  toolbox: { name: 'Werkzeugkiste', val: [35, 70], mass: 7, fragile: 0.1, sound: 'metal', shape: { type: 'box', x: 0.55, y: 0.25, z: 0.22 }, rarity: 8 },
  tape:    { name: 'Tonband 1987', val: [66, 99], mass: 0.5, fragile: 0.5, sound: 'metal', shape: { type: 'box', x: 0.22, y: 0.14, z: 0.07 }, rarity: 3, lore: true },
  idol:    { name: 'Goldenes Idol', val: [220, 380], mass: 6, fragile: 0.35, sound: 'metal', shape: { type: 'box', x: 0.25, y: 0.5, z: 0.25 }, rarity: 2, rare: true },
  boeller: { name: 'Böller', val: [0, 0], mass: 0.4, fragile: 0, sound: 'soft', shape: { type: 'cyl', r: 0.06, h: 0.22 }, rarity: 0, tool: true },
  polen:   { name: 'Polenböller', val: [0, 0], mass: 0.9, fragile: 0, sound: 'soft', shape: { type: 'cyl', r: 0.1, h: 0.3 }, rarity: 0, tool: true },
};
/** Sprengkörper: Zündzeit, Lärm-Radius, Stärke (1 = normaler Böller) */
export const EXPLOSIVES = { boeller: { fuse: 2.6, noise: 85, power: 1 }, polen: { fuse: 3.2, noise: 160, power: 5 } };

export const ICONS = { vase: '🏺', radio: '📻', teddy: '🧸', lantern: '🏮', camera: '📷', skull: '💀', tv: '📺', jewels: '💎', jar: '🫙', doll: '🪆', clock: '⏱️', toolbox: '🧰', idol: '🗿', tape: '📼', boeller: '🧨', polen: '💥' };

export function pickLootType(rnd, kind) {
  const entries = Object.entries(LOOT).filter(([, d]) => !d.tool);
  let total = 0;
  const w = entries.map(([id, d]) => {
    let r = d.rarity;
    if (kind === 'altar' && id === 'idol') r += 25;
    if (kind === 'forest' && (id === 'tv' || id === 'vase')) r *= 0.3;
    total += r; return r;
  });
  let x = rnd() * total;
  for (let i = 0; i < entries.length; i++) { x -= w[i]; if (x <= 0) return entries[i][0]; }
  return entries[0][0];
}

const cache = {};
function M(key, color, o) { return cache[key] || (cache[key] = mat(color, o)); }
export function clearItemCache() { for (const k in cache) { cache[k].dispose(); delete cache[k]; } }

/** baut das Modell; Ursprung = Mittelpunkt der Physikform */
export function makeItemMesh(type) {
  const g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true; g.add(mesh); return mesh;
  };
  const gold = M('gold', 0xd4a640, { roughness: 0.3, metalness: 0.9, emissive: 0x2a1a00, emissiveIntensity: 0.6 });
  const darkMetal = M('dmetal', 0x2a2a2a, { roughness: 0.5, metalness: 0.7 });
  switch (type) {
    case 'vase': {
      const pts = [[0, -0.22], [0.12, -0.22], [0.17, -0.1], [0.15, 0.08], [0.07, 0.17], [0.09, 0.23]].map(([r, y]) => new THREE.Vector2(r, y));
      add(new THREE.LatheGeometry(pts, 12), M('vase', 0x3d6a8a, { roughness: 0.25, metalness: 0.1 }));
      add(new THREE.TorusGeometry(0.155, 0.012, 4, 16), gold, 0, 0.0, 0, Math.PI / 2);
      break;
    }
    case 'radio':
      add(new THREE.BoxGeometry(0.45, 0.28, 0.16), M('radio', 0x7a2a1e, { roughness: 0.6 }));
      add(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14), M('grill', 0xb0a890, { roughness: 0.4, metalness: 0.6 }), -0.1, 0, 0.08, Math.PI / 2);
      add(new THREE.BoxGeometry(0.14, 0.06, 0.02), M('dial', 0xe8d8a0, { emissive: 0x403010 }), 0.12, 0.05, 0.08);
      add(new THREE.TorusGeometry(0.12, 0.012, 4, 10, Math.PI), darkMetal, 0, 0.14, 0);
      break;
    case 'teddy': {
      const fur = M('fur', 0x8a5a34, { roughness: 1 });
      add(new THREE.SphereGeometry(0.16, 10, 8), fur, 0, -0.04, 0);
      add(new THREE.SphereGeometry(0.11, 10, 8), fur, 0, 0.15, 0);
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.045, 6, 6), fur, s * 0.08, 0.24, 0);
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.018, 6, 6), M('eye', 0x000000, { roughness: 0.2 }), s * 0.04, 0.17, 0.095);
      add(new THREE.BoxGeometry(0.02, 0.12, 0.02), M('stitch', 0xaa0000), 0.05, -0.02, 0.15, 0, 0, 0.6);
      break;
    }
    case 'lantern':
      add(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 10), darkMetal, 0, -0.15, 0);
      add(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 10), M('lglass', 0xffcc66, { emissive: 0xff8a20, emissiveIntensity: 0.5, roughness: 0.1 }), 0, -0.01, 0);
      add(new THREE.ConeGeometry(0.1, 0.1, 10), darkMetal, 0, 0.14, 0);
      add(new THREE.TorusGeometry(0.06, 0.008, 4, 10), darkMetal, 0, 0.21, 0);
      break;
    case 'camera':
      add(new THREE.BoxGeometry(0.24, 0.15, 0.1), M('cam', 0x1c1c1c, { roughness: 0.5 }), 0, 0, -0.02);
      add(new THREE.CylinderGeometry(0.05, 0.055, 0.07, 14), M('lens', 0x101010, { roughness: 0.1, metalness: 0.8 }), 0.03, 0, 0.05, Math.PI / 2);
      add(new THREE.BoxGeometry(0.06, 0.03, 0.06), M('chrome', 0xcccccc, { roughness: 0.2, metalness: 1 }), -0.07, 0.085, -0.02);
      break;
    case 'skull': {
      const bone = M('bone', 0xd8ceb4, { roughness: 0.8 });
      add(new THREE.BoxGeometry(0.2, 0.18, 0.4), bone, 0, -0.04, 0.03);
      add(new THREE.SphereGeometry(0.12, 8, 6), bone, 0, 0.0, -0.12);
      for (const s of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.015, 0.025, 0.35, 5), bone, s * 0.1, 0.13, -0.12, 0, 0, s * -0.6);
        add(new THREE.CylinderGeometry(0.01, 0.015, 0.15, 5), bone, s * 0.2, 0.25, -0.1, 0.5, 0, s * -0.2);
        add(new THREE.SphereGeometry(0.03, 6, 6), M('eyeh', 0x050505), s * 0.07, 0.02, 0.0);
      }
      break;
    }
    case 'tv':
      add(new THREE.BoxGeometry(0.6, 0.5, 0.5), M('tvc', 0x4a3a2a, { roughness: 0.7 }));
      add(new THREE.BoxGeometry(0.42, 0.34, 0.02), M('screen', 0x223322, { roughness: 0.1, emissive: 0x0a1a0a, emissiveIntensity: 1 }), -0.05, 0.02, 0.25);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), darkMetal, 0.23, 0.1, 0.25, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), darkMetal, 0.23, 0.0, 0.25, Math.PI / 2);
      break;
    case 'jewels':
      add(new THREE.BoxGeometry(0.3, 0.12, 0.22), M('jbox', 0x5a1a2a, { roughness: 0.5 }), 0, -0.02, 0);
      add(new THREE.BoxGeometry(0.31, 0.04, 0.23), gold, 0, 0.06, 0);
      add(new THREE.OctahedronGeometry(0.03), M('gem', 0x30ff90, { emissive: 0x10a040, roughness: 0.1, metalness: 0.3 }), 0, 0.09, 0);
      break;
    case 'jar':
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 12), M('jglass', 0x88aa88, { roughness: 0.1, transparent: true, opacity: 0.55 }), 0, -0.01, 0);
      add(new THREE.CylinderGeometry(0.085, 0.085, 0.14, 10), M('pickles', 0x5a6a1a, { roughness: 0.8 }), 0, -0.04, 0);
      add(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), gold, 0, 0.11, 0);
      break;
    case 'doll': {
      const por = M('porcelain', 0xeee4dc, { roughness: 0.3 });
      add(new THREE.ConeGeometry(0.1, 0.24, 10), M('dress', 0x6a1a2a, { roughness: 0.9 }), 0, -0.08, 0);
      add(new THREE.SphereGeometry(0.075, 12, 10), por, 0, 0.12, 0);
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.014, 6, 6), M('eyeh', 0x050505), s * 0.026, 0.13, 0.065);
      add(new THREE.SphereGeometry(0.08, 10, 8, 0, Math.PI * 2, 0, 1.5), M('hair', 0x2a1a0a, { roughness: 1 }), 0, 0.135, -0.01);
      break;
    }
    case 'clock':
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 18), gold, 0, 0, 0);
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.032, 18), M('face', 0xf0ead8, { roughness: 0.3 }), 0, 0.001, 0);
      add(new THREE.TorusGeometry(0.018, 0.005, 4, 8), gold, 0, 0, 0.08, Math.PI / 2);
      break;
    case 'toolbox':
      add(new THREE.BoxGeometry(0.55, 0.22, 0.22), M('tbox', 0xa02010, { roughness: 0.5, metalness: 0.5 }), 0, -0.015, 0);
      add(new THREE.BoxGeometry(0.3, 0.03, 0.04), darkMetal, 0, 0.11, 0);
      break;
    case 'tape': {
      add(new THREE.BoxGeometry(0.22, 0.14, 0.07), M('tapeBody', 0x1c1a18, { roughness: 0.6 }));
      add(new THREE.BoxGeometry(0.16, 0.05, 0.072), M('tapeLabel', 0xe8dcb0, { roughness: 0.9 }), 0, 0.035, 0);
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.074, 10), M('tapeReel', 0x6a4a2a, { roughness: 0.5, metalness: 0.3 }), s * 0.05, -0.02, 0, Math.PI / 2);
      break;
    }
    case 'idol':
      add(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 8), gold, 0, -0.21, 0);
      add(new THREE.CylinderGeometry(0.06, 0.09, 0.22, 8), gold, 0, -0.06, 0);
      add(new THREE.SphereGeometry(0.08, 10, 8), gold, 0, 0.12, 0);
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.018, 6, 6), M('ruby', 0xff1010, { emissive: 0xff0000, emissiveIntensity: 2 }), s * 0.03, 0.13, 0.07);
      add(new THREE.ConeGeometry(0.05, 0.1, 6), gold, 0, 0.22, 0);
      break;
    case 'boeller':
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10), M('fire', 0xc81010, { roughness: 0.6 }));
      add(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 4), M('fuse', 0x222222), 0, 0.13, 0);
      break;
    case 'polen': {
      const red = M('polenRed', 0xd81818, { roughness: 0.5, emissive: 0x300000 });
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 12), red);
      for (const y of [-0.08, 0.08]) add(new THREE.CylinderGeometry(0.102, 0.102, 0.05, 12), M('polenWhite', 0xf0f0f0, { roughness: 0.6 }), 0, y, 0);
      add(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 4), M('fuse', 0x222222), 0, 0.19, 0);
      add(new THREE.SphereGeometry(0.018, 6, 6), M('spark', 0xffd040, { emissive: 0xffa000, emissiveIntensity: 3 }), 0, 0.24, 0);
      break;
    }
  }
  return g;
}
