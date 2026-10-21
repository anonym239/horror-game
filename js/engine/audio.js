// HollowEngine – Audio: alles prozedural mit WebAudio synthetisiert (keine Audiodateien nötig).
// Enthält 3D-Positionsaudio, Mikrofon-Pegelmessung und Proximity-Voice-Chat.

const rand = (a, b) => a + Math.random() * (b - a);
// Party-Musik im Van: Lautstärke im Laderaum / draußen und Dämpfung (Tiefpass) draußen
const PARTY_VOL_IN = 1.0, PARTY_VOL_OUT = 0.7, PARTY_LP_OUT = 1400;
// Proximity-Voice-Chat: bis VOICE_NEAR Meter volle Lautstärke, ab VOICE_RANGE Meter stumm
const VOICE_NEAR = 2.5, VOICE_RANGE = 32;
const PARTY_STATIONS = ['Party FM', 'Synthwave 87', 'Radio Hollow Pines (Spieluhr)', 'Aus'];

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.micStream = null;
    this.micLevel = 0;
    this.micEnabled = false;
    this.voices = new Map();
    this.danger = 0;
    this._hbTimer = 0;
    this.hq = true;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master = c.createGain(); this.master.gain.value = this.volume;
    this.sfx = c.createGain(); this.sfx.gain.value = 1;
    this.amb = c.createGain(); this.amb.gain.value = 0;
    this.voiceBus = c.createGain(); this.voiceBus.gain.value = 1.4;
    this.sfx.connect(this.comp); this.amb.connect(this.comp); this.voiceBus.connect(this.comp);
    this.comp.connect(this.master); this.master.connect(c.destination);
    // Rausch-Puffer
    const len = c.sampleRate * 2;
    this.white = c.createBuffer(1, len, c.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    this.brown = c.createBuffer(1, len * 2, c.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len * 2; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; this.distCurve[i] = Math.tanh(x * 6); }
    this._buildAmbience();
  }

  get t() { return this.ctx.currentTime; }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.t;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  _panner(pos, ref = 3, max = 70) {
    const p = this.ctx.createPanner();
    p.panningModel = this.hq ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref; p.maxDistance = max; p.rolloffFactor = 1.3;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.sfx);
    return p;
  }
  _out(pos, ref, max) { return pos ? this._panner(pos, ref, max) : this.sfx; }

  _noise(buffer = this.white) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer; s.loop = true;
    s.loopStart = 0; s.start(this.t, Math.random() * 1.5);
    return s;
  }
  _env(peak, a, d, start = this.t) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + a);
    g.gain.exponentialRampToValueAtTime(0.0001, start + a + d);
    return g;
  }
  _filter(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  _stopLater(nodes, sec) { setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }), sec * 1000 + 100); }

  // ---------- Ambience ----------
  _buildAmbience() {
    const c = this.ctx;
    const wind = this._noise(this.brown);
    const lp = this._filter('lowpass', 420, 0.7);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 260;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    const wg = c.createGain(); wg.gain.value = 0.32;
    wind.connect(lp); lp.connect(wg); wg.connect(this.amb);
    // tiefer Drone
    const droneG = c.createGain(); droneG.gain.value = 0.05;
    [55, 55.6, 82.4, 110.3].forEach((f, i) => {
      const o = c.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = i === 3 ? 0.25 : 0.6;
      o.connect(g); g.connect(droneG); o.start();
    });
    const dl = c.createOscillator(); dl.frequency.value = 0.05; const dlg = c.createGain(); dlg.gain.value = 0.03;
    dl.connect(dlg); dlg.connect(droneG.gain); dl.start();
    droneG.connect(this.amb);
    // Gefahren-Layer (dissonantes Cluster), Lautstärke über setDanger
    this.dangerG = c.createGain(); this.dangerG.gain.value = 0;
    const dlp = this._filter('lowpass', 700, 2);
    [73.4, 77.8, 146.8, 155.6, 311].forEach((f) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = rand(-12, 12);
      const g = c.createGain(); g.gain.value = 0.08; o.connect(g); g.connect(dlp); o.start();
    });
    const trem = c.createOscillator(); trem.frequency.value = 5.5; const tg = c.createGain(); tg.gain.value = 0.4;
    trem.connect(tg); tg.connect(dlp.frequency); trem.start();
    dlp.connect(this.dangerG); this.dangerG.connect(this.amb);
    // Grillen
    this.crickets = c.createGain(); this.crickets.gain.value = 0.0;
    const co = c.createOscillator(); co.frequency.value = 4300;
    const am = c.createOscillator(); am.frequency.value = 32; const amg = c.createGain(); amg.gain.value = 0.5;
    const cg = c.createGain(); cg.gain.value = 0.5; am.connect(amg); amg.connect(cg.gain);
    co.connect(cg); cg.connect(this.crickets); co.start(); am.start();
    this.crickets.connect(this.amb);
  }
  startAmbience(level = 1) {
    if (!this.ctx) return;
    this.amb.gain.setTargetAtTime(level, this.t, 1.5);
  }
  stopAmbience() { if (this.ctx) this.amb.gain.setTargetAtTime(0, this.t, 0.5); }

  setDanger(d) {
    this.danger = d;
    if (!this.ctx) return;
    this.dangerG.gain.setTargetAtTime(d * d * 0.5, this.t, 0.4);
  }

  /** pro Frame: Herzschlag & Grillen */
  update(dt) {
    if (!this.ctx) return;
    // Grillen zirpen in Schüben, verstummen bei Gefahr
    const chirp = (Math.sin(this.t * 2.2) > 0.3 ? 1 : 0) * (1 - this.danger) * 0.035;
    this.crickets.gain.setTargetAtTime(chirp, this.t, 0.05);
    if (this.danger > 0.15) {
      this._hbTimer -= dt;
      if (this._hbTimer <= 0) {
        this._hbTimer = 1.1 - this.danger * 0.65;
        this.heartbeat(0.25 + this.danger * 0.6);
      }
    }
    // Mikrofonpegel
    if (this.micAnalyser) {
      const d = this._micBuf;
      this.micAnalyser.getFloatTimeDomainData(d);
      let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      const rms = Math.sqrt(s / d.length);
      const db = 20 * Math.log10(rms + 1e-8);
      const lvl = Math.min(1, Math.max(0, (db + 52) / 36));
      this.micLevel += (lvl - this.micLevel) * (lvl > this.micLevel ? 0.6 : 0.12);
    } else this.micLevel = 0;
    for (const v of this.voices.values()) {
      if (!v.an) continue;
      v.an.getFloatTimeDomainData(v.buf);
      let s = 0; for (let i = 0; i < v.buf.length; i++) s += v.buf[i] * v.buf[i];
      v.level = Math.sqrt(s / v.buf.length);
    }
  }

  // ---------- One-Shots ----------
  heartbeat(vol) {
    const c = this.ctx, t = this.t;
    [0, 0.17].forEach((off, i) => {
      const o = c.createOscillator(); o.frequency.setValueAtTime(70, t + off); o.frequency.exponentialRampToValueAtTime(38, t + off + 0.15);
      const g = this._env(vol * (i ? 0.7 : 1), 0.01, 0.2, t + off);
      o.connect(g); g.connect(this.sfx); o.start(t + off); o.stop(t + off + 0.3);
    });
  }

  footstep(pos, vol = 0.3, surface = 'ground') {
    if (!this.ctx) return;
    const out = this._out(pos, 2, 40);
    const n = this._noise();
    const f = surface === 'wood' ? rand(700, 1100) : surface === 'water' ? rand(1500, 2500) : rand(250, 600);
    const bp = this._filter('bandpass', f, surface === 'wood' ? 2.5 : 0.9);
    const g = this._env(vol, 0.006, surface === 'water' ? 0.25 : 0.12);
    n.connect(bp); bp.connect(g); g.connect(out);
    if (surface === 'wood') {
      const o = this.ctx.createOscillator(); o.frequency.value = rand(150, 200);
      const og = this._env(vol * 0.5, 0.004, 0.08); o.connect(og); og.connect(out); o.start(); o.stop(this.t + 0.2);
    }
    this._stopLater([n], 0.4);
  }

  impact(pos, strength = 5, material = 'wood') {
    if (!this.ctx) return;
    const v = Math.min(1, strength / 9);
    const out = this._out(pos, 3, 50);
    const n = this._noise();
    const bp = this._filter('bandpass', material === 'glass' ? 3200 : material === 'metal' ? 2200 : 900, material === 'glass' ? 4 : 1.2);
    const g = this._env(v * 0.8, 0.004, material === 'glass' ? 0.35 : 0.18);
    n.connect(bp); bp.connect(g); g.connect(out);
    const o = this.ctx.createOscillator();
    o.type = material === 'metal' ? 'square' : 'sine';
    o.frequency.setValueAtTime(material === 'metal' ? rand(500, 800) : rand(90, 160), this.t);
    o.frequency.exponentialRampToValueAtTime(50, this.t + 0.2);
    const og = this._env(v * 0.6, 0.003, material === 'metal' ? 0.4 : 0.15);
    o.connect(og); og.connect(out); o.start(); o.stop(this.t + 0.5);
    this._stopLater([n], 0.6);
  }

  tone(f1, f2, dur, vol = 0.2, type = 'sine', delay = 0, pos = null) {
    if (!this.ctx) return;
    const t = this.t + delay;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this._env(vol, 0.01, dur, t);
    o.connect(g); g.connect(this._out(pos)); o.start(t); o.stop(t + dur + 0.05);
  }
  click() { this.tone(1400, 900, 0.05, 0.08, 'triangle'); }
  hover() { this.tone(900, 1000, 0.03, 0.03, 'sine'); }
  pickup() { this.tone(420, 760, 0.09, 0.12, 'triangle'); }
  drop() { this.tone(520, 260, 0.1, 0.1, 'triangle'); }
  cash() { this.tone(1046, 1046, 0.12, 0.15, 'triangle'); this.tone(1568, 1568, 0.3, 0.15, 'triangle', 0.09); this.tone(2093, 2093, 0.4, 0.08, 'sine', 0.18); }
  denied() { this.tone(200, 150, 0.2, 0.15, 'square'); }
  scanPing() { this.tone(600, 1800, 0.5, 0.12, 'sine'); this.tone(1800, 600, 0.6, 0.05, 'sine', 0.2); }
  flashlightClick() { this.tone(2500, 1800, 0.02, 0.08, 'square'); }

  screech() {
    if (!this.ctx) return;
    const c = this.ctx, t = this.t;
    const ws = c.createWaveShaper(); ws.curve = this.distCurve;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.3, t + 0.03);
    g.gain.setValueAtTime(1.3, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    ws.connect(g); g.connect(this.sfx);
    const nodes = [];
    [620, 870, 1310, 1750].forEach((f) => {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.15);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 1.8);
      const vib = c.createOscillator(); vib.frequency.value = rand(25, 40); const vg = c.createGain(); vg.gain.value = f * 0.08;
      vib.connect(vg); vg.connect(o.frequency); vib.start(t); o.start(t);
      const og = c.createGain(); og.gain.value = 0.15; o.connect(og); og.connect(ws);
      nodes.push(o, vib);
    });
    const n = this._noise(); const hp = this._filter('highpass', 1800);
    const ng = this._env(0.6, 0.01, 1.2); n.connect(hp); hp.connect(ng); ng.connect(this.sfx); nodes.push(n);
    const boom = c.createOscillator(); boom.frequency.setValueAtTime(80, t); boom.frequency.exponentialRampToValueAtTime(30, t + 0.8);
    const bg = this._env(1.0, 0.01, 0.9); boom.connect(bg); bg.connect(this.sfx); boom.start(t); nodes.push(boom);
    this._stopLater(nodes, 2);
  }

  scream(pos) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.t;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(950, t + 0.25); o.frequency.linearRampToValueAtTime(380, t + 1.3);
    const vib = c.createOscillator(); vib.frequency.value = 7; const vg = c.createGain(); vg.gain.value = 30;
    vib.connect(vg); vg.connect(o.frequency);
    const bp = this._filter('bandpass', 1100, 2);
    const g = this._env(0.7, 0.05, 1.3);
    o.connect(bp); bp.connect(g); g.connect(this._out(pos, 6, 120));
    o.start(t); vib.start(t); this._stopLater([o, vib], 1.5);
  }

  whisper(pos) {
    if (!this.ctx) return;
    const t = this.t;
    const n = this._noise();
    const bp = this._filter('bandpass', 2400, 5);
    const g = this.ctx.createGain(); g.gain.value = 0;
    let tt = t;
    for (let i = 0; i < 9; i++) {
      g.gain.setTargetAtTime(rand(0.15, 0.45), tt, 0.02);
      bp.frequency.setTargetAtTime(rand(1500, 3800), tt, 0.03);
      tt += rand(0.08, 0.2);
      g.gain.setTargetAtTime(0, tt, 0.03);
      tt += rand(0.03, 0.12);
    }
    n.connect(bp); bp.connect(g); g.connect(this._out(pos, 2, 25));
    this._stopLater([n], tt - t + 0.3);
  }

  branch(pos) {
    if (!this.ctx) return;
    const t = this.t, out = this._out(pos, 4, 60);
    const nodes = [];
    for (let i = 0; i < 6; i++) {
      const n = this._noise(); const hp = this._filter('bandpass', rand(1500, 4000), 3);
      const g = this._env(rand(0.3, 0.8), 0.002, rand(0.02, 0.06), t + i * rand(0.01, 0.05));
      n.connect(hp); hp.connect(g); g.connect(out); nodes.push(n);
    }
    this._stopLater(nodes, 0.6);
  }

  crow(pos) {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) {
      const t = this.t + i * 0.45;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(820, t); o.frequency.exponentialRampToValueAtTime(480, t + 0.3);
      const bp = this._filter('bandpass', 1300, 3); const g = this._env(0.35, 0.02, 0.3, t);
      o.connect(bp); bp.connect(g); g.connect(this._out(pos, 6, 100)); o.start(t); o.stop(t + 0.4);
    }
  }
  owl(pos) {
    [0, 0.55, 0.9].forEach((d) => this.tone(390, 330, 0.4, 0.18, 'sine', d, pos));
  }
  boom(pos) {
    if (!this.ctx) return;
    const out = this._out(pos, 8, 150);
    const n = this._noise(this.brown); const lp = this._filter('lowpass', 900);
    const g = this._env(1.4, 0.005, 1.6); n.connect(lp); lp.connect(g); g.connect(out);
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(90, this.t); o.frequency.exponentialRampToValueAtTime(30, this.t + 1);
    const og = this._env(1.2, 0.005, 1); o.connect(og); og.connect(out); o.start(); o.stop(this.t + 1.2);
    const cr = this._noise(); const hp = this._filter('highpass', 2500); const cg = this._env(0.7, 0.002, 0.25);
    cr.connect(hp); hp.connect(cg); cg.connect(out);
    this._stopLater([n, cr], 1.8);
  }
  /** Polenböller: 5× so stark – tiefer Sub-Wumms, langes Grollen, Splitter-Knistern, Echo im Wald. */
  bigBoom(pos) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.t;
    const out = this._out(pos, 20, 400);
    const ws = c.createWaveShaper(); ws.curve = this.distCurve; ws.connect(out);
    const n = this._noise(this.brown); const lp = this._filter('lowpass', 1400);
    const g = this._env(2.2, 0.004, 3.2); n.connect(lp); lp.connect(g); g.connect(ws);
    const o = c.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(22, t + 2);
    const og = this._env(2.0, 0.004, 2.2); o.connect(og); og.connect(out); o.start(t); o.stop(t + 2.4);
    const cr = this._noise(); const hp = this._filter('highpass', 2000); const cg = this._env(1.2, 0.002, 0.5);
    cr.connect(hp); hp.connect(cg); cg.connect(out);
    const nodes = [n, cr];
    // Splitter / Nachknistern
    for (let i = 0; i < 14; i++) {
      const s = this._noise(); const bp = this._filter('bandpass', rand(1500, 5000), 4);
      const sg = this._env(rand(0.15, 0.4), 0.002, rand(0.02, 0.07), t + 0.3 + i * rand(0.04, 0.12));
      s.connect(bp); bp.connect(sg); sg.connect(out); nodes.push(s);
    }
    // Echo vom Waldrand
    const e = this._noise(this.brown); const elp = this._filter('lowpass', 500);
    const eg = this._env(0.6, 0.15, 2.0, t + 0.9); e.connect(elp); elp.connect(eg); eg.connect(this.sfx); nodes.push(e);
    this._stopLater(nodes, 3.6);
  }

  /** Tag geschafft: kleine Sieger-Fanfare (Arpeggio + Akkord + Glitzer). */
  dayComplete() {
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => { this.tone(f, f, 0.18, 0.16, 'square', i * 0.11); this.tone(f / 2, f / 2, 0.18, 0.1, 'triangle', i * 0.11); });
    const d = notes.length * 0.11 + 0.05;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f) => { this.tone(f, f * 1.003, 1.4, 0.07, 'triangle', d); this.tone(f * 1.005, f, 1.4, 0.04, 'sawtooth', d); });
    this.tone(130.8, 130.8, 1.5, 0.22, 'sine', d);
    for (let i = 0; i < 10; i++) { const f = rand(2000, 4200); this.tone(f, f * 1.2, 0.08, 0.05, 'sine', d + 0.1 + i * 0.09); }
  }

  /** Van startet und fährt weg: Anlasser, Motor brummt auf, Gangwechsel, Kies, Hupe, verklingt in der Ferne. */
  vanDriveAway() {
    if (!this.ctx) return;
    const c = this.ctx, t = this.t, nodes = [];
    // Anlasser
    for (let i = 0; i < 5; i++) this.tone(140, 110, 0.09, 0.18, 'square', i * 0.12);
    const t0 = t + 0.7, len = 6;
    // Motor
    const lp = this._filter('lowpass', 500, 2);
    const mg = c.createGain();
    mg.gain.setValueAtTime(0.0001, t0); mg.gain.exponentialRampToValueAtTime(0.6, t0 + 0.2);
    mg.gain.setValueAtTime(0.6, t0 + 2.2); mg.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    lp.frequency.setValueAtTime(500, t0); lp.frequency.linearRampToValueAtTime(1200, t0 + 1.8); lp.frequency.linearRampToValueAtTime(260, t0 + len);
    [1, 2.01].forEach((m) => {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(38 * m, t0); o.frequency.linearRampToValueAtTime(90 * m, t0 + 1.6);   // 1. Gang hochdrehen
      o.frequency.linearRampToValueAtTime(58 * m, t0 + 1.9);                                           // Gangwechsel
      o.frequency.linearRampToValueAtTime(95 * m, t0 + 3.6);
      o.frequency.linearRampToValueAtTime(70 * m, t0 + len);                                           // Doppler: entfernt sich
      o.connect(lp); o.start(t0); o.stop(t0 + len + 0.1); nodes.push(o);
    });
    lp.connect(mg); mg.connect(this.sfx);
    // Reifen auf Kies
    const n = this._noise(); const bp = this._filter('bandpass', 900, 0.8);
    const ng = c.createGain(); ng.gain.setValueAtTime(0.0001, t0); ng.gain.exponentialRampToValueAtTime(0.35, t0 + 0.3); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.5);
    n.connect(bp); bp.connect(ng); ng.connect(this.sfx); nodes.push(n);
    // Hupe 2×
    [0, 0.32].forEach((d) => { this.tone(392, 392, 0.22, 0.12, 'square', 0.75 + 2.4 + d); this.tone(494, 494, 0.22, 0.1, 'square', 0.75 + 2.4 + d); });
    this._stopLater(nodes, len + 1);
  }

  radarBeep(near) { this.tone(near ? 1600 : 1200, near ? 1600 : 1200, 0.06, 0.09, 'square'); }

  /** Lockere Motel-Shop-Musik (prozedural, Endlosschleife), Look-Ahead-Sequencer. */
  startShopMusic() {
    if (!this.ctx || this._music) return;
    const c = this.ctx;
    const bus = c.createGain(); bus.gain.setValueAtTime(0.0001, this.t); bus.gain.exponentialRampToValueAtTime(0.5, this.t + 1.2);
    bus.connect(this.comp);
    const bpm = 108, step = 60 / bpm / 4;
    // C – Am – F – G (je 1 Takt), Melodie in C-Dur-Pentatonik
    const chords = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
    const bass = [65.4, 55.0, 87.3, 98.0];
    const scale = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5];
    const mel = [0, -1, 2, -1, 3, 2, -1, 1, 4, -1, 3, -1, 2, 1, 0, -1, 2, -1, 4, 3, -1, 5, 4, -1, 3, -1, 2, -1, 1, -1, 0, -1];
    const m = this._music = { bus, step: 0, next: this.t + 0.1 };
    const note = (f, at, dur, vol, type, dest = bus) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(dest); o.start(at); o.stop(at + dur + 0.05);
    };
    const hat = (at, vol) => {
      const s = c.createBufferSource(); s.buffer = this.white; const hp = this._filter('highpass', 7000);
      const g = c.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      s.connect(hp); hp.connect(g); g.connect(bus); s.start(at, Math.random()); s.stop(at + 0.06);
    };
    const tick = () => {
      if (this._music !== m) return;
      while (m.next < this.t + 0.25) {
        const s = m.step, bar = Math.floor(s / 16) % 4, i = s % 16, at = m.next;
        if (i % 4 === 0) note(bass[bar], at, step * 3, 0.35, 'triangle');
        if (i === 10) note(bass[bar] * 1.5, at, step * 2, 0.22, 'triangle');
        if (i % 8 === 4) chords[bar].forEach((f) => note(f, at, step * 3, 0.06, 'square'));
        if (i % 2 === 0) hat(at, i % 4 === 2 ? 0.08 : 0.04);
        const k = mel[s % 32];
        if (k >= 0 && s % 64 >= 16) note(scale[k], at, step * 1.8, 0.07, 'triangle');
        m.step++; m.next += step;
      }
    };
    tick();
    m.timer = setInterval(tick, 60);
  }
  stopShopMusic() {
    const m = this._music; if (!m) return;
    this._music = null;
    clearInterval(m.timer);
    m.bus.gain.setTargetAtTime(0.0001, this.t, 0.3);
    setTimeout(() => { try { m.bus.disconnect(); } catch (e) {} }, 1500);
  }

  /** Party-Musik aus dem Van (positional): Four-on-the-floor-Kick, Offbeat-Bass, Saw-Akkorde.
   *  Draußen dumpf durch die Wände, im Laderaum (setPartyInside) voll und klar. */
  startPartyMusic(pos) {
    if (!this.ctx || this._party) return;
    const c = this.ctx;
    // Lauter als früher: höhere Grundlautstärke, weniger Dämpfung draußen, größere Hörweite
    const pan = this._panner(pos, 4, 80); pan.rolloffFactor = 1.2;
    const lp = this._filter('lowpass', PARTY_LP_OUT, 0.8); lp.connect(pan);
    const bus = c.createGain(); bus.gain.setValueAtTime(0.0001, this.t); bus.gain.exponentialRampToValueAtTime(PARTY_VOL_OUT, this.t + 2); bus.connect(lp);
    const bpm = 126, step = 60 / bpm / 4;
    const roots = [55.0, 43.65, 65.41, 49.0];                              // A – F – C – G
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
    const lead = [440, 0, 523.3, 0, 659.3, 523.3, 0, 440, 392, 0, 440, 0, 523.3, 0, 587.3, 0];
    const p = this._party = { bus, lp, pan, step: 0, next: this.t + 0.1 };
    const osc = (f, at, dur, vol, type, f2) => {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(bus); o.start(at); o.stop(at + dur + 0.05);
    };
    const noise = (at, dur, vol, f, type = 'highpass') => {
      const s = c.createBufferSource(); s.buffer = this.white; const fl = this._filter(type, f);
      const g = c.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      s.connect(fl); fl.connect(g); g.connect(bus); s.start(at, Math.random()); s.stop(at + dur + 0.02);
    };
    const box = [880, 0, 1046.5, 0, 987.8, 0, 784, 0, 659.3, 0, 784, 0, 698.5, 0, 0, 0]; // Spieluhr
    p.station = this._partyStation || 0;
    const tick = () => {
      if (this._party !== p) return;
      while (p.next < this.t + 0.25) {
        const s = p.step, bar = Math.floor(s / 16) % 4, i = s % 16, at = p.next, drop = (s % 128) >= 32;
        if (p.station === 0) { // Party
          if (i % 4 === 0) osc(150, at, 0.28, 1.0, 'sine', 40);                         // Kick
          if (i % 4 === 2) osc(roots[bar] * 2, at, step * 1.6, 0.5, 'sawtooth');        // Offbeat-Bass
          if (i % 2 === 1) noise(at, 0.03, 0.18, 8000);                                 // Hi-Hat
          if (i === 4 || i === 12) noise(at, 0.15, 0.4, 1800, 'bandpass');             // Clap
          if (drop && (i === 0 || i === 6 || i === 10)) chords[bar].forEach((f) => osc(f, at, step * 2.5, 0.07, 'sawtooth'));
          if (drop && lead[i]) osc(lead[i] * 2, at, step * 0.9, 0.05, 'square');
        } else if (p.station === 1) { // Synthwave: Halftime-Beat, Arpeggio, Bass-Achtel
          if (i === 0 || i === 10) osc(120, at, 0.35, 0.9, 'sine', 45);
          if (i === 8) noise(at, 0.25, 0.45, 1200, 'bandpass');
          if (i % 2 === 0) osc(roots[bar] * 2, at, step * 1.8, 0.35, 'sawtooth');
          osc(chords[bar][s % 3] * (i % 8 < 4 ? 2 : 4), at, step * 0.9, 0.05, 'square');
          if (i % 4 === 2) noise(at, 0.02, 0.1, 9000);
        } else if (p.station === 2) { // Spieluhr – Camp-Gruselsender
          if (box[i]) { osc(box[i] * 2, at, step * 5, 0.12, 'sine'); osc(box[i] * 4.02, at, step * 2, 0.03, 'sine'); }
          if (i === 0) osc(roots[bar], at, step * 14, 0.12, 'triangle');
        }
        p.step++; p.next += step;
      }
    };
    tick();
    p.timer = setInterval(tick, 60);
    this.setPartyInside(false);
  }
  setPartyInside(inside) {
    const p = this._party; if (!p || p.inside === inside) return;
    p.inside = inside;
    p.lp.frequency.setTargetAtTime(inside ? 16000 : PARTY_LP_OUT, this.t, 0.15);
    p.bus.gain.setTargetAtTime(inside ? PARTY_VOL_IN : PARTY_VOL_OUT, this.t, 0.2);
    p.pan.rolloffFactor = inside ? 0.4 : 1.2;
  }
  /** Casino-Lounge: Swing mit Walking-Bass, Jazz-Akkorden, Besen-Becken und Vibraphon. */
  startCasinoMusic() {
    if (!this.ctx || this._casino) return;
    const c = this.ctx;
    const bus = c.createGain(); bus.gain.setValueAtTime(0.0001, this.t); bus.gain.exponentialRampToValueAtTime(0.55, this.t + 1.5);
    bus.connect(this.comp);
    const beat = 60 / 116;
    // ii-V-I-VI in F: Gm7 – C7 – Fmaj7 – D7
    const chords = [[196, 233.1, 293.7, 349.2], [196, 261.6, 329.6, 466.2], [220, 261.6, 329.6, 349.2], [185, 261.6, 293.7, 370]];
    const walk = [[98, 110, 116.5, 123.5], [130.8, 123.5, 116.5, 110], [87.3, 98, 110, 130.8], [146.8, 130.8, 123.5, 110]];
    const vib = [698.5, 0, 784, 880, 0, 784, 698.5, 0, 587.3, 0, 659.3, 698.5, 0, 880, 784, 0];
    const m = this._casino = { bus, step: 0, next: this.t + 0.1 };
    const note = (f, at, dur, vol, type) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(bus); o.start(at); o.stop(at + dur + 0.05);
    };
    const brush = (at, vol, len) => {
      const s = c.createBufferSource(); s.buffer = this.white; const f = this._filter('highpass', 6000);
      const g = c.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      s.connect(f); f.connect(g); g.connect(bus); s.start(at, Math.random()); s.stop(at + len + 0.02);
    };
    const tick = () => {
      if (this._casino !== m) return;
      while (m.next < this.t + 0.3) {
        const s = m.step, bar = Math.floor(s / 4) % 4, b = s % 4, at = m.next;
        note(walk[bar][b], at, beat * 0.9, 0.32, 'triangle');                                   // Walking-Bass
        if (b === 1 || b === 3) chords[bar].forEach((f) => note(f, at, beat * 0.5, 0.045, 'sine')); // Comping
        brush(at, b % 2 ? 0.07 : 0.04, 0.12); brush(at + beat * 0.66, 0.035, 0.06);              // Swing-Becken
        const v = vib[(s * 2) % 16]; if (v && s % 8 >= 4) note(v, at, beat * 1.4, 0.06, 'sine');
        const v2 = vib[(s * 2 + 1) % 16]; if (v2 && s % 8 >= 4) note(v2, at + beat * 0.66, beat, 0.05, 'sine');
        m.step++; m.next += beat;
      }
    };
    tick();
    m.timer = setInterval(tick, 80);
  }
  stopCasinoMusic() {
    const m = this._casino; if (!m) return;
    this._casino = null;
    clearInterval(m.timer);
    m.bus.gain.setTargetAtTime(0.0001, this.t, 0.3);
    setTimeout(() => { try { m.bus.disconnect(); } catch (e) {} }, 1500);
  }

  /** Van-Radio (R): wechselt den Sender und gibt dessen Namen zurück. */
  nextPartyStation() {
    this._partyStation = ((this._partyStation || 0) + 1) % PARTY_STATIONS.length;
    if (this._party) this._party.station = this._partyStation;
    this.radioStatic(null, 0.25);
    return PARTY_STATIONS[this._partyStation];
  }

  /** Van-Hupe: zwei verstimmte Rechteck-Töne, weit hörbar. */
  horn(pos) {
    if (!this.ctx) return;
    for (const f of [349, 440]) this.tone(f, f * 0.98, 1.1, 0.35, 'square', 0, pos);
    for (const f of [349, 440]) this.tone(f, f * 0.98, 0.9, 0.3, 'square', 1.3, pos);
  }
  /** Geisterblick-Brille: aufsteigender Glitch-Sweep. */
  xray() {
    this.tone(200, 2400, 0.5, 0.12, 'sawtooth');
    this.tone(2400, 300, 0.6, 0.06, 'square', 0.45);
    this.radioStatic(null, 0.4);
  }
  /** Adrenalin: Herzschlag-Doppel und Zischen. */
  adrenaline() {
    for (let i = 0; i < 4; i++) { this.tone(70, 40, 0.15, 0.6, 'sine', i * 0.38); this.tone(65, 38, 0.12, 0.45, 'sine', i * 0.38 + 0.16); }
    this.tone(3000, 600, 0.4, 0.05, 'sawtooth');
  }

  stopPartyMusic() {
    const p = this._party; if (!p) return;
    this._party = null;
    clearInterval(p.timer);
    p.bus.gain.setTargetAtTime(0.0001, this.t, 0.2);
    setTimeout(() => { try { p.bus.disconnect(); p.lp.disconnect(); p.pan.disconnect(); } catch (e) {} }, 1200);
  }

  fuse(pos) {
    if (!this.ctx) return;
    const n = this._noise(); const hp = this._filter('highpass', 4000);
    const g = this.ctx.createGain(); g.gain.value = 0.15;
    n.connect(hp); hp.connect(g); g.connect(this._out(pos, 2, 30));
    this._stopLater([n], 2.2);
  }
  creak(pos) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(rand(70, 110), this.t); o.frequency.linearRampToValueAtTime(rand(120, 180), this.t + 0.35);
    const bp = this._filter('bandpass', 700, 9); const g = this._env(0.5, 0.03, 0.35);
    o.connect(bp); bp.connect(g); g.connect(this._out(pos, 3, 40)); o.start(); o.stop(this.t + 0.5);
  }
  radioStatic(pos, dur = 1.2) {
    if (!this.ctx) return;
    const n = this._noise(); const bp = this._filter('bandpass', 1800, 0.6);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.25, this.t); g.gain.linearRampToValueAtTime(0, this.t + dur);
    n.connect(bp); bp.connect(g); g.connect(this._out(pos, 3, 40)); this._stopLater([n], dur);
  }
  engine(pos) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(40, this.t); o.frequency.linearRampToValueAtTime(70, this.t + 1.5); o.frequency.linearRampToValueAtTime(55, this.t + 3);
    const lp = this._filter('lowpass', 300); const g = this._env(0.5, 0.3, 2.8);
    o.connect(lp); lp.connect(g); g.connect(this._out(pos, 6, 80)); o.start(); o.stop(this.t + 3.2);
  }

  /** Dauer-Sound für Monster (Knurren / Atmen), positional. */
  loop(kind, pos) {
    if (!this.ctx) return null;
    const c = this.ctx;
    const p = this._panner(pos, 3, 60);
    const g = c.createGain(); g.gain.value = 0; g.connect(p);
    const nodes = [];
    if (kind === 'growl') {
      const lp = this._filter('lowpass', 380, 3); lp.connect(g);
      [52, 55.5, 104].forEach((f) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); nodes.push(o); });
      const am = c.createOscillator(); am.frequency.value = 3.2; const amg = c.createGain(); amg.gain.value = 0.4;
      am.connect(amg); amg.connect(g.gain); am.start(); nodes.push(am);
    } else if (kind === 'breath') {
      const n = this._noise(); const bp = this._filter('bandpass', 700, 1.5); n.connect(bp);
      const am = c.createOscillator(); am.frequency.value = 0.45; const amg = c.createGain(); amg.gain.value = 1;
      const bg = c.createGain(); bg.gain.value = 0; am.connect(amg); amg.connect(bg.gain); bp.connect(bg); bg.connect(g);
      am.start(); nodes.push(n, am);
    } else if (kind === 'music') {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 880;
      const vib = c.createOscillator(); vib.frequency.value = 0.8; const vg = c.createGain(); vg.gain.value = 18;
      vib.connect(vg); vg.connect(o.frequency); o.connect(g); o.start(); vib.start(); nodes.push(o, vib);
    }
    return {
      setPos: (v) => { if (p.positionX) { p.positionX.setTargetAtTime(v.x, this.t, 0.05); p.positionY.setTargetAtTime(v.y, this.t, 0.05); p.positionZ.setTargetAtTime(v.z, this.t, 0.05); } else p.setPosition(v.x, v.y, v.z); },
      setGain: (v) => g.gain.setTargetAtTime(v, this.t, 0.2),
      stop: () => { g.gain.setTargetAtTime(0, this.t, 0.1); this._stopLater(nodes, 0.4); setTimeout(() => { try { p.disconnect(); } catch (e) {} }, 600); },
    };
  }

  // ---------- Mikrofon & Voice ----------
  async enableMic() {
    if (this.micStream) return this.micStream;
    this.init();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
    if (!this._micReq) {
      this._micReq = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }).then((s) => { this._attachMic(s); return s; })
        .catch((e) => { console.warn('Mikrofon nicht verfügbar', e); this._micReq = null; return null; });
    }
    // Nie das Spiel blockieren, falls der Browser die Abfrage offen lässt (späte Freigabe wird trotzdem übernommen)
    const timeout = new Promise((r) => setTimeout(() => r(null), 6000));
    return Promise.race([this._micReq, timeout]);
  }
  _attachMic(stream) {
    this.micStream = stream;
    const src = this.ctx.createMediaStreamSource(stream);
    this.micAnalyser = this.ctx.createAnalyser();
    this.micAnalyser.fftSize = 1024;
    this._micBuf = new Float32Array(this.micAnalyser.fftSize);
    src.connect(this.micAnalyser);
    this.micEnabled = true;
    if (this.onMic) this.onMic(stream);
  }
  setMicMuted(m) {
    if (!this.micStream) return;
    this.micStream.getAudioTracks().forEach((t) => (t.enabled = !m));
  }

  addVoice(id, stream) {
    if (!this.ctx) return null;
    this.removeVoice(id);
    const el = new Audio(); el.srcObject = stream; el.muted = true; el.play().catch(() => {});
    const src = this.ctx.createMediaStreamSource(stream);
    const g = this.ctx.createGain(); g.gain.value = 1; // Lobby: voll hörbar, im Spiel regelt setVoice
    // Tiefpass: dumpf hinter Wänden und auf Entfernung (wie in Horror-Spielen)
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000; lp.Q.value = 0.5;
    const p = this.ctx.createPanner();
    p.panningModel = this.hq ? 'HRTF' : 'equalpower'; p.distanceModel = 'linear';
    p.refDistance = 1; p.maxDistance = 1e4; p.rolloffFactor = 0; // nur Richtung – Lautstärke regelt setVoice
    const an = this.ctx.createAnalyser(); an.fftSize = 512;
    src.connect(g); g.connect(lp); lp.connect(p); p.connect(this.voiceBus); src.connect(an);
    const v = { el, src, g, lp, p, an, buf: new Float32Array(512), level: 0 };
    this.voices.set(id, v);
    return v;
  }
  /** Proximity-Voice: pos = Mund des Sprechers, dist = Abstand zum Hörer, opts.wall = Wand dazwischen,
   *  opts.full = überall voll hörbar (Lobby/Shop/Zuschauer). */
  setVoice(id, pos, dist, opts = {}) {
    const v = this.voices.get(id); if (!v) return;
    if (v.p.positionX) { v.p.positionX.value = pos.x; v.p.positionY.value = pos.y; v.p.positionZ.value = pos.z; }
    else v.p.setPosition(pos.x, pos.y, pos.z);
    const R = VOICE_RANGE;
    let gain, cut;
    if (opts.full) { gain = 1; cut = 16000; }
    else if (opts.off) { gain = 0; cut = 16000; }
    else {
      const k = Math.min(1, Math.max(0, (dist - VOICE_NEAR) / (R - VOICE_NEAR)));
      gain = Math.pow(1 - k, 1.6) * 1.25;           // bis 2,5 m voll, bei ~32 m stumm
      cut = 16000 - k * 12500;                       // weiter weg = weniger Höhen
      if (opts.wall) { gain *= 0.45; cut = Math.min(cut, 900); }
    }
    v.g.gain.setTargetAtTime(gain, this.t, 0.12);
    v.lp.frequency.setTargetAtTime(cut, this.t, 0.15);
  }
  removeVoice(id) {
    const v = this.voices.get(id); if (!v) return;
    try { v.src.disconnect(); v.p.disconnect(); v.el.srcObject = null; } catch (e) {}
    this.voices.delete(id);
  }
}
