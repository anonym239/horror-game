// Prozedurale Texturen (Canvas) – klein, kachelbar, keine Downloads.
import * as THREE from 'three';
import { mulberry32 } from '../engine/rng.js';

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(g, s, rnd, n, alpha, light = false) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${rnd() * alpha})`;
    g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

export function makeTextures() {
  const rnd = mulberry32(99);
  const T = {};
  T.planks = canvasTex(256, (g, s) => {
    const rows = 6, h = s / rows;
    for (let r = 0; r < rows; r++) {
      const base = 95 + rnd() * 40;
      g.fillStyle = `rgb(${base},${base * 0.72},${base * 0.5})`;
      g.fillRect(0, r * h, s, h);
      for (let k = 0; k < 40; k++) {
        g.strokeStyle = `rgba(40,25,15,${0.1 + rnd() * 0.25})`;
        g.beginPath();
        const y = r * h + rnd() * h;
        g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + rnd() * 4 - 2, s * 0.6, y + rnd() * 4 - 2, s, y + rnd() * 3 - 1.5);
        g.stroke();
      }
      g.fillStyle = 'rgba(15,10,6,0.85)'; g.fillRect(0, r * h, s, 2);
      const seam = rnd() * s; g.fillRect(seam, r * h, 2, h);
      if (rnd() < 0.5) { g.fillStyle = 'rgba(20,12,8,0.6)'; g.beginPath(); g.ellipse(rnd() * s, r * h + h / 2, 5, 3, 0, 0, 7); g.fill(); }
    }
    speckle(g, s, rnd, 1500, 0.25);
  });
  T.shingles = canvasTex(256, (g, s) => {
    g.fillStyle = '#2a2624'; g.fillRect(0, 0, s, s);
    const rows = 8, h = s / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < 8; c++) {
      const x = c * 32 + (r % 2) * 16, v = 30 + rnd() * 25;
      g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.9})`;
      g.fillRect(x + 1, r * h + 1, 30, h - 3);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, r * h + h - 3, 32, 3);
    }
    speckle(g, s, rnd, 2000, 0.3);
  });
  T.stone = canvasTex(256, (g, s) => {
    g.fillStyle = '#5a5850'; g.fillRect(0, 0, s, s);
    const rows = 6, h = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 30;
      while (x < s) {
        const w = 30 + rnd() * 40, v = 70 + rnd() * 40;
        g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.9})`;
        g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
        x += w;
      }
    }
    speckle(g, s, rnd, 4000, 0.3);
    speckle(g, s, rnd, 600, 0.15, true);
    g.fillStyle = 'rgba(40,60,30,0.25)';
    for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(rnd() * s, rnd() * s, 4 + rnd() * 12, 0, 7); g.fill(); }
  });
  T.bark = canvasTex(128, (g, s) => {
    g.fillStyle = '#4a3a2c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const v = 30 + rnd() * 50; g.fillStyle = `rgba(${v},${v * 0.8},${v * 0.6},0.8)`;
      g.fillRect(rnd() * s, 0, 1 + rnd() * 3, s);
    }
    speckle(g, s, rnd, 800, 0.4);
  });
  T.ground = canvasTex(256, (g, s) => {
    g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = 120 + rnd() * 135;
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      const r = rnd() * 2.2;
      g.beginPath(); g.arc(rnd() * s, rnd() * s, r, 0, 7); g.fill();
    }
    for (let i = 0; i < 120; i++) { // Blätter / Zweige
      g.strokeStyle = `rgba(60,60,60,${0.3 + rnd() * 0.4})`;
      g.lineWidth = 1 + rnd();
      const x = rnd() * s, y = rnd() * s, a = rnd() * 7, l = 4 + rnd() * 10;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }, 70);
  T.rust = canvasTex(128, (g, s) => {
    g.fillStyle = '#6b6f6a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${110 + rnd() * 60},${50 + rnd() * 30},20,${0.3 + rnd() * 0.5})`;
      g.beginPath(); g.arc(rnd() * s, rnd() * s, 2 + rnd() * 14, 0, 7); g.fill();
    }
    speckle(g, s, rnd, 1500, 0.4);
  });
  T.dirtyWhite = canvasTex(128, (g, s) => {
    g.fillStyle = '#c9c4b6'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(90,70,40,${rnd() * 0.25})`;
      g.fillRect(rnd() * s, s * 0.6 + rnd() * s * 0.4, 4 + rnd() * 30, 3 + rnd() * 20);
    }
    speckle(g, s, rnd, 1200, 0.25);
  });
  return T;
}

/** Schild mit Text (z.B. Camp-Eingang). */
export function signTexture(lines, w = 512, h = 192) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const rnd = mulberry32(7);
  g.fillStyle = '#4b3524'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(20,10,5,${rnd() * 0.4})`; g.beginPath(); const y = rnd() * h; g.moveTo(0, y); g.lineTo(w, y + rnd() * 6 - 3); g.stroke(); }
  g.fillStyle = '#d8cfb4'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    g.font = `${l.size || 56}px "Special Elite", Georgia, serif`;
    g.fillText(l.text, w / 2, h / (lines.length + 1) * (i + 1));
  });
  g.fillStyle = 'rgba(120,10,10,0.7)';
  for (let i = 0; i < 5; i++) g.fillRect(w * 0.55 + rnd() * 60, h * 0.6, 3, 10 + rnd() * 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
