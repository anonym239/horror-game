// HollowEngine – Rigid-Body-Physik (cannon-es) mit Terrain-Heightfield, statischen Boxen und Schadens-Events.
import * as CANNON from 'cannon-es';

export class Physics {
  constructor(world) {
    this.w = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.w.broadphase = new CANNON.SAPBroadphase(this.w);
    this.w.allowSleep = true;
    this.w.solver.iterations = 8;
    this.w.defaultContactMaterial.friction = 0.45;
    this.w.defaultContactMaterial.restitution = 0.18;
    this.collisionWorld = world.collision;
    this.onImpact = null;
    this.onPreStep = null;
    this.w.addEventListener('preStep', () => this.onPreStep && this.onPreStep());

    // Terrain-Heightfield (2m Raster) über die gesamte Karte
    const size = world.size, half = size / 2, el = 2;
    const n = Math.floor(size / el) + 1;
    const data = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) row.push(world.height(-half + i * el, half - j * el));
      data.push(row);
    }
    const hf = new CANNON.Heightfield(data, { elementSize: el });
    const ground = new CANNON.Body({ mass: 0 });
    ground.addShape(hf);
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.position.set(-half, 0, half);
    this.w.addBody(ground);

    // statische Boxen aus der Welt übernehmen (Wände, Möbel, Böden)
    for (const b of world.collision.boxes) {
      if (b.tag === 'nophys') continue;
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(b.hx, (b.y1 - b.y0) / 2, b.hz)));
      body.position.set(b.cx, (b.y0 + b.y1) / 2, b.cz);
      body.quaternion.setFromEuler(0, b.rot, 0);
      this.w.addBody(body);
    }
    this._tmp = { x: 0, y: 0, z: 0 };
  }

  addItem(shapeDef, mass, pos, userData) {
    const body = new CANNON.Body({ mass, linearDamping: 0.08, angularDamping: 0.25, allowSleep: true, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.8 });
    const s = shapeDef;
    if (s.type === 'box') body.addShape(new CANNON.Box(new CANNON.Vec3(s.x / 2, s.y / 2, s.z / 2)));
    else if (s.type === 'sphere') body.addShape(new CANNON.Sphere(s.r));
    else if (s.type === 'cyl') body.addShape(new CANNON.Cylinder(s.r, s.r, s.h, 10));
    body.position.set(pos.x, pos.y, pos.z);
    body.quaternion.setFromEuler(0, Math.random() * Math.PI * 2, 0);
    body.userData = userData;
    body.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 2.2 && this.onImpact) this.onImpact(body, v, e.body);
    });
    this.w.addBody(body);
    return body;
  }
  remove(body) { this.w.removeBody(body); }

  step(dt) {
    this.w.step(1 / 60, dt, 3);
    // Gegenstände prallen an Baumstämmen ab (Bäume sind nur im Kollisions-Grid, nicht in cannon)
    for (const b of this.w.bodies) {
      if (b.mass === 0 || b.sleepState === 2) continue;
      const p = this._tmp; p.x = b.position.x; p.y = b.position.y - 0.3; p.z = b.position.z;
      const ox = p.x, oz = p.z;
      this.collisionWorld._forTrees(p.x - 1.5, p.z - 1.5, p.x + 1.5, p.z + 1.5, (t) => {
        const dx = p.x - t.x, dz = p.z - t.z, rr = t.r + 0.2;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          p.x = t.x + (dx / d) * rr; p.z = t.z + (dz / d) * rr;
          const nx = dx / d, nz = dz / d;
          const vn = b.velocity.x * nx + b.velocity.z * nz;
          if (vn < 0) { b.velocity.x -= 1.4 * vn * nx; b.velocity.z -= 1.4 * vn * nz; if (-vn > 2.2 && this.onImpact) this.onImpact(b, -vn, null); }
        }
      });
      if (p.x !== ox || p.z !== oz) { b.position.x = p.x; b.position.z = p.z; }
      // Sicherheitsnetz: nie unter das Terrain fallen
      const h = this.collisionWorld.height(b.position.x, b.position.z);
      if (b.position.y < h - 1) { b.position.y = h + 0.5; b.velocity.set(0, 0, 0); }
    }
  }
}
