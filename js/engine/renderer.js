// HollowEngine – Renderer: Qualitätsstufen, dynamische Auflösung, eigener Post-Processing-Pass.
import * as THREE from 'three';

export const PRESETS = {
  low: {
    key: 'low', name: 'Niedrig', maxScale: 0.8, minScale: 0.45, shadows: false, shadowSize: 0,
    post: false, grass: 0, decoTrees: 260, terrainSeg: 90, lambert: true, far: 75, fireflies: 40,
  },
  medium: {
    key: 'medium', name: 'Mittel', maxScale: 1.0, minScale: 0.55, shadows: true, shadowSize: 512,
    post: true, grass: 2600, decoTrees: 650, terrainSeg: 140, lambert: false, far: 95, fireflies: 90,
  },
  high: {
    key: 'high', name: 'Hoch', maxScale: 1.35, minScale: 0.65, shadows: true, shadowSize: 1024,
    post: true, grass: 7000, decoTrees: 1100, terrainSeg: 200, lambert: false, far: 120, fireflies: 160,
  },
};

let Q = PRESETS.medium;
export const getQ = () => Q;

/** Grobe Hardware-Erkennung, um ohne Einstellungen direkt flüssig zu laufen. */
export function detectQuality(renderer) {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile) return 'low';
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
  } catch (e) { /* egal */ }
  gpu = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';
  // Ältere Intel-Grafik (z.B. Schul-PCs mit Core i3 + "HD Graphics") → Niedrig; neuere (UHD/Iris/Xe/Arc) → Mittel
  if (/intel/.test(gpu) && !/uhd|iris|xe|arc/.test(gpu)) return 'low';
  if (/intel|uhd|mali|adreno|powervr|apple gpu/.test(gpu)) return 'medium';
  if ((navigator.hardwareConcurrency || 4) <= 2) return 'low';
  return 'high';
}

/** Material-Fabrik: auf "Niedrig" billige Lambert-Materialien, sonst PBR. */
export function mat(color, opts = {}) {
  const { roughness = 0.9, metalness = 0, emissive, emissiveIntensity, map, side, flatShading, vertexColors, transparent, opacity } = opts;
  const base = { color };
  if (emissive !== undefined) { base.emissive = new THREE.Color(emissive); base.emissiveIntensity = emissiveIntensity ?? 1; }
  if (map) base.map = map;
  if (side !== undefined) base.side = side;
  if (vertexColors) base.vertexColors = true;
  if (transparent) { base.transparent = true; base.opacity = opacity ?? 1; }
  if (Q.lambert) return new THREE.MeshLambertMaterial({ ...base, flatShading: undefined });
  return new THREE.MeshStandardMaterial({ ...base, roughness, metalness, flatShading: !!flatShading });
}

export const windUniform = { value: 0 };
/** Wind-Animation im Vertex-Shader (für Blätter & Gras), kostet praktisch nichts. */
export function addWind(material, strength = 0.15) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = windUniform;
    shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wp = instanceMatrix[3].xyz;
      #else
        vec3 wp = vec3(0.0);
      #endif
      float sway = sin(uWind * 1.3 + wp.x * 0.21 + wp.z * 0.17) + 0.5 * sin(uWind * 2.7 + wp.z * 0.4);
      transformed.x += sway * ${strength.toFixed(3)} * max(position.y, 0.0);
      transformed.z += cos(uWind * 1.1 + wp.x * 0.3) * ${(strength * 0.6).toFixed(3)} * max(position.y, 0.0);`
    );
  };
  material.customProgramCacheKey = () => 'wind' + strength;
  return material;
}

const POST_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FS = `
precision highp float;
uniform sampler2D tDiffuse; uniform float uTime, uScare, uDanger, uHurt, uFade, uExposure; uniform vec2 uRes;
varying vec2 vUv;
vec3 aces(vec3 x){ const float a=2.51; const float b=0.03; const float c=2.43; const float d=0.59; const float e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  uv.x += sin(uv.y * 38.0 + uTime * 47.0) * 0.006 * uScare;
  float ab = 0.0012 + uScare * 0.014 + uDanger * 0.004;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + c * ab).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - c * ab).b;
  col = aces(col * uExposure);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 0.82 - uHurt * 0.6);
  col *= vec3(0.93, 1.0, 1.07);
  col = mix(col, vec3(l * 1.4, l * 0.15, l * 0.12) + col * 0.3, clamp(max(uScare * 0.7, uHurt * 0.45), 0.0, 1.0));
  float pulse = 1.0 + uDanger * (0.35 + 0.15 * sin(uTime * 7.0));
  float v = smoothstep(0.9, 0.15, length(c) * pulse);
  col *= mix(0.25, 1.0, v);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  col += (hash(floor(uv * uRes) + fract(uTime) * 91.7) - 0.5) * (0.05 + uScare * 0.18);
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
    this.scene.add(this.camera);
    this.fx = { scare: 0, danger: 0, hurt: 0, fade: 0, exposure: 1.15 };
    this.time = 0;
    this.scale = 1;
    this._acc = 0; this._frames = 0;
    this.fps = 60;
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: null }, uTime: { value: 0 }, uScare: { value: 0 }, uDanger: { value: 0 },
        uHurt: { value: 0 }, uFade: { value: 0 }, uExposure: { value: 1 }, uRes: { value: new THREE.Vector2() },
      },
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
    this.rt = null;
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(key) {
    Q = { ...(PRESETS[key] || PRESETS.medium) };
    this.degradeLevel = 0; this._slow = 0;
    this.q = Q;
    const r = this.renderer;
    r.shadowMap.enabled = Q.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = Q.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.25;
    this.camera.far = Q.far;
    this.camera.updateProjectionMatrix();
    this.scale = Q.maxScale;
    if (this.rt) { this.rt.dispose(); this.rt = null; }
    if (Q.post) {
      const half = r.capabilities.isWebGL2;
      this.rt = new THREE.WebGLRenderTarget(4, 4, {
        type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true,
      });
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 1.5) * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.rt) {
      this.rt.setSize(Math.max(1, Math.floor(w * pr)), Math.max(1, Math.floor(h * pr)));
      this.postMat.uniforms.uRes.value.set(w * pr, h * pr);
    }
  }

  /** Dynamische Auflösung: hält die Bildrate stabil, indem intern die Auflösung angepasst wird. */
  _dynamicRes(dt) {
    this._acc += dt; this._frames++;
    if (this._acc < 1) return;
    const avg = this._acc / this._frames;
    this.fps = Math.round(1 / avg);
    this._acc = 0; this._frames = 0;
    let s = this.scale;
    if (avg > 1 / 45) s -= 0.1;
    else if (avg > 1 / 54) s -= 0.05;
    else if (avg < 1 / 58) s += 0.05;
    s = Math.min(Q.maxScale, Math.max(Q.minScale, s));
    if (Math.abs(s - this.scale) > 0.001) { this.scale = s; this.resize(); }
    // Reicht das nicht (schwache Grafik, z.B. Core i3), werden teure Effekte stufenweise abgeschaltet
    if (s <= Q.minScale + 0.001 && avg > 1 / 40) this._slow++; else this._slow = 0;
    if (this._slow >= 3) { this._slow = 0; this.degrade(); }
  }

  /** Eine Stufe Grafikaufwand sparen (ohne Neuladen). */
  degrade() {
    const r = this.renderer;
    const recompile = () => this.scene.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; });
    });
    if (this.degradeLevel === 0 && Q.post) {
      Q.post = false; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.25; recompile();
      this.onDegrade && this.onDegrade('Leistung: Nachbearbeitung aus');
    } else if (this.degradeLevel <= 1 && Q.shadows) {
      Q.shadows = false; r.shadowMap.enabled = false;
      this.scene.traverse((o) => { if (o.isLight && o.castShadow) o.castShadow = false; });
      recompile();
      this.onDegrade && this.onDegrade('Leistung: Schatten aus');
    } else if (this.degradeLevel <= 2) {
      this.scene.traverse((o) => { if (o.userData.detail) o.visible = false; });
      Q.minScale = 0.35;
      this.onDegrade && this.onDegrade('Leistung: Gras & Details reduziert');
    } else return;
    this.degradeLevel++;
  }

  render(dt) {
    this.time += dt;
    windUniform.value = this.time;
    this._dynamicRes(dt);
    const r = this.renderer;
    if (Q.post && this.rt) {
      r.setRenderTarget(this.rt);
      r.render(this.scene, this.camera);
      r.setRenderTarget(null);
      const u = this.postMat.uniforms;
      u.tDiffuse.value = this.rt.texture;
      u.uTime.value = this.time;
      u.uScare.value = this.fx.scare;
      u.uDanger.value = this.fx.danger;
      u.uHurt.value = this.fx.hurt;
      u.uFade.value = this.fx.fade;
      u.uExposure.value = this.fx.exposure;
      r.render(this.postScene, this.postCam);
    } else {
      r.render(this.scene, this.camera);
    }
  }
}
