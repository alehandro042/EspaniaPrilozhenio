// Синхронизация прогресса через скрытую папку приложения (appDataFolder) на Google Диске.
// Файл виден только этому приложению; в обычном Диске его не видно.
import { state, settings, saveSettings, merge, replaceState } from './store.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email profile';
const FILE = 'espanola-state.json';
const TKEY = 'espanola.token';
let tokenClient = null, gisLoaded = null, timer = null, running = false;
const listeners = new Set();
export const onSyncStatus = fn => listeners.add(fn);
let status = 'off';
function setStatus(s, msg) { status = s; listeners.forEach(fn => fn(s, msg)); }
export const syncStatus = () => status;

export const clientId = () => settings.clientId || window.ESPANOLA_CONFIG?.googleClientId || '';

function getToken() {
  try { const t = JSON.parse(localStorage.getItem(TKEY) || 'null'); return t && t.exp > Date.now() + 60000 ? t.token : null; } catch { return null; }
}
function setToken(token, sec) { try { localStorage.setItem(TKEY, JSON.stringify({ token, exp: Date.now() + sec * 1000 })); } catch {} }
export const hasToken = () => !!getToken();

function loadGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => { gisLoaded = null; rej(new Error('Нет связи с Google')); };
    document.head.appendChild(s);
  });
  return gisLoaded;
}

// Вызывать только по нажатию пользователя (Chrome блокирует всплывающие окна иначе)
export async function signIn(promptMode) {
  const id = clientId();
  if (!id) throw new Error('Не задан OAuth Client ID. Смотрите инструкцию в профиле.');
  await loadGIS();
  const resp = await new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: id, scope: SCOPE,
      hint: settings.email || undefined,
      callback: r => r.error ? reject(new Error(r.error_description || r.error)) : resolve(r),
      error_callback: e => reject(new Error(e.type === 'popup_closed' ? 'Окно входа закрыто' : (e.message || e.type)))
    });
    tokenClient.requestAccessToken({ prompt: promptMode ?? (settings.signedIn ? '' : 'consent') });
  });
  if (!google.accounts.oauth2.hasGrantedAllScopes(resp, 'https://www.googleapis.com/auth/drive.appdata'))
    throw new Error('Нужно разрешить доступ к данным приложения на Google Диске');
  setToken(resp.access_token, resp.expires_in || 3600);
  try {
    const u = await api('https://www.googleapis.com/oauth2/v3/userinfo');
    Object.assign(settings, { email: u.email || '', name: u.name || '', picture: u.picture || '' });
  } catch {}
  settings.signedIn = true; saveSettings();
  return syncNow();
}

export function signOut() {
  const t = getToken();
  try { if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t, () => {}); } catch {}
  localStorage.removeItem(TKEY);
  Object.assign(settings, { signedIn: false, email: '', name: '', picture: '' }); saveSettings();
  setStatus('off');
}

async function api(url, opt = {}, raw) {
  const t = getToken(); if (!t) throw Object.assign(new Error('Нужно войти заново'), { auth: true });
  const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + t, ...(opt.headers || {}) } });
  if (r.status === 401) { localStorage.removeItem(TKEY); throw Object.assign(new Error('Нужно войти заново'), { auth: true }); }
  if (!r.ok) throw new Error('Google Диск: ' + r.status);
  return raw ? r : r.json();
}

async function findFile() {
  const q = encodeURIComponent(`name='${FILE}'`);
  const j = await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&pageSize=10`);
  return j.files?.[0] || null;
}

export async function syncNow() {
  if (!settings.signedIn) return;
  if (!getToken()) { setStatus('need', 'Нажмите, чтобы войти заново'); return; }
  if (!navigator.onLine) { setStatus('offline'); return; }
  if (running) return; running = true;
  setStatus('busy');
  try {
    const f = await findFile();
    let remote = null;
    if (f) remote = await (await api(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, {}, true)).json().catch(() => null);
    const merged = merge(state, remote);
    replaceState(merged);
    const body = JSON.stringify(merged);
    if (f) {
      await api(`https://www.googleapis.com/upload/drive/v3/files/${f.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    } else {
      const boundary = 'esp' + Math.random().toString(36).slice(2);
      const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' });
      const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
      await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: multipart });
    }
    settings.lastSync = Date.now(); saveSettings();
    setStatus('on');
    window.dispatchEvent(new Event('espanola:synced'));
  } catch (e) {
    console.warn('sync', e);
    setStatus(e.auth ? 'need' : 'err', e.message);
  } finally { running = false; }
}

// Отложенная синхронизация после изменений
export function scheduleSync() {
  if (!settings.signedIn) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, 8000);
}
export function initSync() {
  if (!settings.signedIn) { setStatus('off'); return; }
  syncNow();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); if (getToken()) syncNow(); } });
  window.addEventListener('online', () => syncNow());
}
