// Öffentliche MQTT-Broker für den Server-Browser (Raumliste). Alle werden parallel genutzt.
export const LOBBY_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081',
];

// Netzwerk-Einstellungen für Mehrspieler über das Internet.
// STUN findet den direkten Weg zwischen zwei Spielern; TURN leitet Daten um, wenn
// Router/Firewalls (z.B. Handy-Hotspot, Uni-WLAN) keine direkte Verbindung zulassen.
// Für maximale Zuverlässigkeit kannst du hier eigene TURN-Zugangsdaten eintragen
// (z.B. kostenlos bei https://www.metered.ca/tools/openrelay/).
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  // Öffentliche TURN-Server (Umleitung, wenn kein direkter Weg geht). Port 443/TCP kommt auch durch die meisten VPNs.
  { urls: 'turn:freestun.net:3478', username: 'free', credential: 'free' },
  { urls: 'turns:freestun.net:5349', username: 'free', credential: 'free' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

// Klappt WebRTC gar nicht (z. B. VPN am Handy), verbinden sich Mitspieler automatisch über ein
// Relay auf denselben MQTT-Brokern wie der Server-Browser (siehe game/relaynet.js).
