// Spielfigur der Mitspieler (mit Namensschild, Taschenlampe, Lauf-Animation).
import * as THREE from 'three';
import { mat } from '../engine/renderer.js';
import { angleLerp } from '../engine/rng.js';

export const PLAYER_COLORS = [0xd8742a, 0x2f7fd0, 0x3fae5a, 0xa04fc8];
export const PLAYER_CSS = ['#e8843a', '#4a96e8', '#52c46e', '#b866e0'];

function nameTag(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px "Special Elite", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(name, 128, 32);
  g.fillStyle = color; g.fillText(name, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true, fog: false }));
  s.scale.set(1.2, 0.3, 1);
  return s;
}

export class Avatar {
  constructor(scene, name, colorIdx, spot) {
    this.root = new THREE.Group();
    const jacket = mat(PLAYER_COLORS[colorIdx % 4], { roughness: 0.85 });
    const pants = mat(0x2a2c30, { roughness: 1 });
    const skin = mat(0xd0a080, { roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 4, 8), jacket);
    body.position.y = 1.15; body.castShadow = true;
    this.body = body;
    this.headG = new THREE.Group(); this.headG.position.y = 1.62;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin); head.castShadow = true;
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, 1.4), mat(0x202020, { roughness: 1 }));
    beanie.position.y = 0.03;
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eyes.position.set(0, 0.02, 0.14);
    this.headG.add(head, beanie, eyes);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.45, 0.2), mat(0x4a3a24, { roughness: 1 }));
    pack.position.set(0, 1.2, -0.25); pack.castShadow = true;
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.12, 0.8, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 3, 6), pants);
      leg.position.y = -0.38; leg.castShadow = true; hip.add(leg);
      this.root.add(hip); this.legs.push(hip);
    }
    this.armR = new THREE.Group(); this.armR.position.set(0.3, 1.38, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.45, 3, 6), jacket); arm.position.y = -0.25; this.armR.add(arm);
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 8), mat(0x1a1a1a, { roughness: 0.4 }));
    torch.position.set(0, -0.52, 0.08); torch.rotation.x = Math.PI / 2; this.armR.add(torch);
    this.armL = new THREE.Group(); this.armL.position.set(-0.3, 1.38, 0);
    const arm2 = arm.clone(); this.armL.add(arm2);
    this.root.add(body, this.headG, pack, this.armR, this.armL);
    this.tag = nameTag(name, '#' + PLAYER_COLORS[colorIdx % 4].toString(16).padStart(6, '0'));
    this.tag.position.y = 2.15;
    this.root.add(this.tag);
    this.spot = spot; // vorab erzeugte SpotLight (konstante Lichtanzahl = keine Shader-Neukompilierung)
    scene.add(this.root);
    this.scene = scene;
    this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.phase = 0;
    this.visYaw = 0;
    this.crouch = false; this.flash = false; this.alive = true;
    this._last = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  setState(s) {
    this.pos.set(s.x, s.y, s.z); this.yaw = s.yaw; this.pitch = s.pitch;
    this.crouch = s.crouch; this.flash = s.flash; this.alive = s.alive;
  }

  update(dt, speaking) {
    this.root.visible = this.alive;
    const moved = this._last.distanceTo(this.pos) / Math.max(dt, 1e-4);
    this._last.copy(this.pos);
    this.root.position.copy(this.pos);
    this.visYaw = angleLerp(this.visYaw, this.yaw + Math.PI, Math.min(1, dt * 12));
    this.root.rotation.y = this.visYaw;
    this.phase += dt * Math.min(moved, 7) * 1.7;
    const sw = Math.min(1, moved / 3) * 0.7;
    this.legs[0].rotation.x = Math.sin(this.phase) * sw;
    this.legs[1].rotation.x = -Math.sin(this.phase) * sw;
    this.armL.rotation.x = -Math.sin(this.phase) * sw * 0.7;
    this.armR.rotation.x = -1.2 - this.pitch * 0.8;
    this.headG.rotation.x = -this.pitch * 0.6;
    const cr = this.crouch ? 0.55 : 0;
    this.body.position.y = 1.15 - cr * 0.6; this.headG.position.y = 1.62 - cr * 0.65;
    this.armR.position.y = this.armL.position.y = 1.38 - cr * 0.6;
    this.tag.material.opacity = speaking ? 1 : 0.75;
    this.tag.scale.set(speaking ? 1.35 : 1.2, speaking ? 0.34 : 0.3, 1);
    if (this.spot) {
      this.spot.intensity = this.alive && this.flash ? 45 : 0;
      const hy = this.pos.y + 1.4 - cr * 0.6;
      this.spot.position.set(this.pos.x, hy, this.pos.z);
      const c = Math.cos(this.pitch);
      this._dir.set(-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c);
      this.spot.target.position.set(this.pos.x + this._dir.x * 10, hy + this._dir.y * 10, this.pos.z + this._dir.z * 10);
      this.spot.target.updateMatrixWorld();
    }
  }

  dispose() {
    this.scene.remove(this.root);
    if (this.spot) this.spot.intensity = 0;
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
