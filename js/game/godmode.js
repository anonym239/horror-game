// God-Mode (geheim): Testen & Freunde trollen.
// Freischalten: Strg+Shift+G (PC) oder 7× schnell auf die Versionsnummer im Menü tippen (Handy),
// dann das geheime Passwort eingeben. Im Code steht nur der SHA-256-Hash – das Passwort selbst nicht.
// Danach: F9 oder der 👑-Knopf öffnet das Menü. Alle Befehle wirken nur als Host bzw. im Einzelspieler.
import { $, esc } from '../ui/ui.js';
import { LOOT, ICONS } from './items.js';
import { SHOP } from './shop.js';
import { MonsterAI, MonsterView, MONSTER_INFO } from './monsters.js';

const HASH = 'e5e7368c02a6be075a8261b3519d13192ebae33fd44dd474dd3aacb8327d6584';
const KEY = 'hp_god';

async function sha(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hollowpines:' + txt));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class GodMode {
  constructor(app) {
    this.app = app;
    this.unlocked = (() => { try { return localStorage.getItem(KEY) === HASH; } catch (e) { return false; } })();
    this.flags = { infMoney: false, invuln: false, invis: false, speed: false, freeze: false, fly: false, esp: false };
    this._espT = 0;
    this._build();
    addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyG') { e.preventDefault(); this.toggle(); }
      else if (e.code === 'F9' && this.unlocked) { e.preventDefault(); this.toggle(); }
    }, true);
    let taps = [];
    $('versionInfo').addEventListener('click', () => {
      const now = performance.now(); taps = taps.filter((t) => now - t < 2500); taps.push(now);
      if (taps.length >= 7) { taps = []; this.toggle(); }
    });
    $('godBtn').onclick = () => this.toggle();
  }

  get game() { return this.app.game; }

  async toggle() {
    if (!this.unlocked) {
      const pw = prompt('🔒 Passwort:');
      if (!pw) return;
      if (await sha(pw.trim()) !== HASH) { this.app.ui.toast('Falsch.', '#888', 1.2); return; }
      this.unlocked = true;
      try { localStorage.setItem(KEY, HASH); } catch (e) { /* privat */ }
      this.app.ui.toast('👑 GOD-MODE freigeschaltet – F9 oder 👑 öffnet das Menü', '#ffd040', 3);
    }
    const open = !this.app.ui.isModal('godPanel');
    if (open) { this._render(); this.app.input.unlock(); }
    this.app.ui.modal('godPanel', open);
  }

  _build() {
    const btn = document.createElement('button');
    btn.id = 'godBtn'; btn.className = 'god-btn hidden'; btn.textContent = '👑';
    document.body.appendChild(btn);
    const m = document.createElement('div');
    m.id = 'godPanel'; m.className = 'modal';
    m.innerHTML = `<div class="panel god-panel"><div class="cas-head"><h2>👑 God-Mode</h2><button class="btn small ghost" data-g="close">✕</button></div><div id="godBody"></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) this._cmd(b.dataset.g, b); });
    m.addEventListener('change', (e) => { const c = e.target.closest('[data-flag]'); if (c) { this.flags[c.dataset.flag] = c.checked; this._applyFlags(); } });
  }

  _render() {
    const g = this.game;
    const host = g && g.isHost;
    const loot = Object.keys(LOOT).filter((k) => !LOOT[k].tool).map((k) => `<option value="${k}">${ICONS[k] || ''} ${esc(LOOT[k].name)}</option>`).join('');
    const mons = Object.keys(MONSTER_INFO).map((k) => `<option value="${k}">${esc(MONSTER_INFO[k].name)}</option>`).join('');
    const friends = g ? g.roster.filter((r) => !r.isLocal).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('') : '';
    const flag = (k, label) => `<label class="check"><input type="checkbox" data-flag="${k}" ${this.flags[k] ? 'checked' : ''}/> ${label}</label>`;
    const local = `<section><h3>🕹️ Hacks (nur für dich)</h3>
          ${flag('fly', '🕊️ Fliegen + durch Wände (Leertaste hoch, C runter)')}${flag('esp', '👁️ ESP: Monster, Beute & Spieler durch Wände')}
        </section>`;
    $('godBody').innerHTML = !g ? '<p class="hint">Starte zuerst ein Spiel (Einzelspieler oder als Host).</p>' : !host ? `<div class="god-grid">${local}</div><p class="hint">Geld, Shop, Spawnen und Trollen gehen nur, wenn <b>du der Host</b> bist (oder im Einzelspieler).</p>` : `
      <div class="god-grid">${local}
        <section><h3>💰 Geld & Shop</h3>
          <div class="ed-row"><button class="btn small" data-g="money1k">+1.000 $</button><button class="btn small" data-g="money10k">+10.000 $</button><button class="btn small" data-g="money1m">+1.000.000 $</button></div>
          ${flag('infMoney', '♾️ Unendlich Geld')}
          <div class="ed-row"><button class="btn small primary" data-g="maxshop">🛒 Ganzen Shop ausmaxen</button><button class="btn small" data-g="unlockall">🔓 Alle Tage freischalten</button></div>
        </section>
        <section><h3>🌙 Nächte & Zeit</h3>
          <div class="ed-row"><button class="btn small" data-g="winnight">✔ Nacht sofort schaffen</button><button class="btn small" data-g="skip">⏩ Nacht überspringen</button><button class="btn small" data-g="time">+60 s</button></div>
          ${flag('freeze', '⏸️ Uhr anhalten')}
          <div class="ed-row"><button class="btn small" data-g="quota">Quote sofort erfüllen</button></div>
        </section>
        <section><h3>🦸 Ich</h3>
          ${flag('invuln', '🛡️ Unverwundbar')}${flag('invis', '👻 Unsichtbar für Monster')}${flag('speed', '⚡ Doppelt schnell + unendlich Ausdauer & Akku')}
          <div class="ed-row"><button class="btn small" data-g="tpvan">🚐 Zum Van</button><button class="btn small" data-g="tpcamp">🔥 Zum Camp</button></div>
        </section>
        <section><h3>🎁 Spawnen</h3>
          <div class="ed-row"><select id="godLoot">${loot}</select><input type="number" id="godVal" value="500" min="1" style="width:80px"/><button class="btn small" data-g="spawnloot">Item spawnen</button></div>
          <div class="ed-row"><select id="godMon">${mons}</select><button class="btn small" data-g="spawnmon">Monster spawnen</button><button class="btn small ghost" data-g="killmon">Alle Monster weg</button></div>
        </section>
        <section class="wide"><h3>😈 Freunde trollen</h3>
          ${friends ? `<div class="ed-row"><select id="godVictim">${friends}</select></div>
          <div class="ed-row">
            <button class="btn small" data-g="t_scare">😱 Jumpscare</button><button class="btn small" data-g="t_hunt">👹 Monster hetzen</button>
            <button class="btn small" data-g="t_launch">🚀 Hochschleudern</button><button class="btn small" data-g="t_drop">🫳 Alles fallen lassen</button>
            <button class="btn small" data-g="t_flip">🙃 Bildschirm drehen</button><button class="btn small" data-g="t_dark">🔦 Akku leer</button>
            <button class="btn small" data-g="t_sms">📱 Fake-SMS von Crane</button><button class="btn small" data-g="t_tpme">🧲 Zu mir holen</button>
          </div>` : '<p class="hint">Keine Mitspieler im Raum.</p>'}
        </section>
      </div>`;
  }

  _applyFlags() {
    const g = this.game; if (!g || !g.isHost) return;
    const me = g.players.get(g.myId);
    if (me) { me.god = this.flags.invuln; me.godInvis = this.flags.invis; }
  }

  /** jedes Bild (aus der Hauptschleife) */
  update(dt) {
    const g = this.game;
    $('godBtn').classList.toggle('hidden', !(this.unlocked && g));
    if (!g) return;
    // lokale Hacks (auch als Client)
    g.local.godFly = this.flags.fly && g.phase === 'play';
    this._esp(dt);
    if (!g.isHost) return;
    const f = this.flags, me = g.players.get(g.myId);
    if (f.infMoney && g.money < 999999) { g.money = 999999; if (g.phase === 'shop') g._refreshShopMoney && g._refreshShopMoney(); }
    if (f.freeze && g.phase === 'play') g.timeLeft = Math.max(g.timeLeft, 30) + dt;
    if (me) { me.god = f.invuln; me.godInvis = f.invis; }
    if (f.speed && g.local.alive) { g.local.stamina = g.local.maxStamina; g.local.battery = 100; }
  }

  /** ESP: Monster rot durch Wände, Beute und Spieler beschriftet */
  _esp(dt) {
    const g = this.game, on = this.flags.esp && g.phase === 'play';
    if (on !== this._espOn) { this._espOn = on; if (!on) { for (const mo of g.monsters.values()) mo.view.setXray(g.xrayT > 0); g.ui.clearTags(); } }
    if (!on) return;
    for (const mo of g.monsters.values()) mo.view.setXray(true);
    if ((this._espT -= dt) > 0) return;
    this._espT = 1;
    const e = [];
    for (const mo of g.monsters.values()) e.push({ pos: mo.view.pos.clone(), obj: mo.view.root, yOff: mo.view.headHeight + 0.5, cls: 'monster', html: `☠ ${MONSTER_INFO[mo.view.type].name} <b>${Math.round(mo.view.pos.distanceTo(g.local.pos))} m</b>` });
    for (const it of g.items.values()) if (!it.def.tool && !it.heldBy) e.push({ pos: it.mesh.position.clone(), obj: it.mesh, gone: () => !!it.heldBy, html: `${ICONS[it.type] || ''} ${it.def.name} <b>${it.value} $</b>` });
    for (const r of g.roster) if (!r.isLocal) e.push({ pos: r.pos.clone(), obj: r.avatar && r.avatar.root, yOff: 2.2, html: `🧍 ${esc(r.name)}${r.alive ? '' : ' ☠'}` });
    g.ui.scan(e, 1.15);
  }

  _victim() { const g = this.game, id = $('godVictim') && $('godVictim').value; return g && g.players.get(id); }

  _cmd(c, btn) {
    const app = this.app, g = this.game, ui = app.ui;
    if (c === 'close') { ui.modal('godPanel', false); if (g && (g.phase === 'play' || g.inCasino)) app.input.lock(); return; }
    if (!g || !g.isHost) return;
    const toast = (t) => ui.toast('👑 ' + t, '#ffd040', 1.8);
    const shopRefresh = () => { if (g.phase === 'shop') g.emit({ t: 'shop', n: g.night, money: g.money, upg: g.upg, boellers: g.boellers, polen: g.polen, adren: g.adren, cloak: g.cloak }); };
    switch (c) {
      case 'money1k': g.money += 1000; shopRefresh(); toast('+1.000 $'); break;
      case 'money10k': g.money += 10000; shopRefresh(); toast('+10.000 $'); break;
      case 'money1m': g.money += 1000000; shopRefresh(); toast('Millionär!'); break;
      case 'maxshop':
        for (const it of SHOP) { if (it.consumable) g[it.store] = Math.max(g[it.store] || 0, 99); else g.upg[it.k] = it.max; }
        g.local.upg = g.upg; shopRefresh(); toast('Shop komplett ausgemaxt'); break;
      case 'unlockall': g.night = Math.max(g.night, 7); shopRefresh(); toast('Alle Tage freigeschaltet (Tag 7)'); break;
      case 'winnight': if (g.phase === 'play') { g.banked = Math.max(g.banked, g.quota); g.endNight('leave'); toast('Nacht geschafft'); } break;
      case 'skip':
        if (g.phase === 'play') { g.banked = Math.max(g.banked, g.quota); g.endNight('leave'); }
        else if (g.phase === 'shop') { g.night++; g.stats.nights++; shopRefresh(); }
        toast('Nacht übersprungen'); break;
      case 'time': if (g.phase === 'play') { g.timeLeft += 60; toast('+60 s'); } break;
      case 'quota': if (g.phase === 'play') { g.banked = Math.max(g.banked, g.quota); g.money += 0; toast('Quote erfüllt – fahr los (H)'); } break;
      case 'tpvan': if (g.phase === 'play') { const sp = g.world.playerSpawns[0]; g.local.pos.set(sp.x, g.world.collision.groundAt(sp.x, sp.z) + 0.1, sp.z); } break;
      case 'tpcamp': if (g.phase === 'play') { const cf = g.world.clearing; g.local.pos.set(cf.x + 3, g.world.collision.groundAt(cf.x + 3, cf.z) + 0.1, cf.z); } break;
      case 'spawnloot': {
        if (g.phase !== 'play') { toast('Nur nachts'); break; }
        const type = $('godLoot').value, v = Math.max(1, Math.floor(+$('godVal').value || 100));
        const f = g.local.forward, p = g.local.pos;
        const id = g.nextItemId++;
        g.emit({ t: 'spawn', item: [id, type, v, p.x + f.x * 1.5, p.y + 1.2, p.z + f.z * 1.5] });
        toast(`${LOOT[type].name} (${v} $) gespawnt`); break;
      }
      case 'spawnmon': {
        if (g.phase !== 'play') { toast('Nur nachts'); break; }
        const type = $('godMon').value, f = g.local.forward, p = g.local.pos;
        this._spawnMonster(type, p.x + f.x * 12, p.z + f.z * 12, 0);
        toast(`${MONSTER_INFO[type].name} gespawnt`); break;
      }
      case 'killmon': for (const mo of g.monsters.values()) mo.view.dispose(g.engine.scene); g.monsters.clear(); toast('Alle Monster entfernt'); break;
      default: if (c.startsWith('t_')) this._troll(c.slice(2));
    }
    if (btn && btn.dataset.g !== 'close') this.app.audio.tone(900, 1300, 0.06, 0.06, 'triangle');
  }

  _spawnMonster(type, x, z, delay) {
    const g = this.game;
    const rnd = Math.random;
    const ai = new MonsterAI(type, x, z, g.world, Math.max(1, g.night), rnd);
    ai.activeIn = delay;
    g.monsters.set(ai.id, { ai, view: new MonsterView(type, g.engine.scene, g.audio) });
    return ai;
  }

  _troll(kind) {
    const g = this.game, v = this._victim();
    if (!v) return;
    const ui = this.app.ui;
    if (kind === 'drop') { g._hostDropAll(v.id); ui.toast(`😈 ${esc(v.name)} hat alles fallen lassen`, '#ff6ad5', 2); return; }
    if (kind === 'hunt') {
      if (g.phase !== 'play') return;
      const ai = this._spawnMonster('stalker', v.pos.x - Math.sin(v.yaw) * -14, v.pos.z - Math.cos(v.yaw) * -14, 0.5);
      ai.state = 'chase'; ai.target = v.id; ai.lastSeen = v.pos.clone(); ai.timer = 0;
      ui.toast(`😈 Ein Blasser jagt jetzt ${esc(v.name)}`, '#ff6ad5', 2); return;
    }
    if (kind === 'tpme') { g.emit({ t: 'ev', k: 'troll', id: v.id, w: 'tp', x: g.local.pos.x + 1, y: g.local.pos.y + 0.5, z: g.local.pos.z }); return; }
    g.emit({ t: 'ev', k: 'troll', id: v.id, w: kind });
    ui.toast(`😈 Troll an ${esc(v.name)} geschickt`, '#ff6ad5', 1.6);
  }
}

/** Auf dem Bildschirm des Opfers ausführen (aus Game.handle → ev 'troll'). */
export function applyTroll(g, m) {
  const a = g.audio, ui = g.ui, p = g.local;
  switch (m.w) {
    case 'scare': {
      a.screech(); ui.flash(1); g.engine.fx.scare = 1;
      const el = document.createElement('div'); el.className = 'troll-face'; el.textContent = '💀';
      document.body.appendChild(el); setTimeout(() => el.remove(), 1300);
      break;
    }
    case 'launch': if (p.alive) { p.vel.y = 17; p.onGround = false; a.tone(200, 900, 0.5, 0.2, 'sawtooth'); } break;
    case 'flip': document.body.classList.add('troll-flip'); setTimeout(() => document.body.classList.remove('troll-flip'), 10000); break;
    case 'dark': p.battery = 0; p.flashOn = false; a.flashlightClick(); break;
    case 'sms': {
      const lines = ['Ich stehe hinter dir.', 'Dreh dich nicht um.', 'Deine Beute gehört jetzt mir.', 'Warum bist du allein?', 'Er hat deinen Namen geflüstert.'];
      a.tone(1318, 1318, 0.08, 0.12, 'sine'); a.tone(1760, 1760, 0.12, 0.12, 'sine', 0.12);
      ui.toast(`📱 <b>Mr. Crane:</b> ${lines[Math.floor(Math.random() * lines.length)]}`, '#6ad1ff', 4);
      break;
    }
    case 'tp': if (p.alive) { p.pos.set(m.x, m.y, m.z); p.vel.set(0, 0, 0); ui.flash(0.6); } break;
  }
}
