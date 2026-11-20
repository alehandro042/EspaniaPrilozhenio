// Озвучка испанским голосом и приблизительная проверка произношения (Web Speech API в Chrome).
import { settings } from './store.js';

let voices = [];
function loadVoices() { voices = (speechSynthesis.getVoices?.() || []); }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

export function esVoices() {
  return voices.filter(v => /^es([-_]|$)/i.test(v.lang));
}
function pickVoice() {
  const vs = esVoices();
  return vs.find(v => v.voiceURI === settings.voice) || vs.find(v => /es[-_]ES/i.test(v.lang)) || vs[0] || null;
}

// Повторное прослушивание того же текста — медленнее: обычная → ×0.7 → ×0.5
let lastText = '', repeats = 0;
export function resetSlow() { lastText = ''; repeats = 0; }
export function speak(text, rate) {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  if (text === lastText) repeats++; else { lastText = text; repeats = 0; }
  // убираем пометки в скобках и варианты через запятую произносим все
  const clean = String(text).replace(/\([^)]*\)/g, '').replace(/\s*\/\s*/g, ', ').trim();
  const u = new SpeechSynthesisUtterance(clean);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = v?.lang || 'es-ES';
  u.rate = (rate || settings.rate || 0.9) * [1, 0.7, 0.5][Math.min(repeats, 2)];
  speechSynthesis.speak(u);
  return true;
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!SR;

// Слушает одну фразу. Возвращает Promise<string[]> — варианты распознавания.
export function listen() {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('Распознавание речи не поддерживается этим браузером. Откройте в Chrome.'));
    const r = new SR();
    r.lang = 'es-ES'; r.interimResults = false; r.maxAlternatives = 5;
    let done = false;
    r.onresult = e => { done = true; resolve([...e.results[0]].map(a => a.transcript)); };
    r.onerror = e => { done = true; reject(new Error(e.error === 'not-allowed' ? 'Нет доступа к микрофону. Разрешите его в настройках Chrome.' : e.error === 'no-speech' ? 'Не услышал речь, попробуйте ещё раз.' : 'Ошибка распознавания: ' + e.error)); };
    r.onend = () => { if (!done) resolve([]); };
    try { r.start(); } catch (e) { reject(e); }
  });
}

export function normSpeech(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, '').replace(/[^a-zñ0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const c = [i];
    for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[n];
}
export function similarity(a, b) {
  a = normSpeech(a); b = normSpeech(b);
  if (!a || !b) return 0;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
}

// strict: 0 лёгкий, 1 средний, 2 сложный
export function judge(target, heard, strict = 0) {
  const variants = String(target).split(/[,;/]/).map(s => s.trim()).filter(Boolean).concat([target]);
  let best = 0, bestHeard = heard[0] || '';
  for (const h of heard) for (const v of variants) {
    const s = similarity(v, h); if (s > best) { best = s; bestHeard = h; }
  }
  const okAt = [0.75, 0.82, 0.9][strict], almostAt = [0.5, 0.6, 0.7][strict];
  return { score: best, heard: bestHeard, verdict: best >= okAt ? 'ok' : best >= almostAt ? 'almost' : 'bad' };
}
