// Spiellogik: Nächte, Quote, Beute, Monster, Tod, Shop – Host-autoritativ, Clients spiegeln.
import * as THREE from 'three';
import { LocalPlayer } from './player.js';
import { Avatar, PLAYER_CSS } from './avatar.js';
import { MonsterView, MonsterAI, MONSTER_INFO } from './monsters.js';
import { LOOT, ICONS, EXPLOSIVES, pickLootType, makeItemMesh } from './items.js';
import { Physics } from '../engine/physics.js';
import { mulberry32, clamp, damp, angleLerp } from '../engine/rng.js';
import { $, SHOP, UPG_DEFAULT, esc } from '../ui/ui.js';
import { Scares } from './scares.js';

export const NIGHT_LEN = 360;
const SNAP_DT = 1 / 15, STATE_DT = 1 / 20;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Game {
  constructor(app, opts) {
    this.app = app;
    this.engine = app.engine; this.input = app.input; this.audio = app.audio; this.ui = app.ui; this.world = app.world; this.net = app.net;
    this.mode = opts.mode;
    this.isHost = opts.mode !== 'client';
    this.myId = opts.myId;
    this.seed = opts.seed;
    this.players = new Map();
    this.items = new Map();
    this.monsters = new Map();
    this.phase = 'wait';
    this.night = 0; this.quota = 0; this.banked = 0; this.money = 0; this.timeLeft = NIGHT_LEN;
    this.upg = UPG_DEFAULT();
    this.boellers = 2; this.polen = 0;
    this.nightLen = NIGHT_LEN; this._radarT = 0;
    this.event = null;
    this.stats = { loot: 0, deaths: 0, nights: 0, best: null };
    this.danger = 0; this.scanCd = 0; this.leaveHold = 0; this.specIdx = 0;
    this.scare = null;
    this._snapT = 0; this._stateT = 0; this._snapN = 0;
    this._noises = [];
    this.nextItemId = 1;
    this.paused = false;
    this.quotaAnnounced = false;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 2.8;

    this.local = new LocalPlayer(this.engine, this.world, this.input, this.audio);
    // Vorab erzeugte Lichter (konstante Anzahl → keine Shader-Neukompilierung im Spiel)
    this.spots = [];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.SpotLight(0xfff0d8, 0, 26, 0.5, 0.5, 1.5);
      this.engine.scene.add(s, s.target);
      this.spots.push(s);
    }
    this.boomLight = new THREE.PointLight(0xffa050, 0, 40, 1.5);
    this.engine.scene.add(this.boomLight);

    opts.players.forEach((p, i) => this._addPlayer(p.id, p.name, p.color ?? i));

    if (this.isHost) {
      this.physics = new Physics(this.world);
      this.physics.onImpact = (b, v) => this._onImpact(b, v);
      this.physics.onPreStep = () => this._applyHolds();
    }
    this.scares = new Scares(this);
    this.input.onLockChange = (locked) => this._onLock(locked);
    if (this.isHost) this.startNight(1, true);
  }

  get myHoldId() { const me = this.players && this.players.get(this.myId); return me ? me.inv[me.sel] || null : null; }
  set myHoldId(v) { /* abgeleitet aus dem Inventar */ }

  // ======================= Spieler =======================
  _addPlayer(id, name, color) {
    if (this.players.has(id)) return;
    const isLocal = id === this.myId;
    const rec = {
      id, name, color, css: PLAYER_CSS[color % 4], isLocal,
      pos: isLocal ? this.local.pos : new THREE.Vector3(0, -50, 0), tPos: new THREE.Vector3(0, -50, 0),
      yaw: 0, pitch: 0, crouch: false, flash: false, alive: true, loud: 0,
      holdTarget: null, inv: [0, 0, 0], sel: 0, inVan: false, avatar: null,
    };
    if (!isLocal) {
      const spot = this.spots.find((s) => !s.userData.used);
      if (spot) spot.userData.used = true;
      rec.avatar = new Avatar(this.engine.scene, name, color, spot);
      rec.spot = spot;
      if (this.net && this.myId < id) this.net.callPeer(id);
    }
    this.players.set(id, rec);
  }

  /** Spieler tritt einem laufenden Spiel bei (nur Host). */
  addLatePlayer(id, name, color) {
    if (this.players.has(id)) return;
    this._addPlayer(id, name, color);
    const r = this.players.get(id);
    const sp = this.world.playerSpawns[(this.roster.length - 1) % 4]; // startet direkt am Van
    r.pos.set(sp.x, this.world.height(sp.x, sp.z), sp.z); r.tPos.copy(r.pos);
    this.net.broadcast({ t: 'pjoin', id, name, color });
    this.net.send(id, { t: 'start', seed: this.seed, players: this.roster.map((p) => ({ id: p.id, name: p.name, color: p.color, host: p.id === this.myId })), late: true });
    if (this.phase === 'play') this.handle({ t: 'resync' }, id);
    else if (this._phaseMsg) this.net.send(id, this._phaseMsg);
    this.ui.toast(`${esc(name)} ist beigetreten`, '#4ce07a', 2);
  }

  /** Spielerliste im Pause-Menü (Host kann kicken). */
  renderPause() {
    const list = this.roster.map((r) => ({ id: r.id, name: r.name, css: r.css, host: r.id === (this.isHost ? this.myId : this.net && this.net.hostId) }));
    this.ui.playerList($('pausePlayers'), list, this.isHost && !!this.net, this.myId, this.net ? (id, name) => this.app.kick(id, name) : null, list.length);
  }

  removePlayer(id) {
    const rec = this.players.get(id); if (!rec) return;
    if (rec.avatar) { rec.avatar.dispose(); if (rec.spot) rec.spot.userData.used = false; }
    if (this.isHost) this._hostDropAll(id);
    this.players.delete(id);
    this.audio.removeVoice(id);
    this.ui.toast(`${esc(rec.name)} hat das Spiel verlassen`, '#888');
    if (this.isHost) this.emit({ t: 'pleft', id });
  }

  get roster() { return [...this.players.values()]; }

  // ======================= Netzwerk =======================
  emit(msg) {
    if (['end', 'shop', 'over'].includes(msg.t)) this._phaseMsg = msg;
    if (msg.t === 'night') this._phaseMsg = null;
    if (this.net && this.isHost) this.net.broadcast(msg);
    this.handle(msg, this.myId);
  }

  handle(m, from) {
    switch (m.t) {
      // ---- Host empfängt ----
      case 'st': {
        if (!this.isHost) return;
        const r = this.players.get(from); if (!r) return;
        r.tPos.set(m.p[0], m.p[1], m.p[2]); r.yaw = m.y; r.pitch = m.pi; r.crouch = !!m.c; r.flash = !!m.f; r.loud = m.l || 0;
        r.holdTarget = m.h ? (r.holdTarget || new THREE.Vector3()).set(m.h[0], m.h[1], m.h[2]) : null;
        return;
      }
      case 'grab': if (this.isHost) this._hostGrab(from, m.id); return;
      case 'drop': if (this.isHost) this._hostDrop(from, m.v); return;
      case 'sel': if (this.isHost) this._hostSelect(from, m.i); return;
      case 'boeller': if (this.isHost) this._hostBoeller(m.p, m.v, m.k === 'polen' ? 'polen' : 'boeller'); return;
      case 'buy': if (this.isHost) this._hostBuy(m.k); return;
      case 'leave': if (this.isHost && this._allInVan()) this.endNight('leave'); return;
      case 'resync': {
        if (!this.isHost || this.phase !== 'play') return;
        const items = [...this.items.values()].filter((it) => !it.def.tool).map((it) => [it.id, it.type, it.value, it.body.position.x, it.body.position.y, it.body.position.z]);
        this.net.send(from, { t: 'night', n: this.night, quota: this.quota, event: this.event, items, money: this.money, upg: this.upg, boellers: this.boellers, polen: this.polen, nightLen: this.nightLen, stats: this.stats });
        return;
      }

      // ---- alle ----
      case 'night': this._onNight(m); return;
      case 'snap': if (!this.isHost) this._onSnap(m); return;
      case 'kill': this._onKill(m); return;
      case 'dep': this._onDeposit(m); return;
      case 'imp': {
        _v.set(m.x, m.y, m.z);
        this.audio.impact(_v, m.s, m.snd === 'soft' ? 'wood' : m.snd);
        if (m.d > 0) this.ui.float(`−${m.d} $`, _v, '#ff5a4a', 1.2);
        return;
      }
      case 'spawn': this._createItem(...m.item); if (EXPLOSIVES[m.item[1]]) this.audio.fuse(new THREE.Vector3(m.item[3], m.item[4], m.item[5])); return;
      case 'rm': this._removeItem(m.id); return;
      case 'ev': {
        _v.set(m.x || 0, m.y || 0, m.z || 0);
        if (m.k === 'boom') {
          const pw = m.pw || 1, d = this.local.pos.distanceTo(_v);
          if (pw > 1) this.audio.bigBoom(_v.clone()); else this.audio.boom(_v.clone());
          this.boomLight.position.copy(_v).y += 1 + pw * 0.3;
          this.boomLight.intensity = 80 * pw; this.boomLight.distance = 40 * Math.sqrt(pw);
          if (d < 12 * Math.sqrt(pw)) this.local.shake = Math.min(1, 0.6 * Math.sqrt(pw));
          if (pw > 1 && d < 30) this.ui.flash(Math.max(0.15, 0.7 - d / 45));
          if (pw > 1 && m.n) this.ui.toast(`💥 ${m.n} Monster verscheucht!`, '#ff8a4a', 2);
        } else if (m.k === 'roar') {
          this.audio.tone(70, 40, 1.2, 0.5, 'sawtooth', 0, _v.clone());
          this.audio.tone(140, 60, 1.0, 0.3, 'sawtooth', 0.05, _v.clone());
        } else if (m.k === 'snag' && m.id === this.myId) {
          this.ui.toast('Losgelassen – hängen geblieben!', '#ff8a4a', 1.4);
        } else if (m.k === 'full' && m.id === this.myId) {
          this.audio.denied(); this.ui.toast('Inventar voll (3/3)', '#ff5a4a', 1.4);
        }
        return;
      }
      case 'end': this._onEnd(m.res); return;
      case 'shop': this._onShop(m); return;
      case 'over': if (this.phase !== 'over') this._onOver(m); return;
      case 'pleft': if (!this.isHost) this.removePlayer(m.id); return;
      case 'pjoin': if (!this.isHost && m.id !== this.myId) { this._addPlayer(m.id, m.name, m.color); this.ui.toast(`${esc(m.name)} ist beigetreten`, '#4ce07a', 2); } return;
      case 'kicked': if (!this.isHost) this.app.kicked(); return;
    }
  }

  _onSnap(m) {
    for (const s of m.p) {
      const [id, x, y, z, yaw, pitch, c, f, a, inv, sel] = s;
      const r = this.players.get(id); if (!r) continue;
      if (r.isLocal) {
        if (!a && this.local.alive && !this.scare) { this.local.alive = false; }
        r.alive = !!a;
        if (inv && inv.join() !== r.inv.join()) { r.inv = inv.slice(); r.sel = sel; }
        continue;
      }
      r.tPos.set(x, y, z); r.yaw = yaw; r.pitch = pitch; r.crouch = !!c; r.flash = !!f; r.alive = !!a; if (inv) { r.inv = inv; r.sel = sel; }
      if (r.pos.y < -40) r.pos.copy(r.tPos);
    }
    const seen = new Set();
    for (const s of m.m) {
      const [id, type, x, y, z, ry, anim, extra] = s;
      seen.add(id);
      let mo = this.monsters.get(id);
      if (!mo) {
        mo = { view: new MonsterView(type, this.engine.scene, this.audio), t: { x, y, z, ry, anim, extra } };
        mo.view.setState(x, y, z, ry, anim, extra);
        this.monsters.set(id, mo);
      }
      mo.t = { x, y, z, ry, anim, extra };
    }
    if (!m.part) for (const [id, mo] of this.monsters) if (!seen.has(id)) { mo.view.dispose(this.engine.scene); this.monsters.delete(id); }
    for (const s of m.i) {
      const it = this.items.get(s[0]); if (!it) continue;
      it.tp.set(s[1], s[2], s[3]); it.tq.set(s[4], s[5], s[6], s[7]); it.value = s[8]; it.heldBy = s[9] || null; it.inHand = !!s[10];
    }
    const g = m.g;
    if (g[5] && g[5] !== this.night && performance.now() - (this._resyncAt || 0) > 2000) { this._resyncAt = performance.now(); this.net.toHost({ t: 'resync' }); }
    this.timeLeft = g[0]; this.banked = g[1]; this.quota = g[2]; this.money = g[3]; this.boellers = g[4]; this.polen = g[6] || 0;
  }

  _sendSnapshot() {
    const r2 = (v) => Math.round(v * 100) / 100;
    const full = this._snapN++ % 30 === 0;
    const items = [];
    for (const it of this.items.values()) {
      const b = it.body;
      if (!full && b.sleepState === 2 && !it.dirty) continue;
      it.dirty = false;
      const p = b.position, q = b.quaternion;
      items.push([it.id, r2(p.x), r2(p.y), r2(p.z), r2(q.x), r2(q.y), r2(q.z), r2(q.w), it.value, it.heldBy || 0, it.inHand ? 1 : 0]);
    }
    this.net.broadcast({
      t: 'snap',
      p: this.roster.map((r) => [r.id, r2(r.pos.x), r2(r.pos.y), r2(r.pos.z), r2(r.yaw), r2(r.pitch), r.crouch ? 1 : 0, r.flash ? 1 : 0, r.alive ? 1 : 0, r.inv, r.sel]),
      m: [...this.monsters.values()].map((mo) => mo.ai.snapshot()),
      i: items,
      g: [Math.round(this.timeLeft), this.banked, this.quota, this.money, this.boellers, this.night, this.polen],
    });
  }

  // ======================= Nacht-Ablauf =======================
  startNight(n, fresh = false) {
    if (fresh) {
      this.money = 0; this.upg = UPG_DEFAULT(); this.boellers = 2; this.polen = 0;
      this.stats = { loot: 0, deaths: 0, nights: 0, best: null };
    }
    const rnd = mulberry32(this.seed + n * 977 + Math.floor(Math.random() * 1e6));
    const np = this.players.size;
    const quota = Math.round(((200 + 190 * (n - 1) + 45 * (n - 1) ** 2) * (1 + 0.45 * (np - 1)) * (1 - 0.1 * (this.upg.quota || 0))) / 10) * 10;
    const nightLen = NIGHT_LEN + 45 * (this.upg.overtime || 0);
    let event = null;
    if (n >= 2 && rnd() < 0.3) event = rnd() < 0.5 ? 'bloodmoon' : 'fog';
    const spots = this.world.lootSpots.slice();
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    const count = Math.min(spots.length, 15 + 3 * n + 4 * (np - 1));
    const valueMul = (1 + 0.1 * (n - 1)) * (event === 'bloodmoon' ? 1.5 : 1);
    const items = [];
    this.nextItemId = 1;
    // Altar bekommt immer etwas Besonderes
    spots.sort((a, b) => (b.kind === 'altar') - (a.kind === 'altar'));
    for (let i = 0; i < count; i++) {
      const s = spots[i];
      const type = pickLootType(rnd, s.kind);
      const d = LOOT[type];
      const v = Math.round((d.val[0] + (d.val[1] - d.val[0]) * rnd()) * valueMul);
      items.push([this.nextItemId++, type, v, s.x, s.y + 0.25, s.z]);
    }
    const plan = ['stalker'];
    if (n >= 2) plan.push('doll');
    if (n >= 3) plan.push('stalker');
    if (n >= 4) plan.push('crawler');
    if (n >= 6) plan.push('crawler');
    if (n >= 7) plan.push('stalker');
    if (event === 'bloodmoon') plan.push('stalker');
    this.emit({ t: 'night', n, quota, event, items, money: this.money, upg: this.upg, boellers: this.boellers, polen: this.polen, nightLen, stats: this.stats });
    // Monster (nur Host-KI)
    const ms = this.world.monsterSpawns.slice();
    plan.forEach((type, i) => {
      const sp = ms[Math.floor(rnd() * ms.length)];
      const ai = new MonsterAI(type, sp.x, sp.z, this.world, n, rnd);
      ai.activeIn += i * 25;
      const view = new MonsterView(type, this.engine.scene, this.audio);
      this.monsters.set(ai.id, { ai, view });
    });
  }

  _clearNight() {
    for (const it of [...this.items.keys()]) this._removeItem(it);
    for (const mo of this.monsters.values()) mo.view.dispose(this.engine.scene);
    this.monsters.clear();
    this.myHoldId = null;
    this.ui.clearLabels();
  }

  _onNight(m) {
    this._clearNight();
    this.nightLen = m.nightLen || NIGHT_LEN;
    this.night = m.n; this.quota = m.quota; this.event = m.event; this.banked = 0; this.timeLeft = this.nightLen;
    this.money = m.money; this.upg = { ...UPG_DEFAULT(), ...m.upg }; this.boellers = m.boellers; this.polen = m.polen || 0;
    if (m.stats) this.stats = { ...m.stats };
    this.quotaAnnounced = false; this._deadT = 0;
    for (const it of m.items) this._createItem(...it);
    this.world.setEvent(m.event);
    const idx = this.roster.findIndex((r) => r.isLocal);
    const sp = this.world.playerSpawns[Math.max(0, idx) % 4];
    this.local.upg = this.upg;
    this.local.spawn(sp.x, sp.z);
    for (const r of this.players.values()) { r.alive = true; r.inv = [0, 0, 0]; r.sel = 0; r.holdTarget = null; }
    this.scare = null; this.engine.fx.scare = 0; this.engine.fx.hurt = 0;
    this.phase = 'play';
    this.ui.modal('shop', false); this.ui.modal('endcard', false); this.ui.modal('gameover', false);
    $('death').classList.add('hidden');
    this.ui.hud(true);
    this.ui.fade(false);
    // Intro-Karte
    $('introNight').textContent = 'NACHT ' + m.n;
    $('introQuota').textContent = `Quote: ${m.quota} $  ·  bis 04:00 Uhr`;
    const newM = m.n === 1 ? 'stalker' : m.n === 2 ? 'doll' : m.n === 4 ? 'crawler' : null;
    let hint = newM ? `${MONSTER_INFO[newM].name}: ${MONSTER_INFO[newM].desc}` : '';
    if (m.event === 'bloodmoon') hint = '🩸 BLUTMOND – Beute ist mehr wert, aber sie sind zahlreicher. ' + hint;
    if (m.event === 'fog') hint = '🌫️ DICHTER NEBEL – ihr seht kaum etwas. ' + hint;
    $('introMonster').textContent = hint;
    $('hudEvent').textContent = m.event === 'bloodmoon' ? 'BLUTMOND' : m.event === 'fog' ? 'NEBEL' : '';
    const intro = $('intro');
    intro.classList.remove('hidden');
    intro.querySelectorAll('div').forEach((d) => { d.style.animation = 'none'; void d.offsetWidth; d.style.animation = ''; });
    clearTimeout(this._introTO);
    this._introTO = setTimeout(() => intro.classList.add('hidden'), 5000);
    if (m.n === 1) this._tips();
    this.audio.stopShopMusic();
    this.world.setParty(true);
    this.audio.startPartyMusic(new THREE.Vector3(this.world.van.x, this.world.height(this.world.van.x, this.world.van.z) + 1.4, this.world.van.z - 0.6));
    this.audio.startAmbience(1);
    this.audio.engine(new THREE.Vector3(this.world.van.x, this.local.pos.y + 1, this.world.van.z));
    if (!this.input.locked) this.input.lock();
  }

  _tips() {
    const tips = [
      [7, '💡 <b>Q</b> = Scanner: zeigt Beute in der Nähe mit Wert'],
      [16, '💡 <b>E</b> aufheben · <b>1 2 3</b> Slot wählen · <b>G</b> ablegen · <b>Klick</b> werfen'],
      [26, '💡 Alles in die <b style="color:#ffb547">gelbe Zone am Van</b> legen. Dort lädt auch die Taschenlampe.'],
      [38, '💡 <b>Leise sein!</b> Sprinten, Stöße und dein Mikrofon locken den Blassen an.'],
    ];
    clearTimeout(this._tipTO);
    const run = (i) => {
      if (i >= tips.length) return;
      this._tipTO = setTimeout(() => { if (this.phase === 'play' && this.night === 1 && !this.disposed) this.ui.toast(tips[i][1], '#6ad1ff', 5); run(i + 1); }, (tips[i][0] - (i ? tips[i - 1][0] : 0)) * 1000);
    };
    run(0);
  }

  endNight(reason) {
    if (this.phase !== 'play') return;
    this.phase = 'end';
    const lost = [], dead = [];
    for (const r of this.players.values()) {
      if (!r.alive) dead.push(r.name);
      else if (reason !== 'leave' && !r.inVan) { r.alive = false; lost.push(r.name); }
    }
    const success = this.banked >= this.quota;
    if (success) this.stats.nights++;
    const res = { reason, success, banked: this.banked, quota: this.quota, night: this.night, lost, dead, money: this.money, stats: this.stats };
    this.emit({ t: 'end', res });
    setTimeout(() => {
      if (this.disposed) return;
      if (success) this.emit({ t: 'shop', money: this.money, upg: this.upg, boellers: this.boellers, polen: this.polen });
      else this.emit({ t: 'over', stats: this.stats, night: this.night });
    }, 5500);
  }

  _onEnd(res) {
    const first = this.phase !== 'end'; // Host sendet Phasen-Nachrichten wiederholt → Sounds nur einmal
    this.phase = 'end';
    this.audio.stopAmbience(); this.audio.setDanger(0);
    this.engine.fx.danger = 0;
    this.myHoldId = null;
    this.scare = null; this.engine.fx.scare = 0;
    $('death').classList.add('hidden');
    $('endTitle').textContent = res.success ? `NACHT ${res.night} ÜBERSTANDEN` : 'QUOTE VERFEHLT';
    $('endTitle').className = res.success ? '' : 'red';
    const why = res.reason === 'leave' ? 'Ihr seid rechtzeitig abgefahren.' : res.reason === 'dead' ? 'Niemand hat überlebt …' : 'Um 04:00 fuhr der Van ab.';
    let html = `<div class="${res.success ? 'big-ok' : 'big-bad'}">${why}</div>`;
    html += `<div class="row"><span>Abgeliefert</span><b>${res.banked} $</b></div>`;
    html += `<div class="row"><span>Quote</span><b>${res.quota} $</b></div>`;
    if (res.dead.length) html += `<div class="row"><span>Gestorben</span><span class="red">${res.dead.map(esc).join(', ')}</span></div>`;
    if (res.lost.length) html += `<div class="row"><span>Zurückgelassen</span><span class="red">${res.lost.map(esc).join(', ')}</span></div>`;
    if (res.success) html += `<p class="hint">Alle Toten sind nächste Nacht wieder dabei. Gleich geht's zum Shop …</p>`;
    $('endBody').innerHTML = html;
    this.ui.modal('endcard', true);
    this.ui.hud(false);
    this.input.unlock();
    this.world.setParty(false);
    this.audio.stopPartyMusic();
    // Van fährt los (Abfahrt oder 04:00) → Motor-Sound; geschaffter Tag → Fanfare
    if (!first) return;
    if (res.reason !== 'dead') this.audio.vanDriveAway();
    if (res.success) { clearTimeout(this._fanfareTO); this._fanfareTO = setTimeout(() => !this.disposed && this.audio.dayComplete(), res.reason !== 'dead' ? 1800 : 200); }
  }

  _onShop(m) {
    const paid = this.phase === 'shop' && m.money < this.money;
    this.phase = 'shop';
    this.money = m.money; this.upg = { ...UPG_DEFAULT(), ...m.upg }; this.boellers = m.boellers; this.polen = m.polen || 0;
    this.ui.modal('endcard', false);
    this.ui.modal('shop', true);
    this.ui.shop(this.money, this.upg, { boellers: this.boellers, polen: this.polen }, this.night, this.isHost, (k) => this.buy(k));
    if (paid) this.audio.cash();
    this.audio.startShopMusic();
    this.input.unlock();
  }

  buy(k) {
    if (this.isHost) this._hostBuy(k); else this.net.toHost({ t: 'buy', k });
  }
  _hostBuy(k) {
    if (this.phase !== 'shop') return;
    const it = SHOP.find((s) => s.k === k); if (!it || it.day > this.night) return; // noch nicht freigeschaltet
    const lvl = it.consumable ? 0 : this.upg[k] || 0;
    const price = it.price(lvl);
    if (this.money < price || (!it.consumable && lvl >= it.max)) return;
    this.money -= price;
    if (it.consumable) this[it.store] += it.add; else this.upg[k] = lvl + 1;
    this.emit({ t: 'shop', money: this.money, upg: this.upg, boellers: this.boellers, polen: this.polen, bought: k });
  }

  nextNight() { if (this.isHost && this.phase === 'shop') this.startNight(this.night + 1); }

  _onOver(m) {
    this.phase = 'over';
    this.audio.stopShopMusic();
    this.ui.modal('endcard', false);
    const s = m.stats;
    const best = this.app.saveStats(m.night, s.loot);
    $('overBody').innerHTML = `
      <div class="big-bad">Ihr habt bis Nacht ${m.night} durchgehalten.</div>
      <div class="row"><span>Überstandene Nächte</span><b>${s.nights}</b></div>
      <div class="row"><span>Gesamte Beute</span><b>${s.loot} $</b></div>
      <div class="row"><span>Tode im Team</span><b>${s.deaths}</b></div>
      ${s.best ? `<div class="row"><span>Bester Fund</span><b>${esc(s.best.name)} (${s.best.v} $)</b></div>` : ''}
      <div class="row"><span>Dein Rekord</span><b>Nacht ${best.bestNight}</b></div>`;
    $('btnRetry').style.display = this.isHost ? '' : 'none';
    this.ui.modal('gameover', true);
    this.input.unlock();
  }

  retry() { if (this.isHost) { this.ui.modal('gameover', false); this.startNight(1, true); } }

  // ======================= Gegenstände =======================
  _createItem(id, type, value, x, y, z) {
    if (this.items.has(id)) return;
    const def = LOOT[type];
    const mesh = makeItemMesh(type);
    mesh.position.set(x, y, z);
    this.engine.scene.add(mesh);
    mesh.traverse((o) => { o.userData.itemId = id; });
    const it = { id, type, def, value, max: value, mesh, heldBy: null, tp: new THREE.Vector3(x, y, z), tq: new THREE.Quaternion(), lastHit: 0, fuse: EXPLOSIVES[type] ? EXPLOSIVES[type].fuse : 0, dirty: true };
    if (this.isHost) it.body = this.physics.addItem(def.shape, def.mass, { x, y, z }, it);
    if (type === 'idol') {
      const glow = new THREE.PointLight(0xffc040, 0, 3);
      void glow; // (kein Extra-Licht: konstante Lichtanzahl)
    }
    this.items.set(id, it);
    if (id >= this.nextItemId) this.nextItemId = id + 1;
    return it;
  }

  _removeItem(id) {
    const it = this.items.get(id); if (!it) return;
    this.engine.scene.remove(it.mesh);
    it.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (it.body && it.inWorld !== false) this.physics.remove(it.body);
    for (const r of this.players.values()) r.inv = r.inv.map((x) => (x === id ? 0 : x));
    this.items.delete(id);
  }

  // ---------- Inventar (3 Slots) – nur Host verändert, Clients spiegeln ----------
  _bodyIn(it, on, pos) {
    if (!it.body) return;
    if (on && it.inWorld === false) {
      if (pos) it.body.position.set(pos.x, pos.y, pos.z);
      it.body.velocity.set(0, 0, 0); it.body.angularVelocity.set(0, 0, 0);
      this.physics.w.addBody(it.body); it.inWorld = true; it.body.wakeUp();
    } else if (!on && it.inWorld !== false) { this.physics.remove(it.body); it.inWorld = false; }
  }

  _syncHands(r) {
    for (let j = 0; j < 3; j++) {
      const it = this.items.get(r.inv[j]);
      if (!it) { r.inv[j] = 0; continue; }
      it.heldBy = r.id; it.inHand = j === r.sel; it.dirty = true;
      const hand = r.holdTarget || { x: r.pos.x, y: r.pos.y + 1.3, z: r.pos.z };
      this._bodyIn(it, it.inHand, hand);
    }
  }

  _hostGrab(pid, id) {
    const it = this.items.get(id), r = this.players.get(pid);
    if (!it || !r || !r.alive || this.phase !== 'play') return;
    if (it.heldBy && it.heldBy !== pid) {
      const h = this.players.get(it.heldBy);
      if (h && h.alive) return;
      h && (h.inv = h.inv.map((x) => (x === id ? 0 : x)));
    }
    if (r.inv.includes(id)) return;
    let slot = r.inv[r.sel] ? r.inv.findIndex((x) => !x) : r.sel;
    if (slot < 0) { this.emit({ t: 'ev', k: 'full', id: pid }); return; }
    r.inv[slot] = id; r.sel = slot;
    this._syncHands(r);
  }

  _hostSelect(pid, i) {
    const r = this.players.get(pid); if (!r || i < 0 || i > 2) return;
    r.sel = i; this._syncHands(r);
  }

  /** aktiven Slot fallenlassen / werfen */
  _hostDrop(pid, vel) {
    const r = this.players.get(pid); if (!r) return;
    const it = this.items.get(r.inv[r.sel]);
    r.inv[r.sel] = 0;
    if (!it) return;
    it.heldBy = null; it.inHand = false; it.dirty = true;
    this._bodyIn(it, true, r.holdTarget || { x: r.pos.x, y: r.pos.y + 1.2, z: r.pos.z });
    if (vel) it.body.velocity.set(vel[0], vel[1], vel[2]);
    else it.body.velocity.scale(0.3, it.body.velocity);
    it.body.wakeUp();
  }

  /** alles fallenlassen (Tod / Verlassen) */
  _hostDropAll(pid) {
    const r = this.players.get(pid); if (!r) return;
    r.inv.forEach((id, j) => {
      const it = this.items.get(id); if (!it) return;
      it.heldBy = null; it.inHand = false; it.dirty = true;
      this._bodyIn(it, true, { x: r.pos.x + (j - 1) * 0.4, y: r.pos.y + 0.8 + j * 0.3, z: r.pos.z });
    });
    r.inv = [0, 0, 0];
  }

  _applyHolds() {
    for (const it of this.items.values()) {
      if (!it.heldBy || !it.inHand) continue;
      const r = this.players.get(it.heldBy);
      if (!r || !r.alive) continue;
      if (!r.holdTarget) continue; // Ziel kommt im nächsten Frame
      const b = it.body, t = r.holdTarget;
      const dx = t.x - b.position.x, dy = t.y - b.position.y, dz = t.z - b.position.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 3.4) { // hängen geblieben → zurück in die Hand teleportieren statt verlieren
        b.position.set(t.x, t.y, t.z); b.velocity.set(0, 0, 0);
        continue;
      }
      const k = 16 / (1 + it.def.mass / 14);
      let vx = dx * k, vy = dy * k, vz = dz * k;
      const sp = Math.hypot(vx, vy, vz);
      if (sp > 15) { vx *= 15 / sp; vy *= 15 / sp; vz *= 15 / sp; }
      b.velocity.set(vx, vy, vz);
      b.angularVelocity.scale(0.82, b.angularVelocity);
      b.wakeUp();
      it.dirty = true;
    }
  }

  _onImpact(body, v) {
    const it = body.userData; if (!it || !this.items.has(it.id)) return;
    const now = performance.now();
    if (now - it.lastHit < 140) return;
    it.lastHit = now;
    let dmg = 0;
    if (it.def.fragile > 0 && v > 3.2 && it.value > 0) {
      dmg = Math.min(it.value, Math.round((v - 3.2) * it.def.fragile * it.max * 0.07 * (1 - 0.3 * (this.upg.padding || 0))));
      it.value -= dmg; it.dirty = true;
    }
    const p = body.position;
    this._noises.push({ x: p.x, z: p.z, r: Math.min(34, v * 3.4) });
    this.emit({ t: 'imp', x: p.x, y: p.y, z: p.z, s: Math.min(v, 12), snd: it.def.sound, d: dmg });
  }

  _hostBoeller(p, v, kind = 'boeller') {
    const store = kind === 'polen' ? 'polen' : 'boellers';
    if (this[store] <= 0 || this.phase !== 'play') return;
    this[store]--;
    const id = this.nextItemId++;
    const item = [id, kind, 0, p[0], p[1], p[2]];
    this.emit({ t: 'spawn', item });
    const it = this.items.get(id);
    if (it) { it.body.velocity.set(v[0], v[1], v[2]); it.body.angularVelocity.set(Math.random() * 8, Math.random() * 8, 0); }
  }

  _onDeposit(m) {
    _v.set(m.x, m.y + 0.5, m.z);
    this._removeItem(m.id);
    if (!this.isHost) { this.banked += m.v; this.money += m.v; }
    this.audio.cash();
    this.ui.float(`+${m.v} $`, _v, '#4ce07a', 2);
    this.ui.toast(`<b style="color:#4ce07a">+${m.v} $</b> &nbsp;${esc(m.n)} abgeliefert`, '#4ce07a', 2);
    if (!this.quotaAnnounced && this.banked >= this.quota) {
      this.quotaAnnounced = true;
      this.ui.toast('✔ QUOTE ERFÜLLT! Sammelt weiter oder fahrt los (H am Van).', '#4ce07a', 5);
      this.audio.tone(523, 523, 0.2, 0.15, 'triangle'); this.audio.tone(659, 659, 0.2, 0.15, 'triangle', 0.15); this.audio.tone(784, 784, 0.5, 0.15, 'triangle', 0.3);
    }
  }

  _hostItems(dt) {
    const w = this.world;
    for (const it of [...this.items.values()]) {
      const b = it.body;
      const ex = EXPLOSIVES[it.type];
      if (ex) {
        it.fuse -= dt;
        if (it.fuse <= 0) {
          const bx = b.position.x, bz = b.position.z;
          this._noises.push({ x: bx, z: bz, r: ex.noise });
          this._boomAt = { x: bx, z: bz, t: 9, r: ex.noise };
          // Polenböller: Druckwelle verscheucht Monster im Umkreis
          let n = 0;
          if (ex.power > 1) for (const mo of this.monsters.values()) if (mo.ai.blast(bx, bz, 18)) n++;
          this.emit({ t: 'ev', k: 'boom', x: bx, y: b.position.y, z: bz, pw: ex.power, n });
          this.emit({ t: 'rm', id: it.id });
        }
        continue;
      }
      if (!it.heldBy && w.inVanZone(b.position.x, b.position.z) && b.position.y < w.height(b.position.x, b.position.z) + 2.2) {
        it.value = Math.round(it.value * (1 + 0.1 * (this.upg.haggle || 0))); // Crane-Deal
        this.banked += it.value; this.money += it.value; this.stats.loot += it.value;
        if (!this.stats.best || it.value > this.stats.best.v) this.stats.best = { name: it.def.name, v: it.value };
        this.emit({ t: 'dep', id: it.id, v: it.value, n: it.def.name, x: b.position.x, y: b.position.y, z: b.position.z });
      }
    }
    // Spieler schubsen Gegenstände
    for (const r of this.players.values()) {
      if (!r.alive) continue;
      for (const it of this.items.values()) {
        if (it.heldBy) continue;
        const b = it.body;
        const dx = b.position.x - r.pos.x, dz = b.position.z - r.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.36 && b.position.y > r.pos.y - 0.2 && b.position.y < r.pos.y + 1.0) {
          const d = Math.sqrt(d2) || 0.01;
          const push = Math.min(3, 2 / (it.def.mass * 0.4 + 0.5));
          b.velocity.x += (dx / d) * push * dt * 20; b.velocity.z += (dz / d) * push * dt * 20;
          b.wakeUp(); it.dirty = true;
        }
      }
    }
  }

  // ======================= Tod & Jumpscare =======================
  _hostKill(p, ai) {
    if (!p.alive || p.safe) return; // Safe-Zone im Van
    p.alive = false;
    this._hostDropAll(p.id);
    this.stats.deaths++;
    this.emit({ t: 'kill', id: p.id, m: ai.id, x: p.pos.x, y: p.pos.y, z: p.pos.z });
  }

  _onKill(m) {
    const r = this.players.get(m.id);
    if (r) r.alive = false;
    if (m.id === this.myId) {
      this.local.alive = false;
      this.myHoldId = null;
      const mo = this.monsters.get(m.m);
      this.scare = { t: 0, mo };
      if (mo) mo.view.forceAnim = 3;
      this.audio.screech();
      $('intro').classList.add('hidden');
      this.ui.flash(1);
      this.engine.fx.scare = 1;
      this.ui.hud(false);
    } else {
      this.audio.scream(new THREE.Vector3(m.x, m.y + 1.5, m.z));
      if (r) this.ui.toast(`☠ ${esc(r.name)} wurde geholt …`, '#c0141e', 3);
    }
  }

  _updateScare(dt) {
    const s = this.scare;
    s.t += dt;
    const cam = this.engine.camera;
    if (s.mo) {
      const v = s.mo.view;
      v.head.getWorldPosition(_v);
      const fx = Math.sin(v.ry), fz = Math.cos(v.ry);
      // Monster springt auf die Kamera zu, Gesicht bleibt komplett sichtbar
      const big = v.type === 'doll' ? 0.85 : v.crawler ? 0.9 : 1.15;
      const dist = Math.max(big * 0.62, big * 1.7 - s.t * 2.2);
      const sh = s.t < 1.2 ? 0.06 : 0.02;
      cam.position.set(_v.x + fx * dist + (Math.random() - 0.5) * sh, _v.y + 0.05 + (Math.random() - 0.5) * sh, _v.z + fz * dist);
      cam.lookAt(_v.x, _v.y - 0.05, _v.z);
      this.local.flash.intensity = Math.random() < 0.2 ? 1 : 9;
    }
    this.engine.fx.scare = Math.max(0, 1 - s.t / 2.2);
    if (s.t > 1.6 && s.t - dt <= 1.6) this.ui.fade(true);
    if (s.t > 2.6) {
      if (s.mo) s.mo.view.forceAnim = null;
      this.scare = null;
      this.engine.fx.scare = 0;
      this.ui.fade(false);
      if (this.phase === 'play') {
        $('death').classList.remove('hidden');
        $('deathSub').textContent = this.roster.some((r) => r.alive) ? 'Du beobachtest die anderen. Klick = nächster Spieler.' : '';
        this.ui.hud(true);
      }
    }
  }

  _spectate(dt) {
    const alive = this.roster.filter((r) => r.alive && !r.isLocal);
    const cam = this.engine.camera;
    if (this.input.click(0)) this.specIdx++;
    if (!alive.length) {
      const v = this.world.vanZone;
      cam.position.set(v.x - 6, v.y + 6, v.z + 10); cam.lookAt(v.x, v.y, v.z);
      return;
    }
    const t = alive[this.specIdx % alive.length];
    _v.set(t.pos.x + Math.sin(t.yaw) * 3.2, t.pos.y + 2.3, t.pos.z + Math.cos(t.yaw) * 3.2);
    const free = this.world.collision.lineOfSight({ x: t.pos.x, y: t.pos.y + 1.7, z: t.pos.z }, _v);
    if (!free) _v.set(t.pos.x + Math.sin(t.yaw) * 0.8, t.pos.y + 2.0, t.pos.z + Math.cos(t.yaw) * 0.8);
    cam.position.lerp(_v, 1 - Math.exp(-6 * dt));
    cam.lookAt(t.pos.x, t.pos.y + 1.5, t.pos.z);
    $('deathSub').textContent = `Du beobachtest ${t.name}. Klick = nächster Spieler.`;
  }

  // ======================= Interaktion =======================
  _interact(dt) {
    const inp = this.input, cam = this.engine.camera, p = this.local;
    let prompt = '';
    let aim = false;
    if (inp.hit('KeyM') && this.audio.micStream) {
      this.micMuted = !this.micMuted; this.audio.setMicMuted(this.micMuted);
      this.ui.toast(this.micMuted ? '🔇 Mikrofon stumm' : '🎤 Mikrofon an', '#888', 1.2);
    }
    if (!p.alive || this.phase !== 'play') { this.ui.set('prompt', 'html', ''); this.ui.set('crosshair', 'class:active', false); p.carryMass = 0; return; }
    if (this.scanCd > 0) this.scanCd -= dt;
    if (inp.hit('KeyQ') && this.scanCd <= 0) this._scan();
    if (inp.hit('KeyB')) this._throwBoeller('boeller');
    if (inp.hit('KeyV')) this._throwBoeller('polen');
    const me = this.players.get(this.myId);

    // Slot-Wahl wie in Minecraft: 1/2/3 oder Mausrad
    let ns = me.sel;
    if (inp.hit('Digit1')) ns = 0;
    if (inp.hit('Digit2')) ns = 1;
    if (inp.hit('Digit3')) ns = 2;
    if (inp.wheel) ns = (ns + (inp.wheel > 0 ? 1 : 2)) % 3;
    if (ns !== me.sel) this._select(ns);

    const hand = this.items.get(me.inv[me.sel]);
    const target = _v2.copy(cam.position).addScaledVector(p.forward, 1.45);
    target.y -= 0.22;
    me.holdTarget = (me.holdTarget || new THREE.Vector3()).copy(target);
    p.carryMass = me.inv.reduce((s, id) => { const it = this.items.get(id); return s + (it ? it.def.mass * (id === me.inv[me.sel] ? 1 : 0.5) : 0); }, 0);

    const look = this._lookItem();
    if (look) {
      aim = true;
      const tags = [];
      if (look.def.fragile >= 0.8) tags.push('zerbrechlich');
      if (look.def.mass >= 6) tags.push('schwer');
      const full = me.inv.every((x) => x);
      prompt = full ? `<span style="color:#ff5a4a">Inventar voll (3/3)</span> – erst etwas ablegen [G]`
        : look.def.tool ? `[E] ${look.def.name} aufheben` : `[E] <b>${look.def.name}</b> — ${look.value} $${tags.length ? ' · ' + tags.join(', ') : ''}`;
      if (inp.hit('KeyE')) { if (full) this.audio.denied(); else this._grab(look.id); }
    } else if (hand) {
      prompt = `<b>${hand.def.name}</b> ${hand.value} $ · [G] Ablegen · [Klick] Werfen`;
    }
    if (hand && inp.hit('KeyG')) this._drop(null);
    if (hand && inp.click(0)) {
      const f = p.forward, sp = Math.min(13, 15 / Math.sqrt(hand.def.mass));
      this._drop([f.x * sp + p.vel.x, f.y * sp + 2 + p.vel.y * 0.5, f.z * sp + p.vel.z]);
      this.audio.tone(300, 180, 0.12, 0.1, 'triangle');
    }

    // Abfahren
    if (this._allInVan() && this.local.alive) {
      if (!prompt) prompt = this.banked >= this.quota ? '[H halten] Abfahren – Quote erfüllt ✔' : `[H halten] Abfahren – <span style="color:#ff5a4a">Quote fehlt noch ${this.quota - this.banked} $</span>`;
      if (inp.down('KeyH')) {
        this.leaveHold += dt;
        if (this.leaveHold > 1.6) {
          this.leaveHold = 0;
          if (this.isHost) this.endNight('leave'); else this.net.toHost({ t: 'leave' });
        }
      } else this.leaveHold = 0;
    } else this.leaveHold = 0;
    $('leaveProg').classList.toggle('hidden', this.leaveHold <= 0);
    if (this.leaveHold > 0) $('leaveProg').firstElementChild.style.width = Math.min(100, this.leaveHold / 1.6 * 100) + '%';

    this.ui.set('prompt', 'html', prompt);
    this.ui.set('crosshair', 'class:active', aim);
  }

  _allInVan() {
    const alive = this.roster.filter((r) => r.alive);
    return alive.length > 0 && alive.every((r) => this.world.inVanZone(r.pos.x, r.pos.z, 3));
  }

  /** Gegenstand unter dem Fadenkreuz – oder der nächste im engen Blickkegel (leichteres Zielen) */
  _lookItem() {
    const cam = this.engine.camera, col = this.world.collision;
    this.raycaster.setFromCamera({ x: 0, y: 0 }, cam);
    const meshes = [];
    for (const it of this.items.values()) if (!it.heldBy) meshes.push(it.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    const d = this.raycaster.ray.direction;
    if (hits.length) {
      const h = hits[0], it = this.items.get(h.object.userData.itemId);
      if (it && col.raycast(cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, h.distance) >= h.distance - 0.45) return it; // Regal-/Tischkanten nicht als Wand werten
    }
    let best = null, bestDot = 0.975;
    for (const it of this.items.values()) {
      if (it.heldBy) continue;
      _v.subVectors(it.mesh.position, cam.position);
      const dist = _v.length();
      if (dist > 2.7 || dist < 0.05) continue;
      _v.divideScalar(dist);
      const dot = _v.dot(d);
      if (dot > bestDot && col.raycast(cam.position.x, cam.position.y, cam.position.z, _v.x, _v.y, _v.z, dist) >= dist - 0.45) { bestDot = dot; best = it; }
    }
    return best;
  }

  _grab(id) {
    this.audio.pickup();
    if (this.isHost) this._hostGrab(this.myId, id); else this.net.toHost({ t: 'grab', id });
  }
  _select(i) {
    const me = this.players.get(this.myId);
    me.sel = i;
    this.audio.tone(900, 1100, 0.04, 0.05, 'triangle');
    if (this.isHost) this._hostSelect(this.myId, i); else this.net.toHost({ t: 'sel', i });
  }
  _drop(vel) {
    this.audio.drop();
    if (this.isHost) this._hostDrop(this.myId, vel); else this.net.toHost({ t: 'drop', v: vel });
  }

  _throwBoeller(kind = 'boeller') {
    const polen = kind === 'polen';
    if ((polen ? this.polen : this.boellers) <= 0) { this.audio.denied(); this.ui.toast(polen ? 'Keine Polenböller – ab Tag 2 im Shop' : 'Keine Böller mehr (Shop)', '#888', 1.2); return; }
    const cam = this.engine.camera, f = this.local.forward;
    const p = [cam.position.x + f.x * 0.6, cam.position.y + f.y * 0.6, cam.position.z + f.z * 0.6];
    const v = [f.x * 13, f.y * 13 + 3, f.z * 13];
    if (this.isHost) this._hostBoeller(p, v, kind); else { this.net.toHost({ t: 'boeller', p, v, k: kind }); }
    this.ui.toast(polen ? '💥 POLENBÖLLER! In Deckung!' : '🧨 Böller geworfen!', polen ? '#ff5a4a' : '#ffb547', 1.4);
  }

  _scan() {
    const lvl = this.upg.scanner || 0;
    this.scanCd = 9 - lvl * 2.5;
    const range = 24 + lvl * 12;
    const entries = [];
    for (const it of this.items.values()) {
      if (it.def.tool) continue;
      if (it.mesh.position.distanceTo(this.local.pos) > range) continue;
      entries.push({ pos: it.mesh.position.clone(), obj: it.mesh, html: this.upg.goldscan && it.value >= 150 ? `<span style="color:#ffd040">✨ ${it.def.name} <b>${it.value} $</b></span>` : `${it.def.name} <b>${it.value} $</b>` });
    }
    const vz = this.world.vanZone;
    entries.push({ pos: new THREE.Vector3(vz.x, vz.y + 2.5, vz.z), html: '🚐 <b>VAN</b> – Abgabe' });
    this.ui.scan(entries, 4);
    this.audio.scanPing();
    if (entries.length <= 1) this.ui.toast('Scanner: nichts in der Nähe', '#6ad1ff', 1.5);
  }

  // ======================= Update =======================
  _onLock(locked) {
    if (this.phase === 'play' && !locked && !this.scare && !this.ui.isModal('settings') && !this.ui.isModal('controls')) {
      this.ui.modal('pause', true);
      this.renderPause();
      if (this.mode === 'sp') this.paused = true;
    }
    if (locked) { this.ui.modal('pause', false); this.paused = false; }
  }

  update(dt) {
    if (this.disposed) return;
    const eng = this.engine;
    const playing = this.phase === 'play' && !this.paused;
    $('clickToPlay').classList.toggle('hidden', !(this.phase === 'play' && !this.scare && !this.input.locked && !this.ui.isModal('pause') && !this.ui.isModal('settings') && !this.ui.isModal('controls')));

    const me = this.players.get(this.myId);
    // Lokaler Spieler
    if (playing && this.local.alive && !this.scare) {
      this.local.update(dt, { flicker: this.scares.flicker > 0 || this._nearStalker, speedMul: 1 });
      if (this.local.landHurt) { this.engine.fx.hurt = 0.7; this.local.landHurt = 0; }
    } else this.local.update(0, {});
    if (me) {
      me.yaw = this.local.yaw; me.pitch = this.local.pitch; me.crouch = this.local.crouch;
      me.flash = this.local.flashOn && this.local.battery > 0; me.alive = this.isHost ? me.alive && this.local.alive : this.local.alive && me.alive;
      const mic = this.audio.micEnabled && !this.micMuted ? this.audio.micLevel : 0;
      me.loud = Math.max(this.local.noise, mic > 0.18 ? mic * 1.1 : 0);
    }
    this.engine.fx.hurt = Math.max(0, this.engine.fx.hurt - dt * 0.8);

    if (playing || this.phase === 'play') this._interact(dt);

    // Host-Simulation
    if (this.isHost && playing) {
      this.timeLeft -= dt;
      this.physics.step(dt);
      for (const r of this.players.values()) {
        if (!r.isLocal) r.pos.lerp(r.tPos, 1 - Math.exp(-14 * dt));
        r.safe = this.world.inSafeZone(r.pos.x, r.pos.z) && r.pos.y > this.world.height(r.pos.x, r.pos.z) + 0.3;
        r.inVan = r.safe || this.world.inVanZone(r.pos.x, r.pos.z, 3);
      }
      this._hostItems(dt);
      for (const r of this.players.values()) if (r.alive && !r.safe && r.loud > 0.05) this._noises.push({ x: r.pos.x, z: r.pos.z, r: r.loud * 40 });
      if (this._boomAt && (this._boomAt.t -= dt) > 0) this._noises.push({ x: this._boomAt.x, z: this._boomAt.z, r: this._boomAt.r });
      const ctx = { players: this.roster, noises: this._noises, onKill: (p, ai) => this._hostKill(p, ai), onEvent: (k, d) => { if (k === 'roar') this.emit({ t: 'ev', k, ...d }); } };
      for (const mo of this.monsters.values()) {
        mo.ai.update(dt, ctx);
        const a = mo.ai;
        mo.view.setState(a.pos.x, a.pos.y, a.pos.z, a.ry, a.anim, a.extra);
      }
      this._noises.length = 0;
      if (this.roster.every((r) => !r.alive)) {
        this._deadT = (this._deadT || 0) + dt; // Jumpscare erst zu Ende spielen lassen
        if (this._deadT > 3.6) this.endNight('dead');
      } else this._deadT = 0;
      if (this.phase === 'play' && this.timeLeft <= 0) { this.timeLeft = 0; this.endNight('time'); }
    }
    if (this.isHost && this.net && this._phaseMsg && this.phase !== 'play') {
      this._phaseT = (this._phaseT || 0) + dt; // verlorene Nachrichten (room) ausgleichen
      if (this._phaseT > 2) { this._phaseT = 0; this.net.broadcast(this._phaseMsg); }
    }
    if (this.isHost && this.net) {
      this._snapT += dt;
      if (this._snapT >= SNAP_DT && this.phase === 'play') { this._snapT = 0; this._sendSnapshot(); }
    }
    // Physik → Mesh (Host) bzw. Interpolation (Client)
    for (const it of this.items.values()) {
      it.mesh.visible = !(it.heldBy && !it.inHand);
      if (this.isHost) { it.mesh.position.copy(it.body.position); it.mesh.quaternion.copy(it.body.quaternion); }
      else {
        if (it.heldBy === this.myId && it.inHand && me && me.holdTarget) it.mesh.position.lerp(me.holdTarget, 1 - Math.exp(-14 * dt));
        else it.mesh.position.lerp(it.tp, 1 - Math.exp(-15 * dt));
        it.mesh.quaternion.slerp(it.tq, 1 - Math.exp(-12 * dt));
      }
    }
    if (!this.isHost) {
      for (const r of this.players.values()) if (!r.isLocal) r.pos.lerp(r.tPos, 1 - Math.exp(-14 * dt));
      for (const mo of this.monsters.values()) {
        const t = mo.t, v = mo.view, k = 1 - Math.exp(-12 * dt);
        v.setState(v.pos.x + (t.x - v.pos.x) * k, v.pos.y + (t.y - v.pos.y) * k, v.pos.z + (t.z - v.pos.z) * k, angleLerp(v.ry, t.ry, k), t.anim, t.extra);
      }
      this._stateT += dt;
      if (this._stateT >= STATE_DT && this.phase === 'play') {
        this._stateT = 0;
        const r2 = (v) => Math.round(v * 100) / 100, p = this.local.pos;
        this.net.toHost({ t: 'st', p: [r2(p.x), r2(p.y), r2(p.z)], y: r2(this.local.yaw), pi: r2(this.local.pitch), c: this.local.crouch ? 1 : 0, f: me.flash ? 1 : 0, l: r2(me.loud), a: this.local.alive ? 1 : 0, h: me.holdTarget ? [r2(me.holdTarget.x), r2(me.holdTarget.y), r2(me.holdTarget.z)] : 0 });
      }
    }
    // Avatare & Voice
    const cam = eng.camera;
    for (const r of this.players.values()) {
      if (r.isLocal) continue;
      const voice = this.audio.voices.get(r.id);
      const speaking = voice && voice.level > 0.02;
      r.avatar.setState({ x: r.pos.x, y: r.pos.y, z: r.pos.z, yaw: r.yaw, pitch: r.pitch, crouch: r.crouch, flash: r.flash, alive: r.alive });
      r.avatar.update(dt, speaking);
      if (voice) this.audio.setVoice(r.id, { x: r.pos.x, y: r.pos.y + 1.6, z: r.pos.z }, r.alive ? 1 : (this.local.alive ? 0 : 1));
    }
    // Monster-Animation & Gefahr
    let danger = 0; this._nearStalker = false;
    for (const mo of this.monsters.values()) {
      mo.view.update(dt, cam.position);
      if (!this.local.alive) continue;
      const d = mo.view.pos.distanceTo(this.local.pos);
      const a = mo.view.anim;
      if (a === 2) danger = Math.max(danger, clamp(1 - d / 32, 0, 1));
      else if (a === 1 && mo.view.type === 'doll') danger = Math.max(danger, clamp(1 - d / 22, 0, 1) * 0.85);
      else if (a >= 1) danger = Math.max(danger, clamp(1 - d / 18, 0, 1) * 0.55);
      if (d < 11 && a >= 1 && mo.view.type !== 'doll') this._nearStalker = true;
    }
    this.danger = damp(this.danger, playing ? danger : 0, 3, dt);
    this.audio.setDanger(this.danger);
    eng.fx.danger = this.danger * 0.85;
    this._radar(dt, playing);
    this._localSafe = this.local.alive && this.phase === 'play' && this.world.inSafeZone(this.local.pos.x, this.local.pos.z) && this.local.pos.y > this.world.height(this.local.pos.x, this.local.pos.z) + 0.3;
    this.audio.setPartyInside(this._localSafe);
    this.boomLight.intensity = Math.max(0, this.boomLight.intensity - dt * 160);

    this.scares.update(playing ? dt : 0);
    if (this.scare) this._updateScare(dt);
    else if (!this.local.alive && this.phase === 'play') this._spectate(dt);

    this.world.update(dt, eng.time, cam.position);
    const fwd = _v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.audio.setListener(cam.position, fwd);
    this._hud();
    this.ui.updateOverlays(dt);
  }

  /** Monster-Radar (Shop-Upgrade): piept schneller, je näher ein aktives Monster ist. */
  _radar(dt, playing) {
    if (!this.upg.radar || !playing || !this.local.alive) { this.ui.set('hudRadar', 'text', ''); return; }
    let best = Infinity;
    for (const mo of this.monsters.values()) if (mo.view.anim >= 1) best = Math.min(best, mo.view.pos.distanceTo(this.local.pos));
    if (best > 30) { this.ui.set('hudRadar', 'text', '📟 Radar: ruhig'); this.ui.set('hudRadar', 'class:cd', true); return; }
    this.ui.set('hudRadar', 'text', `📟 MONSTER ${Math.round(best)} m`); this.ui.set('hudRadar', 'class:cd', false);
    this._radarT -= dt;
    if (this._radarT <= 0) { this._radarT = 0.25 + best / 30; this.audio.radarBeep(best < 12); }
  }

  _hud() {
    if (this.phase !== 'play') return;
    const ui = this.ui, p = this.local;
    ui.set('hudNight', 'text', 'NACHT ' + this.night);
    const prog = 1 - this.timeLeft / this.nightLen;
    const mins = Math.floor(prog * 360);
    const hh = (22 + Math.floor(mins / 60)) % 24, mm = mins % 60;
    ui.set('hudClock', 'text', `${String(hh).padStart(2, '0')}:${String(Math.floor(mm / 5) * 5).padStart(2, '0')}`);
    ui.set('hudClock', 'class:late', this.timeLeft < 60);
    ui.set('hudQuota', 'text', `${this.banked} / ${this.quota} $`);
    ui.set('hudQuotaFill', 'width', Math.min(100, this.banked / Math.max(1, this.quota) * 100).toFixed(1) + '%');
    ui.set('hudQuotaFill', 'class:done', this.banked >= this.quota);
    ui.set('hudStamina', 'width', (p.stamina / p.maxStamina * 100).toFixed(0) + '%');
    ui.set('hudBattery', 'width', p.battery.toFixed(0) + '%');
    $('hudBattery').parentElement.classList.toggle('low', p.battery < 15);
    const mic = this.audio.micEnabled && !this.micMuted ? this.audio.micLevel : 0;
    ui.set('hudMic', 'width', (mic * 100).toFixed(0) + '%');
    $('hudMic').parentElement.classList.toggle('loud', mic > 0.35);
    ui.set('hudMicIco', 'text', !this.audio.micEnabled ? '🚫' : this.micMuted ? '🔇' : '🎤');
    ui.set('hudMoney', 'text', String(this.money));
    ui.set('hudBoeller', 'text', String(this.boellers));
    ui.set('hudPolen', 'text', String(this.polen));
    ui.set('hudScan', 'text', this.scanCd > 0 ? `Scanner ${Math.ceil(this.scanCd)}s` : 'Q  Scanner bereit');
    ui.set('hudScan', 'class:cd', this.scanCd > 0);
    const vz = this.world.vanZone;
    const dx = vz.x - p.pos.x, dz = vz.z - p.pos.z, dist = Math.hypot(dx, dz);
    if (dist > 8 && p.alive) {
      let rel = Math.atan2(-dx, -dz) - p.yaw;
      rel = ((rel + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const arrows = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'];
      const idx = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
      ui.set('hudVan', 'text', `${arrows[idx]} Van ${Math.round(dist)} m`);
    } else ui.set('hudVan', 'text', !p.alive ? '' : this._localSafe ? '🛡️ SAFE ZONE – Monster sehen & hören dich nicht' : '🚐 Am Van – Beute in die gelbe Zone legen · Im Laderaum bist du sicher');
    const me = this.players.get(this.myId);
    if (me) {
      ui.set('hotbar', 'html', me.inv.map((id, j) => {
        const t = this.items.get(id);
        return `<div class="slot ${j === me.sel ? 'sel' : ''} ${t ? '' : 'empty'}"><span class="k">${j + 1}</span><span class="i">${t ? ICONS[t.type] : '▫'}</span>${t ? `<span class="v">${t.value} $</span>` : ''}</div>`;
      }).join(''));
    }
    const it = this.myHoldId && this.items.get(this.myHoldId);
    ui.set('hudCarry', 'text', it ? `Trägst: ${it.def.name} (${it.value} $)${it.def.mass >= 6 ? ' – schwer!' : ''}` : '');
    ui.players(this.roster.map((r) => ({ name: r.name + (r.isLocal ? ' (du)' : ''), css: r.css, alive: r.alive, speaking: r.isLocal ? mic > 0.2 : (this.audio.voices.get(r.id)?.level || 0) > 0.02 })));
    if (this.app.settings.fps) ui.set('fps', 'text', `${this.engine.fps} FPS · ${Math.round(this.engine.scale * 100)}% Auflösung`);
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this._introTO); clearTimeout(this._tipTO);
    this._clearNight();
    for (const r of this.players.values()) { if (r.avatar) r.avatar.dispose(); this.audio.removeVoice(r.id); }
    this.players.clear();
    for (const s of this.spots) { this.engine.scene.remove(s, s.target); s.dispose(); }
    this.engine.scene.remove(this.boomLight);
    this.engine.camera.remove(this.local.flash, this.local.flash.target, this.local.torch);
    this.scares.dispose();
    clearTimeout(this._fanfareTO);
    this.audio.stopShopMusic(); this.audio.stopPartyMusic();
    this.world.setParty(false);
    this.audio.stopAmbience(); this.audio.setDanger(0);
    this.engine.fx.scare = 0; this.engine.fx.danger = 0; this.engine.fx.hurt = 0;
    this.world.setEvent(null);
    this.input.onLockChange = null;
    $('intro').classList.add('hidden'); $('death').classList.add('hidden'); $('clickToPlay').classList.add('hidden');
    this.ui.hud(false); this.ui.fade(false);
  }
}
