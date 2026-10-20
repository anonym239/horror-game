// Netzwerk über die claude.ai-"room"-Funktion (wenn das Spiel als Artifact läuft).
// Gleiche Schnittstelle wie Net (PeerJS), aber ohne WebRTC/Voice: Nachrichten gehen über einen
// benannten Raum, Absender-IDs stempelt die Plattform (fälschungssicher).

const TOPIC = 'g';
const MAX = 3800; // Byte-Grenze pro Nachricht (Plattform: 4 KiB)

export class RoomNet {
  constructor(room) {
    this.lobby = room;
    this.room = null;
    this.isHost = false;
    this.handlers = {};
    this.myId = null;
    this.hostPeer = null;
    this.known = new Set();
    this.calls = new Map(); // Kompatibilität (kein Voice hier)
    this.voice = false;
    this.maxPlayers = 4;
    this.banned = new Set();
  }
  on(t, fn) { this.handlers[t] = fn; }
  _emit(t, ...a) { const h = this.handlers[t]; if (h) h(...a); }

  async _join(code) {
    this.room = await this.lobby.join('hp-' + code.toLowerCase());
    // eigene Peer-Kennung finden
    for (let i = 0; i < 50 && !this.myId; i++) {
      const me = this.room.peers().find((p) => p.sameTab);
      if (me) this.myId = me.peer; else await new Promise((r) => setTimeout(r, 100));
    }
    if (!this.myId) throw new Error('Keine Verbindung zum Raum');
    this.room.on(TOPIC, (msg) => {
      if (msg.sameTab) return;
      const d = msg.data; if (!d || typeof d !== 'object') return;
      if (d._to && d._to !== this.myId) return;
      if (!this.isHost && msg.peer !== this.hostPeer) {
        if (d.t === 'iamhost' && !this.hostPeer) { this.hostPeer = msg.peer; this._hostFound && this._hostFound(); }
        return;
      }
      if (this.isHost && this.banned.has(msg.peer)) { this._send({ t: 'kicked', _to: msg.peer }); return; }
      if (this.isHost && !this.known.has(msg.peer)) {
        if (this.known.size >= this.maxPlayers - 1) { this._send({ t: 'full', _to: msg.peer }); return; }
        this.known.add(msg.peer); this._emit('join', msg.peer);
      }
      delete d._to;
      this._emit('msg', d, msg.peer);
    });
    this.room.onPeers((ch) => {
      for (const p of ch.left) {
        if (this.isHost && this.known.delete(p.peer)) this._emit('leave', p.peer);
        if (!this.isHost && p.peer === this.hostPeer) this._emit('hostLost');
      }
      if (this.isHost && ch.joined.length) this._send({ t: 'iamhost' });
    });
  }

  async host(code) {
    this.isHost = true;
    await this._join(code);
    await this.room.presence({ host: true });
    this._send({ t: 'iamhost' });
    this._beacon = setInterval(() => this._send({ t: 'iamhost' }), 3000);
    return this.myId;
  }

  async join(code) {
    await this._join(code);
    const fromPresence = () => this.room.peers().find((p) => p.presence && p.presence.host && !p.sameTab);
    const found = new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('Raum „' + code + '" nicht gefunden – ist der Host online?')), 12000);
      this._hostFound = () => { clearTimeout(to); res(); };
      const poll = setInterval(() => {
        const h = fromPresence();
        if (h && !this.hostPeer) { this.hostPeer = h.peer; }
        if (this.hostPeer) { clearInterval(poll); this._hostFound(); }
      }, 200);
    });
    await found;
    return this.myId;
  }

  get hostId() { return this.isHost ? this.myId : this.hostPeer; }

  _send(msg) {
    if (!this.room) return;
    let s = JSON.stringify(msg);
    if (s.length > MAX && msg.t === 'snap' && msg.i && msg.i.length > 1) {
      // Schnappschuss zu groß → Gegenstände auf mehrere Nachrichten verteilen
      const half = Math.ceil(msg.i.length / 2);
      this._send({ ...msg, i: msg.i.slice(0, half) });
      this._send({ ...msg, i: msg.i.slice(half), p: [], m: [] , part: 1 });
      return;
    }
    this.room.emit(TOPIC, msg).catch(() => {});
  }
  send(to, msg) { this._send({ ...msg, _to: to }); }
  broadcast(msg) { this._send(msg); }
  toHost(msg) { this._send({ ...msg, _to: this.hostPeer }); }

  kick(id) {
    this.banned.add(id);
    this._send({ t: 'kicked', _to: id });
    if (this.known.delete(id)) this._emit('leave', id);
  }

  setStream() {}
  callPeer() {}

  destroy() {
    clearInterval(this._beacon);
    if (this.room) this.room.leave().catch(() => {});
    this.room = null;
  }
}
