// ИИ-помощник: свой бесплатный ключ Gemini (AI Studio) хранится только на устройстве.
import { gemini, settings } from './store.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];

export const SYSTEM = 'Ты помощник студента, который учит испанский по учебнику «Español Actual. Начальный курс» (Гринина, Микаэлян, МГИМО, уровень A1–A2). ' +
  'Отвечай по-русски, кратко и понятно, с примерами на испанском. Не используй грамматику сильно сложнее уровня A2, если не просят. ' +
  'Если вопрос про конкретное слово, дай перевод, род, пример и подсказку по произношению.';

function models() {
  const m = settings.model || window.ESPANOLA_CONFIG?.geminiModel;
  return [...new Set([m, ...FALLBACK_MODELS].filter(Boolean))];
}

async function call(body) {
  const key = gemini.key;
  if (!key) throw new Error('Нет ключа Gemini. Добавьте его в профиле.');
  let lastErr;
  for (const m of models()) {
    const r = await fetch(API + encodeURIComponent(m) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body)
    });
    if (r.status === 404) { lastErr = new Error('Модель ' + m + ' недоступна'); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j.error?.message || r.statusText;
      if (r.status === 400 && /API key/i.test(msg)) throw new Error('Ключ Gemini не подходит. Проверьте его в профиле.');
      if (r.status === 429) throw new Error('Лимит бесплатных запросов Gemini исчерпан, попробуйте позже.');
      throw new Error('Gemini: ' + msg);
    }
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    if (!text) throw new Error('Gemini не дал ответа.');
    return text;
  }
  throw lastErr || new Error('Gemini недоступен');
}

// history: [{role:'user'|'model', text}]
export function chat(history, context) {
  return call({
    systemInstruction: { parts: [{ text: SYSTEM + (context ? '\n\nКонтекст: ' + context : '') }] },
    contents: history.map(h => ({ role: h.role, parts: [{ text: h.text }] }))
  });
}

// Распознать испанские слова на фото. Возвращает [{es, ru}]
export async function wordsFromPhoto(base64, mime) {
  const prompt = 'На фото страница или записи с испанскими словами (возможно, с переводом). ' +
    'Выпиши все испанские слова и выражения, которые видны на фото, с русским переводом. Если перевод написан на фото — возьми его, иначе переведи сам. ' +
    'Ответь ТОЛЬКО JSON-массивом вида [{"es":"...","ru":"..."}] без пояснений.';
  const text = await call({
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' }
  });
  const m = text.match(/\[[\s\S]*\]/);
  const arr = JSON.parse(m ? m[0] : text);
  return arr.filter(x => x && x.es).map(x => ({ es: String(x.es).trim(), ru: String(x.ru || '').trim() }));
}

// «Спросить Gemini» без ключа: копируем запрос и открываем Gemini (или меню «Поделиться» на Android)
export async function askGeminiApp(text, files) {
  const full = SYSTEM + '\n\n' + text;
  let copied = false;
  try { await navigator.clipboard.writeText(full); copied = true; } catch {}
  if (files?.length && navigator.canShare?.({ files })) {
    try { await navigator.share({ files, text: full }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  window.open('https://gemini.google.com/app', '_blank');
  return copied ? 'copied' : 'opened';
}

export async function shareText(text) {
  const full = SYSTEM + '\n\n' + text;
  if (navigator.share) { try { await navigator.share({ text: full }); return true; } catch {} }
  return false;
}

export const translateUrl = es => 'https://translate.google.com/?sl=es&tl=ru&op=translate&text=' + encodeURIComponent(es);
