// Hollow Pines – App-Einstieg: Laden, Menü, Server-Browser, Lobby, Host/Join, Einstellungen, Hauptschleife.
import * as THREE from 'three';
import { Engine, detectQuality, PRESETS } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { AudioSys } from './engine/audio.js';
import { World } from './world/world.js';
import { UI, $, esc, ask } from './ui/ui.js';
import { makeRoomCode } from './game/net.js';
import { HybridNet } from './game/relaynet.js';
import { RoomNet } from './game/roomnet.js';
import { Lobby } from './game/lobby.js';
import { Game } from './game/game.js';
import { PLAYER_CSS } from './game/avatar.js';
import { Story } from './story.js';
import { checkForUpdate } from './updater.js';
import { TouchControls } from './engine/touch.js';
import { GodMode } from './game/godmode.js';
import { Editor } from './editor/editor.js';
import { Saves, describeSave, AUTO_ID } from './game/saves.js';
import { Scenarios, sanitizeScenario, templates } from './game/scenario.js';
import { ACTIONS, loadBinds, saveBinds, assign, buildMap, keyLabel, RESERVED } from './engine/keybinds.js';

// Kurz an den Browser abgeben (Ladebalken zeichnen) – auch in Hintergrund-Tabs, wo rAF pausiert
const frame = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 60); });
const load = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privat */ } };
const IN_ARTIFACT = !!(window.claude && window.claude.use);

class App {
  constructor() {
    this.canvas = $('c');
    this.settings = load('hp_settings', {
      quality: 'auto', volume: 0.8, sens: 1, mic: true, fps: false, fullscreen: true,
      name: 'Camper' + Math.floor(Math.random() * 90 + 10),
    });
    this.engine = new Engine(this.canvas);
    this.qualityKey = this.settings.quality === 'auto' ? detectQuality(this.engine.renderer) : this.settings.quality;
    this.engine.setQuality(this.qualityKey);
    this.engine.onDegrade = (msg) => this.ui.toast('⚙ ' + msg, '#6ad1ff', 3);
    this.audio = new AudioSys();
    this.audio.hq = this.qualityKey !== 'low';
    this.audio.setVolume(this.settings.volume);
    this.input = new Input(this.canvas);
    this.input.sensitivity = this.settings.sens;
    this.binds = loadBinds();
    this.input.setBinds(buildMap(this.binds));
    this._worldKey = 'default';
    this.ui = new UI(this.engine);
    this.audio.onMic = (st) => { if (this.net) this.net.setStream(st); $('btnMicLobby').textContent = '🎤 Mikrofon aktiv'; };
    this.game = null; this.net = null;
    this.lobbyPlayers = [];
    this.room = null;           // eigener/beigetretener Raum: {code, name, max, priv}
    this.lobby = new Lobby();
    this.menuT = 0;
    this._fwd = new THREE.Vector3();
    this.story = new Story(this);
    this.boot();
  }

  async boot() {
    try {
      this.ui.loading(0.15, 'Wald wird gepflanzt …'); await frame();
      this.world = new World(this.engine, 1337);
      this.ui.loading(0.75, 'Shader werden kompiliert …'); await frame();
      this._menuCam(0);
      this.engine.renderer.compile(this.engine.scene, this.engine.camera);
      this.ui.loading(1, 'Bereit.'); await frame();
    } catch (e) {
      console.error(e);
      this.ui.loading(1, 'Fehler beim Laden: ' + e.message);
      return;
    }
    $('gpuInfo').textContent = 'Grafik: ' + PRESETS[this.qualityKey].name + (this.settings.quality === 'auto' ? ' (auto)' : '');
    $('loading').style.opacity = '0';
    setTimeout(() => { $('loading').classList.remove('show'); this.ui.screen('menu'); }, 600);
    this.editor = new Editor(this);
    this.touch = new TouchControls(this);
    this.god = new GodMode(this);
    checkForUpdate();
    $('btnUpdateLater').onclick = () => $('updateBar').classList.add('hidden');
    this._bindUI();
    this._renderStats();
    this.refreshMapLists();
    this._renderKeys();
    // Nach "Übernehmen & neu laden" im Spiel: direkt dort weiterspielen
    let resume = null;
    try { resume = JSON.parse(sessionStorage.getItem('hp_resume') || 'null'); sessionStorage.removeItem('hp_resume'); } catch (e) { resume = null; }
    if (resume && resume.data) setTimeout(() => { this.startSolo({ save: resume.data }); this.ui.toast('⚙ Einstellungen übernommen – du spielst genau dort weiter', '#6ad1ff', 3.5); }, 650);
    // Beim Schließen/Verlassen automatisch speichern
    addEventListener('beforeunload', () => { if (this.game) this.game.autosave(); });
    addEventListener('pagehide', () => { if (this.game) this.game.autosave(); });
    // Raumliste schon im Hintergrund laden (Zähler am Mehrspieler-Button)
    if (!IN_ARTIFACT) {
      this.lobby.onChange = (list) => this._renderRooms(list);
      this.lobby.connect();
    }
    this._last = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  // ---------------- UI ----------------
  _bindUI() {
    const s = this.settings;
    $('nameInput').value = s.name;
    $('nameInput').addEventListener('change', () => { s.name = $('nameInput').value.trim().slice(0, 14) || 'Camper'; save('hp_settings', s); });
    document.querySelectorAll('.btn').forEach((b) => {
      b.addEventListener('mouseenter', () => this.audio.ctx && this.audio.hover());
      b.addEventListener('click', () => { this.audio.init(); this.audio.click(); });
    });
    // Vollbild automatisch bei der ersten Interaktion
    const goFull = () => {
      if (!this.settings.fullscreen || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    };
    addEventListener('pointerdown', goFull, true);
    addEventListener('keydown', (e) => { if (e.code !== 'Escape' && e.code !== 'F11') goFull(); }, true);

    // Beim ersten Spielen läuft zuerst die Story (ohne Überspringen), danach nie wieder automatisch
    $('btnSolo').onclick = () => this._storyFirst(() => this.startSolo());
    $('btnMulti').onclick = () => this._storyFirst(() => this.openBrowser());
    $('btnStory').onclick = () => this.playStory('menu');
    $('btnStoryLobby').onclick = () => this.playStory('lobby');
    $('btnBrBack').onclick = () => this.ui.screen('menu');
    $('btnJoin').onclick = () => this.joinGame($('joinCode').value.trim().toUpperCase());
    $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnJoin').click(); });
    $('joinCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    // Raum erstellen
    this._priv = false;
    const setVis = (priv) => {
      this._priv = priv;
      $('crPublic').classList.toggle('on', !priv); $('crPrivate').classList.toggle('on', priv);
      $('crHint').textContent = priv ? 'Nicht in der Liste. Nur wer den Code kennt, kommt rein.' : 'Erscheint in der Liste. Jeder kann beitreten.';
    };
    $('crPublic').onclick = () => setVis(false);
    $('crPrivate').onclick = () => setVis(true);
    $('btnCreate').onclick = () => this.hostGame({
      name: ($('crName').value.trim() || `${this.name}s Camp`).slice(0, 28),
      max: +$('crMax').value || 4,
      priv: this._priv,
    });
    $('brMic').onchange = (e) => { s.mic = e.target.checked; save('hp_settings', s); if (s.mic) this._mic(); else this.audio.setMicMuted(true); };

    $('btnSettings').onclick = () => this.openSettings();
    $('btnControls').onclick = () => { this._renderKeys(); this.ui.modal('controls', true); };
    $('btnEditor').onclick = () => { this.audio.init(); this.editor.open(); };
    $('btnLoad').onclick = () => this.openSaves('load');
    $('btnContinue').onclick = () => { const a = Saves.get(AUTO_ID); if (a) this._storyFirst(() => this.startSolo({ save: a.data })); };
    $('mapSelect').onchange = (e) => { s.map = e.target.value; save('hp_settings', s); };
    $('lobbyMap').onchange = () => { if (this.net && this.net.isHost) this._broadcastLobby(); };
    $('lobbySave').onchange = () => { const sv = Saves.get($('lobbySave').value); if (sv) $('lobbyMap').value = ''; if (this.net && this.net.isHost) this._broadcastLobby(); };
    $('btnPauseSave').onclick = () => this.openSaves('save');
    $('btnSavesClose').onclick = () => { this.ui.modal('saves', false); if (this._savesFromPause) this._maybeResume(); };
    $('btnSaveNew').onclick = () => this._saveTo(null, $('saveName').value.trim());
    $('saveName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnSaveNew').click(); });
    $('btnKeysReset').onclick = () => { this.binds = {}; for (const x of ACTIONS) this.binds[x.a] = x.def; this._applyBinds(); };
    $('btnCloseControls').onclick = () => { this.ui.modal('controls', false); this._maybeResume(); };
    $('btnCloseSettings').onclick = () => { this.ui.modal('settings', false); this._maybeResume(); };
    $('btnApplyReload').onclick = () => this._applyReload();
    $('optQuality').onchange = (e) => { s.quality = e.target.value; save('hp_settings', s); };
    $('optVolume').oninput = (e) => { s.volume = +e.target.value; this.audio.setVolume(s.volume); save('hp_settings', s); };
    $('optSens').oninput = (e) => { s.sens = +e.target.value; this.input.sensitivity = s.sens; save('hp_settings', s); };
    $('optMic').onchange = async (e) => { s.mic = e.target.checked; save('hp_settings', s); $('brMic').checked = s.mic; if (s.mic) await this._mic(); else this.audio.setMicMuted(true); };
    $('optFps').onchange = (e) => { s.fps = e.target.checked; save('hp_settings', s); $('fps').classList.toggle('hidden', !s.fps); };
    $('optFull').onchange = (e) => { s.fullscreen = e.target.checked; save('hp_settings', s); };
    $('fps').classList.toggle('hidden', !s.fps);
    $('btnCopy').onclick = () => { try { navigator.clipboard.writeText($('roomCode').textContent).then(() => this.ui.toast('Code kopiert', '#ffb547', 1.2), () => {}); } catch (e) { /* Code ist sichtbar */ } };
    $('btnMicLobby').onclick = () => this._mic();
    $('btnLeaveLobby').onclick = () => this.exitToMenu();
    $('btnStart').onclick = () => this.startHosted();
    $('btnNextNight').onclick = () => this.game && this.game.nextNight();
    $('btnCasino').onclick = () => this.game && this.game.enterCasino();
    $('btnSkipNight').onclick = async () => { if (this.game && await ask(`Crane ${this.game.skipPrice()} $ zahlen und Nacht ${this.game.night + 1} überspringen?`, { ok: 'Bezahlen' })) this.game.skipNight(); };
    $('btnCasClose').onclick = () => this.game && this.game.casino.close();
    $('btnCasResume').onclick = () => { this.ui.modal('casinoMenu', false); this.input.lock(); };
    $('btnCasShop').onclick = () => this.game && this.game.exitCasino();
    $('btnCasNext').onclick = () => { if (this.game) { this.ui.modal('casinoMenu', false); this.game.nextNight(); } };
    $('btnCasSettings').onclick = () => { this.ui.modal('casinoMenu', false); this.openSettings(); };
    $('btnToMenu').onclick = () => this.exitToMenu();
    $('btnRetry').onclick = () => this.game && this.game.retry();
    $('btnResume').onclick = () => { this.ui.modal('pause', false); this.input.lock(); };
    $('btnPauseSettings').onclick = () => { this.ui.modal('pause', false); this.openSettings(); };
    $('btnPauseControls').onclick = () => { this.ui.modal('pause', false); this._renderKeys(); this.ui.modal('controls', true); };
    $('btnQuit').onclick = () => this.exitToMenu();
    $('btnMsgOk').onclick = () => this.ui.modal('message', false);
    this.canvas.addEventListener('click', () => {
      this.audio.init();
      if (this.game && this.game.phase === 'play' && !this.input.locked && !document.querySelector('.modal.show')) this.input.lock();
    });
    $('clickToPlay').addEventListener('click', () => this.input.lock());
  }

  // ---------------- Grafik neu laden, ohne das Spiel zu verlieren ----------------
  async _applyReload() {
    const s = this.settings;
    save('hp_settings', s);
    const g = this.game;
    if (g && this.net) {
      if (!(await ask('Neu laden beendet die Mehrspieler-Runde für alle. ' + (g.isHost ? 'Dein Fortschritt wird gespeichert – du kannst ihn danach in der Lobby unter „Spielstand“ fortsetzen. ' : '') + 'Trotzdem neu laden?', { ok: 'Neu laden' }))) return;
      if (g.isHost) g.autosave();
    } else if (g) {
      const d = g.serialize();
      if (d) { try { sessionStorage.setItem('hp_resume', JSON.stringify({ data: d })); } catch (e) { /* ohne Fortsetzen */ } g.autosave(); }
    }
    location.reload();
  }

  // ---------------- Tastenbelegung ----------------
  _renderKeys() {
    const box = $('keyList');
    box.innerHTML = '';
    for (const x of ACTIONS) {
      const row = document.createElement('div');
      const b = document.createElement('button');
      b.className = 'kb' + (this.binds[x.a] !== x.def ? ' changed' : '');
      b.textContent = keyLabel(this.binds[x.a]);
      b.onclick = () => {
        box.querySelectorAll('.kb.wait').forEach((o) => o.classList.remove('wait'));
        b.classList.add('wait'); b.textContent = 'Taste …';
        this.input.capture = (code) => {
          if (code !== 'Escape' && !RESERVED.has(code)) { assign(this.binds, x.a, code); this._applyBinds(); }
          else this._renderKeys();
        };
      };
      row.appendChild(b);
      row.appendChild(document.createTextNode(' ' + x.name));
      box.appendChild(row);
    }
  }
  _applyBinds() { saveBinds(this.binds); this.input.setBinds(buildMap(this.binds)); this._renderKeys(); }

  // ---------------- Karten (Szenarien) ----------------
  /** id → Szenario (eigene oder Vorlage), '' = Standard */
  getMap(id) { if (!id) return null; return Scenarios.get(id) || templates().find((t) => t.id === id) || null; }

  refreshMapLists() {
    const mine = Scenarios.list(), tpl = templates();
    const opts = `<option value="">🌲 Standard-Camp</option>`
      + (mine.length ? `<optgroup label="Deine Szenarien">${mine.map((m, i) => `<option value="${m.id}">Szenario ${i + 1}: ${esc(m.name)}</option>`).join('')}</optgroup>` : '')
      + `<optgroup label="Vorlagen">${tpl.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</optgroup>`;
    for (const id of ['mapSelect', 'lobbyMap']) {
      const el = $(id), cur = id === 'mapSelect' ? this.settings.map || '' : el.value;
      el.innerHTML = opts;
      el.value = this.getMap(cur) ? cur : '';
    }
    const saves = Saves.list();
    $('lobbySave').innerHTML = `<option value="">Neues Spiel</option>` + saves.map((sv) => `<option value="${sv.id}">${esc(sv.name)} – Nacht ${sv.data.night}</option>`).join('');
    const auto = Saves.get(AUTO_ID);
    $('btnContinue').classList.toggle('hidden', !auto);
    if (auto) $('btnContinue').innerHTML = `▶ Weiterspielen<small>Nacht ${auto.data.night} · ${esc(auto.data.scenario ? auto.data.scenario.name : 'Standard-Camp')}</small>`;
  }

  /** Welt für ein Szenario bauen (null = Standard). Baut nur neu, wenn sich die Karte ändert. */
  setWorld(scn) {
    const key = scn ? scn.id + ':' + scn.rev : 'default';
    if (this._worldKey === key) return;
    this.world.dispose();
    this.world = new World(this.engine, 1337, scn);
    this.engine.renderer.compile(this.engine.scene, this.engine.camera);
    this._worldKey = key;
  }

  // ---------------- Spielstände ----------------
  openSaves(mode) {
    this._savesMode = mode;
    const inGame = mode === 'save';
    this._savesFromPause = inGame;
    if (inGame) this.ui.modal('pause', false);
    $('savesTitle').textContent = inGame ? '💾 Spiel speichern' : '💾 Spiel laden';
    $('savesNew').classList.toggle('hidden', !inGame);
    $('saveName').value = inGame && this.game ? `Nacht ${this.game.night} – ${new Date().toLocaleDateString('de-DE')}` : '';
    $('savesHint').textContent = inGame && this.game && !this.game.isHost ? 'Nur der Host kann speichern.' : '';
    this._renderSaves();
    this.ui.modal('saves', true);
  }

  _renderSaves() {
    const inGame = this._savesMode === 'save', canSave = inGame && this.game && this.game.isHost;
    const list = Saves.list();
    const box = $('savesList');
    if (!list.length) { box.innerHTML = '<p class="hint">Noch keine Spielstände. Im Spiel: Esc → 💾 Speichern. Außerdem speichert das Spiel automatisch.</p>'; return; }
    box.innerHTML = list.map((sv) => {
      const auto = sv.id === AUTO_ID;
      const btns = inGame
        ? `${canSave && !auto ? `<button class="btn small primary" data-over="${sv.id}">Überschreiben</button>` : ''}<button class="btn small ghost" data-del="${sv.id}">Löschen</button>`
        : `<button class="btn small primary" data-load="${sv.id}">Laden</button>${auto ? '' : `<button class="btn small" data-ren="${sv.id}">Umbenennen</button>`}<button class="btn small ghost" data-del="${sv.id}">Löschen</button>`;
      return `<div class="save-row${auto ? ' auto' : ''}"><div class="sr-main"><b>${auto ? '🔄 ' : ''}${esc(sv.name)}</b><small>${esc(describeSave(sv.data))}</small><small>${new Date(sv.date).toLocaleString('de-DE')}</small></div><div class="sr-btns">${btns}</div></div>`;
    }).join('');
    box.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.load) { const sv = Saves.get(b.dataset.load); this.ui.modal('saves', false); if (sv) this.startSolo({ save: sv.data }); }
      else if (b.dataset.over) { if (await ask('Diesen Spielstand überschreiben?', { ok: 'Überschreiben' })) this._saveTo(b.dataset.over); }
      else if (b.dataset.ren) { const n = await ask('Neuer Name:', { input: Saves.get(b.dataset.ren).name }); if (n) { Saves.rename(b.dataset.ren, n); this._renderSaves(); this.refreshMapLists(); } }
      else if (b.dataset.del) { if (await ask('Spielstand wirklich löschen?', { ok: 'Löschen' })) { Saves.remove(b.dataset.del); this._renderSaves(); this.refreshMapLists(); } }
    };
  }

  _saveTo(id, name) {
    const g = this.game;
    if (!g || !g.isHost) { this.ui.toast('Nur der Host kann speichern', '#888', 2); return; }
    const d = g.serialize();
    if (!d) { this.ui.toast('Gerade gibt es nichts zu speichern', '#888', 2); return; }
    const e = Saves.put(d, { id: id || undefined, name: name || undefined });
    if (!e) { this.ui.toast('Speichern fehlgeschlagen – Speicher voll oder zu viele Spielstände (max. 20)', '#ff5a4a', 3); return; }
    this.audio.cash();
    this.ui.toast(`💾 Gespeichert: ${esc(e.name)}`, '#4ce07a', 2);
    this._renderSaves(); this.refreshMapLists();
  }

  _maybeResume() {
    if (this.game && this.game.inCasino) { this.ui.modal('casinoMenu', true); return; }
    if (this.game && this.game.phase === 'play') { this.ui.modal('pause', true); this.game.renderPause(); }
  }

  openSettings() {
    const s = this.settings;
    $('optQuality').value = s.quality; $('optVolume').value = s.volume; $('optSens').value = s.sens;
    $('optMic').checked = s.mic; $('optFps').checked = s.fps; $('optFull').checked = s.fullscreen;
    this.ui.modal('settings', true);
  }

  async _mic() {
    if (!this.settings.mic) return null;
    this.audio.init();
    const st = await this.audio.enableMic();
    if (!st) { this.ui.toast('Kein Mikrofon gefunden. Du spielst ohne. Monster hören nur deine Schritte.', '#ff8a4a', 3.5); return null; }
    this.audio.setMicMuted(false);
    $('btnMicLobby').textContent = '🎤 Mikrofon aktiv';
    if (this.net) this.net.setStream(st);
    return st;
  }

  _renderStats() {
    const st = load('hp_stats', { bestNight: 0, totalLoot: 0, games: 0 });
    $('stats').innerHTML = st.games
      ? `Rekord: <b>Nacht ${st.bestNight}</b> · Gesamte Beute: <b>${st.totalLoot} $</b> · Runden: <b>${st.games}</b>`
      : 'Noch keine Runde gespielt. Wie lange hältst du durch?';
  }

  saveStats(night, loot) {
    const st = load('hp_stats', { bestNight: 0, totalLoot: 0, games: 0 });
    st.bestNight = Math.max(st.bestNight, night); st.totalLoot += loot; st.games++;
    save('hp_stats', st);
    this._renderStats();
    return st;
  }

  get name() { return (this.settings.name || 'Camper').slice(0, 14); }

  // ---------------- Server-Browser ----------------
  openBrowser() {
    this.audio.init();
    $('crName').value = $('crName').value || `${this.name}s Camp`;
    $('brMic').checked = this.settings.mic;
    this.ui.screen('browser');
    if (IN_ARTIFACT) {
      $('brStatus').textContent = 'Auf claude.ai: Räume nur per Code';
      $('brStatus').className = 'br-status off';
      $('brRooms').innerHTML = '<div class="br-empty">Die öffentliche Raumliste gibt es in der Netlify- und der .exe-Version.<br>Hier: Raum erstellen und den Code teilen.</div>';
      return;
    }
    this.lobby.connect();
    this._renderRooms(this.lobby.list());
  }

  _renderRooms(list) {
    $('menuRooms').textContent = list.length ? `${list.length} offen` : '';
    const on = this.lobby.status === 'online';
    $('brStatus').textContent = on ? 'Online · Liste aktualisiert sich live' : 'Verbinde mit dem Raum-Verzeichnis …';
    $('brStatus').className = 'br-status ' + (on ? 'on' : '');
    if ($('browser').classList.contains('show')) this.ui.rooms(list, (code) => this.joinGame(code));
  }

  // ---------------- Spielmodi ----------------
  playStory(back, then, forced = false) {
    this.audio.init();
    this.ui.screen(null);
    this.story.play(() => {
      if (then) then();
      else if (!this.game) this.ui.screen(back);
    }, forced);
  }

  _storyFirst(go) {
    if (Story.seen()) go(); else this.playStory('menu', go, true);
  }

  /** opts: { save, scenario, fromEditor } */
  async startSolo(opts = {}) {
    this.audio.init();
    if (this.settings.mic) this._mic(); // läuft im Hintergrund, blockiert den Start nicht
    const save = opts.save || null;
    const scn = save ? sanitizeScenario(save.scenario) : opts.scenario !== undefined ? opts.scenario : this.getMap(this.settings.map);
    this._fromEditor = !!opts.fromEditor;
    this.ui.screen(null);
    this.setWorld(scn);
    this.game = new Game(this, { mode: 'sp', myId: 'local', seed: save ? save.seed : Math.floor(Math.random() * 1e9), players: [{ id: 'local', name: this.name, color: 0 }], scenario: scn, save });
  }

  async _setupNet() {
    // Als claude.ai-Artifact: WebRTC ist dort gesperrt → Plattform-"room" nutzen
    let room = null;
    if (IN_ARTIFACT) { try { room = await window.claude.use('room'); } catch (e) { room = null; } }
    const net = room ? new RoomNet(room) : new HybridNet();
    this.net = net;
    net.on('msg', (m, from) => {
      if (this.net !== net) return;
      if (net.isHost && m.t === 'hello') { this._hello(m, from); return; }
      if (this.game) { this.game.handle(m, from); return; }
      this._lobbyMsg(m, from);
    });
    net.on('voice', (id, stream) => this.audio.addVoice(id, stream));
    net.on('voiceEnd', (id) => this.audio.removeVoice(id));
    net.on('error', (e) => console.warn('Netz:', e));
    net.on('relay', () => this.ui.toast('🛰 Direkte Verbindung blockiert (VPN/Firewall?) – du spielst über das Relay. Voice-Chat ist dabei aus.', '#6ad1ff', 5));
    return net;
  }

  async _voiceStream() {
    let st = null;
    if (this.settings.mic) st = await this._mic();
    if (!st) st = this.audio.ctx.createMediaStreamDestination().stream; // stummer Stream: man hört die anderen trotzdem
    if (this.net) this.net.setStream(st);
  }

  _playerCount() { return this.game ? this.game.players.size : this.lobbyPlayers.length; }

  _announce() {
    const r = this.room;
    if (!r || r.priv || !this.net || !this.net.isHost || IN_ARTIFACT) return;
    this.lobby.publish({
      name: r.name, host: this.name, players: this._playerCount(), max: r.max,
      state: this.game ? 'game' : 'lobby', night: this.game ? this.game.night : 0, mic: !!this.settings.mic,
    });
  }

  async hostGame(opts = { name: `${this.name}s Camp`, max: 4, priv: false }) {
    this.audio.init();
    const net = await this._setupNet();
    net.maxPlayers = opts.max;
    $('roomCode').textContent = '…';
    this.ui.screen('lobby');
    this.ui.lobby([], true, { name: opts.name, max: opts.max, priv: opts.priv });
    $('btnStart').disabled = true;
    const code = makeRoomCode();
    try {
      await net.host(code);
    } catch (e) {
      this.exitToMenu();
      this.ui.message('Raum erstellen fehlgeschlagen', (e.message || String(e)) + '. Für Mehrspieler wird eine Internetverbindung benötigt.');
      return;
    }
    if (this.net !== net) return;
    this.room = { code, ...opts };
    $('roomCode').textContent = code;
    $('pauseCode').textContent = `${opts.name} · Code ${code}`;
    $('btnStart').disabled = false;
    this.lobbyPlayers = [{ id: net.myId, name: this.name, color: 0, host: true }];
    if (!opts.priv && !IN_ARTIFACT) { this.lobby.host(code); this._announceTimer = setInterval(() => this._announce(), 20000); }
    this._broadcastLobby();
    this._announce();
    net.on('leave', (id) => {
      const p = this.lobbyPlayers.find((x) => x.id === id);
      this.lobbyPlayers = this.lobbyPlayers.filter((x) => x.id !== id);
      if (this.game) this.game.removePlayer(id);
      else this._broadcastLobby();
      if (p && !this.game) this.ui.toast(`${esc(p.name)} hat den Raum verlassen`, '#888', 2);
      this._announce();
    });
    await this._voiceStream();
  }

  _hello(m, from) {
    const name = String(m.name || 'Camper').replace(/[<>]/g, '').slice(0, 14);
    if (this.lobbyPlayers.find((p) => p.id === from)) return;
    if (this._playerCount() >= (this.room ? this.room.max : 4)) { this.net.send(from, { t: 'full' }); return; }
    const used = new Set(this.lobbyPlayers.map((p) => p.color));
    let color = 0; while (used.has(color)) color++;
    this.lobbyPlayers.push({ id: from, name, color });
    this.audio.tone(660, 880, 0.15, 0.1, 'triangle');
    if (this.game) this.game.addLatePlayer(from, name, color);
    else { this._broadcastLobby(); this.ui.toast(`${esc(name)} ist beigetreten`, '#4ce07a', 2); }
    this._announce();
  }

  kick(id, name) {
    if (!this.net || !this.net.isHost) return;
    this.net.kick(id);
    this.ui.toast(`${esc(name || 'Spieler')} wurde gekickt`, '#ff8a4a', 2);
    if (this.game) setTimeout(() => this.game && this.game.renderPause(), 500);
  }

  kicked() {
    this.exitToMenu();
    this.ui.message('Gekickt', 'Der Host hat dich aus dem Raum entfernt.');
  }

  async joinGame(code) {
    code = String(code || '').toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) { this.ui.message('Code ungültig', 'Der Raum-Code hat 5 Zeichen, zum Beispiel K7QX2.'); return; }
    this.audio.init();
    const net = await this._setupNet();
    $('roomCode').textContent = code;
    this.ui.screen('lobby');
    this.ui.lobby([], false, {});
    $('lobbyHint').textContent = 'Verbinde …';
    try {
      await net.join(code);
    } catch (e) {
      if (this.net === net) this.exitToMenu('browser');
      this.ui.message('Beitreten fehlgeschlagen', e.message || String(e));
      return;
    }
    if (this.net !== net) return;
    $('pauseCode').textContent = 'Raum-Code: ' + code;
    net.toHost({ t: 'hello', name: this.name });
    net.on('hostLost', () => {
      if (this.net !== net) return;
      this.exitToMenu('browser');
      this.ui.message('Verbindung getrennt', 'Der Host hat das Spiel beendet oder die Verbindung verloren.');
    });
    await this._voiceStream();
  }

  _lobbyMsg(m) {
    const net = this.net;
    if (net.isHost) return;
    if (m.t === 'lobby') {
      this.lobbyPlayers = m.players;
      if (m.room) this.room = m.room;
      const r = this.room || {};
      this.ui.lobby(m.players.map((p) => ({ ...p, css: PLAYER_CSS[p.color % 4] })), false, { name: r.name, max: r.max, priv: r.priv, myId: net.myId });
      $('lobbyHostOpts').classList.add('hidden');
      $('lobbyMapInfo').textContent = r.map ? `Karte: ${r.map}` : '';
      for (const p of m.players) if (p.id !== net.myId && net.myId < p.id) net.callPeer(p.id);
    } else if (m.t === 'start') {
      if (this.story.active) { this.story.onDone = null; this.story.finish(); }
      this.ui.screen(null);
      const scn = m.scenario ? sanitizeScenario(m.scenario) : null;
      this.setWorld(scn);
      this.game = new Game(this, { mode: 'client', myId: net.myId, seed: m.seed, players: m.players, scenario: scn });
      for (const p of m.players) if (p.id !== net.myId && net.myId < p.id) net.callPeer(p.id);
    } else if (m.t === 'full') {
      this.exitToMenu('browser'); this.ui.message('Raum voll', 'Dieser Raum ist schon voll.');
    } else if (m.t === 'kicked') {
      this.kicked();
    }
  }

  /** Host: gewählte Karte bzw. Karte des gewählten Spielstands */
  _lobbyChoice() {
    const sv = Saves.get($('lobbySave').value);
    if (sv) return { save: sv.data, scn: sanitizeScenario(sv.data.scenario) };
    return { save: null, scn: this.getMap($('lobbyMap').value) };
  }

  _broadcastLobby() {
    const r = this.room || {};
    const ch = this._lobbyChoice();
    r.map = (ch.scn ? ch.scn.name : 'Standard-Camp') + (ch.save ? ` · Spielstand Nacht ${ch.save.night}` : '');
    $('lobbyHostOpts').classList.remove('hidden');
    $('lobbyMap').disabled = !!ch.save;
    $('lobbyMapInfo').textContent = ch.save ? `Fortsetzen: ${describeSave(ch.save)}` : ch.scn ? (ch.scn.desc || '') : '';
    const list = this.lobbyPlayers.map((p) => ({ ...p, css: PLAYER_CSS[p.color % 4] }));
    this.ui.lobby(list, true, { name: r.name, max: r.max, priv: r.priv, myId: this.net.myId, onKick: (id, name) => this.kick(id, name) });
    this.net.broadcast({ t: 'lobby', players: this.lobbyPlayers, room: { name: r.name, max: r.max, priv: r.priv, map: r.map } });
  }

  startHosted() {
    if (!this.net || !this.net.isHost) return;
    if (this.story.active) { this.story.onDone = null; this.story.finish(); }
    const { save: sv, scn } = this._lobbyChoice();
    const seed = sv ? sv.seed : Math.floor(Math.random() * 1e9);
    this.setWorld(scn);
    this.net.broadcast({ t: 'start', seed, players: this.lobbyPlayers, scenario: scn });
    this.ui.screen(null);
    this.game = new Game(this, { mode: 'host', myId: this.net.myId, seed, players: this.lobbyPlayers, scenario: scn, save: sv });
    this._announce();
  }

  exitToMenu(screen = 'menu') {
    if (this.story.active) { this.story.onDone = null; this.story.finish(); }
    if (this.game) { this.game.autosave(); this.game.dispose(); this.game = null; }
    clearInterval(this._announceTimer);
    this.lobby.stopHosting();
    if (this.net) { const n = this.net; this.net = null; n.destroy(); }
    this.room = null; this.lobbyPlayers = [];
    for (const id of [...this.audio.voices.keys()]) this.audio.removeVoice(id);
    ['pause', 'shop', 'gameover', 'endcard', 'settings', 'controls', 'saves', 'casinoUI', 'casinoMenu', 'godPanel'].forEach((m) => this.ui.modal(m, false));
    this.input.unlock();
    this.ui.hud(false);
    this.setWorld(null);
    this.refreshMapLists();
    if (this._fromEditor && screen === 'menu') { this._fromEditor = false; this.editor.open(); }
    else if (screen === 'browser') this.openBrowser(); else this.ui.screen('menu');
    this._renderStats();
    $('btnMicLobby').textContent = this.audio.micStream ? '🎤 Mikrofon aktiv' : '🎤 Mikrofon aktivieren';
  }

  // ---------------- Schleife ----------------
  _menuCam(dt) {
    this.menuT += dt;
    const w = this.world, cam = this.engine.camera;
    const a = this.menuT * 0.035 + 2.2;
    const cx = w.clearing.x, cz = w.clearing.z;
    const x = cx + Math.cos(a) * 15, z = cz + Math.sin(a) * 15;
    cam.position.set(x, w.height(x, z) + 3.2 + Math.sin(this.menuT * 0.2) * 0.4, z);
    cam.lookAt(cx + Math.cos(a + 2.4) * 4, w.height(cx, cz) + 1.6, cz + Math.sin(a + 2.4) * 4);
    this.engine.fx.danger = 0.15;
  }

  _loop(t) {
    const dt = Math.min(0.05, (t - this._last) / 1000);
    this._last = t;
    if (this.story.active) this.story.update(dt);
    else if (this.game) this.game.update(dt);
    else {
      this._menuCam(dt);
      this.world.update(dt, this.engine.time, this.engine.camera.position);
      if (this.audio.ctx) {
        const f = this._fwd.set(0, 0, -1).applyQuaternion(this.engine.camera.quaternion);
        this.audio.setListener(this.engine.camera.position, f);
      }
    }
    this.audio.update(dt);
    if (this.touch) this.touch.update();
    if (this.god) this.god.update(dt);
    const ml = (this.audio.micLevel * 100).toFixed(0) + '%';
    if (this.ui.isModal('settings')) $('setMic').style.width = ml;
    if ($('lobby').classList.contains('show')) $('lobbyMic').style.width = ml;
    this.engine.render(dt);
    this.input.endFrame();
    requestAnimationFrame((tt) => this._loop(tt));
  }
}

window.app = new App();
