// HollowEngine – StaticBuilder: baut Gebäude aus Primitiven, verschmilzt alles pro Material zu
// wenigen Draw-Calls und erzeugt automatisch die passenden Kollisions-Boxen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export function boxGeo(w, h, d, tex = 1.6) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0] / tex, uv.getY(i) * dims[f][1] / tex);
  }
  return g;
}

/** Dreiecks-Prisma (Giebel): Basis entlang z, Spitze nach oben, Dicke entlang x. */
export function gableGeo(base, height, thick) {
  const b = base / 2, t = thick / 2;
  const A = [-b, 0], B = [b, 0], C = [0, height];
  const P = [];
  const tri = (a, b2, c) => P.push(...a, ...b2, ...c);
  const v = (x, zy) => [x, zy[1], zy[0]];
  tri(v(t, A), v(t, B), v(t, C));
  tri(v(-t, B), v(-t, A), v(-t, C));
  const quad = (p1, p2, p3, p4) => { tri(p1, p2, p3); tri(p1, p3, p4); };
  quad(v(-t, A), v(-t, B), v(t, B), v(t, A));
  quad(v(-t, B), v(-t, C), v(t, C), v(t, B));
  quad(v(-t, C), v(-t, A), v(t, A), v(t, C));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const uv = [];
  for (let i = 0; i < P.length; i += 3) uv.push(P[i + 2] / 1.6, P[i + 1] / 1.6);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export class Builder {
  constructor(collision) {
    this.col = collision;
    this.parts = {};
    this.f = { x: 0, y: 0, z: 0, rot: 0, c: 1, s: 0, k: 1 };
    this.lootSpots = [];
  }
  /** k: Skalierung des lokalen Rahmens (z. B. größerer Van im Editor). */
  setFrame(x, y, z, rot = 0, k = 1) { this.f = { x, y, z, rot, c: Math.cos(rot), s: Math.sin(rot), k }; }
  toWorld(lx, lz) { const f = this.f; lx *= f.k; lz *= f.k; return [f.x + lx * f.c + lz * f.s, f.z - lx * f.s + lz * f.c]; }

  _add(key, geo, lx, ly, lz, rotY = 0, rx = 0, rz = 0) {
    const [wx, wz] = this.toWorld(lx, lz);
    _e.set(rx, this.f.rot + rotY, rz, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(wx, this.f.y + ly * this.f.k, wz);
    _m.compose(_p, _q, _s.setScalar(this.f.k));
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(_m);
    (this.parts[key] || (this.parts[key] = [])).push(g);
  }

  /** Box, ly = Unterkante (lokal). */
  box(key, lx, ly, lz, w, h, d, o = {}) {
    const rot = o.rot || 0;
    const g = boxGeo(w, h, d, o.tex);
    g.translate(0, h / 2, 0);
    this._add(key, g, lx, ly, lz, rot, o.rx || 0, o.rz || 0);
    if (o.collide !== false && ((!o.rx && !o.rz) || o.forceCollide)) this.collider(lx, ly, lz, w, h, d, rot, o.tag);
  }
  collider(lx, ly, lz, w, h, d, rot = 0, tag) {
    const [wx, wz] = this.toWorld(lx, lz);
    const k = this.f.k;
    this.col.addBox(wx, wz, w * k / 2, d * k / 2, this.f.rot + rot, this.f.y + ly * k, this.f.y + (ly + h) * k, tag);
  }
  cyl(key, lx, ly, lz, rt, rb, h, seg = 8, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (!o.rx && !o.rz) g.translate(0, h / 2, 0); // aufrecht: ly = Unterkante, liegend: ly = Mitte
    this._add(key, g, lx, ly, lz, o.rot || 0, o.rx || 0, o.rz || 0);
    if (o.collide) this.collider(lx, ly, lz, rb * 1.6, h, rb * 1.6, 0, o.tag);
  }
  geo(key, g, lx, ly, lz, rot = 0, rx = 0, rz = 0) { this._add(key, g, lx, ly, lz, rot, rx, rz); }
  loot(lx, ly, lz, kind = 'inside') {
    const [wx, wz] = this.toWorld(lx, lz);
    this.lootSpots.push({ x: wx, y: this.f.y + ly * this.f.k, z: wz, kind });
  }

  build(materials, shadows) {
    const group = new THREE.Group();
    for (const key in this.parts) {
      const merged = mergeGeometries(this.parts[key], false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materials[key] || materials.wood);
      mesh.castShadow = shadows && !key.startsWith('glow');
      mesh.receiveShadow = shadows;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      this.parts[key].forEach((g) => g.dispose());
    }
    this.parts = {};
    return group;
  }
}
