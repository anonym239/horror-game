// HollowEngine – Audio: alles prozedural mit WebAudio synthetisiert (keine Audiodateien nötig).
// Enthält 3D-Positionsaudio, Mikrofon-Pegelmessung und Proximity-Voice-Chat.

const rand = (a, b) => a + Math.random() * (b - a);

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
    const g = this.ctx.createGain(); g.gain.value = 1;
    const p = this.ctx.createPanner();
    p.panningModel = this.hq ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse';
    p.refDistance = 2.5; p.maxDistance = 40; p.rolloffFactor = 1.6;
    const an = this.ctx.createAnalyser(); an.fftSize = 512;
    src.connect(g); g.connect(p); p.connect(this.voiceBus); src.connect(an);
    const v = { el, src, g, p, an, buf: new Float32Array(512), level: 0 };
    this.voices.set(id, v);
    return v;
  }
  setVoice(id, pos, gain) {
    const v = this.voices.get(id); if (!v) return;
    if (v.p.positionX) { v.p.positionX.value = pos.x; v.p.positionY.value = pos.y; v.p.positionZ.value = pos.z; }
    else v.p.setPosition(pos.x, pos.y, pos.z);
    v.g.gain.setTargetAtTime(gain, this.t, 0.1);
  }
  removeVoice(id) {
    const v = this.voices.get(id); if (!v) return;
    try { v.src.disconnect(); v.p.disconnect(); v.el.srcObject = null; } catch (e) {}
    this.voices.delete(id);
  }
}
