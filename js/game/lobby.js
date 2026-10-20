// Öffentliches Raum-Verzeichnis (Server-Browser) ohne eigenen Server:
// Hosts melden ihren Raum als "retained" Nachricht bei öffentlichen MQTT-Brokern an.
// Bricht die Verbindung des Hosts ab, löscht der Broker den Eintrag automatisch ("Last Will").
// Es werden mehrere Broker parallel genutzt – fällt einer aus, läuft die Liste weiter.
import { LOBBY_BROKERS } from '../config.js';

const BASE = 'hollowpines/v2/rooms/';
const STALE_MS = 90_000;

function clean(s, n) { return String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').slice(0, n); }

export class Lobby {
  constructor() {
    this.clients = [];
    this.rooms = new Map();   // code → {info, at}
    this.onChange = null;
    this.status = 'offline';
    this._hostClients = [];
  }

  get available() { return typeof mqtt !== 'undefined'; }

  /** Verbindet sich mit allen Brokern und abonniert die Raumliste. */
  connect() {
    if (!this.available || this.clients.length) return;
    this.status = 'connecting';
    for (const url of LOBBY_BROKERS) {
      let c;
      try { c = mqtt.connect(url, { connectTimeout: 8000, reconnectPeriod: 5000, clean: true }); } catch (e) { continue; }
      c.on('connect', () => {
        this.status = 'online';
        c.subscribe(BASE + '+', { qos: 0 });
        this._emit();
      });
      c.on('message', (topic, payload) => this._onMsg(topic, payload));
      c.on('error', () => {});
      this.clients.push(c);
    }
    this._prune = setInterval(() => this._emit(), 5000);
  }

  _onMsg(topic, payload) {
    const code = topic.slice(BASE.length);
    if (!/^[A-Z0-9]{5}$/.test(code)) return;
    const txt = payload ? payload.toString() : '';
    if (!txt) { if (this.rooms.delete(code)) this._emit(); return; }
    let r;
    try { r = JSON.parse(txt); } catch (e) { return; }
    if (!r || r.v !== 2 || r.code !== code) return;
    const info = {
      code, name: clean(r.name, 28) || 'Unbenannt', host: clean(r.host, 16), players: Math.max(1, Math.min(4, r.players | 0)),
      max: Math.max(2, Math.min(4, r.max | 0)), state: r.state === 'game' ? 'game' : 'lobby', night: r.night | 0, mic: !!r.mic, ts: +r.ts || 0,
    };
    this.rooms.set(code, { info, at: Date.now() });
    this._emit();
  }

  _emit() { if (this.onChange) this.onChange(this.list()); }

  list() {
    const now = Date.now();
    const out = [];
    for (const [code, r] of this.rooms) {
      // veraltet: Host meldet sich alle 20 s neu
      if (Math.abs(now - r.info.ts) > STALE_MS && now - r.at > STALE_MS) { this.rooms.delete(code); continue; }
      out.push(r.info);
    }
    return out.sort((a, b) => (a.state === 'lobby' ? 0 : 1) - (b.state === 'lobby' ? 0 : 1) || b.players - a.players);
  }

  // ---------- Host-Seite ----------
  /** Startet die Anmeldung eines öffentlichen Raums (eigene Verbindungen mit "Last Will"). */
  host(code) {
    this.stopHosting();
    if (!this.available) return;
    this.hostCode = code;
    for (const url of LOBBY_BROKERS) {
      try {
        const c = mqtt.connect(url, {
          connectTimeout: 8000, reconnectPeriod: 5000, clean: true,
          will: { topic: BASE + code, payload: '', retain: true, qos: 1 },
        });
        c.on('connect', () => { if (this._lastInfo) c.publish(BASE + code, JSON.stringify(this._lastInfo), { retain: true, qos: 1 }); });
        c.on('error', () => {});
        this._hostClients.push(c);
      } catch (e) { /* Broker nicht erreichbar */ }
    }
  }

  /** Aktuellen Raumzustand veröffentlichen (bei Änderungen und alle 20 s). */
  publish(info) {
    if (!this.hostCode) return;
    this._lastInfo = { v: 2, ...info, code: this.hostCode, ts: Date.now() };
    const msg = JSON.stringify(this._lastInfo);
    for (const c of this._hostClients) if (c.connected) c.publish(BASE + this.hostCode, msg, { retain: true, qos: 1 });
  }

  stopHosting() {
    if (!this.hostCode) return;
    const topic = BASE + this.hostCode;
    for (const c of this._hostClients) {
      try { if (c.connected) c.publish(topic, '', { retain: true, qos: 1 }, () => c.end(true)); else c.end(true); } catch (e) {}
    }
    this.rooms.delete(this.hostCode);
    this._hostClients = []; this.hostCode = null; this._lastInfo = null;
  }

  disconnect() {
    clearInterval(this._prune);
    for (const c of this.clients) { try { c.end(true); } catch (e) {} }
    this.clients = [];
    this.status = 'offline';
  }
}
