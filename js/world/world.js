// Die Welt: abgelegenes Camp „Hollow Pines" mitten im Wald.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Noise, mulberry32, smoothstep, lerp } from '../engine/rng.js';
import { CollisionWorld } from '../engine/collision.js';
import { mat, addWind, getQ } from '../engine/renderer.js';
import { makeTextures, signTexture } from './textures.js';
import { Builder } from './builder.js';
import * as S from './structures.js';

const SIZE = 300, HALF = SIZE / 2;
export const PLAY_RADIUS = 108;

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  const x = ax + dx * t, z = az + dz * t;
  return Math.hypot(px - x, pz - z);
}

export class World {
  constructor(engine, seed = 1337) {
    this.engine = engine;
    this.seed = seed;
    this.size = SIZE;
    this.q = getQ();
    this.group = new THREE.Group();
    this.noise = new Noise(seed);
    const rnd = mulberry32(seed * 7 + 3);
    this.rnd = rnd;
    this._layout(rnd);
    this.height = (x, z) => this._height(x, z);
    this.collision = new CollisionWorld(this.height);
    this.tex = makeTextures();
    this._materials();
    this._terrain();
    this._structures(rnd);
    this._forest(mulberry32(seed * 13 + 1));
    this._sky();
    this._water();
    this._lights();
    this._fireflies(mulberry32(seed + 5));
    this._outdoorSpots(mulberry32(seed * 3 + 9));
    engine.scene.add(this.group);
  }

  // ---------------- Layout ----------------
  _layout(rnd) {
    const j = (s) => (rnd() - 0.5) * s;
    this.clearing = { x: j(4), z: j(4) };
    this.cabins = [];
    const angles = [15, 62, 108, 155, 205, 335];
    for (const a of angles) {
      const ang = (a + j(14)) * Math.PI / 180, R = 27 + j(8);
      const x = this.clearing.x + Math.cos(ang) * R, z = this.clearing.z + Math.sin(ang) * R;
      this.cabins.push({ x, z, rot: Math.atan2(this.clearing.x - x, this.clearing.z - z) });
    }
    this.lodge = { x: j(8), z: 55 + j(6) };
    this.lodge.rot = Math.atan2(this.clearing.x - this.lodge.x, this.clearing.z - this.lodge.z);
    this.chapel = { x: -72 + j(8), z: 36 + j(10), rot: Math.PI / 2 + j(0.4) };
    this.graves = { x: this.chapel.x + 2, z: this.chapel.z - 14, rot: this.chapel.rot };
    this.tower = { x: 64 + j(8), z: 58 + j(8) };
    this.lake = { x: 58 + j(6), z: -40 + j(6), r: 17 };
    this.van = { x: 0, z: -95, rot: 0 };
    this.trail = [[0, -150], [0, -100], [3 + j(6), -70], [-4 + j(6), -42], [this.clearing.x, this.clearing.z - 12]];
    this.paths = [
      [[this.clearing.x, this.clearing.z], [this.chapel.x + 8, this.chapel.z]],
      [[this.clearing.x, this.clearing.z], [this.lodge.x, this.lodge.z - 5]],
      [[this.clearing.x, this.clearing.z], [this.lake.x - 14, this.lake.z + 6]],
      [[this.clearing.x, this.clearing.z], [this.tower.x - 3, this.tower.z - 3]],
    ];
    this.outhouses = [{ x: this.clearing.x - 38, z: this.clearing.z - 10 }, { x: this.clearing.x + 40, z: this.clearing.z + 4 }];
    this.wreck = { x: -9, z: -68, rot: 0.5 };
    // Abflachungs-Zonen (Hütten stehen eben)
    this.zones = [
      { x: this.clearing.x, z: this.clearing.z, r0: 11, r1: 18 },
      ...this.cabins.map((c) => ({ x: c.x, z: c.z, r0: 5, r1: 9 })),
      { x: this.lodge.x, z: this.lodge.z, r0: 9, r1: 14 },
      { x: this.chapel.x, z: this.chapel.z, r0: 9, r1: 14 },
      { x: this.graves.x, z: this.graves.z, r0: 5, r1: 9 },
      { x: this.tower.x, z: this.tower.z, r0: 4, r1: 7 },
      { x: this.van.x + 2, z: this.van.z, r0: 8, r1: 13 },
      ...this.outhouses.map((o) => ({ x: o.x, z: o.z, r0: 2, r1: 4 })),
      { x: this.wreck.x, z: this.wreck.z, r0: 3, r1: 5 },
    ];
    for (const z of this.zones) z.h = this._base(z.x, z.z);
    this.waterY = this._base(this.lake.x, this.lake.z) - 0.4;
  }

  _base(x, z) {
    const n = this.noise;
    let h = n.fbm(x * 0.011, z * 0.011, 4) * 9 + n.fbm(x * 0.05 + 30, z * 0.05, 3) * 1.1;
    const r = Math.hypot(x, z);
    h += smoothstep(95, 145, r) * 20 * (0.7 + 0.3 * n.perlin(x * 0.03, z * 0.03));
    return h;
  }

  trailDist(x, z) {
    let d = Infinity;
    for (let i = 0; i < this.trail.length - 1; i++) d = Math.min(d, distToSeg(x, z, ...this.trail[i], ...this.trail[i + 1]));
    return d;
  }
  pathDist(x, z) {
    let d = this.trailDist(x, z);
    for (const p of this.paths) d = Math.min(d, distToSeg(x, z, ...p[0], ...p[1]));
    return d;
  }

  _height(x, z) {
    let h = this._base(x, z);
    // Weg leicht glätten
    const td = this.trailDist(x, z);
    if (td < 8) h = lerp(h, this.noise.fbm(x * 0.011, z * 0.011, 2) * 9, (1 - smoothstep(2.5, 8, td)) * 0.5);
    for (const zn of this.zones) {
      const d = Math.hypot(x - zn.x, z - zn.z);
      if (d < zn.r1) h = lerp(h, zn.h, 1 - smoothstep(zn.r0, zn.r1, d));
    }
    const ld = Math.hypot(x - this.lake.x, z - this.lake.z);
    if (ld < this.lake.r + 10) {
      h = lerp(h, this.waterY + 0.35, 1 - smoothstep(this.lake.r, this.lake.r + 10, ld));
      h = lerp(h, this.waterY - 1.8, 1 - smoothstep(this.lake.r * 0.3, this.lake.r, ld));
    }
    return h;
  }

  inWater(x, z) { return Math.hypot(x - this.lake.x, z - this.lake.z) < this.lake.r + 1 && this.height(x, z) < this.waterY; }

  // ---------------- Materialien ----------------
  _materials() {
    const T = this.tex;
    const plank = (c) => mat(c, { map: T.planks, roughness: 0.92 });
    this.M = {
      wood: plank(0xb09a85),
      woodDark: plank(0x6d5a4a),
      roof: mat(0xffffff, { map: T.shingles, roughness: 0.95 }),
      stone: mat(0xb8b4a8, { map: T.stone, roughness: 0.95 }),
      cloth: mat(0x6e5e52, { roughness: 1 }),
      cloth2: mat(0x8f8676, { roughness: 1 }),
      rug: mat(0x5a2420, { roughness: 1 }),
      dirt: mat(0x2e251c, { roughness: 1 }),
      white: mat(0xffffff, { map: T.dirtyWhite, roughness: 0.6 }),
      metal: mat(0x9a9890, { map: T.rust, roughness: 0.7, metalness: 0.4 }),
      rust: mat(0xb0a090, { map: T.rust, roughness: 0.8, metalness: 0.3 }),
      glass: mat(0x0b1218, { roughness: 0.08, metalness: 0.6 }),
      tire: mat(0x151515, { roughness: 0.9 }),
      bark: mat(0x8a7a6a, { map: T.bark, roughness: 1 }),
      stick: mat(0x3a2c20, { roughness: 1 }),
      glowHead: new THREE.MeshBasicMaterial({ color: 0xfff4d0 }),
      glowRed: new THREE.MeshBasicMaterial({ color: 0xff2010 }),
      glowZone: new THREE.MeshBasicMaterial({ color: 0xffc040 }),
      glowEmber: new THREE.MeshBasicMaterial({ color: 0xff5a14 }),
      glowLamp: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
    };
  }

  // ---------------- Terrain ----------------
  _terrain() {
    const seg = this.q.terrainSeg;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(0x26331b), moss = new THREE.Color(0x1b2614), leaf = new THREE.Color(0x3a2c1c);
    const dirt = new THREE.Color(0x4a3a2a), mud = new THREE.Color(0x231c15), rock = new THREE.Color(0x3c3c38);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.height(x, z);
      pos.setY(i, h);
      const n = this.noise.perlin(x * 0.08, z * 0.08) * 0.5 + 0.5;
      const n2 = this.noise.perlin(x * 0.02 + 50, z * 0.02) * 0.5 + 0.5;
      c.copy(grass).lerp(moss, n).lerp(leaf, smoothstep(0.45, 0.75, n2));
      const pd = this.pathDist(x, z);
      c.lerp(dirt, (1 - smoothstep(1.2, 3.2, pd)) * 0.85);
      for (const zn of this.zones) {
        const d = Math.hypot(x - zn.x, z - zn.z);
        if (d < zn.r1) c.lerp(dirt, (1 - smoothstep(zn.r0 * 0.6, zn.r1, d)) * 0.55);
      }
      const ld = Math.hypot(x - this.lake.x, z - this.lake.z);
      if (ld < this.lake.r + 6) c.lerp(mud, 1 - smoothstep(this.lake.r - 2, this.lake.r + 6, ld));
      const r = Math.hypot(x, z);
      c.lerp(rock, smoothstep(110, 140, r) * 0.5 * n);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = mat(0xffffff, { vertexColors: true, map: this.tex.ground, roughness: 1 });
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = this.q.shadows;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.terrainMesh = mesh;
  }

  // ---------------- Gebäude ----------------
  _structures(rnd) {
    const b = new Builder(this.collision);
    const H = (x, z) => this.height(x, z);
    this.cabins.forEach((c) => S.cabin(b, c.x, c.z, c.rot, H(c.x, c.z), rnd));
    S.cabin(b, this.lodge.x, this.lodge.z, this.lodge.rot, H(this.lodge.x, this.lodge.z), rnd, { W: 11, D: 7, lodge: true });
    S.chapel(b, this.chapel.x, this.chapel.z, this.chapel.rot, H(this.chapel.x, this.chapel.z), rnd);
    S.graveyard(b, this.graves.x, this.graves.z, this.graves.rot, H, rnd);
    S.watchtower(b, this.tower.x, this.tower.z, H(this.tower.x, this.tower.z), rnd);
    this.outhouses.forEach((o) => S.outhouse(b, o.x, o.z, Math.atan2(this.clearing.x - o.x, this.clearing.z - o.z), H(o.x, o.z)));
    this.vanZone = S.van(b, this.van.x, this.van.z, this.van.rot, H(this.van.x, this.van.z));
    S.carWreck(b, this.wreck.x, this.wreck.z, this.wreck.rot, H(this.wreck.x, this.wreck.z) - 0.1);
    S.campfire(b, this.clearing.x, this.clearing.z, H(this.clearing.x, this.clearing.z));
    for (let i = 0; i < 3; i++) {
      const a = 1.2 + i * 0.9, R = 9;
      const x = this.clearing.x + Math.cos(a) * R, z = this.clearing.z + Math.sin(a) * R;
      S.picnicTable(b, x, z, a, H(x, z));
    }
    S.well(b, this.clearing.x - 9, this.clearing.z + 5, H(this.clearing.x - 9, this.clearing.z + 5));
    S.fence(b, -4, -125, -4, -100, H, rnd);
    S.fence(b, 5, -125, 5, -102, H, rnd);
    // Stockfiguren an Bäumen entlang der Wege
    this.stickSpots = [];
    for (let i = 0; i < 14; i++) {
      const p = this.trail[1 + Math.floor(rnd() * 3)];
      const x = p[0] + (rnd() - 0.5) * 50, z = p[1] + (rnd() - 0.5) * 30;
      this.stickSpots.push([x, z]);
      S.stickFigure(b, x, H(x, z) + 2.2 + rnd(), z, rnd() * 6, rnd);
    }
    // Steg am See
    const lx = this.lake.x - this.lake.r + 1, lz = this.lake.z;
    b.setFrame(lx, this.waterY, lz, Math.PI / 2);
    b.box('woodDark', 0, 0.25, 4, 1.6, 0.12, 9, { tex: 1.2 });
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) b.box('woodDark', s * 0.7, -1.5, 0.5 + i * 2.6, 0.14, 1.85, 0.14, { collide: false });
    b.loot(0, 0.6, 7.5, 'outside');
    this.lootSpots = b.lootSpots;
    this.structures = b.build(this.M, this.q.shadows);
    this.group.add(this.structures);
    // Eingangsschild mit Text
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshLambertMaterial({ map: signTexture([{ text: 'CAMP HOLLOW PINES', size: 52 }, { text: 'seit 1987 geschlossen', size: 30 }]) }));
    const sx = -4.5, sz = -108;
    sign.position.set(sx, H(sx, sz) + 2.2, sz);
    sign.rotation.set(0, 0.15, 0.06);
    this.group.add(sign);
    const sb = new Builder(this.collision);
    sb.setFrame(sx, H(sx, sz), sz, 0.15);
    for (const s of [-1, 1]) sb.box('woodDark', s * 1.5, -0.3, -0.05, 0.14, 3.2, 0.14);
    this.group.add(sb.build(this.M, false));
  }

  _clearOf(x, z, extra = 0) {
    if (this.pathDist(x, z) < 3.5 + extra) return false;
    for (const zn of this.zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.r0 + 2 + extra) return false;
    if (Math.hypot(x - this.lake.x, z - this.lake.z) < this.lake.r + 4) return false;
    return true;
  }

  // ---------------- Wald ----------------
  _forest(rnd) {
    const q = this.q;
    // Kiefer: drei gestapelte Kegel, Vertex-Farben (unten dunkler)
    const cones = [];
    const layers = [[2.3, 3.2, 2.2], [1.8, 2.8, 3.8], [1.25, 2.4, 5.3], [0.7, 1.8, 6.6]];
    for (const [r, h, y] of layers) {
      const c = new THREE.ConeGeometry(r, h, 7, 1);
      c.translate(0, y, 0);
      cones.push(c.toNonIndexed());
    }
    const pine = mergeGeometries(cones);
    {
      const p = pine.attributes.position, col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const t = Math.min(1, p.getY(i) / 8);
        col[i * 3] = 0.06 + t * 0.06; col[i * 3 + 1] = 0.13 + t * 0.12; col[i * 3 + 2] = 0.08 + t * 0.05;
      }
      pine.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const trunk = new THREE.CylinderGeometry(0.16, 0.3, 1, 6);
    trunk.translate(0, 0.5, 0);
    // toter Baum: Stamm + Äste
    const deadParts = [new THREE.CylinderGeometry(0.1, 0.28, 7, 6).translate(0, 3.5, 0).toNonIndexed()];
    const dr = mulberry32(55);
    for (let i = 0; i < 7; i++) {
      const br = new THREE.CylinderGeometry(0.03, 0.08, 1.6 + dr() * 1.5, 4);
      br.translate(0, 0.8, 0);
      br.rotateZ(0.7 + dr() * 0.6);
      br.rotateY(dr() * Math.PI * 2);
      br.translate(0, 2.5 + i * 0.6, 0);
      deadParts.push(br.toNonIndexed());
    }
    const dead = mergeGeometries(deadParts);

    const inner = [], deco = [], deads = [];
    const occupied = new Map();
    const okSpacing = (x, z, d) => {
      const kx = Math.floor(x / 4), kz = Math.floor(z / 4);
      for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) {
        const arr = occupied.get((kx + a) * 1000 + kz + b2); if (!arr) continue;
        for (const [ox, oz] of arr) if ((ox - x) ** 2 + (oz - z) ** 2 < d * d) return false;
      }
      return true;
    };
    const mark = (x, z) => { const k = Math.floor(x / 4) * 1000 + Math.floor(z / 4); (occupied.get(k) || occupied.set(k, []).get(k)).push([x, z]); };
    // Kollidierbare Bäume im Spielbereich (immer gleich – unabhängig von der Grafikstufe)
    let tries = 0;
    while (inner.length + deads.length < 720 && tries++ < 20000) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (PLAY_RADIUS + 6);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const dense = 0.55 + 0.45 * (this.noise.perlin(x * 0.03 + 9, z * 0.03) * 0.5 + 0.5);
      if (rnd() > dense) continue;
      if (!this._clearOf(x, z) || !okSpacing(x, z, 3.2)) continue;
      mark(x, z);
      const s = 0.75 + rnd() * 0.65;
      (rnd() < 0.12 ? deads : inner).push([x, z, s, rnd() * 6]);
      this.collision.addTree(x, z, 0.28 * s + 0.05);
    }
    // Deko-Ring außen (nicht begehbar), Menge je nach Grafikstufe
    tries = 0;
    while (deco.length < q.decoTrees && tries++ < 20000) {
      const a = rnd() * Math.PI * 2, r = PLAY_RADIUS + 6 + rnd() * 40;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.trailDist(x, z) < 4 || !okSpacing(x, z, 3.4)) continue;
      mark(x, z);
      deco.push([x, z, 0.9 + rnd() * 0.7, rnd() * 6]);
    }
    const all = inner.concat(deco);
    const trunkMat = mat(0x8a7a6a, { map: this.tex.bark, roughness: 1 });
    const pineMat = addWind(mat(0xffffff, { vertexColors: true, roughness: 0.95, flatShading: true }), 0.025);
    const trunks = new THREE.InstancedMesh(trunk, trunkMat, all.length);
    const crowns = new THREE.InstancedMesh(pine, pineMat, all.length);
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
    const tint = new THREE.Color();
    all.forEach(([x, z, s, r], i) => {
      const y = this.height(x, z) - 0.2;
      qt.setFromEuler(e.set(0, r, 0));
      m4.compose(v.set(x, y, z), qt, sc.set(s, 4.2 * s, s)); trunks.setMatrixAt(i, m4);
      m4.compose(v.set(x, y + 1.6 * s, z), qt, sc.set(s * (0.9 + (r % 0.3)), s * 1.15, s)); crowns.setMatrixAt(i, m4);
      tint.setRGB(0.75 + (r % 1) * 0.4, 0.8 + ((r * 3) % 1) * 0.35, 0.8);
      crowns.setColorAt(i, tint);
    });
    const deadM = new THREE.InstancedMesh(dead, mat(0x5a4c40, { map: this.tex.bark, roughness: 1 }), Math.max(1, deads.length));
    deads.forEach(([x, z, s, r], i) => {
      qt.setFromEuler(e.set((r % 0.2) - 0.1, r, 0));
      m4.compose(v.set(x, this.height(x, z) - 0.3, z), qt, sc.set(s, s, s));
      deadM.setMatrixAt(i, m4);
    });
    deadM.count = deads.length;
    for (const im of [trunks, crowns, deadM]) {
      im.castShadow = q.shadows; im.receiveShadow = q.shadows;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
    this.deadTrees = deads;

    // Felsen
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    {
      const p = rockGeo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + Math.abs(Math.sin(i * 12.9)) * 0.4), p.getY(i) * 0.65, p.getZ(i));
      rockGeo.computeVertexNormals();
    }
    const rocks = [];
    for (let i = 0; i < 400 && rocks.length < 70; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * PLAY_RADIUS;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this._clearOf(x, z, -1) || !okSpacing(x, z, 2.5)) continue;
      const s = 0.4 + rnd() * rnd() * 1.6;
      rocks.push([x, z, s, rnd() * 6]);
      if (s > 0.7) this.collision.addTree(x, z, s * 0.85);
    }
    const rockM = new THREE.InstancedMesh(rockGeo, mat(0x9a968c, { map: this.tex.stone, roughness: 0.95, flatShading: true }), rocks.length);
    rocks.forEach(([x, z, s, r], i) => {
      m4.compose(v.set(x, this.height(x, z) + s * 0.15, z), qt.setFromEuler(e.set(r, r * 2, 0)), sc.set(s * 1.3, s, s));
      rockM.setMatrixAt(i, m4);
    });
    rockM.castShadow = q.shadows; rockM.receiveShadow = q.shadows;
    this.group.add(rockM);
    this.rocks = rocks;

    // Büsche (Farn-artig) – rein dekorativ
    const bushGeo = new THREE.IcosahedronGeometry(0.8, 0);
    bushGeo.scale(1, 0.6, 1); bushGeo.translate(0, 0.3, 0);
    const bushes = [];
    for (let i = 0; i < 3000 && bushes.length < 260; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (PLAY_RADIUS + 20);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this._clearOf(x, z, -1.5)) continue;
      bushes.push([x, z, 0.5 + rnd() * 0.9]);
    }
    const bushM = new THREE.InstancedMesh(bushGeo, addWind(mat(0x1d2c17, { roughness: 1, flatShading: true }), 0.06), bushes.length);
    bushes.forEach(([x, z, s], i) => {
      m4.compose(v.set(x, this.height(x, z) - 0.1, z), qt.setFromEuler(e.set(0, s * 9, 0)), sc.set(s, s, s));
      bushM.setMatrixAt(i, m4);
      tint.setHSL(0.25 + (s % 0.1), 0.35, 0.5 + (s * 7 % 0.3)); bushM.setColorAt(i, tint);
    });
    bushM.userData.detail = true;
    this.group.add(bushM);

    // Gras (nur Mittel/Hoch)
    if (q.grass > 0) {
      const blades = [];
      for (let k = 0; k < 4; k++) {
        const bl = new THREE.PlaneGeometry(0.08, 0.5, 1, 2);
        bl.translate(0, 0.25, 0);
        const p = bl.attributes.position;
        for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.4) p.setX(i, 0);
        bl.rotateY(k * 0.8); bl.rotateZ((k - 1.5) * 0.15);
        bl.translate((k - 1.5) * 0.08, 0, ((k * 7) % 3 - 1) * 0.06);
        blades.push(bl.toNonIndexed());
      }
      const clump = mergeGeometries(blades);
      const grassMat = addWind(mat(0x2f4022, { roughness: 1, side: THREE.DoubleSide }), 0.25);
      const gm = new THREE.InstancedMesh(clump, grassMat, q.grass);
      let n = 0;
      for (let i = 0; i < q.grass * 4 && n < q.grass; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (PLAY_RADIUS - 4);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (this.pathDist(x, z) < 1.5 || Math.hypot(x - this.lake.x, z - this.lake.z) < this.lake.r || this.zones.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r0)) continue;
        const s = 0.7 + rnd() * 0.8;
        m4.compose(v.set(x, this.height(x, z) - 0.05, z), qt.setFromEuler(e.set(0, rnd() * 6, 0)), sc.set(s, s * (0.8 + rnd() * 0.6), s));
        gm.setMatrixAt(n, m4);
        tint.setHSL(0.2 + rnd() * 0.08, 0.35, 0.35 + rnd() * 0.25); gm.setColorAt(n, tint);
        n++;
      }
      gm.count = n;
      gm.receiveShadow = q.shadows;
      gm.userData.detail = true;
      this.group.add(gm);
    }
  }

  // ---------------- Himmel / Wasser / Licht ----------------
  _sky() {
    const fogColor = new THREE.Color(0x0a0f16);
    this.fogColor = fogColor;
    this.engine.scene.fog = new THREE.FogExp2(fogColor, 0.038);
    this.engine.scene.background = fogColor;
    const R = this.q.far * 0.92;
    const geo = new THREE.SphereGeometry(R, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uHorizon: { value: fogColor.clone() }, uMoon: { value: new THREE.Vector3(-0.4, 0.55, 0.73).normalize() }, uTint: { value: new THREE.Color(0, 0, 0) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 uHorizon; uniform vec3 uMoon; uniform vec3 uTint; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 zen = vec3(0.018, 0.028, 0.05) + uTint * 0.5;
          vec3 col = mix(uHorizon + uTint * 0.3, zen, smoothstep(0.0, 0.5, h));
          float m = max(dot(d, uMoon), 0.0);
          col += vec3(0.55, 0.62, 0.75) * pow(m, 900.0) * 3.0 + vec3(0.12, 0.15, 0.22) * pow(m, 18.0) * 0.6 + uTint * pow(m, 900.0) * 3.0;
          vec3 sp = floor(d * 260.0);
          float st = step(0.9975, hash(sp)) * smoothstep(0.08, 0.4, h);
          col += vec3(st) * 0.7;
          // Wolkenschleier
          col *= 1.0 - 0.25 * smoothstep(0.2, 0.0, h);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
  }

  _water() {
    const g = new THREE.CircleGeometry(this.lake.r + 9, 40);
    g.rotateX(-Math.PI / 2);
    const m = this.q.lambert
      ? new THREE.MeshPhongMaterial({ color: 0x0a1218, shininess: 90, specular: 0x334455, transparent: true, opacity: 0.92 })
      : new THREE.MeshStandardMaterial({ color: 0x081016, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.92 });
    const w = new THREE.Mesh(g, m);
    w.position.set(this.lake.x, this.waterY, this.lake.z);
    this.group.add(w);
  }

  _lights() {
    const sc = this.engine.scene;
    this.hemi = new THREE.HemisphereLight(0x4a5a80, 0x141810, 1.0);
    this.moon = new THREE.DirectionalLight(0x9ab0d8, 0.7);
    this.moon.position.set(-40, 60, 80);
    this.group.add(this.hemi, this.moon);
    const cf = this.clearing;
    this.fireLight = new THREE.PointLight(0xff6a20, 4, 16, 1.6);
    this.fireLight.position.set(cf.x, this.height(cf.x, cf.z) + 0.6, cf.z);
    this.group.add(this.fireLight);
    this.vanLight = new THREE.SpotLight(0xfff0c8, 30, 45, 0.5, 0.6, 1.4);
    const vy = this.height(this.van.x, this.van.z);
    this.vanLight.position.set(this.van.x, vy + 1.0, this.van.z + 2.3);
    this.vanLight.target.position.set(this.van.x, vy, this.van.z + 30);
    this.group.add(this.vanLight, this.vanLight.target);
    this._partyLights(vy);
    // Glut-Partikel
    const n = 24, pg = new THREE.BufferGeometry();
    this.embers = new Float32Array(n * 3);
    this.emberSeeds = Array.from({ length: n }, () => Math.random());
    pg.setAttribute('position', new THREE.BufferAttribute(this.embers, 3));
    this.emberPts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xff7a30, size: 0.06, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.emberPts.frustumCulled = false;
    this.group.add(this.emberPts);
    void sc;
  }

  /** Party-Lights am Van: Lichterkette auf dem Dach, Unterboden-Neon und ein Farb-Punktlicht.
   *  Die Lichter existieren immer (konstante Lichtanzahl → keine Shader-Neukompilierung), sind aber nur im Spiel an. */
  _partyLights(vy) {
    const v = this.van, c = Math.cos(v.rot), s = Math.sin(v.rot);
    const W = (lx, ly, lz) => new THREE.Vector3(v.x + lx * c + lz * s, vy + ly, v.z - lx * s + lz * c);
    const pts = [];
    for (let i = 0; i <= 9; i++) { const lz = -2.35 + i * 0.38; pts.push(W(-1.08, 2.56, lz), W(1.08, 2.56, lz)); }
    for (let i = 1; i < 5; i++) { const lx = -1.08 + i * 0.432; pts.push(W(lx, 2.56, -2.4), W(lx, 2.56, 1.2)); }
    // Lichterkette innen unter der Decke (Safe-Zone)
    for (let i = 0; i <= 7; i++) { const lz = -2.2 + i * 0.45; pts.push(W(-0.88, 2.33, lz), W(0.88, 2.33, lz)); }
    // Rahmen der Schiebetür
    for (let i = 0; i <= 6; i++) { const y = 0.6 + i * 0.29; pts.push(W(1.07, y, -1.42), W(1.07, y, 0.22)); }
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), pts.length);
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); bulbs.setMatrixAt(i, m); bulbs.setColorAt(i, new THREE.Color(0x222222)); });
    bulbs.frustumCulled = false;
    // Unterboden-Neon: flache, leuchtende Fläche unter dem Van
    const glowGeo = new THREE.PlaneGeometry(2.6, 5.4); glowGeo.rotateX(-Math.PI / 2);
    const under = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    under.position.copy(W(0, 0.06, -0.4)); under.rotation.y = v.rot;
    const light = new THREE.PointLight(0xff00ff, 0, 9, 2);
    light.position.copy(W(0.3, 1.1, -0.6)); // im Laderaum, scheint durch die offene Tür nach draußen
    // Discokugel unter der Laderaum-Decke
    const disco = new THREE.Group();
    disco.position.copy(W(0, 1.95, -0.7));
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15, flatShading: true, emissive: 0xff00ff, emissiveIntensity: 0.6 }));
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    cord.position.y = 0.3;
    disco.add(ball, cord);
    this.group.add(bulbs, under, light, disco);
    this.party = { on: false, bulbs, under, light, disco, ball, n: pts.length, col: new THREE.Color() };
    this.setParty(false);
  }

  setParty(on) {
    const P = this.party; if (!P) return;
    P.on = on;
    P.bulbs.visible = on; P.under.visible = on; P.disco.visible = on;
    if (!on) P.light.intensity = 0;
  }

  _updateParty(t) {
    const P = this.party; if (!P || !P.on) return;
    const beat = Math.floor(t * 4);   // Wechsel 4× pro Sekunde
    for (let i = 0; i < P.n; i++) {
      const h = ((i * 0.13 + t * 0.35) % 1);
      const blink = ((i + beat) % 3) !== 0 ? 1 : 0.15;
      P.col.setHSL(h, 1, 0.5 * blink);
      P.bulbs.setColorAt(i, P.col);
    }
    P.bulbs.instanceColor.needsUpdate = true;
    const hue = (t * 0.25) % 1;
    P.col.setHSL(hue, 1, 0.5);
    P.light.color.copy(P.col);
    P.light.intensity = 0.6 + 0.6 * Math.max(0, Math.sin(t * Math.PI * 4));
    P.under.material.color.setHSL((hue + 0.5) % 1, 1, 0.5);
    P.under.material.opacity = 0.35 + 0.15 * Math.sin(t * 6);
    P.disco.rotation.y = t * 1.6;
    P.ball.material.emissive.setHSL((hue + 0.33) % 1, 1, 0.5);
  }

  _fireflies(rnd) {
    const n = this.q.fireflies;
    this.ffBase = [];
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const nearLake = i % 2 === 0;
      const a = rnd() * Math.PI * 2, r = (nearLake ? this.lake.r + 4 : 20) + rnd() * 25;
      const cx = nearLake ? this.lake.x : this.clearing.x, cz = nearLake ? this.lake.z : this.clearing.z;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      this.ffBase.push([x, Math.max(this.height(x, z), this.waterY) + 0.5 + rnd() * 2, z, rnd() * 10]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.ff = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc8ff70, size: 0.09, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true }));
    this.ff.frustumCulled = false;
    this.group.add(this.ff);
  }

  _outdoorSpots(rnd) {
    // Loot-Punkte im Wald (bei toten Bäumen, Felsen, Stockfiguren)
    for (const [x, z] of this.deadTrees.slice(0, 30)) this.lootSpots.push({ x: x + 1.2, y: this.height(x + 1.2, z) + 0.5, z, kind: 'forest' });
    for (const [x, z, s] of this.rocks.slice(0, 20)) this.lootSpots.push({ x: x + s + 0.8, y: this.height(x + s + 0.8, z) + 0.5, z, kind: 'forest' });
    for (const [x, z] of this.stickSpots) this.lootSpots.push({ x, y: this.height(x, z) + 0.5, z, kind: 'forest' });
    for (let i = 0; i < 25; i++) {
      const a = rnd() * Math.PI * 2, r = 15 + rnd() * (PLAY_RADIUS - 20);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this._clearOf(x, z, -2)) continue;
      this.lootSpots.push({ x, y: this.height(x, z) + 0.5, z, kind: 'forest' });
    }
    // Monster-Spawns: weit weg vom Van
    this.monsterSpawns = [];
    for (let i = 0; i < 200 && this.monsterSpawns.length < 24; i++) {
      const a = rnd() * Math.PI * 2, r = 45 + rnd() * 55;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - this.van.x, z - this.van.z) < 55 || !this._clearOf(x, z, -2)) continue;
      this.monsterSpawns.push({ x, z });
    }
    const vz = this.vanZone;
    this.playerSpawns = [0, 1, 2, 3].map((i) => ({ x: vz.x - 1 + (i % 2) * 2, z: vz.z + 3.5 + Math.floor(i / 2) * 1.5 }));
  }

  /** Im Laderaum des Vans (Safe-Zone: Monster sehen und hören dich dort nicht). */
  inSafeZone(x, z) {
    const v = this.van, c = Math.cos(v.rot), s = Math.sin(v.rot);
    const dx = x - v.x, dz = z - v.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < 1.0 && lz > -2.3 && lz < 1.1;
  }

  /** In einer Camp-Hütte oder der Lodge (Versteck: Monster können dich dort nicht sehen).
   *  Maße passen zu structures.cabin(): Innenraum = Grundfläche minus Wandstärke. */
  inHideout(x, y, z) {
    if (!this._hideouts) {
      const mk = (h, hw, hd) => ({ x: h.x, z: h.z, c: Math.cos(h.rot), s: Math.sin(h.rot), hw, hd, floor: this.height(h.x, h.z), r2: hw * hw + hd * hd });
      this._hideouts = [...this.cabins.map((c) => mk(c, 2.8, 2.3)), mk(this.lodge, 5.3, 3.3)];
    }
    for (const h of this._hideouts) {
      const dx = x - h.x, dz = z - h.z;
      if (dx * dx + dz * dz > h.r2) continue;
      const lx = dx * h.c - dz * h.s, lz = dx * h.s + dz * h.c;
      if (Math.abs(lx) < h.hw && Math.abs(lz) < h.hd && y > h.floor + 0.15) return true;
    }
    return false;
  }

  inVanZone(x, z, margin = 0) {
    const v = this.vanZone;
    const dx = x - v.x, dz = z - v.z, c = Math.cos(v.rot), s = Math.sin(v.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < v.hx + margin && Math.abs(lz) < v.hz + margin;
  }

  setEvent(kind) {
    // Spezial-Nächte: Blutmond (rot) oder Nebel
    const fog = this.engine.scene.fog;
    const tint = this.skyMat.uniforms.uTint.value;
    if (kind === 'bloodmoon') { fog.color.setHex(0x140405); fog.density = 0.034; tint.setRGB(0.25, 0.02, 0.02); this.hemi.color.setHex(0x6a2a2a); this.moon.color.setHex(0xff6050); }
    else if (kind === 'fog') { fog.color.setHex(0x0e1114); fog.density = 0.075; tint.setRGB(0.02, 0.02, 0.02); this.hemi.color.setHex(0x3a4a6a); this.moon.color.setHex(0x9ab0d8); }
    else { fog.color.copy(this.fogColor); fog.density = 0.038; tint.setRGB(0, 0, 0); this.hemi.color.setHex(0x3a4a6a); this.moon.color.setHex(0x9ab0d8); }
    this.engine.scene.background = fog.color;
    this.skyMat.uniforms.uHorizon.value.copy(fog.color);
  }

  update(dt, t, camPos) {
    this.sky.position.copy(camPos);
    this.fireLight.intensity = 3.2 + Math.sin(t * 13) * 0.5 + Math.sin(t * 7.3) * 0.6 + Math.random() * 0.4;
    this._updateParty(t);
    // Glut
    const cf = this.clearing, by = this.fireLight.position.y - 0.4;
    for (let i = 0; i < this.emberSeeds.length; i++) {
      const s = this.emberSeeds[i], life = (t * 0.35 + s) % 1;
      this.embers[i * 3] = cf.x + Math.sin(s * 40 + t) * 0.4 * life;
      this.embers[i * 3 + 1] = by + life * 2.2;
      this.embers[i * 3 + 2] = cf.z + Math.cos(s * 30 + t * 0.7) * 0.4 * life;
    }
    this.emberPts.geometry.attributes.position.needsUpdate = true;
    const p = this.ff.geometry.attributes.position.array;
    for (let i = 0; i < this.ffBase.length; i++) {
      const [x, y, z, ph] = this.ffBase[i];
      p[i * 3] = x + Math.sin(t * 0.3 + ph) * 1.5;
      p[i * 3 + 1] = y + Math.sin(t * 0.7 + ph * 2) * 0.4;
      p[i * 3 + 2] = z + Math.cos(t * 0.25 + ph) * 1.5;
    }
    this.ff.geometry.attributes.position.needsUpdate = true;
    this.ff.material.opacity = 0.5 + 0.5 * Math.sin(t * 3);
  }

  dispose() {
    this.engine.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map && m.map.dispose(); m.dispose(); });
    });
  }
}
