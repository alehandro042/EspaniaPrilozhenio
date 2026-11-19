// ИИ-помощник: пользователь выбирает сервис и вводит свой ключ. Ключи хранятся только на этом устройстве.
import { aiKeys, settings } from './store.js';

export const SYSTEM = 'Ты помощник студента, который учит испанский по учебнику «Español Actual. Начальный курс» (Гринина, Микаэлян, МГИМО, уровень A1–A2). ' +
  'Отвечай по-русски, кратко и понятно, с примерами на испанском. Не используй грамматику сильно сложнее уровня A2, если не просят. ' +
  'Если вопрос про конкретное слово, дай перевод, род, пример и подсказку по произношению.';

// Модели по умолчанию можно поменять в профиле («Модель»), если сервис их переименует.
export const PROVIDERS = {
  gemini: {
    name: 'Google Gemini', free: true, vision: true,
    keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'aistudio.google.com/apikey → «Create API key»', keyPrefix: 'AIza…',
    model: 'gemini-flash-latest', fallbacks: ['gemini-2.5-flash', 'gemini-2.0-flash'],
    note: 'Бесплатно, нужен Google-аккаунт. Читает фото.'
  },
  groq: {
    name: 'Groq (Llama)', free: true, vision: true, kind: 'openai',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyUrl: 'https://console.groq.com/keys', keyHint: 'console.groq.com/keys → «Create API Key»', keyPrefix: 'gsk_…',
    model: 'llama-3.3-70b-versatile', visionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    note: 'Бесплатно, очень быстро. Регистрация по почте или Google. Фото читает отдельной моделью.'
  },
  openrouter: {
    name: 'OpenRouter', free: true, vision: true, kind: 'openai',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyUrl: 'https://openrouter.ai/keys', keyHint: 'openrouter.ai/keys → «Create Key»', keyPrefix: 'sk-or-…',
    model: 'meta-llama/llama-3.3-70b-instruct:free', visionModel: 'google/gemma-3-27b-it:free',
    note: 'Много моделей, бесплатные с пометкой «:free» (есть дневной лимит).'
  },
  mistral: {
    name: 'Mistral', free: true, vision: true, kind: 'openai',
    url: 'https://api.mistral.ai/v1/chat/completions',
    keyUrl: 'https://console.mistral.ai/api-keys', keyHint: 'console.mistral.ai → план Experiment (бесплатный) → API Keys', keyPrefix: '',
    model: 'mistral-small-latest',
    note: 'Бесплатный план Experiment, нужен номер телефона. Читает фото.'
  },
  deepseek: {
    name: 'DeepSeek', free: false, vision: false, kind: 'openai',
    url: 'https://api.deepseek.com/chat/completions',
    keyUrl: 'https://platform.deepseek.com/api_keys', keyHint: 'platform.deepseek.com/api_keys (нужно пополнить баланс, от $2)', keyPrefix: 'sk-…',
    model: 'deepseek-chat',
    note: 'Платно, но очень дёшево. Бесплатно DeepSeek можно получить через OpenRouter (модели deepseek с пометкой «:free»).'
  },
  openai: {
    name: 'OpenAI (ChatGPT)', free: false, vision: true, kind: 'openai',
    url: 'https://api.openai.com/v1/chat/completions',
    keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'platform.openai.com/api-keys (нужно пополнить баланс)', keyPrefix: 'sk-…',
    model: 'gpt-4o-mini',
    note: 'Платно: оплата за запросы с баланса аккаунта. Читает фото.'
  },
  claude: {
    name: 'Anthropic Claude', free: false, vision: true, kind: 'claude',
    keyUrl: 'https://platform.claude.com/settings/keys', keyHint: 'platform.claude.com → Settings → API keys (нужно пополнить баланс)', keyPrefix: 'sk-ant-…',
    model: 'claude-opus-5-5',
    note: 'Платно: оплата за запросы с баланса аккаунта. Читает фото.'
  }
};

export const provider = () => PROVIDERS[settings.aiProvider] ? settings.aiProvider : 'gemini';
export const providerInfo = () => PROVIDERS[provider()];
export const hasKey = () => !!aiKeys.get(provider());
const modelFor = (p, vision) => (settings.models || {})[p] || (vision && PROVIDERS[p].visionModel) || PROVIDERS[p].model;

function niceError(status, msg) {
  if (status === 401 || status === 403 || /api key|unauthorized|invalid.*key/i.test(msg)) return new Error('Ключ не подходит. Проверьте его в профиле.');
  if (status === 429) return new Error('Лимит запросов исчерпан, попробуйте позже.');
  if (status === 402) return new Error('На балансе сервиса закончились деньги.');
  return new Error(providerInfo().name + ': ' + msg);
}

// history: [{role:'user'|'model', text}], image: {b64, mime} — прикрепляется к последнему сообщению
async function call({ system, history, image }) {
  const p = provider(); const P = PROVIDERS[p]; const key = aiKeys.get(p);
  if (!key) throw new Error('Нет ключа ИИ. Добавьте его в профиле.');
  if (P.kind === 'openai') return callOpenAI(P, key, modelFor(p, !!image), system, history, image);
  if (P.kind === 'claude') return callClaude(key, modelFor(p), system, history, image);
  return callGemini(key, p, system, history, image);
}

async function callGemini(key, p, system, history, image) {
  const models = [...new Set([(settings.models || {})[p] || settings.model || window.ESPANOLA_CONFIG?.geminiModel, PROVIDERS.gemini.model, ...PROVIDERS.gemini.fallbacks].filter(Boolean))];
  const contents = history.map((h, i) => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [...(image && i === history.length - 1 ? [{ inline_data: { mime_type: image.mime, data: image.b64 } }] : []), { text: h.text }]
  }));
  let lastErr;
  for (const m of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents })
    });
    if (r.status === 404) { lastErr = new Error('Модель ' + m + ' недоступна'); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw niceError(r.status === 400 && /API key/i.test(j.error?.message) ? 401 : r.status, j.error?.message || r.statusText);
    const text = (j.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('');
    if (!text) throw new Error('ИИ не дал ответа.');
    return text;
  }
  throw lastErr || new Error('Gemini недоступен');
}

async function callOpenAI(P, key, model, system, history, image) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  history.forEach((h, i) => {
    const role = h.role === 'user' ? 'user' : 'assistant';
    if (image && i === history.length - 1) messages.push({ role, content: [{ type: 'text', text: h.text }, { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.b64}` } }] });
    else messages.push({ role, content: h.text });
  });
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key };
  if (P === PROVIDERS.openrouter) { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Espanola'; }
  const r = await fetch(P.url, { method: 'POST', headers, body: JSON.stringify({ model, messages }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw niceError(r.status, j.error?.message || j.message || r.statusText);
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new Error('ИИ не дал ответа.');
  return Array.isArray(text) ? text.map(x => x.text || '').join('') : text;
}

async function callClaude(key, model, system, history, image) {
  const messages = history.map((h, i) => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: [...(image && i === history.length - 1 ? [{ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.b64 } }] : []), { type: 'text', text: h.text }]
  }));
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true', 'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    body: JSON.stringify({ model, max_tokens: 16000, system, messages, output_config: { effort: 'low' }, fallbacks: 'default' })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw niceError(r.status, j.error?.message || r.statusText);
  if (j.stop_reason === 'refusal') throw new Error('Claude отказался отвечать на этот запрос.');
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text) throw new Error('ИИ не дал ответа.');
  return text;
}

export function chat(history, context) {
  return call({ system: SYSTEM + (context ? '\n\nКонтекст: ' + context : ''), history });
}

// Распознать испанские слова на фото. Возвращает [{es, ru}]
export async function wordsFromPhoto(b64, mime) {
  if (!providerInfo().vision) throw new Error(providerInfo().name + ' не читает фото. Для фото выберите в профиле Gemini, Groq, Mistral или OpenRouter.');
  const prompt = 'На фото страница или записи с испанскими словами (возможно, с переводом). ' +
    'Выпиши все испанские слова и выражения, которые видны на фото, с русским переводом. Если перевод написан на фото — возьми его, иначе переведи сам. ' +
    'Ответь ТОЛЬКО JSON-массивом вида [{"es":"...","ru":"..."}] без пояснений и без markdown.';
  const text = await call({ history: [{ role: 'user', text: prompt }], image: { b64, mime } });
  const m = text.match(/\[[\s\S]*\]/);
  let arr;
  try { arr = JSON.parse(m ? m[0] : text); } catch { throw new Error('ИИ ответил не в том формате, попробуйте ещё раз.'); }
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
