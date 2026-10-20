// Spielstände: manuelle Slots + ein Autosave-Slot, alles im localStorage.
// Ein Spielstand enthält den Fortschritt (Nacht, Geld, Upgrades, Vorräte) und – mitten in der Nacht –
// die restliche Beute, die Uhrzeit und die Position. Das Szenario wird mitgespeichert,
// damit der Spielstand auch dann lädt, wenn die Karte im Editor geändert oder gelöscht wurde.

const KEY = 'hp_saves';
export const AUTO_ID = 'auto';
export const MAX_SLOTS = 20;

const read = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const write = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); return true; } catch (e) { return false; } };

export const Saves = {
  /** alle Spielstände, neueste zuerst (Autosave immer oben) */
  list() {
    return read().filter((s) => s && s.data).sort((a, b) => (b.id === AUTO_ID) - (a.id === AUTO_ID) || b.date - a.date);
  },
  get(id) { return read().find((s) => s && s.id === id) || null; },
  /** speichert/überschreibt; ohne id = neuer Slot. Gibt den Eintrag zurück (oder null bei vollem Speicher). */
  put(data, { id, name } = {}) {
    const all = read().filter((s) => s && s.data);
    const old = id ? all.find((s) => s.id === id) : null;
    if (!old && id !== AUTO_ID && all.filter((s) => s.id !== AUTO_ID).length >= MAX_SLOTS) return null;
    const entry = {
      id: id || 'save_' + Date.now().toString(36),
      name: String(name || (old && old.name) || (id === AUTO_ID ? 'Autosave' : 'Spielstand')).replace(/[<>]/g, '').slice(0, 30),
      date: Date.now(), data,
    };
    const next = all.filter((s) => s.id !== entry.id);
    next.push(entry);
    return write(next) ? entry : null;
  },
  auto(data) { return this.put(data, { id: AUTO_ID, name: 'Autosave' }); },
  rename(id, name) { const all = read(); const s = all.find((x) => x && x.id === id); if (s) { s.name = String(name).replace(/[<>]/g, '').slice(0, 30) || s.name; write(all); } },
  remove(id) { write(read().filter((s) => s && s.id !== id)); },
};

/** Kurzbeschreibung für Listen: "Nacht 3 · 840 $ · Am großen See · mitten in der Nacht" */
export function describeSave(d) {
  const where = d.play ? `mitten in Nacht ${d.night} (${Math.max(0, Math.round(d.play.timeLeft / d.play.nightLen * 100))} % Zeit übrig)` : `im Shop nach Nacht ${d.night}`;
  return `${d.scenario ? d.scenario.name : 'Standard-Camp'} · ${d.money} $ · ${where}`;
}
