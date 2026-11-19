// Синхронизация через бесплатную базу Supabase: вход через Google или по коду из письма.
// Прогресс каждого пользователя — одна строка в таблице progress (видна только ему, RLS).
import { state, settings, saveSettings, merge, replaceState } from './store.js';

const cfg = () => window.ESPANOLA_CONFIG || {};
const URL_ = () => (cfg().supabaseUrl || '').replace(/\/+$/, '');
const KEY_ = () => cfg().supabaseKey || '';
export const configured = () => !!(URL_() && KEY_());

const SKEY = 'espanola.sb.session';
let timer = null, running = false, status = 'off';
const listeners = new Set();
export const onSyncStatus = fn => listeners.add(fn);
function setStatus(s, msg) { status = s; listeners.forEach(fn => fn(s, msg)); }

function getSession() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch { return null; } }
function setSession(s) {
  try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch {}
}
export const hasToken = () => !!getSession()?.refresh_token;

async function auth(path, body, token) {
  const r = await fetch(URL_() + '/auth/v1/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: KEY_(), 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = j.msg || j.error_description || j.message || j.error || r.statusText;
    if (r.status === 429 || /rate limit/i.test(m)) throw new Error('Слишком много писем за короткое время. Подождите и попробуйте снова или войдите через Google.');
    if (/expired|invalid/i.test(m) && path.startsWith('verify')) throw new Error('Код неверный или устарел. Запросите новый.');
    throw new Error(m);
  }
  return j;
}

async function saveTokens(j) {
  const s = { access_token: j.access_token, refresh_token: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, user: j.user };
  if (!s.user) s.user = await auth('user', null, s.access_token).catch(() => null);
  setSession(s);
  const u = s.user || {}; const md = u.user_metadata || {};
  Object.assign(settings, { signedIn: true, email: u.email || '', name: md.full_name || md.name || '', picture: md.avatar_url || md.picture || '' });
  saveSettings();
}

async function accessToken() {
  const s = getSession(); if (!s) return null;
  if (s.exp > Date.now() + 60000) return s.access_token;
  try { await saveTokens(await auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token })); return getSession().access_token; }
  catch (e) { if (navigator.onLine) { setSession(null); } return null; }
}

// --- вход ---
export function signInGoogle() {
  const back = location.origin + location.pathname;
  location.href = `${URL_()}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
}
export async function sendCode(email) {
  await auth('otp', { email: email.trim(), create_user: true });
}
export async function verifyCode(email, code) {
  await saveTokens(await auth('verify', { type: 'email', email: email.trim(), token: code.trim() }));
  return syncNow();
}
// После возврата со страницы входа (Google или ссылка из письма) токены приходят в адресе после #
export async function consumeRedirect() {
  const h = location.hash;
  if (!/access_token=|error_description=/.test(h)) return false;
  const p = new URLSearchParams(h.slice(1));
  history.replaceState(null, '', location.pathname + '#/profile');
  if (p.get('error_description')) throw new Error(p.get('error_description'));
  await saveTokens({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: +p.get('expires_in') || 3600 });
  return true;
}
export function signOut() {
  const s = getSession();
  if (s) fetch(URL_() + '/auth/v1/logout', { method: 'POST', headers: { apikey: KEY_(), Authorization: 'Bearer ' + s.access_token } }).catch(() => {});
  setSession(null);
  Object.assign(settings, { signedIn: false, email: '', name: '', picture: '' }); saveSettings();
  setStatus('off');
}

// --- синхронизация ---
async function rest(path, opt = {}) {
  const t = await accessToken();
  if (!t) throw Object.assign(new Error('Нужно войти заново'), { auth: true });
  const r = await fetch(URL_() + '/rest/v1/' + path, { ...opt, headers: { apikey: KEY_(), Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  if (r.status === 401) throw Object.assign(new Error('Нужно войти заново'), { auth: true });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error('База: ' + (j.message || r.status)); }
  return r.status === 204 ? null : r.json().catch(() => null);
}

export async function syncNow() {
  if (!settings.signedIn || !hasToken()) { if (settings.signedIn) setStatus('need', 'Нужно войти заново'); return; }
  if (!navigator.onLine) { setStatus('offline'); return; }
  if (running) return; running = true;
  setStatus('busy');
  try {
    const uid = getSession().user?.id || (await auth('user', null, await accessToken())).id;
    const rows = await rest(`progress?select=data&user_id=eq.${uid}`);
    const merged = merge(state, rows?.[0]?.data || null);
    replaceState(merged);
    await rest('progress?on_conflict=user_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: uid, data: merged, updated_at: new Date().toISOString() })
    });
    settings.lastSync = Date.now(); saveSettings();
    setStatus('on');
    window.dispatchEvent(new Event('espanola:synced'));
  } catch (e) {
    console.warn('sync', e);
    setStatus(e.auth ? 'need' : 'err', e.message);
  } finally { running = false; }
}

export function scheduleSync() {
  if (!settings.signedIn) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, 8000);
}
export function initSync() {
  if (!settings.signedIn) { setStatus('off'); return; }
  syncNow();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); syncNow(); } });
  window.addEventListener('online', () => syncNow());
}
