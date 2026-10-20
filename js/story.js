// Story-Intro: In-Engine-Zwischensequenz mit Kamerafahrten, Erzählstimme, Untertiteln,
// SMS vom Auftraggeber, Zeitungsausschnitt und einem ersten Blick auf den Blassen.
import * as THREE from 'three';
import { MonsterView } from './game/monsters.js';
import { $ } from './ui/ui.js';

const ease = (t) => t * t * (3 - 2 * t);

export class Story {
  constructor(app) {
    this.app = app;
    this.active = false;
  }

  _shots() {
    const w = this.app.world, H = (x, z) => w.height(x, z);
    const v = w.van, c = w.clearing, ch = w.chapel;
    const chFront = { x: ch.x + Math.sin(ch.rot) * 14, z: ch.z + Math.cos(ch.rot) * 14 };
    return [
      { // 1 – Straße, Van mit Scheinwerfern
        dur: 9, from: [v.x + 0.5, H(v.x, v.z + 34) + 1.5, v.z + 34], to: [v.x - 1.5, H(v.x, v.z + 11) + 1.7, v.z + 11],
        look: [v.x, H(v.x, v.z) + 1.2, v.z], card: 'Oktober 2026 · irgendwo im Norden',
        say: 'Vor drei Wochen haben wir uns Geld bei den falschen Leuten geliehen.', engine: true,
      },
      { // 2 – am Van, SMS
        dur: 9, from: [v.x + 6, H(v.x + 6, v.z + 2) + 1.7, v.z + 2], to: [v.x + 4.5, H(v.x + 4.5, v.z + 4) + 1.6, v.z + 4],
        look: [v.x + 1, H(v.x, v.z) + 1.1, v.z - 0.5], sms: true,
        say: 'Mister Crane will es zurück. Mit Zinsen. Und er hat uns ein Angebot gemacht.',
      },
      { // 3 – Flug über das Camp, Zeitungsartikel
        dur: 10, from: [c.x - 26, H(c.x, c.z) + 11, c.z - 22], to: [c.x + 10, H(c.x, c.z) + 6, c.z - 8],
        look: [c.x, H(c.x, c.z) + 0.5, c.z], paper: true,
        say: 'Camp Hollow Pines. Geschlossen im Sommer 1987, nachdem zwölf Kinder verschwunden sind. Man hat sie nie gefunden.',
      },
      { // 4 – Hütten
        dur: 9, from: [c.x + 4, H(c.x, c.z) + 2.2, c.z + 4], to: [c.x + 9, H(c.x, c.z) + 2.0, c.z + 11],
        look: [w.lodge.x, H(w.lodge.x, w.lodge.z) + 1.6, w.lodge.z],
        say: 'Crane sammelt Dinge aus diesem Camp. Er zahlt für alles, was wir rausholen. Jede Nacht eine feste Summe. Die Quote.',
      },
      { // 5 – Kapelle, der Blasse erscheint
        dur: 10, from: [chFront.x + 4, H(chFront.x, chFront.z) + 1.7, chFront.z + 3], to: [chFront.x + 1, H(chFront.x, chFront.z) + 1.6, chFront.z + 0.5],
        look: [ch.x, H(ch.x, ch.z) + 1.8, ch.z], monster: { at: 5.2, len: 1.6 },
        say: 'Er sagt, wir sollen vor vier Uhr morgens wieder weg sein. Er sagt nicht, warum.',
      },
      { // 6 – zurück am Van, Titel
        dur: 9, from: [v.x + 2, H(v.x, v.z + 6) + 1.6, v.z + 7], to: [v.x + 2, H(v.x, v.z + 9) + 7, v.z + 12],
        look: [c.x, H(c.x, c.z) + 2, c.z], title: true,
        say: 'Aber im Wald ist etwas. Und es hört zu.',
      },
    ];
  }

  /** Untertitel Buchstabe für Buchstabe mit leisen Schreibmaschinen-Klicks (statt KI-Stimme). */
  _type(text) {
    clearInterval(this._typeT);
    const el = $('storySub');
    let i = 0;
    el.textContent = '';
    this._typeT = setInterval(() => {
      if (!this.active) { clearInterval(this._typeT); return; }
      i++;
      el.textContent = text.slice(0, i);
      const ch = text[i - 1];
      if (ch && ch !== ' ' && i % 2 === 0) this.app.audio.tone(1900 + Math.random() * 400, 1200, 0.025, 0.035, 'square');
      if (i >= text.length) clearInterval(this._typeT);
    }, 38);
  }

  play(onDone) {
    if (this.active) return;
    const app = this.app, eng = app.engine, cam = eng.camera, a = app.audio;
    a.init();
    a.startAmbience(1);
    this.active = true;
    this.onDone = onDone;
    // Kino-Licht: etwas heller als im Spiel, damit man die Szenen gut sieht
    this._hemi = app.world.hemi.intensity; this._exp = eng.fx.exposure;
    app.world.hemi.intensity = this._hemi * 1.9; eng.fx.exposure = 1.6;
    this.shots = this._shots();
    this.idx = -1; this.t = 0;
    this.fig = new MonsterView('stalker', eng.scene, null);
    this.fig.root.visible = false;
    const el = $('story');
    el.classList.remove('hidden');
    $('storySub').textContent = ''; $('storyCard').textContent = '';
    $('storySms').classList.add('hidden'); $('storyPaper').classList.add('hidden'); $('storyTitle').classList.add('hidden');
    this._skip = (e) => { if (e.type === 'click' || e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') this.finish(); };
    $('btnSkipStory').onclick = () => this.finish();
    addEventListener('keydown', this._skip);
    this._next();
    this._v = new THREE.Vector3(); this._l = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    void cam;
  }

  _next() {
    this.idx++;
    if (this.idx >= this.shots.length) { this.finish(); return; }
    const s = this.shots[this.idx];
    this.t = 0;
    $('storyCard').textContent = s.card || '';
    $('storySms').classList.toggle('hidden', !s.sms);
    $('storyPaper').classList.toggle('hidden', !s.paper);
    $('storyTitle').classList.toggle('hidden', !s.title);
    this._type(s.say);
    const a = this.app.audio;
    if (s.engine) a.engine(new THREE.Vector3(...s.look));
    if (s.sms) { a.tone(1318, 1318, 0.08, 0.12, 'sine'); a.tone(1760, 1760, 0.12, 0.12, 'sine', 0.12); }
    if (s.paper) a.radioStatic(null, 0.5);
    this.app.ui.fade(false);
  }

  update(dt) {
    if (!this.active) return;
    const s = this.shots[this.idx];
    this.t += dt;
    const k = ease(Math.min(1, this.t / s.dur));
    const cam = this.app.engine.camera;
    this._v.set(s.from[0] + (s.to[0] - s.from[0]) * k, s.from[1] + (s.to[1] - s.from[1]) * k, s.from[2] + (s.to[2] - s.from[2]) * k);
    cam.position.copy(this._v);
    this._l.set(...s.look);
    if (this.t < 0.05) this.camLook.copy(this._l); else this.camLook.lerp(this._l, 1 - Math.exp(-3 * dt));
    cam.lookAt(this.camLook);
    // Monster-Moment
    const fig = this.fig;
    if (s.monster) {
      const on = this.t > s.monster.at && this.t < s.monster.at + s.monster.len;
      if (on && !fig.root.visible) {
        const w = this.app.world;
        const dir = new THREE.Vector3().subVectors(this._l, cam.position).setY(0).normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const p = cam.position.clone().addScaledVector(dir, 13).addScaledVector(side, 4);
        p.y = w.collision.groundAt(p.x, p.z);
        fig.setState(p.x, p.y, p.z, Math.atan2(cam.position.x - p.x, cam.position.z - p.z), 0, 0);
        fig.root.visible = true;
        const a = this.app.audio;
        a.tone(1180, 1100, 0.9, 0.14, 'sawtooth'); a.tone(1255, 1190, 0.9, 0.14, 'sawtooth'); a.tone(80, 40, 1, 0.6, 'sine');
        this.app.engine.fx.scare = 0.6;
      } else if (!on && fig.root.visible) {
        fig.root.visible = false;
        this.app.audio.whisper(cam.position.clone().add(new THREE.Vector3(1, 0, 0)));
      }
    } else fig.root.visible = false;
    fig.update(dt, null);
    this.app.engine.fx.scare = Math.max(0, this.app.engine.fx.scare - dt * 0.8);
    this.app.engine.fx.danger = s.monster ? 0.5 : 0.2;
    this.app.world.update(dt, this.app.engine.time, cam.position);
    if (this.t > s.dur - 0.6 && !this._fading) { this._fading = true; this.app.ui.fade(true); }
    if (this.t >= s.dur) { this._fading = false; this._next(); }
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    clearInterval(this._typeT);
    removeEventListener('keydown', this._skip);
    if (this.fig) { this.fig.dispose(this.app.engine.scene); this.fig = null; }
    $('story').classList.add('hidden');
    this.app.world.hemi.intensity = this._hemi; this.app.engine.fx.exposure = this._exp;
    this.app.ui.fade(false);
    this.app.engine.fx.scare = 0;
    try { localStorage.setItem('hp_story_seen', '1'); } catch (e) {}
    const cb = this.onDone; this.onDone = null;
    if (cb) cb();
  }
}
