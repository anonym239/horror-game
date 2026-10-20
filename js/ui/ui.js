// DOM-Oberfläche: Menüs, HUD, Toasts, 3D-Beschriftungen, Shop.
import * as THREE from 'three';

export const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export const SHOP = [
  { k: 'battery', ico: '🔋', name: 'Bessere Akkus', desc: 'Taschenlampe hält deutlich länger.', max: 3, price: (l) => 110 + l * 90 },
  { k: 'stamina', ico: '🫁', name: 'Kondition', desc: 'Mehr Ausdauer zum Sprinten & Springen.', max: 3, price: (l) => 100 + l * 80 },
  { k: 'strength', ico: '💪', name: 'Tragegurte', desc: 'Schwere Beute bremst weniger.', max: 3, price: (l) => 120 + l * 90 },
  { k: 'scanner', ico: '📡', name: 'Scanner-Modul', desc: 'Größere Reichweite, kürzere Abklingzeit.', max: 2, price: (l) => 90 + l * 110 },
  { k: 'boeller', ico: '🧨', name: 'Böller ×2', desc: 'Werfen (B): lockt den Blassen weg.', max: 99, price: () => 60, consumable: true },
];

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

  shop(money, upg, boellers, canStart, onBuy) {
    $('shopMoney').textContent = money;
    const box = $('shopItems');
    box.innerHTML = '';
    for (const it of SHOP) {
      const lvl = it.consumable ? 0 : upg[it.k] || 0;
      const price = it.price(lvl);
      const maxed = !it.consumable && lvl >= it.max;
      const el = document.createElement('div');
      el.className = 'shop-item' + (maxed || money < price ? ' off' : '');
      el.innerHTML = `<div class="si-ico">${it.ico}</div><div class="si-name">${it.name}</div><div class="si-desc">${it.desc}</div>
        ${it.consumable ? `<div class="hint">Vorrat: ${boellers}</div>` : `<div class="si-lvl">${Array.from({ length: it.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>`}
        <div class="si-price">${maxed ? 'MAX' : price + ' $'}</div>`;
      el.onclick = () => onBuy(it.k);
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
