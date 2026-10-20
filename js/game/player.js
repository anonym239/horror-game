// Lokaler Spieler: First-Person-Steuerung, Ausdauer, Taschenlampe, Kopfwippen, Schritte.
import * as THREE from 'three';
import { clamp, damp } from '../engine/rng.js';
import { getQ, mat } from '../engine/renderer.js';
import { PLAY_RADIUS } from '../world/world.js';
import { UPG_DEFAULT } from './shop.js';

const RADIUS = 0.35;

export class LocalPlayer {
  constructor(engine, world, input, audio) {
    this.engine = engine; this.world = world; this.input = input; this.audio = audio;
    this.cam = engine.camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.crouch = false;
    this.eye = 1.65;
    this.stamina = 100; this.staminaDelay = 0;
    this.battery = 100;
    this.flashOn = true;
    this.alive = true;
    this.stepPhase = 0;
    this.noise = 0;
    this.carryMass = 0;
    this.upg = UPG_DEFAULT();
    this._fwd = new THREE.Vector3();
    this.shake = 0;
    this.landHurt = 0;
    this.frozen = false;

    const q = getQ();
    this.flash = new THREE.SpotLight(0xfff0d8, 60, 34, 0.48, 0.5, 1.5);
    this.flash.castShadow = q.shadows && engine.renderer.shadowMap.enabled;
    if (q.shadows) {
      this.flash.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      this.flash.shadow.camera.near = 0.2; this.flash.shadow.camera.far = 32;
      this.flash.shadow.bias = -0.0006;
    }
    this.flash.position.set(0.22, -0.22, 0.1);
    this.flash.target.position.set(0.05, -0.1, -10);
    this.cam.add(this.flash, this.flash.target);
    // sichtbare Taschenlampe in der Hand
    this.torch = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 10), mat(0x1a1a1a, { roughness: 0.4, metalness: 0.6 }));
    body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.03, 0.06, 12), mat(0x333333, { roughness: 0.3, metalness: 0.8 }));
    head.rotation.x = Math.PI / 2; head.position.z = -0.13;
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.036, 12), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
    this.lens.position.z = -0.161; this.lens.rotation.y = Math.PI;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.12), mat(0xc69a7a, { roughness: 0.8 }));
    hand.position.set(0.01, -0.02, 0.03);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), mat(0x3a4a2a, { roughness: 1 }));
    sleeve.position.set(0.02, -0.04, 0.22);
    this.torch.add(body, head, this.lens, hand, sleeve);
    this.torch.scale.setScalar(0.75);
    this.torch.position.set(0.26, -0.25, -0.46);
    this.cam.add(this.torch);
  }

  get maxStamina() { return 100 + this.upg.stamina * 30; }
  get strength() { return 9 + this.upg.strength * 7; }

  spawn(x, z) {
    this.pos.set(x, this.world.collision.groundAt(x, z) + 0.05, z);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI; this.pitch = 0;   // Blick Richtung Camp (+z)
    this.stamina = this.maxStamina; this.battery = 100; this.alive = true; this.flashOn = true;
    this.crouch = false; this.eye = 1.65; this.frozen = false;
  }

  get height() { return this.crouch ? 1.05 : 1.8; }
  /** Blickrichtung (wiederverwendeter Vektor – nicht speichern, sondern sofort benutzen bzw. kopieren). */
  get forward() { const c = Math.cos(this.pitch); return this._fwd.set(-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c); }

  update(dt, opts = {}) {
    const inp = this.input, col = this.world.collision;
    this.noise = 0;
    if (!this.alive || this.frozen) { this.flash.intensity = 0; this.torch.visible = false; return; }
    this.torch.visible = true;
    // Blick
    const [mx, my] = inp.consumeMouse();
    this.yaw -= mx; this.pitch = clamp(this.pitch - my, -1.5, 1.5);

    // Eingabe
    let fx = 0, fz = 0;
    if (inp.down('KeyW')) fz -= 1; if (inp.down('KeyS')) fz += 1;
    if (inp.down('KeyA')) fx -= 1; if (inp.down('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz); if (len > 0) { fx /= len; fz /= len; }
    if (inp.hit('KeyC') || inp.hit('ControlLeft')) this.crouch = !this.crouch;
    const wantSprint = inp.down('ShiftLeft') && fz < 0 && !this.crouch && this.stamina > 1;
    const sprint = wantSprint && len > 0;
    const inWater = this.world.inWater(this.pos.x, this.pos.z);

    let speed = (this.crouch ? 1.7 : sprint ? 6.4 : 3.4) * (1 + 0.08 * (this.upg.boots || 0));
    if (this.carryMass > 0) speed *= 1 - clamp(this.carryMass / (this.strength * 3.2), 0, 0.5);
    if (inWater) speed *= 0.55;
    if (opts.speedMul) speed *= opts.speedMul;

    // Ausdauer
    if (sprint) { this.stamina -= 17 * dt; this.staminaDelay = 1.1; }
    else if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else this.stamina = Math.min(this.maxStamina, this.stamina + 15 * dt);
    this.stamina = Math.max(0, this.stamina);

    // Bewegung relativ zur Blickrichtung
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const wx = fx * c + fz * s, wz = -fx * s + fz * c;
    const accel = this.onGround ? 14 : 2.5;
    this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, wz * speed, accel, dt);
    if (inp.hit('Space') && this.onGround && this.stamina > 8) {
      this.vel.y = 6.0; this.onGround = false; this.stamina -= 8; this.staminaDelay = 0.6;
      if (this.crouch) this.crouch = false;
    }
    this.vel.y -= 20 * dt;

    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    // Decke
    if (this.vel.y > 0) {
      const ceil = col.ceilingAt(this.pos.x, this.pos.z, prevY + this.height, 0.2);
      if (this.pos.y + this.height > ceil) { this.pos.y = ceil - this.height; this.vel.y = 0; }
    }
    col.resolve(this.pos, RADIUS, this.height);
    // Spielfeldgrenze (dichter Wald)
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > PLAY_RADIUS) { this.pos.x *= PLAY_RADIUS / r; this.pos.z *= PLAY_RADIUS / r; }
    // Boden
    const g = col.groundAt(this.pos.x, this.pos.z, Math.max(this.pos.y, prevY), RADIUS);
    const wasGround = this.onGround;
    if (this.pos.y <= g || (wasGround && this.vel.y <= 0 && this.pos.y - g < 0.45)) {
      if (!wasGround && this.vel.y < -9) {
        this.noise = Math.max(this.noise, 0.7);
        this.shake = Math.min(1, (-this.vel.y - 9) / 6);
        this.audio.footstep(null, 0.6, this._surface(inWater));
        this.landHurt = this.vel.y < -14 ? 1 : 0;
      } else if (!wasGround && this.vel.y < -4) { this.audio.footstep(null, 0.35, this._surface(inWater)); this.noise = Math.max(this.noise, 0.35); }
      this.pos.y = g; this.vel.y = 0; this.onGround = true;
    } else this.onGround = false;

    // Schritte & Kopfwippen
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      const prev = this.stepPhase;
      this.stepPhase += dt * hs * (sprint ? 1.25 : 1.6);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.stepPhase / Math.PI)) {
        const v = this.crouch ? 0.06 : sprint ? 0.42 : 0.22;
        this.audio.footstep(null, v, this._surface(inWater));
      }
      this.noise = Math.max(this.noise, this.crouch ? 0.04 : sprint ? 0.5 : 0.16);
      if (inWater) this.noise = Math.max(this.noise, 0.4);
    }
    this.noise *= 1 - 0.25 * (this.upg.shoes || 0);

    // Taschenlampe
    if (inp.hit('KeyF')) { this.flashOn = !this.flashOn; this.audio.flashlightClick(); }
    if (this.world.inVanZone(this.pos.x, this.pos.z, 2)) this.battery = Math.min(100, this.battery + 25 * dt);
    else if (this.flashOn) this.battery = Math.max(0, this.battery - dt * 100 / (150 + this.upg.battery * 75));
    if (this.battery <= 0) this.flashOn = false;
    const fl = this.upg.flashlight || 0;
    this.flash.distance = 34 + fl * 10;
    let fi = this.flashOn ? 60 + fl * 30 : 0;
    if (this.flashOn && this.battery < 15 && Math.random() < 0.08) fi *= Math.random() * 0.3;
    if (this.flashOn && opts.flicker && Math.random() < 0.25) fi *= Math.random() * 0.2;
    this.flash.intensity = fi;
    this.lens.material.color.setHex(fi > 5 ? 0xfff6e0 : 0x333333);

    // Kamera
    this.eye = damp(this.eye, this.crouch ? 1.0 : 1.65, 10, dt);
    const bob = this.onGround ? Math.sin(this.stepPhase * 2) * 0.035 * Math.min(1, hs / 3) : 0;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * 0.08 + (opts.shake || 0);
    this.cam.position.set(
      this.pos.x + (Math.random() - 0.5) * sh,
      this.pos.y + this.eye + bob + (Math.random() - 0.5) * sh,
      this.pos.z + (Math.random() - 0.5) * sh,
    );
    this.cam.rotation.set(this.pitch, this.yaw, Math.sin(this.stepPhase) * 0.004 * hs, 'YXZ');
    this.torch.position.set(0.26 + Math.sin(this.stepPhase) * 0.012 * Math.min(1, hs / 3), -0.25 + bob * 0.5, -0.46);
  }

  _surface(water) {
    if (water) return 'water';
    const g = this.world.height(this.pos.x, this.pos.z);
    return this.pos.y > g + 0.2 ? 'wood' : 'ground';
  }
}
