// Monster: prozedurale Modelle mit Animation (alle Clients) + KI (nur Host).
import * as THREE from 'three';
import { mat } from '../engine/renderer.js';
import { angleLerp, clamp } from '../engine/rng.js';

export const MONSTER_INFO = {
  stalker: { name: 'Der Blasse', desc: 'Hört alles. Sei leise – auch am Mikrofon.' },
  doll: { name: 'Die Puppe', desc: 'Bewegt sich nur, wenn niemand hinsieht.' },
  crawler: { name: 'Der Kriecher', desc: 'Schnell und flach. Folgt Taschenlampen.' },
};

const XRAY_MAT = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, fog: false });

const limb = (len, r0, r1, m) => {
  const g = new THREE.CylinderGeometry(r1, r0, len, 6);
  g.translate(0, -len / 2, 0);
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; return mesh;
};

// ======================= Ansicht (Mesh + Animation + Sound) =======================
export class MonsterView {
  constructor(type, scene, audio) {
    this.type = type;
    this.audio = audio;
    this.root = new THREE.Group();
    this.anim = 0; this.phase = Math.random() * 10; this.t = 0;
    this.pos = new THREE.Vector3(); this.ry = 0;
    this.prev = null; this.next = null;
    if (type === 'doll') this._buildDoll(); else this._buildStalker(type === 'crawler');
    scene.add(this.root);
    this.loop = null;
    this._creakT = 0;
    this.poseSeed = 0;
  }

  _buildStalker(crawler) {
    const skin = mat(crawler ? 0x8a8478 : 0xd2cabb, { roughness: 0.65 });
    const dark = mat(0x2a2420, { roughness: 0.9 });
    const bone = mat(0xe8dcc4, { roughness: 0.6 });
    const eyeM = new THREE.MeshBasicMaterial({ color: crawler ? 0xff3010 : 0xfff2c0 });
    const s = crawler ? 0.75 : 1;
    this.scale = s;
    const R = this.root;
    this.hips = new THREE.Group(); this.hips.position.y = 1.62 * s; R.add(this.hips);
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.2 * s, 0.85 * s, 4, 8), skin);
    chest.position.y = 0.55 * s; chest.scale.set(1.1, 1, 0.7); chest.castShadow = true; this.torso.add(chest);
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.19 * s, 0.015 * s, 3, 10, Math.PI), dark);
      rib.position.set(0, (0.55 + i * 0.12) * s, 0.04 * s); rib.rotation.set(Math.PI / 2 + 0.2, 0, Math.PI); this.torso.add(rib);
    }
    this.neck = new THREE.Group(); this.neck.position.y = 1.15 * s; this.torso.add(this.neck);
    const neckM = limb(0.25 * s, 0.05 * s, 0.06 * s, skin); neckM.rotation.x = Math.PI; this.neck.add(neckM);
    this.head = new THREE.Group(); this.head.position.y = 0.3 * s; this.neck.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17 * s, 10, 8), bone);
    skull.scale.set(0.9, 1.15, 1.25); skull.castShadow = true; this.head.add(skull);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14 * s, 0.12 * s, 0.2 * s), bone);
    snout.position.set(0, -0.05 * s, 0.18 * s); this.head.add(snout);
    this.jaw = new THREE.Group(); this.jaw.position.set(0, -0.11 * s, 0.05 * s); this.head.add(this.jaw);
    const jawM = new THREE.Mesh(new THREE.BoxGeometry(0.13 * s, 0.04 * s, 0.26 * s), bone); jawM.position.z = 0.12 * s; this.jaw.add(jawM);
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.012 * s, 0.05 * s, 4), bone);
      tooth.position.set((i % 2 ? 1 : -1) * 0.05 * s, 0.03 * s, (0.08 + Math.floor(i / 2) * 0.07) * s); this.jaw.add(tooth);
    }
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const sock = new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 8, 6), dark);
      sock.position.set(sx * 0.07 * s, 0.03 * s, 0.15 * s); this.head.add(sock);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.028 * s, 8, 6), eyeM);
      e.position.set(sx * 0.07 * s, 0.03 * s, 0.185 * s); this.head.add(e); this.eyes.push(e);
      if (!crawler) {
        // Geweih
        const a1 = limb(0.5 * s, 0.03 * s, 0.012 * s, bone); a1.rotation.set(Math.PI + 0.3, 0, sx * 0.7); a1.position.set(sx * 0.1 * s, 0.15 * s, -0.05 * s); this.head.add(a1);
        const a2 = limb(0.3 * s, 0.015 * s, 0.006 * s, bone); a2.rotation.set(Math.PI - 0.5, 0, sx * 0.2); a2.position.set(sx * 0.22 * s, 0.35 * s, 0.0); this.head.add(a2);
        const a3 = limb(0.35 * s, 0.015 * s, 0.006 * s, bone); a3.rotation.set(Math.PI + 0.1, 0, sx * 1.1); a3.position.set(sx * 0.3 * s, 0.42 * s, -0.08 * s); this.head.add(a3);
      }
    }
    this.arms = []; this.legs = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 0.28 * s, 1.0 * s, 0); this.torso.add(sh);
      sh.add(limb(0.85 * s, 0.055 * s, 0.04 * s, skin));
      const el = new THREE.Group(); el.position.y = -0.85 * s; sh.add(el);
      el.add(limb(0.85 * s, 0.04 * s, 0.03 * s, skin));
      const hand = new THREE.Group(); hand.position.y = -0.85 * s; el.add(hand);
      for (let f = 0; f < 4; f++) {
        const fi = limb(0.28 * s, 0.012 * s, 0.004 * s, dark); fi.rotation.set(0.2, 0, (f - 1.5) * 0.15); hand.add(fi);
      }
      this.arms.push({ sh, el, sx });
      const hip = new THREE.Group(); hip.position.set(sx * 0.13 * s, 0, 0); this.hips.add(hip);
      hip.add(limb(0.82 * s, 0.075 * s, 0.05 * s, skin));
      const kn = new THREE.Group(); kn.position.y = -0.82 * s; hip.add(kn);
      kn.add(limb(0.8 * s, 0.05 * s, 0.035 * s, skin));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.05 * s, 0.25 * s), dark);
      foot.position.set(0, -0.8 * s, 0.08 * s); kn.add(foot);
      this.legs.push({ hip, kn, sx });
    }
    this.crawler = crawler;
    this.headHeight = crawler ? 0.9 : 2.85;
  }

  _buildDoll() {
    const por = mat(0xf2ebe4, { roughness: 0.25 });
    const dress = mat(0x4a0f18, { roughness: 0.9 });
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const R = this.root;
    const d = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 12, 1, true), dress);
    d.position.y = 0.55; d.castShadow = true; R.add(d);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.45, 10), dress);
    body.position.y = 1.2; R.add(body);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 5, 14), mat(0xe8e0d0, { roughness: 1 }));
    collar.position.y = 1.43; collar.rotation.x = Math.PI / 2; R.add(collar);
    this.head = new THREE.Group(); this.head.position.y = 1.65; R.add(this.head);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), por); h.castShadow = true; this.head.add(h);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), black);
      e.position.set(sx * 0.08, 0.03, 0.18); e.scale.set(1, 1.3, 0.5); this.head.add(e);
      const tear = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.01), mat(0x3a0000, { roughness: 0.3 }));
      tear.position.set(sx * 0.08, -0.06, 0.2); this.head.add(tear);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.01), black);
    mouth.position.set(0, -0.1, 0.2); mouth.rotation.z = 0.12; this.head.add(mouth);
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.18, 0.01), black);
    crack.position.set(0.05, 0.1, 0.19); crack.rotation.z = -0.4; this.head.add(crack);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, 1.7), mat(0x1a1008, { roughness: 1 }));
    hair.position.set(0, 0.03, -0.03); this.head.add(hair);
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.08), hair.material);
    hairBack.position.set(0, -0.2, -0.18); this.head.add(hairBack);
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 0.2, 1.38, 0); R.add(sh);
      sh.add(limb(0.55, 0.04, 0.03, por));
      this.arms.push({ sh, sx });
    }
    this.eyes = [];
    this.headHeight = 1.65;
  }

  /** Geisterblick: Monster rot und durch Wände sichtbar zeichnen (nur lokal). */
  setXray(on) {
    if (this._xray === on) return;
    this._xray = on;
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      if (on) { o.userData.mat = o.material; o.material = XRAY_MAT; o.renderOrder = 999; }
      else if (o.userData.mat) { o.material = o.userData.mat; o.renderOrder = 0; }
    });
  }

  setState(x, y, z, ry, anim, extra = 0) {
    this.pos.set(x, y, z); this.ry = ry; this.anim = anim;
    if (this.type === 'doll' && extra !== this.poseSeed) { this.poseSeed = extra; this._dollPose(extra); }
  }

  _dollPose(seed) {
    const r = (k) => (Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1;
    this.head.rotation.set(r(1) * 0.4, r(2) * 0.8, r(3) * 0.7);
    this.arms.forEach((a, i) => a.sh.rotation.set(-0.5 - Math.abs(r(4 + i)) * 2.2, 0, a.sx * (0.1 + Math.abs(r(6 + i)) * 0.4)));
  }

  update(dt, listenerPos) {
    this.t += dt;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.ry;
    const a = this.forceAnim != null ? this.forceAnim : this.anim;
    if (this.type === 'doll') {
      if (a === 1) {
        this._creakT -= dt;
        if (this._creakT <= 0 && this.audio) { this._creakT = 0.5 + Math.random() * 0.4; this.audio.creak(this.pos); }
      }
      return;
    }
    const speed = a === 2 ? 2.4 : a === 1 ? 1.1 : 0;
    this.phase += dt * (speed * 2.6 + 0.001);
    const ph = this.phase;
    const sw = a === 0 ? 0 : a === 2 ? 0.85 : 0.5;
    const s = this.scale;
    if (this.crawler) {
      this.hips.position.y = 0.75 * s + Math.abs(Math.sin(ph)) * 0.08;
      this.torso.rotation.x = 1.35;
      this.neck.rotation.x = -1.2;
      this.arms.forEach((L, i) => { const p = ph + (i ? Math.PI : 0); L.sh.rotation.x = -1.35 + Math.sin(p) * sw; L.el.rotation.x = -0.3 - Math.max(0, Math.cos(p)) * 0.6; });
      this.legs.forEach((L, i) => { const p = ph + (i ? 0 : Math.PI); L.hip.rotation.x = -0.9 + Math.sin(p) * sw; L.kn.rotation.x = 1.4 + Math.cos(p) * 0.4; });
    } else {
      this.hips.position.y = 1.62 * s - (a === 2 ? 0.25 : 0) + Math.abs(Math.sin(ph)) * 0.06 * sw;
      this.torso.rotation.x = a === 2 ? 0.55 : a === 3 ? -0.1 : 0.15;
      this.legs.forEach((L, i) => { const p = ph + (i ? Math.PI : 0); L.hip.rotation.x = Math.sin(p) * sw * 0.9; L.kn.rotation.x = Math.max(0, -Math.cos(p)) * sw * 1.4 + 0.05; });
      this.arms.forEach((L, i) => {
        const p = ph + (i ? 0 : Math.PI);
        if (a === 3) { L.sh.rotation.set(-1.9 + Math.sin(this.t * 30 + i) * 0.1, 0, L.sx * 1.0); L.el.rotation.x = -0.9; }
        else { L.sh.rotation.set(Math.sin(p) * sw * 0.8 + (a === 2 ? -0.6 : 0.05), 0, L.sx * 0.12); L.el.rotation.x = -0.15 - (a === 2 ? 0.6 : 0.1); }
      });
      // Kopfzucken
      const tw = Math.sin(this.t * 1.7) > 0.96 ? Math.sin(this.t * 60) * 0.25 : 0;
      if (a === 3) { const j = Math.sin(this.t * 47) * 0.06; this.head.rotation.set(0.32 + j, j, Math.sin(this.t * 3) * 0.2); }
      else this.head.rotation.set(a === 2 ? -0.5 : 0.1, Math.sin(this.t * 0.5) * 0.3 + tw, Math.sin(this.t * 0.31) * 0.25 + tw);
      this.jaw.rotation.x = a === 3 ? 0.9 + Math.sin(this.t * 40) * 0.1 : a === 2 ? 0.3 + Math.sin(this.t * 9) * 0.15 : 0.05;
    }
    // Sound
    if (this.audio && this.audio.ctx) {
      if (!this.loop) this.loop = this.audio.loop(this.crawler ? 'breath' : 'growl', this.pos);
      if (this.loop) {
        this.loop.setPos(this.pos);
        const d = listenerPos ? listenerPos.distanceTo(this.pos) : 50;
        this.loop.setGain(d > 45 ? 0 : a === 2 ? 0.55 : a === 1 ? 0.12 : 0.05);
      }
    }
  }

  dispose(scene) {
    if (this.loop) this.loop.stop();
    scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}

// ======================= KI (nur Host) =======================
let NEXT_ID = 1;
export class MonsterAI {
  constructor(type, x, z, world, night, rnd) {
    this.id = NEXT_ID++;
    this.type = type;
    this.world = world;
    this.rnd = rnd;
    this.pos = new THREE.Vector3(x, world.collision.groundAt(x, z), z);
    this.ry = rnd() * 6;
    this.state = 'roam';
    this.anim = 1;
    this.target = null;
    this.goal = null;
    this.timer = 0;
    this.night = night;
    this.lastPos = this.pos.clone();
    this.stuckT = 0; this.detour = 0; this.detourDir = 1;
    this.retreatT = 0;
    this.extra = 0;
    this.activeIn = type === 'doll' ? 45 : type === 'crawler' ? 60 : 20;
    this.alerted = 0;
  }

  get radius() { return this.type === 'crawler' ? 0.4 : 0.45; }

  /** Kann dieser Spieler überhaupt gejagt werden? Im Van-Laderaum (safe) und in Camp-Hütten (hidden) nicht. */
  static huntable(p) { return p.alive && !p.inVan && !p.hidden; }

  _pickRoam(players) {
    const w = this.world, r = this.rnd;
    const alive = players.filter(MonsterAI.huntable);
    if (alive.length && r() < 0.35 + this.night * 0.08) {
      const p = alive[Math.floor(r() * alive.length)];
      this.goal = { x: p.pos.x + (r() - 0.5) * 40, z: p.pos.z + (r() - 0.5) * 40 };
    } else {
      const sp = w.lootSpots[Math.floor(r() * w.lootSpots.length)];
      this.goal = { x: sp.x, z: sp.z };
    }
  }

  _canSee(p) {
    const d = this.pos.distanceTo(p.pos);
    let range = this.type === 'crawler' ? (p.flash ? 40 : 9) : p.flash ? 30 : 14;
    if (p.crouch) range *= 0.6;
    if (d > range) return false;
    if (d > 4.5) {
      const fx = Math.sin(this.ry), fz = Math.cos(this.ry);
      const dx = (p.pos.x - this.pos.x) / d, dz = (p.pos.z - this.pos.z) / d;
      if (fx * dx + fz * dz < 0.25) return false;
    }
    const eye = { x: this.pos.x, y: this.pos.y + (this.type === 'crawler' ? 0.8 : 2.6), z: this.pos.z };
    return this.world.collision.lineOfSight(eye, { x: p.pos.x, y: p.pos.y + 1.4, z: p.pos.z });
  }

  _observed(players) {
    for (const p of players) {
      if (!p.alive) continue;
      const dx = this.pos.x - p.pos.x, dy = this.pos.y + 1.2 - (p.pos.y + 1.6), dz = this.pos.z - p.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 45) continue;
      const lit = p.flash && d < 32;
      if (!lit && d > 11) continue;
      const cosPitch = Math.cos(p.pitch);
      const lx = -Math.sin(p.yaw) * cosPitch, ly = Math.sin(p.pitch), lz = -Math.cos(p.yaw) * cosPitch;
      if ((lx * dx + ly * dy + lz * dz) / d < 0.62) continue;
      if (this.world.collision.lineOfSight({ x: p.pos.x, y: p.pos.y + 1.6, z: p.pos.z }, { x: this.pos.x, y: this.pos.y + 1.3, z: this.pos.z })) return true;
    }
    return false;
  }

  /** ctx: { players, noises:[{x,z,r}], onKill(player, ai), onEvent(kind,data) } */
  update(dt, ctx) {
    const { players } = ctx;
    if (this.activeIn > 0) { this.activeIn -= dt; this.anim = 0; return; }
    const w = this.world;
    let speed = 0, goal = null;
    const nightBoost = Math.min(1.2, (this.night - 1) * 0.22);

    if (this.type === 'doll') {
      const watched = this._observed(players);
      let best = null, bd = Infinity;
      for (const p of players) {
        if (!MonsterAI.huntable(p)) continue;
        const d = this.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = p; }
      }
      if (watched || !best) { this.anim = 0; return; }
      if (this.anim !== 1) this.extra = Math.floor(this.rnd() * 1000) + 1;
      this.anim = 1;
      speed = 6.2 + nightBoost;
      goal = best.pos;
      if (bd < 1.15 && Math.abs(best.pos.y - this.pos.y) < 1.5) { ctx.onKill(best, this); this._retreat(); return; }
    } else {
      // Wahrnehmung
      let seen = null, sd = Infinity;
      for (const p of players) {
        if (!MonsterAI.huntable(p)) continue;
        const d = this.pos.distanceTo(p.pos);
        if (d < sd && this._canSee(p)) { seen = p; sd = d; }
      }
      if (this.state === 'retreat') {
        this.retreatT -= dt;
        if (this.retreatT <= 0) this.state = 'roam';
      } else if (seen) {
        if (this.state !== 'chase') ctx.onEvent('roar', { id: this.id, x: this.pos.x, y: this.pos.y, z: this.pos.z });
        this.state = 'chase'; this.target = seen.id; this.lastSeen = seen.pos.clone(); this.timer = 0;
      } else if (this.state === 'chase') {
        this.timer += dt;
        const t = players.find((p) => p.id === this.target);
        const hunt = t && MonsterAI.huntable(t);
        if (hunt && this.timer < 2.5) this.lastSeen.copy(t.pos); // kurzes "Nachspüren"
        if (this.timer > 4 || !hunt) { this.state = 'investigate'; this.goal = { x: this.lastSeen.x, z: this.lastSeen.z }; this.timer = 0; }
      }
      if (this.state !== 'chase' && this.state !== 'retreat') {
        const hear = this.type === 'crawler' ? 0.6 : 1;
        for (const n of ctx.noises) {
          const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
          if (d < n.r * hear) {
            if (this.state !== 'investigate') ctx.onEvent('alert', { id: this.id });
            this.state = 'investigate'; this.goal = { x: n.x, z: n.z }; this.timer = 0;
          }
        }
      }
      const base = this.type === 'crawler' ? 1.25 : 1;
      if (this.state === 'chase') {
        const t = players.find((p) => p.id === this.target);
        goal = this.lastSeen; speed = (5.1 + nightBoost) * base;
        if (t && MonsterAI.huntable(t)) {
          const d = this.pos.distanceTo(t.pos);
          if (d < 1.5 && Math.abs(t.pos.y - this.pos.y) < 1.6) { this.anim = 3; ctx.onKill(t, this); this._retreat(); return; }
        }
        this.anim = 2;
      } else if (this.state === 'investigate') {
        goal = this.goal; speed = 3.0 * base; this.anim = 2;
        this.timer += dt;
        if (Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) < 1.5 || this.timer > 20) { this.state = 'roam'; this.goal = null; this.timer = 0; }
        if (speed) this.anim = 1;
      } else if (this.state === 'retreat') {
        goal = this.goal; speed = 2.5; this.anim = 1;
      } else {
        if (!this.goal || Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 2) {
          this.timer += dt;
          this.anim = 0;
          if (this.timer > 2 + this.rnd() * 3) { this.timer = 0; this._pickRoam(players); }
        } else { goal = this.goal; speed = 1.5 * base; this.anim = 1; }
      }
    }

    if (goal && speed > 0) this._move(dt, goal, speed);
  }

  /** Druckwelle (Polenböller): Monster im Radius fliehen und sind kurz benommen. */
  blast(x, z, r) {
    if (Math.hypot(x - this.pos.x, z - this.pos.z) > r) return false;
    this._retreat();
    this.activeIn = 6;
    return true;
  }

  _retreat() {
    this.state = 'retreat'; this.retreatT = 14;
    const a = this.rnd() * Math.PI * 2;
    this.goal = { x: Math.cos(a) * 80, z: Math.sin(a) * 80 };
    this.activeIn = 2.5;
  }

  _move(dt, goal, speed) {
    const w = this.world;
    let dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    dx /= d; dz /= d;
    if (this.detour > 0) {
      this.detour -= dt;
      const px = -dz * this.detourDir, pz = dx * this.detourDir;
      dx = dx * 0.3 + px; dz = dz * 0.3 + pz;
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    }
    const step = Math.min(d, speed * dt);
    this.pos.x += dx * step; this.pos.z += dz * step;
    // Safe-Zone um den Van: Monster kommen nicht ran
    const vz = w.vanZone;
    const vd = Math.hypot(this.pos.x - vz.x, this.pos.z - vz.z);
    const keep = 11 * (vz.k || 1); // größerer Van im Editor = größere Schutzzone
    if (vd < keep) { const k = keep / vd; this.pos.x = vz.x + (this.pos.x - vz.x) * k; this.pos.z = vz.z + (this.pos.z - vz.z) * k; }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > 112) { this.pos.x *= 112 / r; this.pos.z *= 112 / r; }
    w.collision.resolve(this.pos, this.radius, 2.4);
    this.pos.y = w.collision.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, this.radius);
    this.ry = angleLerp(this.ry, Math.atan2(dx, dz), clamp(dt * 8, 0, 1));
    // Steckt fest? → Umweg
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
      if (moved < speed * 0.8 * 0.3 && this.detour <= 0) { this.detour = 1.2 + this.rnd(); this.detourDir = this.rnd() < 0.5 ? -1 : 1; }
      this.lastPos.copy(this.pos); this.stuckT = 0;
    }
  }

  snapshot() {
    const r = (v) => Math.round(v * 100) / 100;
    return [this.id, this.type, r(this.pos.x), r(this.pos.y), r(this.pos.z), r(this.ry), this.anim, this.extra];
  }
}
