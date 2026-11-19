// Хранилище прогресса (на устройстве) + слияние для синхронизации.
const KEY = 'espanola.state.v1';
const SKEY = 'espanola.settings.v1';
const GKEY = 'espanola.geminiKey'; // ключи ИИ — только на этом устройстве, не синхронизируется

const listeners = new Set();
export const onChange = fn => listeners.add(fn);

function blank() {
  return { v: 1, cards: {}, levels: {}, my: {}, days: {}, last: {}, updated: 0 };
}

function read(k, def) {
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : def; } catch { return def; }
}
function write(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('save failed', e); }
}

export let state = Object.assign(blank(), read(KEY, {}));
export const settings = Object.assign(
  { style: 'b', rate: 0.9, voice: '', clientId: '', model: '', aiProvider: 'gemini', models: {}, signedIn: false, email: '', name: '', picture: '' },
  read(SKEY, {})
);

let saveTimer;
export function save(silent) {
  state.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => write(KEY, state), 50);
  if (!silent) listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}
export function saveNow() { clearTimeout(saveTimer); write(KEY, state); }
export function saveSettings() { write(SKEY, settings); }
export function replaceState(s) { state = Object.assign(blank(), s); saveNow(); }

export const aiKeys = {
  k: p => p === 'gemini' ? GKEY : 'espanola.key.' + p,
  get(p) { try { return localStorage.getItem(this.k(p)) || ''; } catch { return ''; } },
  set(p, v) { try { v ? localStorage.setItem(this.k(p), v) : localStorage.removeItem(this.k(p)); } catch {} }
};

export function today(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function tickDay(n = 1) {
  const k = today();
  state.days[k] = (state.days[k] || 0) + n;
}
export function streakDays() {
  let n = 0; const d = new Date();
  if (!state.days[today(d)]) d.setDate(d.getDate() - 1); // серия не обрывается до конца дня
  while (state.days[today(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Слияние двух состояний: по каждой записи побеждает более свежая (t).
export function merge(a, b) {
  a = Object.assign(blank(), a || {}); b = Object.assign(blank(), b || {});
  const out = blank();
  for (const f of ['cards', 'levels', 'my']) {
    const keys = new Set([...Object.keys(a[f]), ...Object.keys(b[f])]);
    for (const k of keys) {
      const x = a[f][k], y = b[f][k];
      out[f][k] = !x ? y : !y ? x : ((y.t || 0) > (x.t || 0) ? y : x);
    }
  }
  const days = new Set([...Object.keys(a.days), ...Object.keys(b.days)]);
  for (const d of days) out.days[d] = Math.max(a.days[d] || 0, b.days[d] || 0);
  out.last = (a.last?.t || 0) >= (b.last?.t || 0) ? a.last : b.last;
  out.updated = Math.max(a.updated || 0, b.updated || 0);
  return out;
}
