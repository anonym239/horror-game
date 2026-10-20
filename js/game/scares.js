// Schreck-Regisseur: zufällige, lokale Grusel-Ereignisse (Schattengestalt, Geflüster, Äste, Krähen …).
import * as THREE from 'three';

export class Scares {
  constructor(game) {
    this.g = game;
    this.timer = 30 + Math.random() * 20;
    this.flicker = 0;
    this.fig = this._figure();
    this.fig.visible = false;
    game.engine.scene.add(this.fig);
    this.figT = 0; this.seenT = 0;
  }

  _figure() {
    const g = new THREE.Group();
    const black = new THREE.MeshLambertMaterial({ color: 0x030303 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.5, 4, 8), black);
    body.position.y = 1.3; body.scale.set(1, 1, 0.6); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), black);
    head.position.y = 2.45; head.scale.set(0.9, 1.2, 0.9); g.add(head);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.5, 5), black);
      arm.position.set(s * 0.3, 1.3, 0); arm.rotation.z = s * 0.08; g.add(arm);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
      eye.position.set(s * 0.07, 2.5, 0.17); g.add(eye);
    }
    return g;
  }

  sting() {
    const a = this.g.audio;
    a.tone(1180, 1100, 0.9, 0.12, 'sawtooth'); a.tone(1255, 1190, 0.9, 0.12, 'sawtooth');
    a.tone(90, 45, 0.8, 0.5, 'sine');
  }

  update(dt) {
    const g = this.g, p = g.local, a = g.audio;
    this.flicker = Math.max(0, this.flicker - dt);
    if (g.phase !== 'play' || !p.alive) { this.fig.visible = false; return; }
    const cam = g.engine.camera;
    if (this.fig.visible) {
      this.figT += dt;
      const to = new THREE.Vector3().subVectors(this.fig.position, cam.position);
      const d = to.length(); to.normalize();
      const fwd = p.forward;
      const looking = fwd.dot(to) > 0.93;
      if (looking) this.seenT += dt;
      this.fig.lookAt(cam.position.x, this.fig.position.y, cam.position.z);
      if (this.seenT > 0.45 || d < 9 || this.figT > 7) {
        if (this.seenT > 0.45) { this.sting(); g.engine.fx.scare = Math.max(g.engine.fx.scare, 0.45); g.local.shake = 0.4; }
        a.whisper(this.fig.position);
        this.fig.visible = false;
      }
      return;
    }
    this.timer -= dt * (1 + g.night * 0.12);
    if (this.timer > 0) return;
    this.timer = 28 + Math.random() * 45;
    const r = Math.random();
    const yaw = p.yaw;
    const around = (dist, ang) => new THREE.Vector3(p.pos.x - Math.sin(yaw + ang) * dist, p.pos.y + 1.6, p.pos.z - Math.cos(yaw + ang) * dist);
    if (r < 0.28) {
      // Schattengestalt zwischen den Bäumen
      const ang = (Math.random() - 0.5) * 0.9;
      const pos = around(20 + Math.random() * 8, ang);
      pos.y = g.world.collision.groundAt(pos.x, pos.z);
      if (g.world.collision.lineOfSight(cam.position, { x: pos.x, y: pos.y + 1.8, z: pos.z })) {
        this.fig.position.copy(pos); this.fig.visible = true; this.figT = 0; this.seenT = 0;
      }
    } else if (r < 0.45) a.branch(around(7, Math.PI + (Math.random() - 0.5)));
    else if (r < 0.58) a.whisper(around(1.2, Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2));
    else if (r < 0.7) a.crow(around(18, Math.random() * 6));
    else if (r < 0.8) { this.flicker = 1.6; a.radioStatic(null, 0.6); }
    else if (r < 0.9) a.scream(around(70, Math.random() * 6));
    else a.owl(around(25, Math.random() * 6));
  }

  dispose() { this.g.engine.scene.remove(this.fig); }
}
