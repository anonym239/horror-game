// Peer-to-Peer-Netzwerk über WebRTC (PeerJS). Host ist autoritativ, Voice-Chat als Mesh.
import { ICE_SERVERS } from '../config.js';

const PREFIX = 'hollowpines-v1-';

export function makeRoomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.conns = new Map();
    this.hostConn = null;
    this.handlers = {};
    this.myId = null;
    this.calls = new Map();
    this.stream = null;
    this.maxPlayers = 4;
    this.banned = new Set();
  }
  on(t, fn) { this.handlers[t] = fn; }
  _emit(t, ...a) { const h = this.handlers[t]; if (h) h(...a); }

  _makePeer(id) {
    if (typeof Peer === 'undefined') throw new Error('PeerJS konnte nicht geladen werden (Internet?)');
    const opts = { debug: 1, config: { iceServers: ICE_SERVERS } };
    return id ? new Peer(id, opts) : new Peer(opts);
  }

  host(code) {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      let p;
      try { p = this._makePeer(PREFIX + code); } catch (e) { return reject(e); }
      this.peer = p;
      const to = setTimeout(() => reject(new Error('Zeitüberschreitung beim Verbinden mit dem Vermittlungsserver')), 12000);
      p.on('open', (id) => { clearTimeout(to); this.myId = id; resolve(id); });
      p.on('error', (e) => { clearTimeout(to); if (!this.myId) reject(e); else this._emit('error', e); });
      p.on('connection', (conn) => {
        conn.on('open', () => {
          if (this.banned.has(conn.peer)) { conn.send({ t: 'kicked' }); setTimeout(() => conn.close(), 300); return; }
          if (this.conns.size >= this.maxPlayers - 1) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
          this.conns.set(conn.peer, conn);
          this._emit('join', conn.peer);
        });
        conn.on('data', (d) => this._emit('msg', d, conn.peer));
        conn.on('close', () => { if (this.conns.delete(conn.peer)) this._emit('leave', conn.peer); });
        conn.on('error', () => { if (this.conns.delete(conn.peer)) this._emit('leave', conn.peer); });
      });
      this._setupCalls();
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      let p;
      try { p = this._makePeer(); } catch (e) { return reject(e); }
      this.peer = p;
      const to = setTimeout(() => reject(new Error('Raum nicht gefunden oder Host nicht erreichbar')), 15000);
      p.on('open', (id) => {
        this.myId = id;
        const conn = p.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
        this.hostConn = conn;
        conn.on('open', () => { clearTimeout(to); resolve(id); });
        conn.on('data', (d) => this._emit('msg', d, conn.peer));
        conn.on('close', () => this._emit('hostLost'));
        conn.on('error', () => this._emit('hostLost'));
      });
      p.on('error', (e) => {
        clearTimeout(to);
        if (e.type === 'peer-unavailable') reject(new Error('Raum „' + code + '" existiert nicht'));
        else if (!this.hostConn || !this.hostConn.open) reject(e);
        else this._emit('error', e);
      });
      this._setupCalls();
    });
  }

  get hostId() { return this.isHost ? this.myId : this.hostConn && this.hostConn.peer; }

  send(to, msg) { const c = this.conns.get(to); if (c && c.open) c.send(msg); }
  broadcast(msg, except) { for (const [id, c] of this.conns) if (id !== except && c.open) c.send(msg); }
  toHost(msg) { if (this.hostConn && this.hostConn.open) this.hostConn.send(msg); }

  /** Spieler aus dem Raum werfen (Host). */
  kick(id) {
    this.banned.add(id);
    const c = this.conns.get(id);
    if (c && c.open) c.send({ t: 'kicked' });
    setTimeout(() => { if (c) c.close(); if (this.conns.delete(id)) this._emit('leave', id); }, 400);
    const call = this.calls.get(id); if (call) call.close();
  }

  // ---------- Voice ----------
  _setupCalls() {
    this.peer.on('call', (call) => {
      call.answer(this.stream || undefined);
      this._hook(call);
    });
  }
  setStream(stream) { this.stream = stream; }
  callPeer(id) {
    if (!this.stream || this.calls.has(id) || !this.peer) return;
    const call = this.peer.call(id, this.stream);
    if (call) this._hook(call);
  }
  _hook(call) {
    this.calls.set(call.peer, call);
    call.on('stream', (s) => this._emit('voice', call.peer, s));
    call.on('close', () => { this.calls.delete(call.peer); this._emit('voiceEnd', call.peer); });
    call.on('error', () => { this.calls.delete(call.peer); });
  }

  destroy() {
    try { for (const c of this.calls.values()) c.close(); } catch (e) {}
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.peer = null; this.conns.clear(); this.calls.clear(); this.hostConn = null;
  }
}
