// Frei belegbare Tastatur-Steuerung.
// Das Spiel fragt intern weiter die Standard-Codes ab (z. B. 'KeyQ' für den Scanner).
// Input übersetzt die gedrückte physische Taste über diese Tabelle in den Standard-Code der Aktion.

export const ACTIONS = [
  { a: 'forward', name: 'Vorwärts', def: 'KeyW' },
  { a: 'back', name: 'Rückwärts', def: 'KeyS' },
  { a: 'left', name: 'Links', def: 'KeyA' },
  { a: 'right', name: 'Rechts', def: 'KeyD' },
  { a: 'sprint', name: 'Sprinten', def: 'ShiftLeft' },
  { a: 'jump', name: 'Springen', def: 'Space' },
  { a: 'crouch', name: 'Ducken', def: 'KeyC' },
  { a: 'pickup', name: 'Aufheben', def: 'KeyE' },
  { a: 'drop', name: 'Ablegen', def: 'KeyG' },
  { a: 'slot1', name: 'Slot 1', def: 'Digit1' },
  { a: 'slot2', name: 'Slot 2', def: 'Digit2' },
  { a: 'slot3', name: 'Slot 3', def: 'Digit3' },
  { a: 'flash', name: 'Taschenlampe', def: 'KeyF' },
  { a: 'scan', name: 'Item-Scanner', def: 'KeyQ' },
  { a: 'boeller', name: 'Böller werfen', def: 'KeyB' },
  { a: 'polen', name: 'Polenböller werfen', def: 'KeyV' },
  { a: 'xray', name: 'Geisterblick-Brille', def: 'KeyX' },
  { a: 'adren', name: 'Adrenalin-Spritze', def: 'KeyT' },
  { a: 'horn', name: 'Hupe (am Van)', def: 'KeyJ' },
  { a: 'radio', name: 'Van-Radio', def: 'KeyR' },
  { a: 'leave', name: 'Abfahren (halten)', def: 'KeyH' },
  { a: 'mute', name: 'Mikrofon stumm', def: 'KeyM' },
];
const DEFAULT_CODES = new Set(ACTIONS.map((x) => x.def));
const KEY = 'hp_keys';
export const RESERVED = new Set(['Escape', 'F11', 'F5', 'F12', 'Tab']);

/** gespeicherte Belegung {action: code} */
export function loadBinds() {
  let b = {};
  try { b = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { b = {}; }
  const out = {};
  for (const x of ACTIONS) out[x.a] = typeof b[x.a] === 'string' && !RESERVED.has(b[x.a]) ? b[x.a] : x.def;
  return out;
}
export function saveBinds(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) { /* privat */ } }

/** Weist einer Aktion eine Taste zu. Ist die Taste schon belegt, tauschen die beiden Aktionen ihre Tasten. */
export function assign(binds, action, code) {
  const other = Object.keys(binds).find((k) => k !== action && binds[k] === code);
  if (other) binds[other] = binds[action];
  binds[action] = code;
  return binds;
}

/** Übersetzungstabelle physische Taste → Standard-Code (null = Taste hat gerade keine Funktion). */
export function buildMap(binds) {
  const map = new Map();
  for (const x of ACTIONS) map.set(binds[x.a], x.def);
  return (code) => (map.has(code) ? map.get(code) : DEFAULT_CODES.has(code) ? null : code);
}

/** lesbarer Tastenname */
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const names = { Space: 'Leertaste', ShiftLeft: 'Shift', ShiftRight: 'Shift rechts', ControlLeft: 'Strg', ControlRight: 'Strg rechts', AltLeft: 'Alt', AltRight: 'Alt Gr', Enter: 'Enter', Backspace: '⌫', CapsLock: 'Feststell', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '^', Minus: 'ß', Equal: '´', BracketLeft: 'Ü', BracketRight: '+', Semicolon: 'Ö', Quote: 'Ä', Backslash: '#', Comma: ',', Period: '.', Slash: '-', IntlBackslash: '<' };
  return names[code] || code;
}
