// DOM-Oberfläche: Menüs, HUD, Toasts, 3D-Beschriftungen, Shop.
import * as THREE from 'three';

export const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

// day: ab welchem geschafften Tag (Nacht) der Artikel im Shop freigeschaltet ist.
// consumable: Verbrauchsgut → add = Menge, store = Feld im Spielzustand.
export const SHOP = [
  { k: 'battery', day: 1, ico: '🔋', name: 'Bessere Akkus', desc: 'Taschenlampe hält deutlich länger.', max: 3, price: (l) => 110 + l * 90 },
  { k: 'stamina', day: 1, ico: '🫁', name: 'Kondition', desc: 'Mehr Ausdauer zum Sprinten & Springen.', max: 3, price: (l) => 100 + l * 80 },
  { k: 'boeller', day: 1, ico: '🧨', name: 'Böller ×2', desc: 'Werfen (B): lockt den Blassen weg.', max: 99, price: () => 60, consumable: true, add: 2, store: 'boellers' },
  { k: 'strength', day: 2, ico: '💪', name: 'Tragegurte', desc: 'Schwere Beute bremst weniger.', max: 3, price: (l) => 120 + l * 90 },
  { k: 'scanner', day: 2, ico: '📡', name: 'Scanner-Modul', desc: 'Größere Reichweite, kürzere Abklingzeit.', max: 2, price: (l) => 90 + l * 110 },
  { k: 'polen', day: 2, ico: '💥', name: 'Polenböller', desc: 'Werfen (V): 5× Explosion! Verscheucht Monster in der Nähe.', max: 99, price: () => 150, consumable: true, add: 1, store: 'polen' },
  { k: 'padding', day: 3, ico: '📦', name: 'Polsterdecken', desc: 'Zerbrechliche Beute nimmt weniger Schaden.', max: 2, price: (l) => 140 + l * 120 },
  { k: 'haggle', day: 3, ico: '🤝', name: 'Crane-Deal', desc: '+10 % mehr Geld pro abgelieferter Beute.', max: 3, price: (l) => 200 + l * 150 },
  { k: 'shoes', day: 3, ico: '🥿', name: 'Leise Sohlen', desc: 'Deine Schritte sind 25 % leiser pro Stufe.', max: 2, price: (l) => 160 + l * 140 },
  { k: 'overtime', day: 4, ico: '⏰', name: 'Fahrer bestechen', desc: 'Der Van wartet jede Nacht 45 s länger.', max: 2, price: (l) => 220 + l * 160 },
  { k: 'boots', day: 4, ico: '👟', name: 'Laufschuhe', desc: '+8 % Lauftempo pro Stufe.', max: 2, price: (l) => 240 + l * 180 },
  { k: 'boellerBox', day: 4, ico: '🎆', name: 'Böller-Kiste ×6', desc: 'Großpackung normale Böller – günstiger.', max: 99, price: () => 150, consumable: true, add: 6, store: 'boellers' },
  { k: 'radar', day: 5, ico: '📟', name: 'Monster-Radar', desc: 'Piept und warnt, wenn ein Monster in der Nähe ist.', max: 1, price: () => 350 },
  { k: 'flashlight', day: 5, ico: '🔦', name: 'Profi-Taschenlampe', desc: 'Heller und größere Reichweite.', max: 2, price: (l) => 260 + l * 200 },
  { k: 'goldscan', day: 6, ico: '🧭', name: 'Schatzsucher', desc: 'Scanner hebt wertvolle Beute (150 $+) golden hervor.', max: 1, price: () => 300 },
  { k: 'polenBox', day: 6, ico: '🧨', name: 'Polenböller ×3', desc: 'Sparpack für den großen Knall (V).', max: 99, price: () => 380, consumable: true, add: 3, store: 'polen' },
  { k: 'quota', day: 7, ico: '💼', name: 'Crane schmieren', desc: 'Die Quote jeder Nacht sinkt um 10 % pro Stufe.', max: 2, price: (l) => 500 + l * 400 },
];
export const UPG_DEFAULT = () => ({ battery: 0, stamina: 0, strength: 0, scanner: 0, padding: 0, haggle: 0, shoes: 0, overtime: 0, boots: 0, radar: 0, flashlight: 0, goldscan: 0, quota: 0 });

export class UI {
  constructor(engine) {
    this.engine = engine;
    this.layer = $('labels');
    this.floats = [];
    this.tags = [];
    this._hudCache = {};
  }

  screen(id) {
    for (const s of ['loading', 'menu', 'lobby', 'browser']) $(s).classList.toggle('show', s === id);
  }
  modal(id, on = true) { $(id).classList.toggle('show', on); }
  isModal(id) { return $(id).classList.contains('show'); }
  hud(on) { $('hud').classList.toggle('hidden', !on); if (!on) this.clearLabels(); }

  loading(p, text) { $('loadFill').style.width = Math.round(p * 100) + '%'; if (text) $('loadText').textContent = text; }

  message(title, text) {
    $('msgTitle').textContent = title; $('msgText').textContent = text;
    this.modal('message', true);
  }

  toast(text, color = '#ffb547', life = 2.6) {
    const el = document.createElement('div');
    el.className = 'toast'; el.innerHTML = text;
    el.style.borderColor = color; el.style.setProperty('--life', life + 's');
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), (life + 0.6) * 1000);
    while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
  }

  float(text, pos, color = '#ffb547', life = 1.6) {
    const el = document.createElement('div');
    el.className = 'float3d'; el.textContent = text; el.style.color = color;
    this.layer.appendChild(el);
    this.floats.push({ el, pos: pos.clone(), t: 0, life });
  }

  /** Scanner-Beschriftungen: entries = [{pos, html}] */
  scan(entries, dur = 3.5) {
    this.clearTags();
    for (const e of entries) {
      const el = document.createElement('div');
      el.className = 'label3d'; el.innerHTML = e.html;
      this.layer.appendChild(el);
      this.tags.push({ el, pos: e.pos, t: 0, life: dur, obj: e.obj });
    }
  }
  clearTags() { this.tags.forEach((t) => t.el.remove()); this.tags = []; }
  clearLabels() { this.clearTags(); this.floats.forEach((f) => f.el.remove()); this.floats = []; }

  _project(pos, el) {
    _v.copy(pos).project(this.engine.camera);
    if (_v.z > 1 || _v.z < -1) { el.style.display = 'none'; return false; }
    el.style.display = '';
    el.style.left = ((_v.x * 0.5 + 0.5) * innerWidth) + 'px';
    el.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight) + 'px';
    return true;
  }

  updateOverlays(dt) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt; f.pos.y += dt * 0.7;
      this._project(f.pos, f.el);
      f.el.style.opacity = String(Math.max(0, 1 - f.t / f.life));
      if (f.t > f.life) { f.el.remove(); this.floats.splice(i, 1); }
    }
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const t = this.tags[i];
      t.t += dt;
      if (t.obj) t.pos.copy(t.obj.position).y += 0.45;
      this._project(t.pos, t.el);
      t.el.style.opacity = String(Math.min(1, (t.life - t.t) * 2));
      if (t.t > t.life || (t.obj && !t.obj.parent)) { t.el.remove(); this.tags.splice(i, 1); }
    }
  }

  // ---------- HUD ----------
  set(id, prop, val) {
    const k = id + prop;
    if (this._hudCache[k] === val) return;
    this._hudCache[k] = val;
    const el = $(id);
    if (prop === 'text') el.textContent = val;
    else if (prop === 'html') el.innerHTML = val;
    else if (prop === 'width') el.style.width = val;
    else if (prop.startsWith('class:')) el.classList.toggle(prop.slice(6), !!val);
  }

  players(list) {
    const html = list.map((p) => `<li class="${p.alive ? '' : 'dead'}" style="color:${p.css}"><span class="spk ${p.speaking ? 'on' : ''}"></span><span style="color:var(--bone)">${esc(p.name)}</span></li>`).join('');
    this.set('hudPlayers', 'html', html);
  }

  /** Spielerliste (Lobby & Pause). onKick(id) nur für den Host. */
  playerList(el, players, isHost, myId, onKick, slots = 4) {
    el.innerHTML = '';
    for (let i = 0; i < slots; i++) {
      const p = players[i];
      const li = document.createElement('li');
      if (!p) { li.className = 'empty'; li.textContent = '— freier Platz —'; el.appendChild(li); continue; }
      li.innerHTML = `<span class="dot" style="background:${p.css};color:${p.css}"></span><span>${esc(p.name)}</span>${p.host ? '<span class="host">HOST</span>' : ''}${p.id === myId ? '<span class="hint">(du)</span>' : ''}`;
      if (isHost && onKick && !p.host && p.id !== myId) {
        const b = document.createElement('button');
        b.className = 'btn small ghost kick'; b.textContent = 'Kicken';
        b.onclick = () => onKick(p.id, p.name);
        li.appendChild(b);
      }
      el.appendChild(li);
    }
  }

  lobby(players, isHost, opts = {}) {
    this.playerList($('lobbyPlayers'), players, isHost, opts.myId, opts.onKick, opts.max || 4);
    $('btnStart').style.display = isHost ? '' : 'none';
    if (opts.name) $('lobbyName').textContent = opts.name;
    $('lobbyVis').textContent = opts.priv ? '🔒 Privat' : opts.priv === false ? '🌐 Öffentlich' : '';
    $('lobbyMax').textContent = opts.max ? `${players.length} / ${opts.max} Spieler` : '';
    $('lobbyHint').textContent = isHost
      ? (opts.priv ? 'Privater Raum: Teile den Code mit deinen Freunden.' : 'Dein Raum steht im Server-Browser. Freunde können ihn dort anklicken oder den Code eingeben.')
      : 'Warte, bis der Host das Spiel startet …';
  }

  /** Server-Browser-Liste */
  rooms(list, onJoin) {
    const box = $('brRooms');
    $('brCount').textContent = list.length ? `${list.length} ${list.length === 1 ? 'Raum' : 'Räume'}` : '';
    if (!list.length) {
      box.innerHTML = '<div class="br-empty">Gerade ist kein öffentlicher Raum offen.<br>Erstelle rechts einen eigenen Raum, dann sehen ihn deine Freunde hier.</div>';
      return;
    }
    box.innerHTML = '';
    for (const r of list) {
      const full = r.players >= r.max;
      const row = document.createElement('div');
      row.className = 'br-row br-room';
      row.innerHTML = `<div class="rn"><b>${esc(r.name)}</b><small>Host: ${esc(r.host)} · Code ${esc(r.code)}${r.mic ? ' · 🎤' : ''}</small></div>
        <span class="rp ${full ? 'full' : ''}">${r.players}/${r.max}</span>
        <span class="rs ${r.state === 'game' ? 'game' : ''}">${r.state === 'game' ? `Nacht ${r.night || 1} läuft` : 'In der Lobby'}</span>`;
      const b = document.createElement('button');
      b.className = 'btn small' + (full ? '' : ' primary');
      b.textContent = full ? 'Voll' : 'Beitreten';
      b.disabled = full;
      b.onclick = () => onJoin(r.code);
      row.appendChild(b);
      box.appendChild(row);
    }
  }

  /** stock: {boellers, polen}; day: zuletzt geschaffte Nacht (schaltet Artikel frei) */
  shop(money, upg, stock, day, canStart, onBuy) {
    $('shopMoney').textContent = money;
    $('shopDay').textContent = `Tag ${day} geschafft · neue Ware ab Tag ${day + 1}`;
    const box = $('shopItems');
    box.innerHTML = '';
    // freigeschaltete zuerst, gesperrte nur die des nächsten Tages als Vorschau
    const list = SHOP.filter((it) => it.day <= day + 1).sort((a, b) => (a.day > day) - (b.day > day));
    for (const it of list) {
      const locked = it.day > day;
      const lvl = it.consumable ? 0 : upg[it.k] || 0;
      const price = it.price(lvl);
      const maxed = !it.consumable && lvl >= it.max;
      const el = document.createElement('div');
      el.className = 'shop-item' + (locked ? ' locked' : maxed || money < price ? ' off' : '') + (it.day === day && day > 1 ? ' new' : '');
      el.innerHTML = `<div class="si-ico">${locked ? '🔒' : it.ico}</div><div class="si-name">${it.name}</div><div class="si-desc">${it.desc}</div>
        ${it.consumable ? `<div class="hint">Vorrat: ${stock[it.store] || 0}</div>` : `<div class="si-lvl">${Array.from({ length: it.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>`}
        <div class="si-price">${locked ? `ab Tag ${it.day}` : maxed ? 'MAX' : price + ' $'}</div>`;
      if (!locked) el.onclick = () => onBuy(it.k);
      box.appendChild(el);
    }
    $('btnNextNight').style.display = canStart ? '' : 'none';
    $('shopWait').textContent = canStart ? '' : 'Warte auf den Host …';
  }

  flash(strength = 1) {
    const f = $('flash');
    f.style.transition = 'none'; f.style.opacity = String(strength);
    requestAnimationFrame(() => { f.style.transition = 'opacity 1.2s'; f.style.opacity = '0'; });
  }
  fade(on) { $('fade').style.opacity = on ? '1' : '0'; }
}

export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
