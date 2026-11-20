// Cloudflare Worker — посредник между приложением «Еспаньола» и GPTunnel.
// Ключ GPTunnel хранится в секрете GPTUNNEL_KEY (Settings → Variables and Secrets), в коде его нет.
// Пускает только запросы с сайта приложения. Текст — одна модель (Gemini 3 Flash),
// запросы с фото — дешёвая модель Gemini Flash (сама находится в списке моделей GPTunnel,
// или задайте её точно переменной VISION_MODEL).

const ALLOWED_ORIGINS = ['https://alehandro042.github.io'];
const DEFAULT_MODEL = 'gemini-3-flash';   // можно поменять переменной MODEL в настройках Worker
const MAX_MESSAGES = 20;                   // сколько последних сообщений чата пересылать
const MAX_CHARS = 40000;                   // предел длины запроса (символов)
const MAX_TOKENS = 12000;                  // предел длины ответа (DeepSeek V4 Pro сначала «думает», это тоже токены)
const MAX_IMAGE = 8000000;                 // предел размера фото (символов base64)
const API = 'https://gptunnel.ru/v1';

let visionCache = null;
async function visionModel(env) {
  if (env.VISION_MODEL) return env.VISION_MODEL;
  if (visionCache) return visionCache;
  const r = await fetch(API + '/models', { headers: { Authorization: env.GPTUNNEL_KEY } });
  const ids = ((await r.json().catch(() => ({}))).data || []).map(m => m.id).filter(Boolean);
  const pick = re => ids.filter(id => re.test(id) && !/image|tts|audio|preview|thinking/i.test(id)).sort().reverse()[0];
  visionCache = pick(/gemini.*flash.*lite/i) || pick(/gemini.*flash/i) || pick(/gpt.*mini/i) || null;
  return visionCache;
}
async function modelList(env) {
  const r = await fetch(API + '/models', { headers: { Authorization: env.GPTUNNEL_KEY } });
  const j = await r.json().catch(() => ({}));
  return (j.data || []).map(m => ({ id: m.id, title: m.title, in: m.cost_context, out: m.cost_completion }));
}
// Сообщение: строка или [{type:'text'}, {type:'image_url'}] (картинка только data:image/…)
function cleanContent(c) {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return null;
  const parts = c.map(x => x?.type === 'text' && typeof x.text === 'string' ? { type: 'text', text: x.text }
    : x?.type === 'image_url' && /^data:image\/[a-z+]+;base64,/.test(x.image_url?.url || '') && x.image_url.url.length < MAX_IMAGE ? { type: 'image_url', image_url: { url: x.image_url.url } } : null);
  return parts.every(Boolean) ? parts : null;
}
const hasImage = m => Array.isArray(m.content) && m.content.some(x => x.type === 'image_url');
const textLen = msgs => msgs.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : m.content.filter(x => x.type === 'text').reduce((k, x) => k + x.text.length, 0)), 0);

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (!env.GPTUNNEL_KEY) return json({ error: { message: 'В Worker не задан секрет GPTUNNEL_KEY' } }, 500, origin);
    if (request.method === 'GET') {   // проверка: какие модели доступны и какая выбрана для фото
      return json({ text: env.MODEL || DEFAULT_MODEL, vision: await visionModel(env), models: await modelList(env) }, 200, origin);
    }
    if (request.method !== 'POST') return json({ error: { message: 'Only POST' } }, 405, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: { message: 'Bad JSON' } }, 400, origin); }
    let messages = Array.isArray(body.messages) ? body.messages : [];
    messages = messages
      .filter(m => m && ['system', 'user', 'assistant'].includes(m.role))
      .map(m => ({ role: m.role, content: cleanContent(m.content) }))
      .filter(m => m.content);
    const system = messages.filter(m => m.role === 'system').slice(0, 1);
    messages = [...system, ...messages.filter(m => m.role !== 'system').slice(-MAX_MESSAGES)];
    if (!messages.some(m => m.role === 'user')) return json({ error: { message: 'Пустой запрос' } }, 400, origin);
    const withImage = messages.some(hasImage);
    if (messages.filter(hasImage).length > 1) return json({ error: { message: 'Не больше одного фото' } }, 400, origin);
    if (textLen(messages) > MAX_CHARS) return json({ error: { message: 'Слишком длинный запрос, очистите чат' } }, 413, origin);

    const model = withImage ? await visionModel(env) : (env.MODEL || DEFAULT_MODEL);
    if (!model) return json({ error: { message: 'Не найдена модель для фото, задайте VISION_MODEL в Worker' } }, 500, origin);
    const r = await fetch(API + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: env.GPTUNNEL_KEY },
      body: JSON.stringify({ model, messages, max_tokens: MAX_TOKENS, useWalletBalance: true })
    });
    const text = await r.text();
    let out;
    try {
      const j = JSON.parse(text);
      // отдаём приложению только ответ, без служебных данных о балансе
      const ch = j.choices?.[0] || {};
      const content = ch.message?.content || '';
      if (r.ok && !content) {
        out = { error: { message: ch.finish_reason === 'length' ? 'Ответ получился слишком длинным. Попросите меньше пунктов за раз (например, «пункты 1–10»).' : 'ИИ вернул пустой ответ, попробуйте ещё раз.' } };
        return json(out, 502, origin);
      }
      out = r.ok ? { choices: [{ message: { content }, finish_reason: ch.finish_reason }] }
                 : { error: { message: j.error?.message || j.message || ('GPTunnel ' + r.status) } };
    } catch { out = { error: { message: 'GPTunnel ' + r.status } }; }
    return json(out, r.ok ? 200 : r.status, origin);
  }
};
