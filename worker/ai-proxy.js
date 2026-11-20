// Cloudflare Worker — посредник между приложением «Еспаньола» и GPTunnel.
// Ключ GPTunnel хранится в секрете GPTUNNEL_KEY (Settings → Variables and Secrets), в коде его нет.
// Пускает только запросы с сайта приложения и только к одной модели.

const ALLOWED_ORIGINS = ['https://alehandro042.github.io'];
const DEFAULT_MODEL = 'deepseek-v4-pro';   // можно поменять переменной MODEL в настройках Worker
const MAX_MESSAGES = 20;                   // сколько последних сообщений чата пересылать
const MAX_CHARS = 40000;                   // предел длины запроса (символов)
const MAX_TOKENS = 3000;                   // предел длины ответа

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    if (request.method !== 'POST') return json({ error: { message: 'Only POST' } }, 405, origin);
    if (!env.GPTUNNEL_KEY) return json({ error: { message: 'В Worker не задан секрет GPTUNNEL_KEY' } }, 500, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: { message: 'Bad JSON' } }, 400, origin); }
    let messages = Array.isArray(body.messages) ? body.messages : [];
    messages = messages
      .filter(m => m && ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content }));
    const system = messages.filter(m => m.role === 'system').slice(0, 1);
    messages = [...system, ...messages.filter(m => m.role !== 'system').slice(-MAX_MESSAGES)];
    if (!messages.some(m => m.role === 'user')) return json({ error: { message: 'Пустой запрос' } }, 400, origin);
    if (JSON.stringify(messages).length > MAX_CHARS) return json({ error: { message: 'Слишком длинный запрос, очистите чат' } }, 413, origin);

    const r = await fetch('https://gptunnel.ru/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: env.GPTUNNEL_KEY },
      body: JSON.stringify({ model: env.MODEL || DEFAULT_MODEL, messages, max_tokens: MAX_TOKENS, useWalletBalance: true })
    });
    const text = await r.text();
    let out;
    try {
      const j = JSON.parse(text);
      // отдаём приложению только ответ, без служебных данных о балансе
      out = r.ok ? { choices: [{ message: { content: j.choices?.[0]?.message?.content || '' } }] }
                 : { error: { message: j.error?.message || j.message || ('GPTunnel ' + r.status) } };
    } catch { out = { error: { message: 'GPTunnel ' + r.status } }; }
    return json(out, r.ok ? 200 : r.status, origin);
  }
};
