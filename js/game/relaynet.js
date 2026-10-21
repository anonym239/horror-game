// Verbindung von überall: Hybrid aus WebRTC (PeerJS, schnell, mit Voice) und einem Relay über
// öffentliche MQTT-Broker (WebSocket über normale Web-Ports – klappt auch hinter VPN, Firewall,
// Handy-Hotspot oder Uni-WLAN, wo WebRTC scheitert).
// Der Host lauscht immer auf beiden Wegen. Ein Client versucht zuerst WebRTC und weicht
// automatisch auf das Relay aus, wenn die direkte Verbindung nicht zustande kommt.
import { Net } from './net.js';
import { LOBBY_BROKERS } from '../config.js';

const BASE = 'hollowpines/v3/relay/';
const P2P_TIMEOUT = 9000;     // so lange wird WebRTC versucht
const RELAY_TIMEOUT = 12000;
const PING_MS = 3000, LOST_MS = 15000;

const rid = () => 'mq-' + Math.random().toString(36).slice(2, 10);

/** Gemeinsame MQTT-Verbindungen zu allen Brokern. */
class Brokers {
  constructor(onMsg) {
    this.clients = [];
    this.onMsg = onMsg;
    this.subs = [];
  }
  get available() { return typeof mqtt !== 'undefined'; }
  connect(topics) {
    if (!this.available) throw new Error('Relay nicht verfügbar');
    this.subs = topics;
    for (const url of LOBBY_BROKERS) {
      let c;
      try { c = mqtt.connect(url, { connectTimeout: 8000, reconnectPeriod: 4000, clean: true }); } catch (e) { continue; }
      c.on('connect', () => c.subscribe(this.subs, { qos: 0 }));
      c.on('message', (topic, payload) => {
        let d; try { d = JSON.parse(payload.toString()); } catch (e) { return; }
        if (d && typeof d === 'object') this.onMsg(topic, d, c);
      });
      c.on('error', () => {});
      this.clients.push(c);
    }
  }
  pub(c, topic, d) { try { if (c && c.connected) c.publish(topic, JSON.stringify(d), { qos: 0 }); } catch (e) { /* Broker weg */ } }
  pubAll(topic, d) { for (const c of this.clients) this.pub(c, topic, d); }
  end() { for (const c of this.clients) { try { c.end(true); } catch (e) { /* egal */ } } this.clients = []; }
}

export class HybridNet {
  constructor() {
    this.handlers = {};
    this.isHost = false;
    this.myId = null;
    this.maxPlayers = 4;
    this.banned = new Set();
    this.p2p = null;
    this.relay = null;          // Brokers
    this.relayPeers = new Map(); // Client-ID → {client (Broker), seen}
    this.mode = 'p2p';          // Client: 'p2p' oder 'relay'
    this.calls = new Map();
  }
  on(t, fn) { this.handlers[t] = fn; }
  _emit(t, ...a) { const h = this.handlers[t]; if (h) h(...a); }

  _wireP2P(n) {
    n.on('msg', (m, from) => this._emit('msg', m, from));
    n.on('join', (id) => this._emit('join', id));
    n.on('leave', (id) => this._emit('leave', id));
    n.on('voice', (id, s) => this._emit('voice', id, s));
    n.on('voiceEnd', (id) => this._emit('voiceEnd', id));
    n.on('hostLost', () => { if (this.mode === 'p2p' && this.p2p === n) this._emit('hostLost'); });
    n.on('error', (e) => this._emit('error', e));
  }

  // ---------------- Host ----------------
  async host(code) {
    this.isHost = true;
    this.code = code;
    this.p2p = new Net();
    this.p2p.maxPlayers = this.maxPlayers;
    this.p2p.banned = this.banned;
    this._wireP2P(this.p2p);
    let p2pErr = null;
    try { await this.p2p.host(code); } catch (e) { p2pErr = e; }
    this.myId = (this.p2p && this.p2p.myId) || 'hollowpines-v1-' + code;
    // Relay: Clients schreiben auf .../h, der Host antwortet auf .../c/<id> bzw. .../all
    const T = BASE + code + '/';
    this.relay = new Brokers((topic, d, client) => this._hostRelayMsg(d, client));
    try { this.relay.connect([T + 'h']); } catch (e) { if (p2pErr) throw p2pErr; }
    if (p2pErr && !this.relay.clients.length) throw p2pErr;
    this._T = T;
    this._ping = setInterval(() => {
      const now = Date.now();
      for (const [id, p] of this.relayPeers) {
        if (now - p.seen > LOST_MS) { this.relayPeers.delete(id); this._emit('leave', id); continue; }
        this.relay.pub(p.client, T + 'c/' + id, { _r: 'ping' });
      }
    }, PING_MS);
    return this.myId;
  }

  _hostRelayMsg(d, client) {
    const id = String(d._f || '');
    if (!/^mq-[a-z0-9]{4,12}$/.test(id)) return;
    const T = this._T;
    if (d._r === 'hello') {
      if (this.banned.has(id)) { this.relay.pub(client, T + 'c/' + id, { t: 'kicked' }); return; }
      const known = this.relayPeers.get(id);
      if (known) { known.seen = Date.now(); this.relay.pub(client, T + 'c/' + id, { _r: 'welcome', host: this.myId }); return; }
      const count = this.relayPeers.size + (this.p2p ? this.p2p.conns.size : 0);
      if (count >= this.maxPlayers - 1) { this.relay.pub(client, T + 'c/' + id, { t: 'full' }); return; }
      this.relayPeers.set(id, { client, seen: Date.now() });
      this.relay.pub(client, T + 'c/' + id, { _r: 'welcome', host: this.myId });
      this._emit('join', id);
      return;
    }
    const p = this.relayPeers.get(id);
    if (!p) return;
    p.seen = Date.now();
    if (d._r === 'ping') return;
    if (d._r === 'bye') { this.relayPeers.delete(id); this._emit('leave', id); return; }
    if (p.client !== client) return; // dieselbe Nachricht kommt evtl. über mehrere Broker
    const m = d.m; if (m && typeof m === 'object') this._emit('msg', m, id);
  }

  // ---------------- Client ----------------
  async join(code) {
    this.code = code;
    // 1) direkt per WebRTC
    this.p2p = new Net();
    this._wireP2P(this.p2p);
    let firstErr = null;
    try {
      await Promise.race([this.p2p.join(code), new Promise((_, rej) => setTimeout(() => rej(new Error('Direkte Verbindung blockiert (VPN/Firewall?)')), P2P_TIMEOUT))]);
      this.myId = this.p2p.myId;
      this.mode = 'p2p';
      return this.myId;
    } catch (e) { firstErr = e; }
    this.mode = 'connecting';
    try { this.p2p.destroy(); } catch (e) { /* egal */ }
    this.p2p = null;
    // 2) Ausweichen auf das Relay
    try {
      await this._joinRelay(code);
      this.mode = 'relay';
      this._emit('relay');
      return this.myId;
    } catch (e) {
      throw new Error(`${firstErr ? firstErr.message : 'Keine Verbindung'} – und auch über das Relay kein Host gefunden. Ist der Raum-Code richtig und der Host online?`);
    }
  }

  _joinRelay(code) {
    this.myId = rid();
    const T = BASE + code + '/';
    this._T = T;
    return new Promise((resolve, reject) => {
      let done = false;
      this.relay = new Brokers((topic, d, client) => {
        if (d._r === 'welcome') {
          if (!this._hostClient) {
            this._hostClient = client; this.hostPeer = String(d.host || 'host'); this._seen = Date.now();
            // überzählige Broker schließen
            for (const c of this.relay.clients) if (c !== client) { try { c.end(true); } catch (e) { /* egal */ } }
            this.relay.clients = [client];
            if (!done) { done = true; clearTimeout(to); clearInterval(hello); resolve(); }
          }
          return;
        }
        if (client !== this._hostClient && !(d.t === 'full' || d.t === 'kicked')) return;
        this._seen = Date.now();
        if (d._r === 'ping') return;
        if (d.t === 'full' || d.t === 'kicked') { this._emit('msg', d, this.hostPeer || 'host'); if (!done) { done = true; reject(new Error(d.t === 'full' ? 'Raum voll' : 'Gekickt')); } return; }
        const m = d.m; if (m && typeof m === 'object') this._emit('msg', m, this.hostPeer);
      });
      try { this.relay.connect([T + 'c/' + this.myId, T + 'all']); } catch (e) { reject(e); return; }
      const hello = setInterval(() => this.relay.pubAll(T + 'h', { _f: this.myId, _r: 'hello' }), 1000);
      const to = setTimeout(() => { if (!done) { done = true; clearInterval(hello); reject(new Error('Relay: kein Host')); } }, RELAY_TIMEOUT);
      this._ping = setInterval(() => {
        if (!this._hostClient) return;
        this.relay.pub(this._hostClient, T + 'h', { _f: this.myId, _r: 'ping' });
        if (Date.now() - this._seen > LOST_MS) { clearInterval(this._ping); this._emit('hostLost'); }
      }, PING_MS);
    });
  }

  get hostId() { return this.isHost ? this.myId : this.mode === 'relay' ? this.hostPeer : this.p2p && this.p2p.hostId; }
  /** true, wenn dieser Client über das Relay verbunden ist (für die Anzeige) */
  get viaRelay() { return !this.isHost && this.mode === 'relay'; }
  get relayCount() { return this.relayPeers.size; }

  // ---------------- Senden ----------------
  send(to, msg) {
    const rp = this.relayPeers.get(to);
    if (rp) this.relay.pub(rp.client, this._T + 'c/' + to, { m: msg });
    else if (this.p2p) this.p2p.send(to, msg);
  }
  broadcast(msg, except) {
    if (this.p2p) this.p2p.broadcast(msg, except);
    if (this.relayPeers.size) {
      // eine Nachricht pro Broker an alle Relay-Clients
      const used = new Set();
      for (const [id, p] of this.relayPeers) if (id !== except && !used.has(p.client)) { used.add(p.client); this.relay.pub(p.client, this._T + 'all', { m: msg }); }
    }
  }
  toHost(msg) {
    if (this.mode === 'relay') { if (this._hostClient) this.relay.pub(this._hostClient, this._T + 'h', { _f: this.myId, m: msg }); }
    else if (this.p2p) this.p2p.toHost(msg);
  }

  kick(id) {
    this.banned.add(id);
    const rp = this.relayPeers.get(id);
    if (rp) { this.relay.pub(rp.client, this._T + 'c/' + id, { t: 'kicked' }); this.relayPeers.delete(id); this._emit('leave', id); }
    else if (this.p2p) this.p2p.kick(id);
  }

  // Voice läuft nur über WebRTC
  setStream(s) { if (this.p2p) this.p2p.setStream(s); }
  callPeer(id) { if (this.p2p && !this.relayPeers.has(id) && this.mode === 'p2p') this.p2p.callPeer(id); }

  destroy() {
    clearInterval(this._ping);
    if (this.relay) {
      if (!this.isHost && this._hostClient) this.relay.pub(this._hostClient, this._T + 'h', { _f: this.myId, _r: 'bye' });
      setTimeout(() => this.relay && this.relay.end(), 150);
    }
    try { if (this.p2p) this.p2p.destroy(); } catch (e) { /* egal */ }
    this.p2p = null; this.relayPeers.clear();
    setTimeout(() => { this.relay = null; }, 200);
  }
}
