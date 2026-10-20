// Karten-Editor: Draufsicht auf das Spielfeld. Objekte platzieren/verschieben/drehen,
// Monster einstellen, Van gestalten, Regeln festlegen, speichern, exportieren und direkt testen.
import { $, esc } from '../ui/ui.js';
import { MONSTER_INFO } from '../game/monsters.js';
import {
  OBJECTS, MAX_OBJECTS, MAX_MONSTERS, MONSTER_TYPES, RADIO_STATIONS, MAP_RADIUS,
  newScenario, sanitizeScenario, Scenarios, templates,
} from '../game/scenario.js';

const PLAY_R = 108;
// Grundflächen (Breite x Tiefe in m) für die Draufsicht
const FOOT = { cabin: [6, 5], lodge: [11, 7], shed: [3.6, 3], chapel: [8, 12], trailer: [2.2, 4.5], tent: [1.6, 2.4], outhouse: [1.3, 1.3], wreck: [1.8, 4.2], picnic: [1.9, 1.7], crates: [2, 1], graves: [10, 9], tower: [3.6, 3.6] };
const VAN_COLORS = ['#ffffff', '#1a1a1a', '#c81e1e', '#2a6aff', '#1f8a3a', '#ffd040', '#ff2ad5', '#7a4aff', '#ff8a20', '#6ad1ff'];
const clone = (o) => JSON.parse(JSON.stringify(o));
const deg = (r) => Math.round(((r * 180 / Math.PI) % 360 + 360) % 360);

export class Editor {
  constructor(app) {
    this.app = app;
    this.canvas = $('edCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.view = { cx: 0, cz: -5, sc: 3 };
    this.tool = null;      // Objekt-Typ zum Platzieren oder null = Auswählen
    this.sel = null;       // ausgewähltes Objekt | 'van' | 'lake'
    this.tab = 'map';
    this.dirty = false;
    this._buildSide();
    this._bind();
  }

  // ---------------- Öffnen / Schließen ----------------
  open(scn) {
    this.scn = scn ? clone(scn) : this.scn || newScenario();
    this.sel = null; this.tool = null; this._userView = false;
    this.app.ui.screen('editor');
    this.active = true;
    this._fit();
    this._sync();
    this._status(this.dirty ? 'Ungespeicherte Änderungen' : '');
  }

  close() {
    if (this.dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
    this.dirty = false;
    this.active = false;
    this.app.ui.screen('menu');
    this.app.refreshMapLists();
  }

  _status(t, color) { const el = $('edStatus'); el.textContent = t; el.style.color = color || ''; }
  _touch() { this.dirty = true; this._status('Ungespeicherte Änderungen'); this._draw(); this._stats(); }

  save() {
    this.scn.name = ($('edName').value.trim() || 'Mein Szenario').slice(0, 40);
    const saved = Scenarios.save(this.scn);
    if (!saved) { this._status('Speichern fehlgeschlagen (Speicher voll?)', '#ff5a4a'); return false; }
    this.scn = clone(saved);
    this.dirty = false;
    this._status('✔ Gespeichert', '#4ce07a');
    this.app.refreshMapLists();
    return true;
  }

  test() {
    if (!this.save()) return;
    this.active = false;
    this.app.startSolo({ scenario: this.scn, fromEditor: true });
  }

  // ---------------- Seitenleiste ----------------
  _buildSide() {
    const pal = Object.entries(OBJECTS).map(([k, o]) => `<button class="ed-pal" data-tool="${k}" title="${esc(o.desc)}"><span>${o.ico}</span>${esc(o.name)}</button>`).join('');
    const mon = MONSTER_TYPES.map((t) => `
      <div class="ed-mon">
        <div><b>${MONSTER_INFO[t].name}</b><small>${MONSTER_INFO[t].desc}</small></div>
        <input type="range" min="0" max="${MAX_MONSTERS}" step="1" data-k="monsters.${t}" />
        <input type="number" min="0" max="${MAX_MONSTERS}" step="1" data-k="monsters.${t}" class="ed-num" />
      </div>`).join('');
    const swatches = VAN_COLORS.map((c) => `<button class="ed-swatch" data-color="${c}" style="background:${c}"></button>`).join('');
    const stations = RADIO_STATIONS.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join('');
    const rng = (k, label, min, max, step, fmt) => `<label class="ed-rng">${label} <b data-show="${k}" data-fmt="${fmt}"></b><input type="range" min="${min}" max="${max}" step="${step}" data-k="${k}" /></label>`;
    $('edSide').innerHTML = `
      <div class="ed-tabs">
        <button data-tab="map" class="on">🗺️ Karte</button><button data-tab="monsters">👹 Monster</button>
        <button data-tab="van">🚐 Van</button><button data-tab="rules">⚙️ Regeln</button>
      </div>
      <div class="ed-tab" data-pane="map">
        <div class="ed-h">Bauen <small>Objekt wählen, dann auf die Karte klicken</small></div>
        <div class="ed-palette"><button class="ed-pal on" data-tool=""><span>🖐</span>Auswählen</button>${pal}</div>
        <div class="ed-h">See</div>
        <div class="ed-row"><button class="btn small" id="edLake">🌊 See hinzufügen</button></div>
        <div id="edLakeOpts">${rng('lake.r', 'Größe', 6, 35, 1, 'm')}</div>
        <div class="ed-h">Auswahl</div>
        <div id="edSel" class="ed-sel hint">Nichts ausgewählt. Klicke ein Objekt an.</div>
        <div class="ed-h">Beschreibung</div>
        <textarea id="edDesc" maxlength="300" rows="3" placeholder="Worum geht es in deinem Szenario?"></textarea>
      </div>
      <div class="ed-tab hidden" data-pane="monsters">
        <div class="ed-h">Monster pro Nacht <small>max. ${MAX_MONSTERS} insgesamt</small></div>
        ${mon}
        <label class="check"><input type="checkbox" data-k="monsters.grow" /> Jede 2. Nacht kommt ein Monster dazu</label>
        <p class="hint">Monster tauchen an den 👹 Spawn-Punkten auf (Tab „Karte“). Ohne eigene Spawn-Punkte kommen sie aus dem Wald. Sehr viele Monster können schwache PCs ausbremsen.</p>
        <div id="edMonInfo" class="ed-info"></div>
      </div>
      <div class="ed-tab hidden" data-pane="van">
        <div class="ed-h">Lackierung</div>
        <div class="ed-swatches">${swatches}<input type="color" data-k="van.color" title="Eigene Farbe" /></div>
        ${rng('van.k', 'Größe', 1, 2.5, 0.05, 'x')}
        <label class="ed-rng">Drehung <b id="edVanRot"></b><input type="range" min="0" max="359" step="1" id="edVanRotIn" /></label>
        <div class="ed-h">Ausstattung</div>
        <label class="check"><input type="checkbox" data-k="van.lights" /> 🎉 Party-Lichter & Unterboden-Neon</label>
        <label class="check"><input type="checkbox" data-k="van.disco" /> 🪩 Discokugel</label>
        <label class="check"><input type="checkbox" data-k="van.cooler" /> 🧊 Kühlbox (Ausdauer lädt im Van)</label>
        <label class="check"><input type="checkbox" data-k="van.bench" /> 🛋️ Sitzbank</label>
        <label>📻 Radiosender beim Start <select data-k="van.station" data-num="1">${stations}</select></label>
        <p class="hint">Position: den Van auf der Karte ziehen. Je größer der Van, desto größer der Laderaum (Safe-Zone) und die Abgabezone.</p>
      </div>
      <div class="ed-tab hidden" data-pane="rules">
        ${rng('rules.quotaMul', 'Quote', 0.1, 5, 0.05, '%')}
        ${rng('rules.nightLen', 'Länge einer Nacht', 60, 1800, 30, 'time')}
        ${rng('rules.lootMul', 'Wert der Beute', 0.2, 5, 0.05, '%')}
        ${rng('rules.lootCount', 'Menge der Beute', 0.3, 3, 0.05, '%')}
        ${rng('rules.trees', 'Bäume', 0, 1.5, 0.05, '%')}
        ${rng('rules.fog', 'Nebel', 0.3, 2.5, 0.05, '%')}
        <label>Startgeld ($) <input type="number" min="0" max="100000" step="50" data-k="rules.startMoney" /></label>
        <label>Böller zum Start <input type="number" min="0" max="99" step="1" data-k="rules.startBoeller" /></label>
        <label class="check"><input type="checkbox" data-k="rules.events" /> Blutmond- & Nebelnächte</label>
      </div>
      <div id="edStats" class="ed-stats"></div>`;
  }

  _get(path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), this.scn); }
  _set(path, v) { const ks = path.split('.'); let o = this.scn; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }

  /** Formularfelder aus dem Szenario füllen */
  _sync() {
    $('edName').value = this.scn.name;
    $('edDesc').value = this.scn.desc || '';
    for (const el of $('edSide').querySelectorAll('[data-k]')) {
      const v = this._get(el.dataset.k);
      if (v === undefined) continue;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    }
    this._shows();
    $('edVanRotIn').value = deg(this.scn.van.r); $('edVanRot').textContent = deg(this.scn.van.r) + '°';
    $('edLake').textContent = this.scn.lake ? '🗑 See entfernen' : '🌊 See hinzufügen';
    $('edLakeOpts').classList.toggle('hidden', !this.scn.lake);
    this._selPanel();
    this._stats();
    this._draw();
  }

  _shows() {
    for (const b of $('edSide').querySelectorAll('[data-show]')) {
      const v = this._get(b.dataset.show), f = b.dataset.fmt;
      b.textContent = v === undefined ? '' : f === '%' ? Math.round(v * 100) + ' %' : f === 'time' ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')} min` : f === 'x' ? v.toFixed(2) + '×' : v + ' ' + f;
    }
  }

  _selPanel() {
    const el = $('edSel'), s = this.sel;
    if (!s) { el.innerHTML = 'Nichts ausgewählt. Klicke ein Objekt an.'; el.classList.add('hint'); return; }
    el.classList.remove('hint');
    if (s === 'van') { el.innerHTML = '🚐 <b>Van</b> – Einstellungen im Tab „Van“. Ziehen zum Verschieben, <kbd>R</kbd> dreht.'; return; }
    if (s === 'lake') { el.innerHTML = '🌊 <b>See</b> – ziehen zum Verschieben, Größe oben einstellen.'; return; }
    const o = OBJECTS[s.t];
    el.innerHTML = `<div class="ed-selname">${o.ico} <b>${esc(o.name)}</b> <small>${esc(o.desc)}</small></div>
      <label class="ed-rng">Drehung <b>${deg(s.r)}°</b><input type="range" min="0" max="359" step="1" value="${deg(s.r)}" id="edRot" /></label>
      <div class="ed-row"><button class="btn small" id="edDup">⧉ Duplizieren</button><button class="btn small ghost" id="edDel">🗑 Löschen</button></div>
      <small class="hint">Tasten: <kbd>R</kbd> drehen · <kbd>Entf</kbd> löschen · <kbd>Strg+D</kbd> duplizieren</small>`;
    $('edRot').oninput = (e) => { s.r = +e.target.value * Math.PI / 180; e.target.previousElementSibling.textContent = deg(s.r) + '°'; this._touch(); };
    $('edDup').onclick = () => this._duplicate();
    $('edDel').onclick = () => this._delete();
  }

  _stats() {
    const objs = this.scn.objects, n = (t) => objs.filter((o) => o.t === t).length;
    const hides = objs.filter((o) => OBJECTS[o.t].hide).length;
    const lootEst = { cabin: 3, lodge: 6, shed: 2, chapel: 5, trailer: 2, tent: 1, crates: 2, circle: 1, outhouse: 1, picnic: 1, loot: 1, tower: 1, wreck: 1 };
    const loot = objs.reduce((a, o) => a + (lootEst[o.t] || 0), 0);
    const m = this.scn.monsters, mons = MONSTER_TYPES.reduce((a, t) => a + m[t], 0);
    const warn = [];
    if (!hides) warn.push('Keine Verstecke (Hütte, Lodge, Schuppen)');
    if (loot < 8) warn.push('Wenig Beute-Orte – der Wald liefert etwas, aber baue mehr Häuser oder 💰 Punkte');
    if (!mons && !m.grow) warn.push('Keine Monster – ziemlich entspannt');
    if (mons > 20) warn.push('Sehr viele Monster: kann auf schwachen PCs ruckeln');
    $('edStats').innerHTML = `<div>Objekte <b>${objs.length}/${MAX_OBJECTS}</b> · Verstecke <b>${hides}</b> · Beute-Orte ca. <b>${loot}</b> · Spawns <b>${n('spawn')}</b> · Monster Nacht 1 <b>${mons}</b></div>${warn.map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join('')}`;
    $('edMonInfo').innerHTML = `Nacht 1: <b>${mons}</b> Monster · Nacht 5: <b>${Math.min(MAX_MONSTERS, mons + (m.grow ? 2 : 0))}</b> · Nacht 9: <b>${Math.min(MAX_MONSTERS, mons + (m.grow ? 4 : 0))}</b>`;
  }

  // ---------------- Eingabe ----------------
  _bind() {
    $('edBack').onclick = () => this.close();
    $('edSave').onclick = () => this.save();
    $('edTest').onclick = () => this.test();
    $('edNew').onclick = () => { if (this.dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return; this.scn = newScenario(); this.dirty = false; this.sel = null; this._fit(); this._sync(); this._status('Neues Szenario'); };
    $('edOpen').onclick = () => this._openList();
    $('edOpenClose').onclick = () => this.app.ui.modal('edOpenModal', false);
    $('edExport').onclick = () => this._export();
    $('edImport').onclick = () => $('edFile').click();
    $('edFile').onchange = (e) => this._import(e.target.files[0]);
    $('edName').oninput = () => { this.scn.name = $('edName').value; this.dirty = true; };
    const side = $('edSide');
    side.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) {
        this.tab = t.dataset.tab;
        side.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b === t));
        side.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== this.tab));
        return;
      }
      const p = e.target.closest('[data-tool]');
      if (p) { this.tool = p.dataset.tool || null; side.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b === p)); this.canvas.style.cursor = this.tool ? 'copy' : 'default'; return; }
      const sw = e.target.closest('[data-color]');
      if (sw) { this.scn.van.color = sw.dataset.color; this._sync(); this._touch(); return; }
      if (e.target.id === 'edLake') {
        this.scn.lake = this.scn.lake ? null : { x: 55, z: -35, r: 16 };
        this.sel = this.scn.lake ? 'lake' : null; this._sync(); this._touch();
      }
    });
    side.addEventListener('input', (e) => {
      const el = e.target;
      if (el.id === 'edDesc') { this.scn.desc = el.value; this.dirty = true; return; }
      if (el.id === 'edVanRotIn') { this.scn.van.r = +el.value * Math.PI / 180; $('edVanRot').textContent = el.value + '°'; this._touch(); return; }
      const k = el.dataset.k; if (!k) return;
      let v = el.type === 'checkbox' ? el.checked : el.type === 'color' ? el.value : el.dataset.num || el.type === 'range' || el.type === 'number' ? +el.value : el.value;
      if (k.startsWith('monsters.') && k !== 'monsters.grow') {
        v = Math.max(0, Math.min(MAX_MONSTERS, Math.round(v) || 0));
        const other = MONSTER_TYPES.filter((t) => 'monsters.' + t !== k).reduce((a, t) => a + this.scn.monsters[t], 0);
        v = Math.min(v, MAX_MONSTERS - other);
        side.querySelectorAll(`[data-k="${k}"]`).forEach((x) => { if (x !== el) x.value = v; });
      }
      this._set(k, v);
      this._shows();
      this._touch();
    });

    const c = this.canvas;
    new ResizeObserver(() => this._resize()).observe(c.parentElement);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [wx, wz] = this._toWorld(e.offsetX, e.offsetY);
      this._userView = true;
      this.view.sc = Math.min(30, Math.max(1.2, this.view.sc * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      const [nx, nz] = this._toWorld(e.offsetX, e.offsetY);
      this.view.cx += wx - nx; this.view.cz += wz - nz;
      this._draw();
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    addEventListener('pointerup', () => { if (this.drag && this.drag.moved && this.drag.obj) this._touch(); this.drag = null; });
    addEventListener('keydown', (e) => this._key(e));
  }

  _key(e) {
    if (!this.active || document.querySelector('.modal.show')) return;
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Escape') { this.tool = null; $('edSide').querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', !b.dataset.tool)); this.canvas.style.cursor = 'default'; this.sel = null; this._selPanel(); this._draw(); }
    if ((e.code === 'Delete' || e.code === 'Backspace') && this.sel) { e.preventDefault(); this._delete(); }
    if (e.code === 'KeyR' && this.sel) {
      const d = (e.shiftKey ? -15 : 15) * Math.PI / 180;
      if (this.sel === 'van') this.scn.van.r += d; else if (this.sel !== 'lake') this.sel.r += d;
      this._sync(); this._touch();
    }
    if (e.code === 'KeyD' && (e.ctrlKey || e.metaKey) && this.sel) { e.preventDefault(); this._duplicate(); }
    if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.save(); }
    if (e.code === 'KeyF' || e.code === 'Home') { this._userView = false; this._fit(); this._draw(); }
  }

  _duplicate() {
    const s = this.sel; if (!s || s === 'van' || s === 'lake') return;
    if (this.scn.objects.length >= MAX_OBJECTS) { this._status(`Maximal ${MAX_OBJECTS} Objekte`, '#ff5a4a'); return; }
    const o = { ...s, x: s.x + 6, z: s.z + 6 };
    this._clampObj(o);
    this.scn.objects.push(o); this.sel = o; this._selPanel(); this._touch();
  }

  _delete() {
    const s = this.sel; if (!s) return;
    if (s === 'van') { this._status('Den Van braucht man zum Abliefern – er kann nur verschoben werden.', '#ffb547'); return; }
    if (s === 'lake') this.scn.lake = null; else this.scn.objects = this.scn.objects.filter((o) => o !== s);
    this.sel = null; this._sync(); this._touch();
  }

  _clampObj(o) { const r = Math.hypot(o.x, o.z); if (r > MAP_RADIUS) { o.x *= MAP_RADIUS / r; o.z *= MAP_RADIUS / r; } }

  _hit(sx, sy) {
    const [x, z] = this._toWorld(sx, sy), sc = this.view.sc;
    const v = this.scn.van, vl = this._local(x, z, v.x, v.z, v.r);
    for (let i = this.scn.objects.length - 1; i >= 0; i--) {
      const o = this.scn.objects[i], f = FOOT[o.t];
      if (f) { const l = this._local(x, z, o.x, o.z, o.r); if (Math.abs(l[0]) < f[0] / 2 + 0.5 && Math.abs(l[1]) < f[1] / 2 + 0.5) return o; }
      if (Math.hypot(o.x - x, o.z - z) * sc < 14) return o;
    }
    if (Math.abs(vl[0]) < 1.2 * v.k && vl[1] > -2.6 * v.k && vl[1] < 2.3 * v.k) return 'van';
    const L = this.scn.lake;
    if (L && Math.hypot(L.x - x, L.z - z) < L.r) return 'lake';
    return null;
  }

  _local(x, z, ox, oz, r) { const dx = x - ox, dz = z - oz, c = Math.cos(r), s = Math.sin(r); return [dx * c - dz * s, dx * s + dz * c]; }

  _down(e) {
    const sx = e.offsetX, sy = e.offsetY;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetischer Pointer */ }
    if (e.button === 2 || e.button === 1) { this.drag = { pan: true, sx, sy, cx: this.view.cx, cz: this.view.cz }; return; }
    const [x, z] = this._toWorld(sx, sy);
    if (this.tool) {
      if (this.scn.objects.length >= MAX_OBJECTS) { this._status(`Maximal ${MAX_OBJECTS} Objekte`, '#ff5a4a'); return; }
      if (Math.hypot(x, z) > MAP_RADIUS) { this._status('Zu nah am Waldrand – weiter innen platzieren', '#ffb547'); return; }
      // Gebäude schauen standardmäßig zur Kartenmitte
      const o = { t: this.tool, x: Math.round(x * 2) / 2, z: Math.round(z * 2) / 2, r: Math.atan2(-x, -z) };
      this.scn.objects.push(o); this.sel = o; this._selPanel(); this._touch();
      this.app.audio.init(); this.app.audio.click();
      return;
    }
    const hit = this._hit(sx, sy);
    this.sel = hit; this._selPanel();
    if (hit) {
      const tgt = hit === 'van' ? this.scn.van : hit === 'lake' ? this.scn.lake : hit;
      this.drag = { obj: tgt, ox: tgt.x - x, oz: tgt.z - z };
    } else this.drag = { pan: true, sx, sy, cx: this.view.cx, cz: this.view.cz };
    this._draw();
  }

  _move(e) {
    const d = this.drag; if (!d) return;
    if (d.pan) { this._userView = true; this.view.cx = d.cx - (e.offsetX - d.sx) / this.view.sc; this.view.cz = d.cz - (e.offsetY - d.sy) / this.view.sc; this._draw(); return; }
    const [x, z] = this._toWorld(e.offsetX, e.offsetY);
    d.obj.x = Math.round((x + d.ox) * 2) / 2; d.obj.z = Math.round((z + d.oz) * 2) / 2;
    this._clampObj(d.obj);
    d.moved = true;
    this._draw();
  }

  // ---------------- Liste / Import / Export ----------------
  _openList() {
    const mine = Scenarios.list(), tpl = templates();
    const row = (s, tplRow) => `<div class="save-row"><div class="sr-main"><b>${esc(s.name)}</b><small>${esc(s.desc || 'Ohne Beschreibung')} · ${s.objects.length} Objekte</small></div>
      <div class="sr-btns">${tplRow ? `<button class="btn small primary" data-tpl="${s.id}">Als Vorlage nehmen</button>` : `<button class="btn small primary" data-open="${s.id}">Öffnen</button><button class="btn small" data-copy="${s.id}">Kopie</button><button class="btn small ghost" data-del="${s.id}">Löschen</button>`}</div></div>`;
    $('edList').innerHTML = `<div class="ed-h">Deine Szenarien</div>${mine.length ? mine.map((s) => row(s)).join('') : '<p class="hint">Noch keine gespeichert.</p>'}
      <div class="ed-h">Vorlagen</div>${tpl.map((s) => row(s, true)).join('')}`;
    $('edList').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const ask = () => !this.dirty || confirm('Ungespeicherte Änderungen verwerfen?');
      if (b.dataset.open && ask()) { this.scn = clone(Scenarios.get(b.dataset.open)); this.dirty = false; }
      else if (b.dataset.copy && ask()) { const s = clone(Scenarios.get(b.dataset.copy)); const n = newScenario(); this.scn = { ...s, id: n.id, name: s.name + ' (Kopie)' }; this.dirty = true; }
      else if (b.dataset.tpl && ask()) { const s = clone(tpl.find((x) => x.id === b.dataset.tpl)); this.scn = { ...s, id: newScenario().id }; this.dirty = true; }
      else if (b.dataset.del) { if (confirm('Szenario wirklich löschen?')) { Scenarios.remove(b.dataset.del); this._openList(); this.app.refreshMapLists(); } return; }
      else return;
      this.sel = null; this.app.ui.modal('edOpenModal', false); this._fit(); this._sync();
      this._status(this.dirty ? 'Ungespeicherte Änderungen' : 'Geöffnet');
    };
    this.app.ui.modal('edOpenModal', true);
  }

  _export() {
    this.scn.name = $('edName').value.trim() || this.scn.name;
    const json = JSON.stringify(sanitizeScenario(this.scn), null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = (this.scn.name.replace(/[^\w äöüÄÖÜß-]/g, '').trim() || 'szenario') + '.hollowpines.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this._status('Exportiert – die Datei kannst du Freunden schicken', '#4ce07a');
  }

  _import(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      let s = null;
      try { s = sanitizeScenario(JSON.parse(r.result)); } catch (e) { s = null; }
      $('edFile').value = '';
      if (!s) { this._status('Datei ist kein gültiges Szenario', '#ff5a4a'); return; }
      if (this.dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
      if (Scenarios.get(s.id)) s.id = newScenario().id; // nichts Bestehendes überschreiben
      this.scn = s; this.dirty = true; this.sel = null; this._fit(); this._sync();
      this._status('Importiert – zum Behalten speichern', '#4ce07a');
    };
    r.readAsText(file);
  }

  // ---------------- Zeichnen ----------------
  _resize() {
    const c = this.canvas, p = c.parentElement, dpr = Math.min(2, devicePixelRatio || 1);
    c.width = p.clientWidth * dpr; c.height = p.clientHeight * dpr;
    c.style.width = p.clientWidth + 'px'; c.style.height = p.clientHeight + 'px';
    this.dpr = dpr;
    if (!this._userView) this._fit(); // solange nicht selbst gezoomt wurde: immer ganze Karte zeigen
    this._draw();
  }
  _fit() { const p = this.canvas.parentElement; this.view = { cx: 0, cz: 0, sc: Math.max(1.2, Math.min(p.clientWidth, p.clientHeight) / (PLAY_R * 2 + 16)) }; }
  _toScreen(x, z) { const v = this.view, c = this.canvas, d = this.dpr || 1; return [c.width / d / 2 + (x - v.cx) * v.sc, c.height / d / 2 + (z - v.cz) * v.sc]; }
  _toWorld(sx, sy) { const v = this.view, c = this.canvas, d = this.dpr || 1; return [v.cx + (sx - c.width / d / 2) / v.sc, v.cz + (sy - c.height / d / 2) / v.sc]; }

  _draw() {
    if (!this.active || !this.scn) return;
    const g = this.ctx, d = this.dpr || 1, sc = this.view.sc;
    g.setTransform(d, 0, 0, d, 0, 0);
    const W = this.canvas.width / d, H = this.canvas.height / d;
    g.fillStyle = '#05080a'; g.fillRect(0, 0, W, H);
    // Spielfeld
    const [ox, oz] = this._toScreen(0, 0);
    g.fillStyle = '#0f1a10'; g.beginPath(); g.arc(ox, oz, PLAY_R * sc, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(30, 60, 25, ${0.15 + 0.25 * this.scn.rules.trees})`; g.fill();
    // Raster
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
    for (let i = -110; i <= 110; i += 10) {
      const [a, b] = this._toScreen(i, -110), [c2, d2] = this._toScreen(i, 110); g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d2); g.stroke();
      const [e, f] = this._toScreen(-110, i), [h, k] = this._toScreen(110, i); g.beginPath(); g.moveTo(e, f); g.lineTo(h, k); g.stroke();
    }
    g.strokeStyle = 'rgba(255,90,74,0.5)'; g.setLineDash([6, 6]); g.beginPath(); g.arc(ox, oz, MAP_RADIUS * sc, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#2a4a24'; g.lineWidth = 2; g.beginPath(); g.arc(ox, oz, PLAY_R * sc, 0, Math.PI * 2); g.stroke();
    // See
    const L = this.scn.lake;
    if (L) {
      const [lx, lz] = this._toScreen(L.x, L.z);
      g.fillStyle = '#123247'; g.beginPath(); g.arc(lx, lz, L.r * sc, 0, Math.PI * 2); g.fill();
      if (this.sel === 'lake') { g.strokeStyle = '#ffd040'; g.lineWidth = 2; g.stroke(); }
    }
    // Ebene Flächen
    for (const o of this.scn.objects) {
      const z = OBJECTS[o.t].zone; if (!z) continue;
      const [x, y] = this._toScreen(o.x, o.z);
      g.fillStyle = 'rgba(80,60,40,0.18)'; g.beginPath(); g.arc(x, y, z[0] * sc, 0, Math.PI * 2); g.fill();
    }
    this._drawVan(g, sc);
    // Objekte
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const o of this.scn.objects) {
      const [x, y] = this._toScreen(o.x, o.z), f = FOOT[o.t], sel = o === this.sel;
      g.save(); g.translate(x, y); g.rotate(-o.r);
      if (f) {
        g.fillStyle = o.t === 'chapel' || o.t === 'graves' ? 'rgba(160,160,150,0.55)' : 'rgba(150,110,70,0.6)';
        g.fillRect(-f[0] / 2 * sc, -f[1] / 2 * sc, f[0] * sc, f[1] * sc);
        if (sel) { g.strokeStyle = '#ffd040'; g.lineWidth = 2; g.strokeRect(-f[0] / 2 * sc - 2, -f[1] / 2 * sc - 2, f[0] * sc + 4, f[1] * sc + 4); }
      }
      // Blickrichtung (Tür)
      if (o.t !== 'loot' && o.t !== 'spawn') { g.strokeStyle = sel ? '#ffd040' : 'rgba(255,255,255,0.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, Math.max(10, ((f ? f[1] / 2 : 1) + 1.5) * sc)); g.stroke(); }
      g.restore();
      const fs = Math.max(13, Math.min(34, (f ? Math.min(f[0], f[1]) : 2.2) * sc * 0.8));
      if (o.t === 'spawn') { g.fillStyle = 'rgba(255,40,40,0.25)'; g.beginPath(); g.arc(x, y, Math.max(8, 3 * sc), 0, Math.PI * 2); g.fill(); }
      if (sel && !f) { g.strokeStyle = '#ffd040'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, fs * 0.7, 0, Math.PI * 2); g.stroke(); }
      g.font = `${fs}px sans-serif`; g.fillText(OBJECTS[o.t].ico, x, y);
    }
    // Legende
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = '12px Inter, sans-serif'; g.textAlign = 'left';
    g.fillText(`Linksklick: auswählen/ziehen · Rechts ziehen: Karte verschieben · Mausrad: Zoom · F: ganze Karte · ${Math.round(10 * sc)} px = 10 m`, 12, H - 14);
  }

  _drawVan(g, sc) {
    const v = this.scn.van, k = v.k, [x, y] = this._toScreen(v.x, v.z), sel = this.sel === 'van';
    g.save(); g.translate(x, y); g.rotate(-v.r);
    // Abgabezone (lokal x = 3.4, z = -0.6, 3.2 x 4.2)
    g.strokeStyle = '#ffc040'; g.lineWidth = 2; g.setLineDash([4, 3]);
    g.strokeRect((3.4 - 1.6) * k * sc, (-0.6 - 2.1) * k * sc, 3.2 * k * sc, 4.2 * k * sc); g.setLineDash([]);
    g.fillStyle = v.color; g.strokeStyle = sel ? '#ffd040' : '#000'; g.lineWidth = sel ? 3 : 1.5;
    g.fillRect(-1.1 * k * sc, -2.4 * k * sc, 2.2 * k * sc, 4.6 * k * sc); g.strokeRect(-1.1 * k * sc, -2.4 * k * sc, 2.2 * k * sc, 4.6 * k * sc);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-1 * k * sc, 1.2 * k * sc, 2 * k * sc, 0.8 * k * sc); // Fahrerhaus-Scheibe
    if (v.lights) { g.fillStyle = '#ff2ad5'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc((i % 2 ? 1 : -1) * 1.05 * k * sc, (-2.2 + Math.floor(i / 2) * 1.5) * k * sc, Math.max(1.5, 0.15 * k * sc), 0, Math.PI * 2); g.fill(); } }
    g.restore();
    g.font = `${Math.max(14, 2.5 * k * sc)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('🚐', x, y);
  }
}
