// Тесты: вопросы строятся только из данных учебника (слова, таблицы спряжений, предложения).
import { state, save } from './store.js';
import { book, hasRu, imgFor, conjugations, articleItems, sentences, withArt } from './data.js';
import { similarity } from './speech.js';
import SENT_RU from './sentences-ru.js';

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
// Варианты ответа: слово и, если есть, слово с артиклем (артикль можно писать, но не обязательно)
const expOf = it => { const v = variants(it.es), a = withArt(it); return a !== it.es ? [...v, ...v.map(x => a.slice(0, a.length - it.es.length) + x)] : v; };

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
  // длинная фраза с одной-двумя опечатками: на лёгком и среднем уровне — «почти»
  if (!loose && lvl < 2 && exp.some(e => e.length > 12 && similarity(e, input) >= 0.92))
    return { ok: true, almost: true, msg: 'Почти: есть небольшая опечатка' };
  if (loose) {
    if (lvl >= 2) return { ok: false, msg: 'Ошибка в ударении или ñ' };
    if (lvl === 1) return { ok: true, almost: true, msg: 'Почти: проверьте ударение / ñ' };
    return { ok: true };
  }
  return { ok: false };
}

function distract(item, pool, field, n = 3, get = x => x[field]) {
  const val = get(item);
  const sameKind = shuffle(pool.filter(x => x.id !== item.id && get(x) && get(x) !== val && x.kind === item.kind));
  const other = shuffle(pool.filter(x => x.id !== item.id && get(x) && get(x) !== val && x.kind !== item.kind));
  const res = []; const used = new Set([val]);
  for (const x of [...sameKind, ...other]) { if (res.length >= n) break; if (!used.has(get(x))) { used.add(get(x)); res.push(get(x)); } }
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
      return { type: 'pick_img', item, kind: 'Выберите картинку', prompt: withArt(item), speak: withArt(item),
        options: opts.map(o => ({ img: imgFor(o.es).src, label: o.ru, correct: o.id === item.id })) };
    }
    if (r < 0.45) {
      const opts = shuffle([item.ru, ...distract(item, pool, 'ru')]);
      return { type: 'listen', item, kind: 'Прослушайте и выберите перевод', prompt: '🔊', speak: withArt(item), autoSpeak: true,
        options: opts.map(o => ({ label: o, correct: o === item.ru })) };
    }
    if (r < 0.75) {
      const opts = shuffle([item.ru, ...distract(item, pool, 'ru')]);
      return { type: 'choose_ru', item, kind: 'Выберите перевод', prompt: withArt(item), speak: withArt(item), img: img?.src,
        options: opts.map(o => ({ label: o, correct: o === item.ru })) };
    }
    const opts = shuffle([withArt(item), ...distract(item, pool, 'es', 3, withArt)]);
    return { type: 'choose_es', item, kind: 'Выберите по-испански', prompt: item.ru, img: img?.src,
      options: opts.map(o => ({ label: o, correct: o === withArt(item), speak: o })) };
  }
  // средний и сложный: больше написания с русского на испанский
  const writeShare = lvl === 1 ? 0.6 : 0.8;
  if (r < writeShare) {
    const art = lvl === 2 && needsArticle(item) ? article(item) : '';
    return { type: 'write_es', item, kind: art ? 'Напишите по-испански с артиклем' : 'Напишите по-испански', prompt: item.ru,
      img: lvl === 1 ? img?.src : null, expected: art ? variants(item.es) : expOf(item), article: art, hint: lvl === 1 };
  }
  const opts = shuffle([item.ru, ...distract(item, pool, 'ru', lvl === 2 ? 4 : 3)]);
  return { type: lvl === 2 ? 'listen' : 'choose_ru', item, kind: lvl === 2 ? 'Прослушайте и выберите перевод' : 'Выберите перевод',
    prompt: lvl === 2 ? '🔊' : withArt(item), speak: withArt(item), autoSpeak: lvl === 2, options: opts.map(o => ({ label: o, correct: o === item.ru })) };
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
      options: ['el', 'la'].map(a => ({ label: a, correct: a === article(it) })), explain: genderRule(it) });
  }
  return qs;
}

// Перевод фраз урока с русского на испанский (только фразы, у которых в учебнике есть перевод)
function phraseQuestions(lid, lvl) {
  return (book.byLesson.get(lid) || []).filter(it => hasRu(it) && /\s/.test(it.es) && !/[=…/]/.test(it.es))
    .map(it => ({ type: 'write_es', item: it, kind: 'Переведите на испанский', prompt: it.ru, expected: expOf(it), hint: lvl < 2 }));
}
// Предложения урока: русский перевод → испанский. Лёгкий уровень — собрать из слов, дальше — написать.
export function sentenceQuestions(lid, lvl = levelOf(lid)) {
  const L = book.lessons.get(lid); if (!L) return [];
  const all = sentences(L).filter(s => s.ru);
  return all.map(s => {
    if (lvl === 0) { const words = s.es.split(/\s+/); return { type: 'order', lessonId: lid, kind: 'Соберите перевод', prompt: s.ru, words, shuffled: shuffle(words), answerSpeak: s.es }; }
    return { type: 'translate', lessonId: lid, kind: 'Переведите на испанский', prompt: s.ru, expected: [...new Set(all.filter(x => x.ru === s.ru).map(x => x.es))], correct: s.es, answerSpeak: s.es, hint: lvl < 2 };
  });
}

// Собрать тест. lessonIds — уроки (или 'my'). Каждое слово идёт на уровне своего урока.
export function buildTest(lessonIds, n = 10, opts = {}) {
  const pool = [];
  const isWord = it => it.kind !== 'phrase' && !/\s/.test(it.es.replace(/\s*\([^)]*\)/g, '').trim());
  for (const lid of lessonIds) pool.push(...(book.byLesson.get(lid) || []).filter(it => hasRu(it) && (!opts.wordsOnly || isWord(it))));
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
      extra.push(...shuffle(phraseQuestions(lid, lvl)).slice(0, 2));
      extra.push(...shuffle(sentenceQuestions(lid, lvl)).slice(0, 2));
    }
    qs.push(...shuffle(extra).slice(0, n - qs.length));
    // если грамматики мало — добираем словами
    while (qs.length < n && bag.length) { const it = bag.splice(Math.random() * bag.length | 0, 1)[0].it; qs.push(vocabQuestion(it, distractPool, levelOf(it.lessonId))); }
  }
  return shuffle(qs);
}

export function hintFor(q) {
  const e = (q.expected || [])[0] || '';
  if (q.type === 'dictation') { const w = e.split(/\s+/); return `Слов: ${w.length}. Начало: «${w.slice(0, 2).join(' ')}…»`; }
  return e ? `Начинается на «${(q.article ? q.article + ' ' : '') + e[0]}», букв: ${e.length}` : '';
}

// Письменный тест: всё нужно написать самому — слова и фразы с русского, диктант предложений из учебника, спряжение.
export function buildWriteTest(lessonIds, n = 10) {
  const items = lessonIds.flatMap(l => (book.byLesson.get(l) || []).filter(hasRu));
  const phrases = items.filter(it => it.kind === 'phrase' || /\s/.test(it.es));
  const words = items.filter(it => !phrases.includes(it));
  const dict = lessonIds.filter(l => l !== 'my').flatMap(l => { const L = book.lessons.get(l); return L ? sentences(L).map(x => ({ ...x, lessonId: l })) : []; });
  const conj = lessonIds.filter(l => l !== 'my').flatMap(l => { const L = book.lessons.get(l); return L ? conjugations(L).map(c => ({ ...c, lessonId: l })) : []; });
  const weight = it => { const c = state.cards[it.id]; return !c ? 2 : 1 + c.lapses * 2 + (c.streak < 2 ? 1 : 0); };
  const pickW = (arr, k) => { const bag = arr.map(it => ({ it, w: weight(it) })); const out = []; while (out.length < k && bag.length) { let r = Math.random() * bag.reduce((a, x) => a + x.w, 0), i = 0; for (; i < bag.length - 1; i++) { r -= bag[i].w; if (r <= 0) break; } out.push(bag.splice(i, 1)[0].it); } return out; };
  const want = { dict: dict.length ? Math.round(n * 0.3) : 0, conj: conj.length ? Math.round(n * 0.2) : 0, phr: phrases.length ? Math.round(n * 0.2) : 0 };
  const qs = [];
  for (const s of shuffle(dict).slice(0, want.dict)) {
    const lvl = levelOf(s.lessonId);
    qs.push({ type: 'dictation', lessonId: s.lessonId, kind: 'Диктант: напишите, что услышали', prompt: '🔊', speak: s.es, autoSpeak: true, expected: [s.es], hint: lvl === 0, sub: s.pattern });
  }
  for (const c of shuffle(conj).slice(0, want.conj)) {
    qs.push({ type: 'conj_write', lessonId: c.lessonId, kind: `Спряжение (${c.ref})`, prompt: `${c.person} … (${c.verb})`, expected: [c.form], answerSpeak: c.form, hint: levelOf(c.lessonId) < 2 });
  }
  const mk = it => { const lvl = levelOf(it.lessonId); const art = lvl === 2 && needsArticle(it) ? article(it) : '';
    return { type: 'write_es', item: it, kind: art ? 'Напишите по-испански с артиклем' : (it.kind === 'phrase' || /\s/.test(it.es) ? 'Напишите фразу по-испански' : 'Напишите по-испански'), prompt: it.ru, expected: art ? variants(it.es) : expOf(it), article: art, hint: lvl < 2 }; };
  qs.push(...pickW(phrases, want.phr).map(mk));
  qs.push(...pickW(words, n - qs.length).map(mk));
  if (qs.length < n) qs.push(...pickW(phrases.filter(p => !qs.some(q => q.item === p)), n - qs.length).map(mk));
  return shuffle(qs);
}

// ---------- Темы для повторения: числа, цвета, дни недели, время (всё из учебника) ----------
export const TOPICS = {
  numbers: { title: 'Числа', icon: '🔢', hint: 'От 0 до 99, на слух и письменно' },
  colors: { title: 'Цвета', icon: '🎨', hint: 'rojo, azul, verde…' },
  days: { title: 'Дни недели', icon: '📅', hint: 'lunes … domingo' },
  time: { title: 'Время', icon: '🕒', hint: '¿Qué hora es? Son las…' },
  preps: { title: 'Предлоги', icon: '🧭', hint: 'a, en, de, con, para, por, sin…' }
};
const COLORS = ['rojo', 'azul', 'verde', 'amarillo', 'blanco', 'negro', 'gris', 'marrón', 'claro', 'oscuro'];
const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const uniqBy = (a, f) => { const s = new Set(); return a.filter(x => { const k = f(x); if (s.has(k)) return false; s.add(k); return true; }); };
const topicItems = words => uniqBy([...book.items.values()].filter(it => it.ru && words.includes(it.es)), it => it.es)
  .sort((a, b) => words.indexOf(a.es) - words.indexOf(b.es));

// число словами по таблице учебника (§27, §31): 0–29 и десятки — как в списке, остальное «десяток y единица»
function numberWords() {
  const m = new Map();
  for (const it of book.items.values()) if (it.kind === 'number' && /^\d+$/.test(it.ru || '')) m.set(+it.ru, it.es);
  return m;
}
function numEs(n, W) {
  if (W.has(n)) return W.get(n);
  const t = Math.floor(n / 10) * 10, u = n % 10;
  return W.has(t) && W.has(u) ? `${W.get(t)} y ${W.get(u)}` : null;
}
function numberQuestions(n) {
  const W = numberWords(); if (W.size < 10) return [];
  const pool = []; for (let k = 0; k < 100; k++) if (numEs(k, W)) pool.push(k);
  const qs = [];
  for (const k of shuffle(pool).slice(0, n)) {
    const es = numEs(k, W), r = Math.random();
    const near = shuffle(pool.filter(x => x !== k && (Math.abs(x - k) <= 12 || x % 10 === k % 10))).slice(0, 3);
    if (r < 0.35) qs.push({ type: 'choose_topic', kind: 'Как это по-испански?', prompt: String(k), options: shuffle([k, ...near]).map(x => ({ label: numEs(x, W), correct: x === k, speak: numEs(x, W) })), answerSpeak: es });
    else if (r < 0.7) qs.push({ type: 'conj_write', kind: 'Прослушайте и напишите цифрами', prompt: '🔊', speak: es, autoSpeak: true, expected: [String(k)], answerSpeak: es, correct: `${k} — ${es}`, placeholder: 'Цифрами, например 47', numeric: true });
    else qs.push({ type: 'conj_write', kind: 'Напишите по-испански', prompt: String(k), expected: [es], answerSpeak: es, placeholder: 'Ответ по-испански', hint: true });
  }
  return qs;
}
// время по §42: Es la una / Son las + час, y cuarto / y media / menos cuarto / en punto
function timeEs(h, m, W) {
  let hh = h, tail = '';
  if (m === 0) tail = '';
  else if (m === 15) tail = ' y cuarto';
  else if (m === 30) tail = ' y media';
  else if (m === 45) { hh = h % 12 + 1; tail = ' menos cuarto'; }
  else if (m < 30) tail = ' y ' + numEs(m, W);
  else { hh = h % 12 + 1; tail = ' menos ' + numEs(60 - m, W); }
  return (hh === 1 ? 'Es la una' : 'Son las ' + numEs(hh, W)) + tail;
}
const pad = m => String(m).padStart(2, '0');
function timeQuestions(n) {
  const W = numberWords(); if (W.size < 25) return [];
  const MIN = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const qs = [];
  for (let k = 0; k < n; k++) {
    const h = 1 + (Math.random() * 12 | 0), m = pick(MIN), es = timeEs(h, m, W), dig = `${h}:${pad(m)}`, r = Math.random();
    const others = []; while (others.length < 3) { const h2 = 1 + (Math.random() * 12 | 0), m2 = pick(MIN), d2 = `${h2}:${pad(m2)}`; if (d2 !== dig && !others.some(o => o.d === d2) && (h2 === h || m2 === m || Math.random() < .3)) others.push({ d: d2, es: timeEs(h2, m2, W) }); }
    if (r < 0.35) qs.push({ type: 'choose_topic', kind: '¿Qué hora es? Выберите по-испански', prompt: dig, options: shuffle([{ d: dig, es }, ...others]).map(o => ({ label: o.es, correct: o.d === dig, speak: o.es })), answerSpeak: es });
    else if (r < 0.7) qs.push({ type: 'choose_topic', kind: 'Прослушайте: который час?', prompt: '🔊', speak: es, autoSpeak: true, options: shuffle([{ d: dig, es }, ...others]).map(o => ({ label: o.d, correct: o.d === dig })), answerSpeak: es, correct: `${dig} — ${es}` });
    else qs.push({ type: 'conj_write', kind: '¿Qué hora es? Напишите по-испански', prompt: dig, expected: [es, ...(m === 0 ? [es + ' en punto'] : [])], answerSpeak: es, placeholder: 'Son las… / Es la…', hint: true });
  }
  return qs;
}
function wordTopicQuestions(items, n) {
  if (items.length < 4) return [];
  const qs = [];
  const chosen = []; while (chosen.length < n) chosen.push(...shuffle(items)); 
  for (const it of chosen.slice(0, n)) {
    const others = shuffle(items.filter(x => x !== it)).slice(0, 3), r = Math.random();
    if (r < 0.3) qs.push({ type: 'choose_ru', item: it, kind: 'Выберите перевод', prompt: withArt(it), speak: withArt(it), options: shuffle([it, ...others]).map(o => ({ label: o.ru, correct: o === it })) });
    else if (r < 0.55) qs.push({ type: 'listen', item: it, kind: 'Прослушайте и выберите перевод', prompt: '🔊', speak: withArt(it), autoSpeak: true, options: shuffle([it, ...others]).map(o => ({ label: o.ru, correct: o === it })) });
    else if (r < 0.8) qs.push({ type: 'choose_es', item: it, kind: 'Выберите по-испански', prompt: it.ru, options: shuffle([it, ...others]).map(o => ({ label: withArt(o), correct: o === it, speak: withArt(o) })) });
    else qs.push({ type: 'write_es', item: it, kind: 'Напишите по-испански', prompt: it.ru, expected: expOf(it), hint: true });
  }
  return qs;
}
// ---- Род: правила §3 (род), §4 (число), §32 (согласование прилагательного) ----
function genderRule(it) {
  const w = it.es.toLowerCase(), m = it.gender === 'm';
  if (m && /(ma|ta)$/.test(w)) return '§3: греческие слова на -ma и -ta мужского рода: el problema, el idioma, el planeta.';
  if (m && /(día|mapa)$/.test(w)) return '§3: запомнить: el día, el mapa — мужской род.';
  if (m && /a$/.test(w)) return '§3: на -a, но мужского рода (лицо мужского пола или исключение): el artista, el día.';
  if (!m && /(mano|radio)$/.test(w)) return '§3: запомнить: la mano, la radio — женский род.';
  if (!m && /(foto|moto|disco)$/.test(w)) return '§3: сокращения на -o женского рода: la foto(grafía), la moto(cicleta).';
  if (!m && /o$/.test(w)) return '§3: на -o, но женского рода (лицо женского пола или исключение): la modelo, la mano.';
  if (!m && /(flor|labor)$/.test(w)) return '§3: исключения: la flor, la labor — женский род, хотя на -or.';
  if (m && /(lápiz|pez|corazón|camión|avión)$/.test(w)) return '§3: исключения: el lápiz, el pez, el corazón, el camión, el avión — мужской род.';
  if (!m && /(d|z|ión|zon|umbre|ie)$/.test(w)) return '§3: на -d, -z, -ión, -umbre, -ie — женский род: la universidad, la lección.';
  if (m && /(aje|an|or|ambre|ete)$/.test(w)) return '§3: на -aje, -an, -or, -ambre, -ete — мужской род: el plan, el color.';
  if (m && /o$/.test(w)) return '§3: на -o — мужской род: el alumno.';
  if (!m && /a$/.test(w)) return '§3: на -a — женский род: la alumna.';
  return `§3: на -e и на согласный бывают и мужского, и женского рода — это слово нужно запомнить: ${m ? 'el' : 'la'} ${it.es}.`;
}
function pluralOf(es) { // §4: гласный + s; согласный + es (берём только слова без ударений и с безопасным окончанием)
  if (/[aeo]$/i.test(es) || /[áéó]$/.test(es)) return es + 's';
  if (/[dlr]$/i.test(es) && !/[áéíóú]/.test(es)) return es + 'es';
  return null;
}
// Существительные урока(ов) для теста «Род»
export const genderNouns = lessons => uniqBy(articleItems(lessons.flatMap(l => (book.byLesson.get(l) || []).filter(it => it.ru))), it => it.es);
export function genderQuestions(lessons, n = 12) {
  const nouns = genderNouns(lessons);
  const isAdj = it => it.kind === 'word' && it.ru && /^[a-záéíóúñ]+o$/.test(it.es) && /(ый|ий|ой)(?![а-яё])/.test(it.ru) && !/женат|замуж|холост|развед|вдов|о человеке/.test(it.ru) && !it.gender;
  // прилагательные: из этих уроков и всех пройденных до них
  const maxL = Math.max(...lessons.filter(l => typeof l === 'number'));
  const adjs = uniqBy([...book.items.values()].filter(it => isAdj(it) && typeof it.lessonId === 'number' && it.lessonId <= maxL), it => it.es);
  if (nouns.length < 4) return [];
  const qs = [];
  for (const it of shuffle(nouns).slice(0, n)) {
    const art = it.gender === 'm' ? 'el' : 'la', r = Math.random(), ex = genderRule(it);
    const pl = pluralOf(it.es);
    if (r < 0.35) qs.push({ type: 'article', item: it, kind: 'Род: el или la?', prompt: `… ${it.es}`, sub: it.ru, speak: `${art} ${it.es}`, options: ['el', 'la'].map(a => ({ label: a, correct: a === art })), explain: ex });
    else if (r < 0.55) { const a2 = it.gender === 'm' ? 'un' : 'una'; qs.push({ type: 'choose_topic', item: it, kind: 'Неопределённый артикль: un или una?', prompt: `… ${it.es}`, sub: it.ru, options: ['un', 'una'].map(a => ({ label: a, correct: a === a2 })), answerSpeak: `${a2} ${it.es}`, correct: `${a2} ${it.es}`, explain: ex }); }
    else if (r < 0.75 && pl) { const a3 = it.gender === 'm' ? 'los' : 'las'; qs.push({ type: 'choose_topic', item: it, kind: 'Множественное число: los или las?', prompt: `… ${pl}`, sub: it.ru, options: ['los', 'las'].map(a => ({ label: a, correct: a === a3 })), answerSpeak: `${a3} ${pl}`, correct: `${a3} ${pl}`, explain: ex + ' Во множественном числе: ' + (it.gender === 'm' ? 'el → los.' : 'la → las.') }); }
    else if (adjs.length) {
      const ad = pick(adjs), f = ad.es.replace(/o$/, 'a'), right = it.gender === 'm' ? ad.es : f;
      qs.push({ type: 'choose_topic', item: it, kind: `Согласуйте прилагательное «${ad.ru}»`, prompt: `${art} ${it.es} …`, sub: it.ru, options: [ad.es, f].map(a => ({ label: a, correct: a === right })), answerSpeak: `${art} ${it.es} ${right}`, correct: `${art} ${it.es} ${right}`, explain: `§32: прилагательное согласуется с существительным в роде: ${it.es} — ${it.gender === 'm' ? 'мужской род, значит ' + ad.es : 'женский род, значит ' + f}. ` + ex });
    } else qs.push({ type: 'article', item: it, kind: 'Род: el или la?', prompt: `… ${it.es}`, sub: it.ru, speak: `${art} ${it.es}`, options: ['el', 'la'].map(a => ({ label: a, correct: a === art })), explain: ex });
  }
  return qs;
}
// ---------- Предлоги: только таблицы §13, §40, §52, §64, §67, §70 и примеры из учебника ----------
// пары, которые в этих контекстах могут быть взаимозаменяемы — не даём их вместе
const CLASH = [['excepto', 'salvo'], ['de', 'desde'], ['a', 'hacia'], ['a', 'hasta'], ['por', 'durante'], ['con', 'mediante'], ['por', 'mediante'], ['en', 'por'], ['sobre', 'encima de'], ['bajo', 'debajo de'], ['entre', 'en medio de'], ['cerca de', 'al lado de'], ['cerca de', 'junto a'], ['al lado de', 'junto a'], ['cerca de', 'pegado a'], ['enfrente de', 'frente a'], ['delante de', 'enfrente de'], ['delante de', 'frente a'], ['dentro de', 'en']];
const clashes = (a, b) => CLASH.some(([x, y]) => (x === a && y === b) || (y === a && x === b));
const SIMPLE_PREPS = ['a', 'en', 'de', 'con', 'para', 'por', 'sobre', 'sin', 'entre', 'desde', 'durante', 'hasta', 'ante', 'bajo', 'contra', 'hacia', 'según', 'tras', 'excepto', 'salvo', 'mediante'];
const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = w => new RegExp(`(^|[\\s¿¡(])(${reEsc(w)})(?=$|[\\s,.;:?!)])`, 'i');
function prepData() {
  const rows = [], compounds = [], sents = [];
  for (const L of book.lessons.values()) {
    for (const g of L.grammar || []) {
      if (!/редлог/.test(g.title || '')) continue;
      const t = g.table; let tr = Array.isArray(t) ? t.slice(1) : t?.rows || [];
      if (g.id === '§70') { for (const r of tr) for (const c of String(r[1] || '').split(/,\s*/)) if (/\s/.test(c.trim())) compounds.push({ prep: c.trim(), meaning: r[0], ref: g.id }); continue; }
      const one = (g.title.match(/Предлог (\S+)$/) || [])[1];
      for (const r of tr) {
        const [p, meaning, ex] = r.length === 2 ? [one, r[0], r[1]] : r;
        if (!p || !meaning) continue;
        for (const prep of String(p).split(/\s*=\s*/)) {
          const exs = String(ex || '').split(/;|,\s*(?=[a-záéíóúñ¿]+\s)/i).map(x => x.trim()).filter(x => x && !/^но:/.test(x) && wordRe(prep).test(x) && /\s/.test(x));
          rows.push({ prep, meaning: String(meaning), full: String(meaning), exs, ref: g.id });
        }
      }
    }
    for (const sb of L.sentence_building || []) {
      const ref = (String(sb.pattern || '').match(/§(13|64|67|70)/) || [])[0];
      if (!ref) continue;
      for (const e of sb.examples || []) if (e.es) sents.push({ es: e.es, ref, ru: SENT_RU_OF(e.es) });
    }
  }
  return { rows, compounds, sents };
}
const SENT_RU_OF = es => SENT_RU[es] || '';
function prepGap(text, cands) {
  // ищем самое длинное совпадение предлога; «X de» + «l …» → «X del»
  for (const c of cands.sort((a, b) => b.length - a.length)) {
    const m = text.match(wordRe(c));
    if (m) return { found: m[2], idx: m.index + m[1].length, len: m[2].length };
    if (/ de$/.test(c)) { const m2 = text.match(wordRe(c + 'l')); if (m2) return { found: m2[2], idx: m2.index + m2[1].length, len: m2[2].length, del: true }; }
    if (c === 'a' || c === 'de') { const m3 = text.match(wordRe(c === 'a' ? 'al' : 'del')); if (m3) return { found: m3[2], idx: m3.index + m3[1].length, len: m3[2].length, contr: true }; }
  }
  return null;
}
// Параграфы учебника с предлогами (для выбора перед тестом)
export function prepSections() {
  const out = [];
  for (const [lid, L] of book.lessons) for (const g of L.grammar || []) if (/редлог/.test(g.title || '')) out.push({ ref: g.id, title: g.title, lessonId: lid });
  return out;
}
function prepQuestions(n, refs) {
  let { rows, compounds, sents } = prepData();
  if (refs?.length) { const R = new Set(refs); rows = rows.filter(r => R.has(r.ref)); compounds = compounds.filter(c => R.has(c.ref)); sents = sents.filter(x => R.has(x.ref)); }
  if (!rows.length && !compounds.length) return [];
  if (!rows.length) return [];
  const ruleOf = (prep, ref) => { const rs = rows.filter(r => r.prep === prep.toLowerCase() && (!ref || r.ref === ref)); return rs.length ? `${rs[0].ref}: ${prep} — ${rs.map(r => r.full).join('; ')}.` : ''; };
  const gaps = [];
  for (const r of rows) for (const ex of r.exs) gaps.push({ text: ex, prep: r.prep, ref: r.ref, sub: r.full, explain: `${r.ref}: ${r.prep} — ${r.full}. Пример: ${ex.replace(/[.?!]$/, '')}.` });
  for (const s of sents) {
    const cands = s.ref === '§70' ? compounds.map(c => c.prep).concat(['en']) : SIMPLE_PREPS.filter(p => rows.some(r => r.prep === p && r.ref === s.ref));
    const gp = prepGap(s.es, cands); if (!gp) continue;
    const base = gp.del ? gp.found.slice(0, -1) : gp.found.toLowerCase();
    const comp = compounds.find(c => c.prep === base);
    gaps.push({ text: s.es, prep: base, ref: s.ref, sub: s.ru || (comp ? comp.meaning : rows.filter(r => r.prep === base && r.ref === s.ref).map(r => r.full).join('; ')), explain: comp ? `${comp.ref}: ${comp.prep} — ${comp.meaning}.` : ruleOf(base, s.ref) || ruleOf(base) });
  }
  const qs = [];
  const mk = g => {
    const cands = /\s/.test(g.prep) ? compounds.map(c => c.prep) : SIMPLE_PREPS;
    const gp = prepGap(g.text, [g.prep]); if (!gp) return null;
    const ans = gp.found.toLowerCase();
    let opts;
    if (gp.contr) opts = ans === 'al' ? ['al', 'a el', 'del', 'en'] : ['del', 'de el', 'al', 'en'];
    else {
      const clash = c => clashes(c, g.prep);
      const others = shuffle(cands.filter(c => c !== g.prep && !clash(c))).slice(0, 3);
      opts = [ans, ...others.map(o => gp.del ? o + 'l' : o)];
    }
    const blank = g.text.slice(0, gp.idx) + '…' + g.text.slice(gp.idx + gp.len);
    return { type: 'choose_topic', kind: 'Вставьте предлог', prompt: blank, sub: g.sub || '', options: shuffle([...new Set(opts)]).map(o => ({ label: o, correct: o === ans })),
      correct: g.text, answerSpeak: g.text, explain: (gp.contr ? '§2: a + el = al, de + el = del. ' : '') + (g.explain || '') };
  };
  const meanQ = r => {
    const others = shuffle(uniqBy(rows.filter(x => x.prep !== r.prep && !clashes(x.prep, r.prep) && x.meaning !== r.meaning), x => x.meaning)).slice(0, 3);
    if (others.length < 3) return null;
    return { type: 'choose_topic', kind: 'Что означает предлог?', prompt: r.exs[0] ? `${r.prep} — «${r.exs[0]}»` : r.prep, options: shuffle([r, ...others]).map(o => ({ label: o.meaning, correct: o === r })),
      correct: `${r.prep} — ${r.full}`, answerSpeak: r.exs[0] || r.prep, explain: `${r.ref}: ${r.prep} — ${r.full}.` };
  };
  const G = shuffle(gaps), R = shuffle(rows);
  while (qs.length < n && (G.length || R.length)) {
    const q = (Math.random() < 0.65 && G.length) || !R.length ? mk(G.pop()) : meanQ(R.pop());
    if (q) qs.push(q);
  }
  return qs;
}
export function topicTest(topic, n = 12, opts) {
  if (topic === 'preps') return prepQuestions(n, opts);
  if (topic === 'numbers') return numberQuestions(n);
  if (topic === 'time') return timeQuestions(n);
  if (topic === 'colors') return wordTopicQuestions(topicItems(COLORS), n);
  if (topic === 'days') return wordTopicQuestions(topicItems(DAYS), n);
  return [];
}
export const topicWords = topic => topic === 'colors' ? topicItems(COLORS) : topic === 'days' ? topicItems(DAYS) : [];
