// HollowEngine – schnelle Charakter-Kollision: Spatial-Grid mit Baum-Kreisen und gedrehten Boxen (OBB).

const CELL = 8;
const key = (ix, iz) => (ix + 2048) * 4096 + (iz + 2048);

export class CollisionWorld {
  constructor(heightFn) {
    this.height = heightFn;
    this.trees = new Map();
    this.boxGrid = new Map();
    this.boxes = [];
    this._stamp = 0;
  }

  addTree(x, z, r) {
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    let a = this.trees.get(k); if (!a) this.trees.set(k, (a = []));
    a.push({ x, z, r });
  }

  /** Box mit Mittelpunkt (cx,cz), Halbmaßen hx/hz, Drehung rot (wie three.js rotation.y), Höhe y0..y1 */
  addBox(cx, cz, hx, hz, rot, y0, y1, tag = '') {
    const c = Math.cos(rot), s = Math.sin(rot);
    const b = { cx, cz, hx, hz, rot, c, s, y0, y1, tag, _m: 0 };
    this.boxes.push(b);
    const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
    const x0 = Math.floor((cx - ex) / CELL), x1 = Math.floor((cx + ex) / CELL);
    const z0 = Math.floor((cz - ez) / CELL), z1 = Math.floor((cz + ez) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = key(ix, iz);
      let a = this.boxGrid.get(k); if (!a) this.boxGrid.set(k, (a = []));
      a.push(b);
    }
    return b;
  }

  _forBoxes(x0, z0, x1, z1, fn) {
    const stamp = ++this._stamp;
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const a = this.boxGrid.get(key(ix, iz)); if (!a) continue;
        for (const b of a) { if (b._m === stamp) continue; b._m = stamp; if (fn(b)) return; }
      }
  }
  _forTrees(x0, z0, x1, z1, fn) {
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const a = this.trees.get(key(ix, iz)); if (!a) continue;
        for (const t of a) fn(t);
      }
  }
  _local(b, x, z) {
    const dx = x - b.cx, dz = z - b.cz;
    return [dx * b.c - dz * b.s, dx * b.s + dz * b.c];
  }

  /** Bodenhöhe unter (x,z): Terrain oder begehbare Box-Oberseite (Treppenhöhe 0.45m). */
  groundAt(x, z, y = 1e9, radius = 0.25) {
    let g = this.height(x, z);
    this._forBoxes(x - 1, z - 1, x + 1, z + 1, (b) => {
      if (b.y1 > y + 0.45 || b.y1 <= g) return;
      const [lx, lz] = this._local(b, x, z);
      const m = radius * 0.6;
      if (Math.abs(lx) <= b.hx + m && Math.abs(lz) <= b.hz + m) g = b.y1;
    });
    return g;
  }

  /** Niedrigste Decke über (x,z) oberhalb von yFrom (für Sprünge in Hütten). */
  ceilingAt(x, z, yFrom, radius = 0.25) {
    let c = Infinity;
    this._forBoxes(x - 1, z - 1, x + 1, z + 1, (b) => {
      if (b.y0 < yFrom - 0.05 || b.y0 >= c) return;
      const [lx, lz] = this._local(b, x, z);
      if (Math.abs(lx) <= b.hx + radius && Math.abs(lz) <= b.hz + radius) c = b.y0;
    });
    return c;
  }

  /** Schiebt einen Zylinder (pos, radius, height) aus Bäumen und Wänden. Gibt true zurück bei Kontakt. */
  resolve(pos, radius, height) {
    let hit = false;
    this._forTrees(pos.x - radius - 1, pos.z - radius - 1, pos.x + radius + 1, pos.z + radius + 1, (t) => {
      const dx = pos.x - t.x, dz = pos.z - t.z, rr = radius + t.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) {
        const d = Math.sqrt(d2), p = (rr - d) / d;
        pos.x += dx * p; pos.z += dz * p; hit = true;
      }
    });
    for (let iter = 0; iter < 2; iter++) {
      this._forBoxes(pos.x - radius - 1, pos.z - radius - 1, pos.x + radius + 1, pos.z + radius + 1, (b) => {
        if (pos.y >= b.y1 - 0.45 || pos.y + height <= b.y0) return;
        const [lx, lz] = this._local(b, pos.x, pos.z);
        const qx = Math.max(-b.hx, Math.min(b.hx, lx)), qz = Math.max(-b.hz, Math.min(b.hz, lz));
        let dx = lx - qx, dz = lz - qz;
        const d2 = dx * dx + dz * dz;
        let px = 0, pz = 0;
        if (d2 > 1e-10) {
          if (d2 >= radius * radius) return;
          const d = Math.sqrt(d2), p = (radius - d) / d;
          px = dx * p; pz = dz * p;
        } else {
          const ox = b.hx - Math.abs(lx) + radius, oz = b.hz - Math.abs(lz) + radius;
          if (ox < oz) px = Math.sign(lx || 1) * ox; else pz = Math.sign(lz || 1) * oz;
        }
        pos.x += px * b.c + pz * b.s;
        pos.z += -px * b.s + pz * b.c;
        hit = true;
      });
    }
    return hit;
  }

  /** Abstand bis zur ersten Box entlang eines Strahls (oder Infinity). */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = Infinity;
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    this._forBoxes(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), (b) => {
      const [lox, loz] = this._local(b, ox, oz);
      const ldx = dx * b.c - dz * b.s, ldz = dx * b.s + dz * b.c;
      let t0 = 0, t1 = maxDist;
      const slab = (o, d, mn, mx) => {
        if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
        let a = (mn - o) / d, c = (mx - o) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
        return t0 <= t1;
      };
      if (slab(lox, ldx, -b.hx, b.hx) && slab(oy, dy, b.y0, b.y1) && slab(loz, ldz, -b.hz, b.hz)) {
        if (t0 < best) best = t0;
      }
    });
    return best;
  }

  /** Sichtlinie zwischen zwei Punkten frei? (Wände blockieren, Bäume nicht.) */
  lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return this.raycast(a.x, a.y, a.z, dx / d, dy / d, dz / d, d) >= d - 0.05;
  }
}
