// Shop-Katalog und zentrale Regeln für freischaltbare Gegenstände.
// Alle Prüfungen ("besitze ich X?", "darf ich X kaufen?") laufen über diese Datei,
// damit Spiel, HUD und Shop-Anzeige immer dieselbe Logik benutzen.

// day: ab welchem geschafften Tag (Nacht) der Artikel im Shop freigeschaltet ist.
// requires: anderes Upgrade, das vorher gekauft sein muss.
// consumable: Verbrauchsgut → add = Menge, store = Feld im Spielzustand.
// premium: besonders teures Gadget (goldener Rahmen im Shop).
export const SHOP = [
  { k: 'scanner', day: 1, ico: '📡', name: 'Item-Scanner', desc: 'Q: zeigt Beute in der Nähe. Weitere Stufen: mehr Reichweite, kürzere Abklingzeit.', max: 3, price: (l) => [80, 150, 240][l] },
  { k: 'battery', day: 1, ico: '🔋', name: 'Bessere Akkus', desc: 'Taschenlampe hält deutlich länger.', max: 3, price: (l) => 110 + l * 90 },
  { k: 'stamina', day: 1, ico: '🫁', name: 'Kondition', desc: 'Mehr Ausdauer zum Sprinten & Springen.', max: 3, price: (l) => 100 + l * 80 },
  { k: 'xray', day: 1, ico: '👁️', name: 'Geisterblick-Brille', desc: 'X: Zeigt ALLE Monster kurz durch Wände (rot, mit Entfernung). Stufen: länger sichtbar, kürzere Abklingzeit.', max: 3, price: (l) => [650, 950, 1400][l], premium: true },
  { k: 'boeller', day: 1, ico: '🧨', name: 'Böller ×2', desc: 'Werfen (B): lockt den Blassen weg.', max: 99, price: () => 60, consumable: true, add: 2, store: 'boellers' },
  { k: 'adren', day: 2, ico: '💉', name: 'Adrenalin-Spritze', desc: 'T: 8 s unendlich Ausdauer und +30 % Tempo. Für die Flucht.', max: 99, price: () => 120, consumable: true, add: 1, store: 'adren' },
  { k: 'strength', day: 2, ico: '💪', name: 'Tragegurte', desc: 'Schwere Beute bremst weniger.', max: 3, price: (l) => 120 + l * 90 },
  { k: 'polen', day: 2, ico: '💥', name: 'Polenböller', desc: 'Werfen (V): 5× Explosion! Verscheucht Monster in der Nähe.', max: 99, price: () => 150, consumable: true, add: 1, store: 'polen' },
  { k: 'padding', day: 3, ico: '📦', name: 'Polsterdecken', desc: 'Zerbrechliche Beute nimmt weniger Schaden.', max: 2, price: (l) => 140 + l * 120 },
  { k: 'haggle', day: 3, ico: '🤝', name: 'Crane-Deal', desc: '+10 % mehr Geld pro abgelieferter Beute.', max: 3, price: (l) => 200 + l * 150 },
  { k: 'shoes', day: 3, ico: '🥿', name: 'Leise Sohlen', desc: 'Deine Schritte sind 25 % leiser pro Stufe.', max: 2, price: (l) => 160 + l * 140 },
  { k: 'overtime', day: 4, ico: '⏰', name: 'Fahrer bestechen', desc: 'Der Van wartet jede Nacht 45 s länger.', max: 2, price: (l) => 220 + l * 160 },
  { k: 'boots', day: 4, ico: '👟', name: 'Laufschuhe', desc: '+8 % Lauftempo pro Stufe.', max: 2, price: (l) => 240 + l * 180 },
  { k: 'boellerBox', day: 4, ico: '🎆', name: 'Böller-Kiste ×6', desc: 'Großpackung normale Böller – günstiger.', max: 99, price: () => 150, consumable: true, add: 6, store: 'boellers' },
  { k: 'radar', day: 5, ico: '📟', name: 'Monster-Radar', desc: 'Piept und warnt, wenn ein Monster in der Nähe ist.', max: 1, price: () => 350 },
  { k: 'flashlight', day: 5, ico: '🔦', name: 'Profi-Taschenlampe', desc: 'Heller und größere Reichweite.', max: 2, price: (l) => 260 + l * 200 },
  { k: 'goldscan', day: 6, ico: '🧭', name: 'Schatzsucher', desc: 'Scanner hebt wertvolle Beute (150 $+) golden hervor.', max: 1, price: () => 300, requires: 'scanner' },
  { k: 'polenBox', day: 6, ico: '🧨', name: 'Polenböller ×3', desc: 'Sparpack für den großen Knall (V).', max: 99, price: () => 380, consumable: true, add: 3, store: 'polen' },
  { k: 'teleport', day: 4, ico: '🌀', name: 'Van-Teleporter', desc: 'K: beamt dich sofort zurück zum Van – samt Beute. 1× pro Nacht pro Stufe.', max: 2, price: (l) => [900, 1500][l], premium: true },
  { k: 'cloak', day: 5, ico: '🫥', name: 'Tarnumhang', desc: 'U: 12 s unsichtbar – kein Monster sieht dich.', max: 99, price: () => 350, consumable: true, add: 1, store: 'cloak' },
  { k: 'jetpack', day: 6, ico: '🚀', name: 'Jetpack', desc: 'Leertaste in der Luft halten: fliegen! Kostet Ausdauer.', max: 1, price: () => 2800, premium: true },
  { k: 'goldvan', day: 7, ico: '👑', name: 'Goldener Van', desc: '+25 % Geld auf jede abgelieferte Beute. Für echte Profis.', max: 1, price: () => 6000, premium: true },
  { k: 'quota', day: 7, ico: '💼', name: 'Crane schmieren', desc: 'Die Quote jeder Nacht sinkt um 10 % pro Stufe.', max: 2, price: (l) => 500 + l * 400 },
];

const BY_KEY = Object.fromEntries(SHOP.map((it) => [it.k, it]));
export const shopItem = (k) => BY_KEY[k] || null;

/** Startzustand aller Upgrades – automatisch aus dem Katalog abgeleitet (alles auf 0 = nicht gekauft). */
export const UPG_DEFAULT = () => Object.fromEntries(SHOP.filter((it) => !it.consumable).map((it) => [it.k, 0]));

/** Upgrade-Stufe (0 = nicht gekauft). Unbekannte/manipulierte Werte werden auf den gültigen Bereich begrenzt. */
export function level(upg, k) {
  const it = BY_KEY[k];
  const v = upg ? Math.floor(Number(upg[k]) || 0) : 0;
  return it ? Math.max(0, Math.min(it.max, v)) : 0;
}
/** Besitzt das Team dieses Upgrade? */
export const owns = (upg, k) => level(upg, k) > 0;

/** Bereinigt ein Upgrade-Objekt (z. B. aus dem Netzwerk): nur bekannte Schlüssel, nur gültige Stufen. */
export function sanitizeUpg(upg) {
  const out = UPG_DEFAULT();
  for (const k in out) out[k] = level(upg, k);
  return out;
}

/**
 * Prüft, ob ein Artikel gekauft werden kann.
 * @returns {{ok:boolean, reason?:'unknown'|'locked'|'requires'|'max'|'money', price:number, lvl:number}}
 */
export function checkBuy(k, { upg, money, day }) {
  const it = BY_KEY[k];
  if (!it) return { ok: false, reason: 'unknown', price: 0, lvl: 0 };
  const lvl = it.consumable ? 0 : level(upg, k);
  const price = it.price(Math.min(lvl, it.max - 1));
  if (it.day > day) return { ok: false, reason: 'locked', price, lvl };
  if (it.requires && !owns(upg, it.requires)) return { ok: false, reason: 'requires', price, lvl };
  if (!it.consumable && lvl >= it.max) return { ok: false, reason: 'max', price, lvl };
  if (money < price) return { ok: false, reason: 'money', price, lvl };
  return { ok: true, price, lvl };
}

/** Werte der Geisterblick-Brille je Stufe (1–3): Sichtdauer und Abklingzeit in Sekunden. */
export const XRAY = { dur: [0, 4, 6, 9], cd: [0, 60, 45, 30] };
