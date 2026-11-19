// Тесты: вопросы строятся только из данных учебника (слова, таблицы спряжений, предложения).
import { state, save } from './store.js';
import { book, hasRu, imgFor, conjugations, articleItems, sentences } from './data.js';

export const LEVELS = ['Лёгкий', 'Средний', 'Сложный'];
export const LEVEL_HINT = [
  'Выбор из вариантов, есть подсказка, ударения не проверяются',
  'Нужно писать слово, подсказка по запросу, ошибка только в ударении — «почти»',
  'Без подсказок, ударения и артикли строго, больше перевода на испанский'
];

export function levelOf(lid) { return state.levels[lid]?.lvl || 0; }

// Тест урока: 2 теста подряд ≥ 80% → следующий уровень. Уровень не понижается.
export function recordTest(lid, score) {
  const L = state.levels[lid] || { lvl: 0, streak: 0, hist: [] };
  L.hist = [...(L.hist || []), { d: Date.now(), s: Math.round(score * 100), lvl: L.lvl }].slice(-20);
  let up = false;
  if (score >= 0.8) {
    L.streak = (L.streak || 0) + 1;
    if (L.streak >= 2 && L.lvl < 2) { L.lvl++; L.streak = 0; up = true; }
  } else L.streak = 0;
  L.t = Date.now();
  state.levels[lid] = L; save();
  return { up, level: L.lvl, streak: L.streak };
}

const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.random() * a.length | 0];

export function norm(s, loose) {
  let x = String(s).toLowerCase().replace(/[¡¿!?.,;:"«»'’]/g, ' ').replace(/\s+/g, ' ').trim();
  if (loose) x = x.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return x;
}
function variants(es) {
  const out = new Set([es]);
  for (const part of String(es).split(/[,;/]/)) {
    const p = part.trim(); if (!p) continue;
    out.add(p.replace(/\([^)]*\)/g, '').trim());
    out.add(p.replace(/[()]/g, '').trim());
  }
  return [...out].filter(Boolean);
}
export const needsArticle = it => articleItems([it]).length > 0;
const article = it => it.gender === 'm' ? 'el' : 'la';

// Проверка набранного ответа
export function checkTyped(input, expectedList, lvl, withArticle) {
  const exp = withArticle ? expectedList.map(e => withArticle + ' ' + e) : expectedList;
  const strict = exp.some(e => norm(e) === norm(input));
  const loose = exp.some(e => norm(e, true) === norm(input, true));
  if (strict) return { ok: true };
  if (withArticle && !strict && !loose) {
    const noArt = expectedList.some(e => norm(e, lvl < 2) === norm(input, lvl < 2));
    if (noArt) return { ok: false, msg: `Нужен артикль: ${withArticle}` };
  }
  if (loose) {
    if (lvl >= 2) return { ok: false, msg: 'Ошибка в ударении или ñ' };
    if (lvl === 1) return { ok: true, almost: true, msg: 'Почти: проверьте ударение / ñ' };
    return { ok: true };
  }
  return { ok: false };
}

function distract(item, pool, field, n = 3) {
  const val = item[field];
  const sameKind = shuffle(pool.filter(x => x.id !== item.id && x[field] && x[field] !== val && x.kind === item.kind));
  const other = shuffle(pool.filter(x => x.id !== item.id && x[field] && x[field] !== val && x.kind !== item.kind));
  const res = []; const used = new Set([val]);
  for (const x of [...sameKind, ...other]) { if (res.length >= n) break; if (!used.has(x[field])) { used.add(x[field]); res.push(x[field]); } }
  return res;
}

// --- генераторы вопросов по словам ---
function vocabQuestion(item, pool, lvl) {
  const img = imgFor(item.es);
  const allImg = pool.filter(x => x.id !== item.id && imgFor(x.es));
  const r = Math.random();
  if (lvl === 0) {
    if (img && allImg.length >= 3 && r < 0.3) {
      const opts = shuffle([item, ...shuffle(allImg).slice(0, 3)]);
      return { type: 'pick_img', item, kind: 'Выберите картинку', prompt: item.es, speak: item.es,
        options: opts.map(o => ({ img: imgFor(o.es).src, label: o.ru, correct: o.id === item.id })) };
    }
    if (r < 0.45) {
      const opts = shuffle([item.ru, ...distract(item, pool, 'ru')]);
      return { type: 'listen', item, kind: 'Прослушайте и выберите перевод', prompt: '🔊', speak: item.es, autoSpeak: true,
        options: opts.map(o => ({ label: o, correct: o === item.ru })) };
    }
    if (r < 0.75) {
      const opts = shuffle([item.ru, ...distract(item, pool, 'ru')]);
      return { type: 'choose_ru', item, kind: 'Выберите перевод', prompt: item.es, speak: item.es, img: img?.src,
        options: opts.map(o => ({ label: o, correct: o === item.ru })) };
    }
    const opts = shuffle([item.es, ...distract(item, pool, 'es')]);
    return { type: 'choose_es', item, kind: 'Выберите по-испански', prompt: item.ru, img: img?.src,
      options: opts.map(o => ({ label: o, correct: o === item.es, speak: o })) };
  }
  // средний и сложный: больше написания с русского на испанский
  const writeShare = lvl === 1 ? 0.6 : 0.8;
  if (r < writeShare) {
    const art = lvl === 2 && needsArticle(item) ? article(item) : '';
    return { type: 'write_es', item, kind: art ? 'Напишите по-испански с артиклем' : 'Напишите по-испански', prompt: item.ru,
      img: lvl === 1 ? img?.src : null, expected: variants(item.es), article: art, hint: lvl === 1 };
  }
  const opts = shuffle([item.ru, ...distract(item, pool, 'ru', lvl === 2 ? 4 : 3)]);
  return { type: lvl === 2 ? 'listen' : 'choose_ru', item, kind: lvl === 2 ? 'Прослушайте и выберите перевод' : 'Выберите перевод',
    prompt: lvl === 2 ? '🔊' : item.es, speak: item.es, autoSpeak: lvl === 2, options: opts.map(o => ({ label: o, correct: o === item.ru })) };
}

export function grammarQuestions(lid, lvl, items) {
  const L = book.lessons.get(lid); if (!L) return [];
  const qs = [];
  for (const c of conjugations(L)) {
    if (lvl === 0) {
      const forms = [...new Set(conjugations(L).filter(x => x.verb === c.verb).map(x => x.form))];
      if (forms.length < 3) continue;
      const opts = shuffle([c.form, ...shuffle(forms.filter(f => f !== c.form)).slice(0, 3)]);
      qs.push({ type: 'conj', lessonId: lid, kind: `Спряжение (${c.ref})`, prompt: `${c.person} … (${c.verb})`,
        options: opts.map(o => ({ label: o, correct: o === c.form, speak: o })), answerSpeak: c.form });
    } else {
      qs.push({ type: 'conj_write', lessonId: lid, kind: `Спряжение (${c.ref})`, prompt: `${c.person} … (${c.verb})`,
        expected: [c.form], answerSpeak: c.form, hint: lvl === 1 });
    }
  }
  for (const it of articleItems(items)) {
    qs.push({ type: 'article', item: it, kind: 'Род: el или la?', prompt: `… ${it.es}`, sub: it.ru, speak: it.es,
      options: ['el', 'la'].map(a => ({ label: a, correct: a === article(it) })) });
  }
  return qs;
}

export function sentenceQuestions(lid) {
  const L = book.lessons.get(lid); if (!L) return [];
  return sentences(L).map(s => {
    const words = s.es.split(/\s+/);
    return { type: 'order', lessonId: lid, kind: 'Соберите предложение', prompt: s.pattern, words, shuffled: shuffle(words), answerSpeak: s.es };
  });
}

// Собрать тест. lessonIds — уроки (или 'my'). Каждое слово идёт на уровне своего урока.
export function buildTest(lessonIds, n = 10, opts = {}) {
  const pool = [];
  for (const lid of lessonIds) pool.push(...(book.byLesson.get(lid) || []).filter(hasRu));
  const distractPool = pool.length >= 8 ? pool : [...book.items.values()].filter(hasRu);
  let vocab = opts.items ? opts.items.filter(hasRu) : pool;
  if (!vocab.length && !opts.items) return [];
  // взвешенный выбор: ошибки и давно не виденные слова чаще
  const weight = it => { const c = state.cards[it.id]; if (!c) return 3; return 1 + c.lapses * 2 + (c.due <= Date.now() ? 2 : 0) + (c.streak < 2 ? 1 : 0); };
  const chosen = [];
  const bag = vocab.map(it => ({ it, w: weight(it) }));
  const nVocab = opts.vocabOnly ? n : Math.max(1, Math.round(n * 0.65));
  while (chosen.length < nVocab && bag.length) {
    const total = bag.reduce((s, x) => s + x.w, 0); let r = Math.random() * total; let i = 0;
    for (; i < bag.length - 1; i++) { r -= bag[i].w; if (r <= 0) break; }
    chosen.push(bag.splice(i, 1)[0].it);
  }
  const qs = chosen.map(it => vocabQuestion(it, distractPool, levelOf(it.lessonId)));
  if (!opts.vocabOnly) {
    const extra = [];
    for (const lid of lessonIds) if (lid !== 'my') {
      const lvl = levelOf(lid);
      extra.push(...shuffle(grammarQuestions(lid, lvl, book.byLesson.get(lid) || [])).slice(0, 4));
      extra.push(...shuffle(sentenceQuestions(lid)).slice(0, 3));
    }
    qs.push(...shuffle(extra).slice(0, n - qs.length));
    // если грамматики мало — добираем словами
    while (qs.length < n && bag.length) { const it = bag.splice(Math.random() * bag.length | 0, 1)[0].it; qs.push(vocabQuestion(it, distractPool, levelOf(it.lessonId))); }
  }
  return shuffle(qs);
}

export function hintFor(q) {
  const e = (q.expected || [])[0] || '';
  return e ? `Начинается на «${(q.article ? q.article + ' ' : '') + e[0]}», букв: ${e.length}` : '';
}
