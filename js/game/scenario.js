// Szenarien: eigene Karten aus dem Editor (Objekte, Monster, Van, Regeln).
// null = Standard-Camp. Ein Szenario ist reines JSON und kann gespeichert, exportiert und an Mitspieler geschickt werden.

export const MAP_RADIUS = 100; // Objekte dürfen bis hierhin stehen (Spielfeld: 108 m)

/** Bau-Objekte im Editor. zone: [r0, r1] = Boden wird dort eben; hide = Versteck (Monster sehen dich drin nicht). */
export const OBJECTS = {
  cabin:    { name: 'Hütte', ico: '🏠', zone: [5, 9], hide: true, desc: 'Versteck mit Beute' },
  lodge:    { name: 'Lodge', ico: '🏚️', zone: [9, 14], hide: true, desc: 'Großes Haus, Versteck' },
  shed:     { name: 'Schuppen', ico: '🛖', zone: [3.5, 6], hide: true, desc: 'Kleines Versteck' },
  chapel:   { name: 'Kapelle', ico: '⛪', zone: [9, 14], desc: 'Altar mit seltener Beute' },
  graves:   { name: 'Friedhof', ico: '🪦', zone: [5, 9], desc: 'Grabsteine' },
  tower:    { name: 'Hochstand', ico: '🗼', zone: [4, 7], desc: 'Aussichtsturm' },
  trailer:  { name: 'Wohnwagen', ico: '🚌', zone: [4, 6], desc: 'Beute drin' },
  tent:     { name: 'Zelt', ico: '⛺', zone: [2.5, 4], desc: 'Beute im Schlafsack' },
  crates:   { name: 'Kisten', ico: '📦', zone: [2, 3.5], desc: 'Stapel mit Beute' },
  circle:   { name: 'Steinkreis', ico: '🗿', zone: [6, 9], desc: 'Altar: oft Gold-Idole' },
  outhouse: { name: 'Plumpsklo', ico: '🚽', zone: [2, 4], desc: 'Beute drin' },
  wreck:    { name: 'Autowrack', ico: '🚗', zone: [3, 5], desc: 'Rostlaube' },
  campfire: { name: 'Lagerfeuer', ico: '🔥', zone: [6, 10], desc: 'Licht in der Nacht' },
  picnic:   { name: 'Picknicktisch', ico: '🪑', zone: [2, 3], desc: 'Beute auf dem Tisch' },
  well:     { name: 'Brunnen', ico: '⛲', zone: [2, 3], desc: 'Deko' },
  stick:    { name: 'Stockfigur', ico: '🪆', desc: 'Gruselig, nur Deko' },
  loot:     { name: 'Beute-Punkt', ico: '💰', desc: 'Hier kann Beute liegen' },
  spawn:    { name: 'Monster-Spawn', ico: '👹', desc: 'Hier tauchen Monster auf' },
};
export const MAX_OBJECTS = 200;
export const MAX_MONSTERS = 40;
export const MONSTER_TYPES = ['stalker', 'doll', 'crawler'];
export const RADIO_STATIONS = ['Party FM', 'Synthwave 87', 'Radio Hollow Pines (Spieluhr)', 'Aus'];

export const DEFAULT_RULES = () => ({ quotaMul: 1, nightLen: 360, startMoney: 0, startBoeller: 2, lootMul: 1, lootCount: 1, events: true, trees: 1, fog: 1 });
export const DEFAULT_VAN = () => ({ x: 0, z: -95, r: 0, k: 1, color: '#ffffff', disco: true, cooler: true, bench: true, lights: true, station: 0 });

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const clampXZ = (o) => { const r = Math.hypot(o.x, o.z); if (r > MAP_RADIUS) { o.x *= MAP_RADIUS / r; o.z *= MAP_RADIUS / r; } return o; };

/** Leeres Szenario (Startpunkt im Editor). */
export function newScenario(name = 'Mein Szenario') {
  return {
    v: 1, id: 'scn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), rev: Date.now(),
    name, desc: '', seed: Math.floor(Math.random() * 1e6),
    objects: [
      { t: 'campfire', x: 0, z: 0, r: 0 },
      { t: 'cabin', x: 20, z: 10, r: -2 }, { t: 'cabin', x: -20, z: 10, r: 2 }, { t: 'cabin', x: 0, z: 25, r: 3.14 },
      { t: 'spawn', x: 60, z: 50, r: 0 }, { t: 'spawn', x: -60, z: 50, r: 0 },
    ],
    lake: null,
    van: DEFAULT_VAN(),
    monsters: { stalker: 1, doll: 0, crawler: 0, grow: true },
    rules: DEFAULT_RULES(),
  };
}

/** Prüft und bereinigt ein Szenario (aus Speicher, Import oder Netzwerk). Gibt null zurück, wenn unbrauchbar. */
export function sanitizeScenario(s) {
  if (!s || typeof s !== 'object') return null;
  const out = {
    v: 1, id: String(s.id || 'scn_import').replace(/[^\w-]/g, '').slice(0, 40) || 'scn_import', rev: num(s.rev, 0, 9e15, Date.now()),
    name: String(s.name || 'Szenario').replace(/[<>]/g, '').slice(0, 40), desc: String(s.desc || '').replace(/[<>]/g, '').slice(0, 300),
    seed: Math.floor(num(s.seed, 0, 1e9, 1)),
    objects: [], lake: null, van: DEFAULT_VAN(), monsters: { stalker: 1, doll: 0, crawler: 0, grow: true }, rules: DEFAULT_RULES(),
  };
  for (const o of Array.isArray(s.objects) ? s.objects.slice(0, MAX_OBJECTS) : []) {
    if (!o || !OBJECTS[o.t]) continue;
    out.objects.push(clampXZ({ t: o.t, x: num(o.x, -200, 200, 0), z: num(o.z, -200, 200, 0), r: num(o.r, -7, 7, 0) }));
  }
  if (s.lake) out.lake = clampXZ({ x: num(s.lake.x, -200, 200, 50), z: num(s.lake.z, -200, 200, 0), r: num(s.lake.r, 6, 35, 15) });
  const v = s.van || {};
  out.van = clampXZ({
    x: num(v.x, -200, 200, 0), z: num(v.z, -200, 200, -95), r: num(v.r, -7, 7, 0), k: num(v.k, 1, 2.5, 1),
    color: /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : '#ffffff',
    disco: v.disco !== false, cooler: v.cooler !== false, bench: v.bench !== false, lights: v.lights !== false,
    station: Math.floor(num(v.station, 0, RADIO_STATIONS.length - 1, 0)),
  });
  const m = s.monsters || {};
  for (const t of MONSTER_TYPES) out.monsters[t] = Math.floor(num(m[t], 0, MAX_MONSTERS, t === 'stalker' ? 1 : 0));
  out.monsters.grow = m.grow !== false;
  const r = s.rules || {}, d = DEFAULT_RULES();
  out.rules = {
    quotaMul: num(r.quotaMul, 0.1, 5, d.quotaMul), nightLen: Math.round(num(r.nightLen, 60, 1800, d.nightLen)),
    startMoney: Math.round(num(r.startMoney, 0, 100000, d.startMoney)), startBoeller: Math.round(num(r.startBoeller, 0, 99, d.startBoeller)),
    lootMul: num(r.lootMul, 0.2, 5, d.lootMul), lootCount: num(r.lootCount, 0.3, 3, d.lootCount),
    events: r.events !== false, trees: num(r.trees, 0, 1.5, d.trees), fog: num(r.fog, 0.3, 2.5, d.fog),
  };
  return out;
}

/** Monster-Plan einer Nacht für ein Szenario. */
export function scenarioPlan(scn, night, event) {
  const m = scn.monsters, plan = [];
  for (const t of MONSTER_TYPES) for (let i = 0; i < m[t]; i++) plan.push(t);
  if (m.grow) for (let i = 0; i < Math.floor((night - 1) / 2); i++) plan.push(MONSTER_TYPES[i % 3]);
  if (event === 'bloodmoon') plan.push('stalker');
  return plan.slice(0, MAX_MONSTERS);
}

// ---------- Speicher (localStorage) ----------
const KEY = 'hp_scenarios';
const read = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const write = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); return true; } catch (e) { return false; } };

export const Scenarios = {
  list() { return read().map(sanitizeScenario).filter(Boolean).sort((a, b) => b.rev - a.rev); },
  get(id) { return this.list().find((s) => s.id === id) || null; },
  save(s) {
    const clean = sanitizeScenario({ ...s, rev: Date.now() });
    const all = read().filter((x) => x && x.id !== clean.id);
    all.push(clean);
    return write(all) ? clean : null;
  },
  remove(id) { write(read().filter((x) => x && x.id !== id)); },
};

// ---------- Vorlagen (fertige Beispiel-Szenarien) ----------
const ring = (t, n, R, cx = 0, cz = 0, a0 = 0) => Array.from({ length: n }, (_, i) => {
  const a = a0 + i / n * Math.PI * 2, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
  return { t, x, z, r: Math.atan2(cx - x, cz - z) };
});
export function templates() {
  const T = (name, desc, extra) => sanitizeScenario({ ...newScenario(name), desc, ...extra, id: 'tpl_' + name.toLowerCase().replace(/[^a-z]/g, '') });
  return [
    T('Am großen See', 'Zelte und Schuppen rund um einen riesigen See. Wenig Verstecke, viel Wasser.', {
      lake: { x: 0, z: 10, r: 34 },
      objects: [...ring('tent', 6, 48, 0, 10), ...ring('shed', 3, 60, 0, 10, 0.5), { t: 'campfire', x: 0, z: 62, r: 0 }, { t: 'circle', x: 70, z: -40, r: 0 }, ...ring('spawn', 4, 85)],
      van: { ...DEFAULT_VAN(), z: -90, color: '#2a6aff', k: 1.3 },
      monsters: { stalker: 2, doll: 0, crawler: 1, grow: true },
    }),
    T('Puppenfriedhof', 'Eine Kapelle, ein riesiger Friedhof und viel zu viele Puppen.', {
      objects: [{ t: 'chapel', x: 0, z: 20, r: 3.14 }, ...ring('graves', 6, 24, 0, 20), ...ring('stick', 10, 40, 0, 20), { t: 'campfire', x: 0, z: -40, r: 0 }, ...ring('loot', 8, 55), ...ring('spawn', 5, 80)],
      van: { ...DEFAULT_VAN(), color: '#4a0f18' },
      monsters: { stalker: 1, doll: 5, crawler: 0, grow: true },
      rules: { ...DEFAULT_RULES(), fog: 1.6 },
    }),
    T('Monster-Hölle', 'Für Profis: 12 Monster ab Nacht 1, dafür doppelt so viel Geld und ein Party-Bus.', {
      objects: [...ring('cabin', 8, 30), { t: 'lodge', x: 0, z: 0, r: 0 }, ...ring('crates', 6, 55, 0, 0, 0.3), ...ring('spawn', 6, 90)],
      van: { ...DEFAULT_VAN(), k: 2.2, color: '#ff2ad5', station: 1 },
      monsters: { stalker: 6, doll: 3, crawler: 3, grow: false },
      rules: { ...DEFAULT_RULES(), lootMul: 2, startMoney: 500, startBoeller: 6, quotaMul: 1.3 },
    }),
    T('Wohnwagen-Park', 'Ein verlassener Campingplatz voller Wohnwagen und Zelte.', {
      objects: [...ring('trailer', 7, 35, 0, 10), ...ring('tent', 6, 18, 0, 10, 0.4), { t: 'campfire', x: 0, z: 10, r: 0 }, ...ring('picnic', 3, 9, 0, 10), { t: 'well', x: -45, z: -30, r: 0 }, { t: 'wreck', x: 30, z: -50, r: 0.6 }, ...ring('spawn', 4, 85, 0, 0, 0.7)],
      monsters: { stalker: 1, doll: 1, crawler: 1, grow: true },
      rules: { ...DEFAULT_RULES(), lootCount: 1.5 },
    }),
  ];
}
