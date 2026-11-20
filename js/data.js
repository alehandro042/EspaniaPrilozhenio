import SENT_RU from './sentences-ru.js';
// Загрузка учебника: textbook/contents.json + все уроки, у которых есть поле file.
// Новый урок = новый JSON в textbook/lessons/ + поле "file" в contents.json. Код менять не нужно.
import { state } from './store.js';

const BASE = 'textbook/';
export const book = { contents: null, lessons: new Map(), images: {}, items: new Map(), byLesson: new Map() };

const KIND = {
  verbs: 'verb', other: 'word', phrases: 'phrase', numbers: 'number',
  countries: 'country', nationalities: 'nationality', extra_from_lesson: 'extra', names_diminutives: 'name'
};
export const KIND_RU = {
  verb: 'Глаголы', word: 'Остальные слова', phrase: 'Фразы', number: 'Числительные',
  country: 'Страны', nationality: 'Национальности', extra: 'Слова из урока', name: 'Имена', my: 'Мои слова',
  subjects: 'Предметы', grades_spain: 'Оценки в Испании', months_seasons: 'Месяцы и сезоны', ordinals: 'Порядковые',
  irregular_participles: 'Причастия', irregular_gerunds: 'Герундий', adjectives_for_mente: 'Прилагательные → -mente',
  company_terms: 'В компании', room_words: 'В комнате', office_words: 'В офисе', home_words: 'Дома',
  real_estate_words: 'Недвижимость', hotel_words: 'В отеле'
};
export const kindLabel = k => KIND_RU[k] || k.replace(/_/g, ' ');

// Слово из словаря учебника → поля карточки. Перевод берём только из учебника.
function fromEntry(w) {
  if (typeof w === 'string') return { es: w, ru: '' };
  if (!w || !w.es) return null;
  let ru = w.ru || '', note = w.note || '';
  if (!ru && w.n != null) ru = String(w.n);
  if (w.participio) note = [note, 'participio: ' + w.participio].filter(Boolean).join('; ');
  if (w.gerundio) note = [note, 'gerundio: ' + w.gerundio].filter(Boolean).join('; ');
  if (w.range) note = [note, w.range].filter(Boolean).join('; ');
  return { es: w.es, ru, gender: w.gender || '', note, page: w.page, participio: w.participio, gerundio: w.gerundio };
}
// Тематические списки-объекты: {title, page, words: [...]} или {page, note, cargos: [...], ...}
function flattenGroup(obj) {
  const out = [];
  for (const [k, v] of Object.entries(obj)) if (Array.isArray(v)) for (const w of v) { const e = fromEntry(w); if (e) out.push({ ...e, page: e.page ?? obj.page }); }
  return out;
}

async function getJSON(path) {
  const r = await fetch(BASE + path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(path + ': ' + r.status);
  return r.json();
}

export async function loadBook() {
  book.contents = await getJSON('contents.json');
  book.images = {}; // картинки к словам отключены по решению пользователя (19.11.2026)
  const ls = (book.contents.lessons || []).filter(l => l.file);
  const res = await Promise.allSettled(ls.map(l => getJSON(l.file)));
  res.forEach((r, i) => {
    if (r.status === 'fulfilled') book.lessons.set(ls[i].id, r.value);
    else console.warn('Урок не загрузился', ls[i].file, r.reason);
  });
  buildItems();
  // сохранить учебник для офлайна (в т.ч. при самом первом открытии, до установки service worker)
  try {
    const urls = ['contents.json', ...ls.map(l => l.file), ...Object.values(book.images).map(i => i.file).filter(Boolean)];
    if (Object.keys(book.images).length) urls.push('images/index.json');
    const c = await caches.open('espanola-data');
    for (const u of urls) if (!(await c.match(BASE + u))) c.add(BASE + u).catch(() => {});
  } catch {}
}

// Пометка «перевода в учебнике нет» — такие слова показываем, но не спрашиваем в тестах.
export const hasRu = it => !!(it.ru && String(it.ru).trim() && !String(it.ru).trim().startsWith('('));

export function imgFor(es) {
  const im = book.images[es];
  return im && im.file ? { src: BASE + im.file, ...im } : null;
}

function buildItems() {
  book.items.clear(); book.byLesson.clear();
  for (const [lid, L] of book.lessons) {
    const arr = [];
    const seen = new Set();
    for (const [field, raw] of Object.entries(L.vocabulary || {})) {
      const list = Array.isArray(raw) ? raw.map(fromEntry) : (raw && typeof raw === 'object') ? flattenGroup(raw) : null;
      if (!list) continue;
      const kind = KIND[field] || field;
      for (const w of list) {
        if (!w || !w.es) continue;
        const id = `L${lid}|${w.es}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const it = { id, lessonId: lid, kind, ...w };
        arr.push(it); book.items.set(id, it);
      }
    }
    book.byLesson.set(lid, arr);
  }
  fillGender();
  refreshMyItems();
}

// Род, если в этом месте учебника он не указан:
// 1) то же слово в другом уроке учебника с указанным родом (tema m, dictado m…);
// 2) несколько слов без рода нигде в учебнике — по правилу §3 (-a — ж. р., -o — м. р.).
const GENDER_BY_RULE = { 'fonética': 'f', 'economía': 'f', 'literatura': 'f', 'práctica': 'f', 'grado': 'm', 'sociología': 'f' };
function fillGender() {
  const known = new Map();
  for (const it of book.items.values()) if (it.gender && it.gender !== 'pl' && it.gender !== 'm, f') {
    const g = known.get(it.es); known.set(it.es, g === undefined || g === it.gender ? it.gender : null);
  }
  for (const it of book.items.values()) if (!it.gender && it.ru && !/\s/.test(it.es)) {
    const g = known.get(it.es) || GENDER_BY_RULE[it.es];
    if (g) it.gender = g;
  }
}

export function refreshMyItems() {
  for (const k of [...book.items.keys()]) if (k.startsWith('M|')) book.items.delete(k);
  const arr = [];
  for (const w of Object.values(state.my)) {
    if (w.del) continue;
    const it = { id: 'M|' + w.id, lessonId: 'my', kind: 'my', es: w.es, ru: w.ru, gender: '', note: w.note || '' };
    arr.push(it); book.items.set(it.id, it);
  }
  arr.sort((a, b) => a.es.localeCompare(b.es, 'es'));
  book.byLesson.set('my', arr);
}

export function lessonMeta(id) { return (book.contents.lessons || []).find(l => l.id === id); }
export function unitMeta(n) { return (book.contents.units || []).find(u => u.unit === n); }
export function lessonName(id) {
  if (id === 'my') return 'Мои слова';
  const m = lessonMeta(id);
  return m ? `Урок ${m.lesson} · Unidad ${m.unit}` : 'Урок ' + id;
}

// --- Грамматические задания, которые строятся строго из таблиц учебника ---
const DEFAULT_PERSONS = ['yo', 'tú', 'él, ella, Usted', 'nosotros', 'vosotros', 'ellos, ellas, Ustedes'];
const isInf = s => /^[a-záéíóúñ]+(ar|er|ir)(se)?$/i.test((s || '').trim());

export function conjugations(L) {
  const out = []; // {verb, person, form, ref}
  for (const g of L.grammar || []) {
    const t = g.table;
    if (t && !Array.isArray(t) && typeof t === 'object') {
      // {"hablar": [6 форм], "atender, Ia (e→ie)": [...], ...}
      for (const [k, v] of Object.entries(t)) {
        const verb = (k.match(/^([a-záéíóúñ]+)/i) || [])[1];
        if (Array.isArray(v) && v.length === 6 && isInf(verb) && v.every(x => typeof x === 'string'))
          v.forEach((form, i) => out.push({ verb, person: DEFAULT_PERSONS[i], form, ref: g.id }));
      }
      continue;
    }
    if (!Array.isArray(t)) continue;
    const ref = g.id;
    const titleVerb = ((g.title || '').match(/глагол[а-я]*\s+([a-záéíóúñ]+(?:se)?)/i) || [])[1];
    if (t.length === 6 && t.every(r => r.length === 2) && titleVerb) {
      t.forEach(r => out.push({ verb: titleVerb, person: r[0], form: r[1], ref }));
    } else if (t.length === 6 && t.every(r => r.length === 1) && titleVerb) {
      t.forEach((r, i) => out.push({ verb: titleVerb, person: DEFAULT_PERSONS[i], form: r[0], ref }));
    } else if (t.length === 7 && t[0].every(isInf) && t.every(r => r.length === t[0].length)) {
      t[0].forEach((verb, c) => t.slice(1).forEach((r, i) => out.push({ verb, person: DEFAULT_PERSONS[i], form: r[c], ref })));
    }
  }
  return out.filter(x => x.form && x.person);
}

// Существительные с однозначным родом (m/f) — для задания «el или la».
// Слова на a-/ha- пропускаем: у части из них артикль el при женском роде (el agua).
export function articleItems(items) {
  return items.filter(it => (it.gender === 'm' || it.gender === 'f') && !/[,/(]/.test(it.es) &&
    !/^h?[aá]/i.test(it.es) && !/\s/.test(it.es));
}

// Слово с артиклем для показа: la casa, el libro. Женские на a-/ha- (el agua) и фразы — без артикля.
// Ударный ли первый слог (для el agua, el aula, el área — но la atención, la avenida)
function firstSyllableStressed(w) {
  w = w.toLowerCase();
  if (/^h?á/.test(w)) return true;
  if (/[áéíóú]/.test(w)) return false;
  const syl = (w.match(/[aeiouü]+/g) || []).length;
  return syl <= 1 || (syl === 2 && /[aeiouns]$/.test(w));
}
export function withArt(it) {
  const g = it?.gender;
  if (!it || !it.es || !['m', 'f', 'm pl', 'f pl'].includes(g) || /[,/(\s]/.test(it.es)) return it?.es || '';
  if (g === 'm pl') return 'los ' + it.es;
  if (g === 'f pl') return 'las ' + it.es;
  if (g === 'm') return 'el ' + it.es;
  return /^h?[aá]/i.test(it.es) && firstSyllableStressed(it.es) ? it.es : 'la ' + it.es;
}

// Предложения из раздела «построение предложений», которые можно собрать из слов.
export function sentences(L) {
  const out = [];
  for (const s of L.sentence_building || []) for (const e of s.examples || []) {
    const es = (e.es || '').trim();
    if (!es || /[=…/–—]|\.\.\./.test(es)) continue;
    const n = es.split(/\s+/).length;
    if (n >= 3 && n <= 12 && /^[¡¿A-ZÁÉÍÓÚÑ]/.test(es)) out.push({ es, pattern: s.pattern, ru: SENT_RU[es] || '' });
  }
  return out;
}
