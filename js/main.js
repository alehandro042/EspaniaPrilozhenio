import { state, settings, save, saveSettings, onChange, aiKeys, streakDays, uid, replaceState, merge, tickDay } from './store.js';
import { book, loadBook, hasRu, imgFor, KIND_RU, kindLabel, lessonMeta, unitMeta, lessonName, refreshMyItems, conjugations, sentences, withArt } from './data.js';
import { grade, answer, dueCards, addToCards, lessonProgress, testable, isLearned, mistakes } from './srs.js';
import { speak, listen, canListen, judge, esVoices } from './speech.js';
import { LEVELS, LEVEL_HINT, levelOf, recordTest, buildTest, checkTyped, hintFor, grammarQuestions, sentenceQuestions, buildWriteTest, TOPICS, topicTest, genderQuestions, genderNouns } from './quiz.js';
import { chat, wordsFromPhoto, askGeminiApp, shareText, translateUrl, PROVIDERS, providerList, onlyShared, provider, providerInfo, hasKey as aiHasKey } from './ai.js';
import * as drive from './sync.js';
import * as cloud from './cloud.js';
// Если в config.js задан Supabase — прогресс хранится там, иначе (запасной вариант) на Google Диске.
const SYNC = cloud.configured() ? cloud : drive;
const { syncNow, scheduleSync, initSync, onSyncStatus } = SYNC;
const { signIn, signOut, clientId, hasToken } = drive;

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VERSION = '1.18';

// ---------- общие элементы ----------
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), ms);
}
function setTitle(t, back) {
  $('#title').textContent = t;
  $('#back').hidden = !back;
  $('#back').onclick = () => (typeof back === 'string' ? (location.hash = back) : history.back());
}
function applyStyle() {
  document.documentElement.dataset.style = settings.style;
  const col = { a: '#d6372b', b: '#2f5bd3', c: '#121212', d: '#0d0d0d', e: '#0d0d0d' }[settings.style] || '#2f5bd3';
  $('meta[name=theme-color]').setAttribute('content', col);
}
function renderAva() {
  const a = $('#ava');
  a.innerHTML = settings.picture ? `<img src="${esc(settings.picture)}" alt="" referrerpolicy="no-referrer">` : esc((settings.name || '').trim()[0] || '👤');
}
const lvlChip = lid => `<span class="chip lvl${levelOf(lid)}">${LEVELS[levelOf(lid)]}</span>`;
const bar = p => `<div class="bar"><i style="width:${p}%"></i></div>`;
const gender = it => it.gender ? `<span class="g">${esc(it.gender)}</span>` : '';

function wordRow(it, opts = {}) {
  const img = imgFor(it.es);
  const inCards = !!state.cards[it.id];
  const tr = hasRu(it) ? esc(it.ru) : `<i>${esc(it.ru || 'перевода в учебнике нет')}</i>`;
  return `<div class="word-row" data-id="${esc(it.id)}">
    ${img ? `<img class="thumb" src="${esc(img.src)}" alt="" loading="lazy">` : ''}
    <div class="grow"><div class="es">${esc(it.es)}${gender(it)}</div><div class="ru">${tr}${it.note && opts.notes !== false ? ` <span class="g">${esc(it.note)}</span>` : ''}</div></div>
    <div class="icons">
      <button class="ic" data-act="say" data-text="${esc(it.es)}" aria-label="Озвучить">🔊</button>
      ${canListen ? `<button class="ic" data-act="mic" data-text="${esc(it.es)}" data-lid="${esc(it.lessonId)}" aria-label="Проверить произношение">🎤</button>` : ''}
      <a class="ic" href="${translateUrl(it.es)}" target="_blank" rel="noopener" aria-label="Google Переводчик">↗</a>
      ${hasRu(it) && !opts.noAdd ? `<button class="ic ${inCards ? 'on' : ''}" data-act="card" aria-label="В карточки">${inCards ? '✓' : '＋'}</button>` : ''}
      ${opts.del ? `<button class="ic" data-act="delmy" aria-label="Удалить">🗑</button>` : ''}
    </div></div>`;
}

// делегирование кликов по общим кнопкам
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'say') { if (!speak(b.dataset.text)) toast('Озвучка недоступна в этом браузере'); }
  else if (act === 'mic') micCheck(b, b.dataset.text, b.dataset.lid);
  else if (act === 'card') {
    const id = b.closest('[data-id]').dataset.id;
    if (state.cards[id]) { delete state.cards[id]; save(); b.classList.remove('on'); b.textContent = '＋'; toast('Убрано из карточек'); }
    else { addToCards([id]); b.classList.add('on'); b.textContent = '✓'; toast('Добавлено в карточки'); }
  } else if (act === 'delmy') {
    const id = b.closest('[data-id]').dataset.id.slice(2);
    if (state.my[id]) { state.my[id] = { id, del: true, t: Date.now() }; delete state.cards['M|' + id]; save(); refreshMyItems(); route(); toast('Слово удалено'); }
  }
});

async function micCheck(btn, text, lid) {
  if (btn.classList.contains('rec')) return;
  btn.classList.add('rec');
  try {
    const heard = await listen();
    const lvl = lid && lid !== 'undefined' ? levelOf(isNaN(+lid) ? lid : +lid) : 0;
    if (!heard.length) { toast('Не услышал, попробуйте ещё раз'); return; }
    const j = judge(text, heard, lvl);
    const v = { ok: '✅ Хорошо!', almost: '🟡 Почти. Послушайте 🔊 и повторите', bad: '❌ Не похоже, попробуйте ещё' }[j.verdict];
    toast(`${v}\nУслышал: «${j.heard}»`, 4000);
    if (j.verdict !== 'bad') tickDay(0);
  } catch (err) { toast(err.message, 4000); }
  finally { btn.classList.remove('rec'); }
}

// ---------- маршрутизация ----------
const routes = [];
const on = (re, fn) => routes.push([re, fn]);
let cleanup = null;
function route() {
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  if (!book.contents) return;
  const h = location.hash.slice(1) || '/today';
  const tab = h.split('/')[1];
  const tabMap = { today: 'today', lessons: 'lessons', lesson: 'lessons', review: 'review', cards: 'review', test: tab === 'test' ? (h.includes('my') ? 'my' : 'review') : '', train: 'review', my: 'my', ai: 'ai' };
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (tabMap[tab] || '')));
  for (const [re, fn] of routes) { const m = h.match(re); if (m) { view.scrollTop = 0; fn(...m.slice(1)); return; } }
  location.hash = '#/today';
}
window.addEventListener('hashchange', route);
$('#ava').onclick = () => (location.hash = '#/profile');

const loadedLessons = () => (book.contents.lessons || []).filter(l => book.lessons.has(l.id));

// ---------- Сегодня ----------
on(/^\/today$/, () => {
  setTitle('Сегодня');
  const due = dueCards().length;
  const last = state.last?.lesson && book.lessons.has(state.last.lesson) ? state.last.lesson : loadedLessons()[0]?.id;
  const lm = last && lessonMeta(last);
  const learned = Object.values(state.cards).filter(isLearned).length;
  const streak = streakDays();
  const errs = mistakes().length;
  view.innerHTML = `
    <div class="c hero stack">
      <div class="row"><div><div style="opacity:.85;font-size:14px">К повторению</div><div class="big">${due} ${plural(due, 'карточка', 'карточки', 'карточек')}</div></div>
        <div style="font-size:28px;text-align:right">🔥<div style="font-size:13px;font-weight:600">${streak} ${plural(streak, 'день', 'дня', 'дней')}</div></div></div>
      <a class="btn" href="${due ? '#/cards/due' : '#/review'}">${due ? 'Повторить' : 'Выбрать, что тренировать'}</a>
    </div>
    ${lm ? `<a class="c stack" href="#/lesson/${last}" style="text-decoration:none;color:inherit">
      <div class="row"><span class="mut">${state.last?.lesson ? 'Продолжить' : 'Начать'}</span>${lvlChip(last)}</div>
      <div class="row"><b>Урок ${lm.lesson} · Unidad ${lm.unit}</b><span class="mut">${lessonProgress(last)}%</span></div>
      ${bar(lessonProgress(last))}
      <div class="mut">${esc(unitMeta(lm.unit)?.title || '')}${lm.topics?.length ? ' · ' + esc(lm.topics.join(', ')) : ''}</div>
    </a>` : ''}
    <div class="btns">
      <a class="btn ghost" href="#/train">Тренировка по урокам</a>
      ${errs ? `<a class="btn ghost" href="#/test/mistakes">Мои ошибки (${errs})</a>` : ''}
    </div>
    <div class="c row"><div><b>Выучено слов</b><div class="mut">из уроков и своих</div></div><b style="font-size:22px">${learned}</b></div>
    <a class="c row" href="#/ai?new" style="text-decoration:none;color:inherit"><div class="grow"><b>💬 Новый чат</b><div class="mut">Спросить помощника или получить ответы на упражнение</div></div><span>›</span></a>
    ${installBlock()}
    ${!settings.signedIn ? `<a class="c row" href="#/profile" style="text-decoration:none;color:inherit"><div class="grow"><b>Сохранять прогресс в Google</b><div class="mut">Чтобы не потерять прогресс и учиться с разных устройств</div></div><span>›</span></a>` : ''}
  `;
});
function plural(n, a, b, c) { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; }

let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (/today|profile/.test(location.hash) || !location.hash) route(); });
function installBlock() {
  if (!installEvt) return '';
  return `<button class="btn line" id="installBtn">📲 Установить на главный экран</button>`;
}
document.addEventListener('click', async e => {
  if (e.target.id !== 'installBtn' || !installEvt) return;
  installEvt.prompt(); await installEvt.userChoice; installEvt = null; route();
});

// ---------- Уроки ----------
on(/^\/lessons$/, () => {
  setTitle('Уроки');
  const C = book.contents;
  let html = '';
  for (const u of C.units || []) {
    const ls = (C.lessons || []).filter(l => l.unit === u.unit);
    const uids = ls.filter(l => book.lessons.has(l.id)).map(l => l.id);
    html += `<div class="row sec-row"><div class="sec-title">Unidad ${u.unit}. ${esc(u.title)}</div>${genderNouns(uids).length >= 4 ? `<a class="chip" href="#/test/gender-${uids.join(',')}">⚥ Род: тест по юниту</a>` : ''}</div>`;
    for (const l of ls) {
      const ok = book.lessons.has(l.id);
      const p = ok ? lessonProgress(l.id) : 0;
      html += ok
        ? `<a class="c lesson" href="#/lesson/${l.id}"><span class="num">${l.lesson}</span>
            <div><div class="row"><b>Урок ${l.lesson}</b>${lvlChip(l.id)}</div>
            <div class="mut small">${esc((l.topics || []).join(', '))}</div>${bar(p)}</div><span class="mut">${p}%</span></a>`
        : `<div class="c lesson empty"><span class="num">${l.lesson}</span><div><b>Урок ${l.lesson}</b><div class="mut small">${esc((l.topics || []).join(', '))} · скоро</div></div><span></span></div>`;
    }
  }
  view.innerHTML = html + `<p class="mut small" style="text-align:center">Материал: «Español Actual. Начальный курс», Гринина Е.А., Микаэлян Ю.И.</p>`;
});

const lessonTabs = {};
on(/^\/lesson\/(\d+)(?:\/(\w+))?$/, (idS, tab) => {
  const id = +idS; const L = book.lessons.get(id); const m = lessonMeta(id);
  if (!L) { location.hash = '#/lessons'; return; }
  state.last = { lesson: id, t: Date.now() }; save(true);
  tab = tab || lessonTabs[id] || 'vocab'; lessonTabs[id] = tab;
  setTitle(`Урок ${m.lesson} · Unidad ${m.unit}`, '#/lessons');
  const p = lessonProgress(id);
  const lv = state.levels[id];
  let body = '';
  if (tab === 'vocab') body = vocabTab(id, L);
  else if (tab === 'grammar') body = grammarTab(id, L);
  else body = sentencesTab(id, L);
  view.innerHTML = `
    <div class="c stack">
      <div class="row"><span class="mut">${esc(unitMeta(m.unit)?.title || '')}</span>${lvlChip(id)}</div>
      ${bar(p)}
      <div class="mut small">Выучено ${p}% слов · ${LEVEL_HINT[levelOf(id)]}${levelOf(id) < 2 ? `. До следующего уровня: ${2 - (lv?.streak || 0)} ${plural(2 - (lv?.streak || 0), 'тест', 'теста', 'тестов')} подряд на 80%+` : ''}</div>
    </div>
    <div class="seg" role="tablist">
      <button data-tab="vocab" class="${tab === 'vocab' ? 'on' : ''}">Словарь</button>
      <button data-tab="grammar" class="${tab === 'grammar' ? 'on' : ''}">Грамматика</button>
      <button data-tab="sent" class="${tab === 'sent' ? 'on' : ''}">Предложения</button>
    </div>
    ${body}
    <div class="btns"><a class="btn" href="#/test/lesson-${id}">Тест по уроку</a><a class="btn ghost" href="#/test/write-${id}">✍️ Письменный тест</a></div>
    ${genderNouns([id]).length >= 4 ? `<a class="btn line" href="#/test/gender-${id}">⚥ Род: el/la, un/una, los/las</a>` : ''}`;
  view.querySelectorAll('.seg button').forEach(b => b.onclick = () => { lessonTabs[id] = b.dataset.tab; location.replace(`#/lesson/${id}/${b.dataset.tab}`); });
  view.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { lessonTabs['k' + id] = b.dataset.kind; route(); });
  const all = $('#addAll'); if (all) all.onclick = () => { const n = addToCards(testable(id).map(i => i.id)); toast(n ? `Добавлено в карточки: ${n}` : 'Все слова урока уже в карточках'); route(); };
});

function vocabTab(id, L) {
  const items = book.byLesson.get(id) || [];
  const kinds = [...new Set(items.map(i => i.kind))];
  const order = ['verb', 'word', 'phrase', 'number', 'country', 'nationality', 'extra', 'name'];
  const rank = x => order.includes(x) ? order.indexOf(x) : 100;
  kinds.sort((a, b) => rank(a) - rank(b));
  let k = lessonTabs['k' + id]; if (!kinds.includes(k)) k = kinds[0];
  const list = items.filter(i => i.kind === k);
  return `<div class="row start" style="flex-wrap:wrap;gap:6px">${kinds.map(x => `<button class="chip ${x === k ? 'on' : ''}" data-kind="${x}">${esc(kindLabel(x))} · ${items.filter(i => i.kind === x).length}</button>`).join('')}</div>
    <div class="c">${list.map(it => wordRow(it)).join('') || '<div class="empty-note">Нет слов</div>'}</div>
    <div class="btns"><button class="btn ghost" id="addAll">Все слова в карточки</button><a class="btn ghost" href="#/cards/lesson-${id}">Карточки урока</a></div>
    ${L.vocabulary?.source ? `<div class="mut small" style="text-align:center">Источник: ${esc(L.vocabulary.source)}</div>` : ''}`;
}

function table(t) {
  const grid = rows => `<div class="scroll-x"><table class="gt">${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
  if (Array.isArray(t)) return grid(t.map(r => Array.isArray(r) ? r : [r]));
  if (!t || typeof t !== 'object') return '';
  if (Array.isArray(t.rows)) return grid([...(t.columns ? [t.columns] : []), ...t.rows]) + extras(t, ['columns', 'rows']);
  // {"ver": [формы], "oír": [...], "ver + ": "сочетания", ...}: списки — колонками, строки — пояснениями
  const cols = Object.entries(t).filter(([, v]) => Array.isArray(v));
  let html = '';
  if (cols.length) {
    const n = Math.max(...cols.map(([, v]) => v.length));
    html = grid([cols.map(([k]) => k), ...Array.from({ length: n }, (_, i) => cols.map(([, v]) => v[i] ?? ''))]);
  }
  return html + extras(t, cols.map(([k]) => k));
}
function extras(t, skip) {
  const rest = Object.entries(t).filter(([k, v]) => !skip.includes(k) && v != null && !Array.isArray(v));
  return rest.length ? `<ul class="pts">${rest.map(([k, v]) => `<li><b>${esc(k.trim())}</b> ${esc(typeof v === 'string' ? v : JSON.stringify(v))}</li>`).join('')}</ul>` : '';
}
function grammarTab(id, L) {
  const conj = conjugations(L).length;
  return (L.grammar || []).map(g => `
    <div class="c stack">
      <div class="row"><h3>${esc(g.id)}. ${esc(g.title)}</h3><span class="mut small">с. ${esc(g.page ?? (g.pages || []).join('–'))}</span></div>
      ${g.table ? table(g.table) : ''}
      ${g.points?.length ? `<ul class="pts">${g.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${g.examples?.length ? `<div class="ex-list">${g.examples.map(x => `<button data-act="say" data-text="${esc(x)}">🔊 ${esc(x)}</button>`).join('')}</div>` : ''}
      <a class="mut small" href="#/ai?q=${encodeURIComponent(`Объясни простыми словами ${g.id} «${g.title}» из учебника Español Actual, урок ${lessonMeta(id).lesson}, с примерами.`)}">Спросить помощника про ${esc(g.id)} ›</a>
    </div>`).join('') + (conj ? `<a class="btn ghost" href="#/test/gram-${id}">Тренировать спряжение и артикли</a>` : `<a class="btn ghost" href="#/test/gram-${id}">Тренировать артикли</a>`);
}
function sentencesTab(id, L) {
  const sb = L.sentence_building || [];
  const ex = L.exercises || [];
  return sb.map(s => `
    <div class="c stack">
      <div class="row"><h3>${esc(s.pattern)}</h3><span class="mut small">с. ${esc(s.page ?? (s.pages || []).join('–'))}</span></div>
      <div>${(s.examples || []).map(e => `<div class="word-row"><div class="grow">${esc(e.es)}${e.ru ? `<div class="ru">${esc(e.ru)}</div>` : ''}</div><div class="icons">
        <button class="ic" data-act="say" data-text="${esc(e.es)}">🔊</button>${canListen ? `<button class="ic" data-act="mic" data-text="${esc(e.es)}" data-lid="${id}">🎤</button>` : ''}</div></div>`).join('')}</div>
      ${s.note ? `<div class="mut small">${esc(s.note)}</div>` : ''}
    </div>`).join('') +
    (sentences(L).length ? `<a class="btn ghost" href="#/test/sent-${id}">Собирать предложения</a>` : '') +
    ((L.texts || []).filter(x => x.es).length ? `<div class="sec-title">Тексты из учебника</div>` + L.texts.filter(x => x.es).map(x => `
      <details class="c"><summary class="row"><b class="grow">${esc(x.title || 'Текст')}</b><span class="mut small">с. ${esc(x.page ?? (x.pages || []).join('–'))}</span></summary>
        <div style="white-space:pre-wrap;margin-top:10px">${esc(x.es)}</div>
        <div class="btns" style="margin-top:10px"><button class="btn ghost sm" data-act="say" data-text="${esc(x.es)}">🔊 Прослушать</button>
        <a class="btn ghost sm" href="${translateUrl(x.es.slice(0, 4500))}" target="_blank" rel="noopener">↗ Перевести</a></div>
      </details>`).join('') : '') +
    (ex.length ? `<details class="c"><summary><b>Упражнения из учебника (${ex.length})</b></summary>
      ${ex.map(x => `<div class="word-row"><div class="grow"><b>${esc(x.number)}.</b> ${esc(x.instruction_ru)} <span class="mut small">с. ${esc(x.page ?? (x.pages || []).join('–'))}</span></div>
        ${aiExercise(x) ? `<a class="btn ghost sm" href="#/ai?ex=${id}:${encodeURIComponent(x.number)}" style="flex:none">🤖 Ответы</a>` : ''}</div>`).join('')}</details>` : '');
}

// ---------- Повторить: карточки ----------
on(/^\/review$/, () => {
  setTitle('Повторить');
  const due = dueCards();
  const total = Object.keys(state.cards).length;
  view.innerHTML = `
    <div class="c hero stack">
      <div style="opacity:.85;font-size:14px">Сейчас к повторению</div>
      <div class="big">${due.length} ${plural(due.length, 'карточка', 'карточки', 'карточек')}</div>
      ${due.length ? `<a class="btn" href="#/cards/due">Начать</a>` : `<div style="font-size:14px">${total ? 'Всё повторено. Новые карточки появятся по расписанию.' : 'Карточек пока нет. Откройте урок и нажмите «Все слова в карточки» или ＋ у слова.'}</div>`}
    </div>
    <div class="sec-title">Темы</div>
    <div class="topic-grid">${Object.entries(TOPICS).map(([k, t]) => `<a class="c topic" href="#/test/topic-${k}"><span>${t.icon}</span><b>${t.title}</b><small class="mut">${t.hint}</small></a>`).join('')}</div>
    <a class="c row" href="#/train" style="text-decoration:none;color:inherit"><div class="grow"><b>Тренировка по нескольким урокам</b><div class="mut">Отметьте уроки и выберите карточки или тест</div></div><span>›</span></a>
    ${mistakes().length ? `<a class="c row" href="#/test/mistakes" style="text-decoration:none;color:inherit"><div class="grow"><b>Мои ошибки</b><div class="mut">${mistakes().length} ${plural(mistakes().length, 'слово', 'слова', 'слов')}, в которых были ошибки</div></div><span>›</span></a>` : ''}
    <div class="c mut small">Как работает повторение: «Знаю» откладывает слово на несколько дней, и каждый раз интервал растёт. «Трудно» — повторим скоро. «Не помню» — слово вернётся через пару минут, а ошибочные слова показываются чаще.</div>`;
});

function resolveSet(spec) {
  // due | lesson-ID | ids-1,2,3 | my | mistakes
  if (spec === 'due') return { items: dueCards(), title: 'Повторение', lessons: null };
  if (spec === 'mistakes') return { items: mistakes(), title: 'Мои ошибки', lessons: [...new Set(mistakes().map(i => i.lessonId))] };
  if (spec === 'my') return { items: (book.byLesson.get('my') || []).filter(hasRu), title: 'Мои слова', lessons: ['my'] };
  const tp = spec.match(/^topic-(\w+)$/);
  if (tp && TOPICS[tp[1]]) return { items: [], title: TOPICS[tp[1]].title, kind: 'topic', topic: tp[1] };
  const m = spec.match(/^(lesson|ids|gram|sent|write|gender)-(.+)$/);
  if (!m) return { items: [], title: '' };
  const lessons = m[2].split(',').map(x => x === 'my' ? 'my' : +x).filter(x => x === 'my' || book.lessons.has(x));
  const items = lessons.flatMap(l => (book.byLesson.get(l) || []).filter(hasRu));
  return { items, lessons, kind: m[1], title: lessons.length === 1 ? lessonName(lessons[0]) : `Уроки: ${lessons.map(l => l === 'my' ? 'мои' : lessonMeta(l).lesson).join(', ')}` };
}

on(/^\/cards\/(.+)$/, spec => {
  const set = resolveSet(decodeURIComponent(spec));
  setTitle(set.title || 'Карточки', true);
  let queue = spec === 'due' ? set.items : [...set.items].sort(() => Math.random() - .5);
  if (spec !== 'due') { // в карточках урока сначала то, что пора повторить или ещё не выучено
    queue.sort((a, b) => (isLearned(state.cards[a.id]) - isLearned(state.cards[b.id])));
  }
  queue = queue.slice(0, 30);
  if (!queue.length) { view.innerHTML = `<div class="empty-note">Нечего повторять 🎉</div><a class="btn ghost" href="#/train">Тренировка по урокам</a>`; return; }
  let i = 0, dir = settings.cardDir || 'es', known = 0;
  const draw = () => {
    if (i >= queue.length) {
      view.innerHTML = `<div class="c stack" style="text-align:center"><div style="font-size:40px">🎉</div><h2>Готово!</h2><div class="mut">Карточек: ${queue.length}, «знаю»: ${known}</div></div>
        <a class="btn" href="#/today">На главную</a>${set.lessons?.length ? `<a class="btn ghost" href="#/test/${spec === 'due' ? 'mistakes' : spec.replace(/^lesson-/, 'ids-')}">Пройти тест</a>` : ''}`;
      scheduleSync(); return;
    }
    const it = queue[i]; const img = imgFor(it.es);
    const front = dir === 'es'
      ? `${img ? `<img src="${esc(img.src)}" alt="">` : ''}<div class="word">${esc(withArt(it))}</div>${withArt(it) === it.es ? gender(it) : ''}`
      : `<div class="word">${esc(it.ru)}</div>`;
    const back = dir === 'es'
      ? `<div class="word">${esc(it.ru)}</div>`
      : `${img ? `<img src="${esc(img.src)}" alt="">` : ''}<div class="word">${esc(withArt(it))}</div>${withArt(it) === it.es ? gender(it) : ''}`;
    view.innerHTML = `
      <div class="row"><span class="mut">Карточка ${i + 1} из ${queue.length}</span>
        <button class="chip" id="dir">${dir === 'es' ? 'es → ru' : 'ru → es'}</button></div>
      ${bar(100 * i / queue.length)}
      <div class="flash" id="flash" role="button" tabindex="0" aria-label="Перевернуть карточку"><div class="in">
        <div class="face fb-front"><div>${front}<div class="mut" style="margin-top:10px">нажмите, чтобы перевернуть</div></div></div>
        <div class="face fb-back"><div>${back}<div class="mut" style="margin-top:8px">${esc(lessonName(it.lessonId))}</div></div></div>
      </div></div>
      <div class="row" style="justify-content:center;gap:10px">
        <button class="ic" data-act="say" data-text="${esc(it.es)}">🔊</button>
        ${canListen ? `<button class="ic" data-act="mic" data-text="${esc(it.es)}" data-lid="${esc(it.lessonId)}">🎤</button>` : ''}
        <a class="ic" href="${translateUrl(it.es)}" target="_blank" rel="noopener">↗</a>
      </div>
      <div class="grade" id="grade" style="visibility:hidden">
        <button data-g="0">Не помню<small>через 2 мин</small></button>
        <button data-g="1">Трудно<small>скоро</small></button>
        <button data-g="2">Знаю<small>через неск. дней</small></button>
      </div>`;
    const f = $('#flash');
    const flip = () => { f.classList.toggle('flip'); $('#grade').style.visibility = 'visible'; if (f.classList.contains('flip') && dir === 'ru') speak(it.es); };
    f.onclick = flip; f.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } };
    if (dir === 'es') speak(it.es);
    $('#dir').onclick = () => { dir = dir === 'es' ? 'ru' : 'es'; settings.cardDir = dir; saveSettings(); draw(); };
    view.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      const g = +b.dataset.g; grade(it.id, g); if (g === 2) known++;
      if (g === 0 && spec !== 'due') queue.push(it); // не помню — покажем ещё раз в этой сессии
      i++; draw();
    });
  };
  draw();
});

// ---------- Тренировка по нескольким урокам ----------
on(/^\/train$/, () => {
  setTitle('Тренировка', true);
  const ls = loadedLessons();
  const sel = new Set(settings.trainSel || []);
  const units = [...new Set(ls.map(l => l.unit))];
  const myCount = (book.byLesson.get('my') || []).filter(hasRu).length;
  view.innerHTML = `
    <div class="row start" style="flex-wrap:wrap;gap:6px">
      ${units.map(u => `<button class="chip" data-preset="u${u}">Unidad ${u}</button>`).join('')}
      <button class="chip" data-preset="started">Всё начатое</button>
      <button class="chip" data-preset="none">Снять все</button>
    </div>
    <div class="c">
      ${ls.map(l => `<label class="check"><input type="checkbox" value="${l.id}" ${sel.has(l.id) ? 'checked' : ''}><span class="grow">Урок ${l.lesson} · Unidad ${l.unit}<div class="mut small">${esc((l.topics || []).join(', '))}</div></span>${lvlChip(l.id)}</label>`).join('')}
      ${myCount ? `<label class="check"><input type="checkbox" value="my" ${sel.has('my') ? 'checked' : ''}><span class="grow">Мои слова<div class="mut small">${myCount} ${plural(myCount, 'слово', 'слова', 'слов')}</div></span>${lvlChip('my')}</label>` : ''}
    </div>
    <div class="mut small">Каждое слово спрашивается на уровне своего урока.</div>
    <div class="btns"><button class="btn ghost" id="goCards">Карточки</button><button class="btn" id="goTest">Тест</button></div>
    <button class="btn ghost" id="goWrite">✍️ Письменный тест</button>
    ${mistakes().length ? `<a class="btn line" href="#/test/mistakes">Только мои ошибки (${mistakes().length})</a>` : ''}`;
  const boxes = () => [...view.querySelectorAll('input[type=checkbox]')];
  const chosen = () => boxes().filter(b => b.checked).map(b => b.value);
  const store = () => { settings.trainSel = chosen().map(v => v === 'my' ? 'my' : +v); saveSettings(); };
  boxes().forEach(b => b.onchange = store);
  view.querySelectorAll('[data-preset]').forEach(c => c.onclick = () => {
    const p = c.dataset.preset;
    boxes().forEach(b => {
      const l = ls.find(x => String(x.id) === b.value);
      b.checked = p === 'none' ? false : p === 'started' ? (b.value === 'my' ? myCount > 0 : lessonProgress(+b.value) > 0 || !!state.levels[b.value]) : (l && 'u' + l.unit === p);
    });
    store();
  });
  const go = kind => { const c = chosen(); if (!c.length) return toast('Отметьте хотя бы один урок'); location.hash = `#/${kind}/ids-${c.join(',')}`; };
  $('#goCards').onclick = () => go('cards');
  $('#goTest').onclick = () => go('test');
  $('#goWrite').onclick = () => { const c = chosen(); if (!c.length) return toast('Отметьте хотя бы один урок'); location.hash = `#/test/write-${c.join(',')}`; };
});

// ---------- Тест ----------
on(/^\/test\/(.+)$/, spec => {
  spec = decodeURIComponent(spec);
  const set = resolveSet(spec);
  const isLessonTest = set.kind === 'lesson' && set.lessons?.length === 1;
  let qs;
  if (set.kind === 'gram') { const lid = set.lessons[0]; qs = grammarQuestions(lid, levelOf(lid), book.byLesson.get(lid) || []).sort(() => Math.random() - .5).slice(0, 10); }
  else if (set.kind === 'write') { qs = buildWriteTest(set.lessons || [], 10); }
  else if (set.kind === 'topic') { qs = topicTest(set.topic, 12); }
  else if (set.kind === 'gender') { qs = genderQuestions(set.lessons || [], 12); }
  else if (set.kind === 'sent') { qs = sentenceQuestions(set.lessons[0]).sort(() => Math.random() - .5).slice(0, 8); }
  else if (spec === 'mistakes' || spec === 'due') qs = buildTest(set.lessons || [], Math.min(12, set.items.length), { items: set.items, vocabOnly: true });
  else qs = buildTest(set.lessons || [], 10, { vocabOnly: spec === 'my' || (set.lessons || []).every(l => l === 'my') });
  setTitle(isLessonTest ? 'Тест · ' + set.title : (set.kind === 'gram' ? 'Грамматика' : set.kind === 'sent' ? 'Предложения' : set.kind === 'write' ? 'Письменный тест' : set.kind === 'topic' ? set.title : set.kind === 'gender' ? 'Род · ' + set.title : 'Тест'), true);
  if (!qs.length) { view.innerHTML = `<div class="empty-note">Для теста пока нет материала.</div>`; return; }
  let i = 0, right = 0; const wrong = [];
  const lid0 = set.lessons?.[0];

  const draw = () => {
    if (i >= qs.length) return finish();
    const q = qs[i];
    let area = '';
    if (q.options) {
      const pics = q.type === 'pick_img';
      area = `<div class="opts ${pics ? 'pics' : ''}">${q.options.map((o, k) => `<button class="opt" data-k="${k}">${pics ? `<img src="${esc(o.img)}" alt="">` : esc(o.label)}</button>`).join('')}</div>`;
    } else if (q.type === 'order') {
      area = `<div class="tiles" id="ans"></div><div class="tiles" id="pool" style="border-style:solid">${q.shuffled.map((w, k) => `<button class="tile" data-k="${k}">${esc(w)}</button>`).join('')}</div>
        <button class="btn" id="chk">Проверить</button>`;
    } else {
      area = `<input class="inp" id="inp" autocomplete="off" autocapitalize="off" spellcheck="false" lang="es" placeholder="${q.placeholder ? q.placeholder : q.type === 'dictation' ? 'Напишите, что услышали' : q.article ? 'el / la + слово' : 'Ответ по-испански'}" enterkeyhint="done"${q.numeric ? ' inputmode="numeric"' : ''}>
        <div class="accents">${['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'].map(c => `<button data-ch="${c}">${c}</button>`).join('')}</div>
        <div class="btns">${q.hint ? `<button class="btn ghost" id="hint">Подсказка</button>` : ''}<button class="btn ghost" id="skip">Не знаю</button><button class="btn" id="chk">Проверить</button></div>`;
    }
    view.innerHTML = `
      <div class="row"><span class="mut">Вопрос ${i + 1} из ${qs.length}</span>${q.item ? lvlChip(q.item.lessonId) : q.lessonId ? lvlChip(q.lessonId) : ''}</div>
      ${bar(100 * i / qs.length)}
      <div class="c stack">
        <div class="mut q-kind">${esc(q.kind)}</div>
        ${q.img ? `<img src="${esc(q.img)}" alt="" style="max-height:140px;margin:0 auto;border-radius:10px">` : ''}
        <div class="q-prompt">${q.prompt === '🔊' ? `<button class="ic listen" data-act="say" data-text="${esc(q.speak)}" aria-label="Прослушать">🔊</button>` : q.type === 'order' ? `<span style="font-size:15px;font-weight:500;font-family:var(--body)">${esc(q.prompt)}</span>` : esc(q.prompt)}</div>
        ${q.sub ? `<div class="mut" style="text-align:center">${esc(q.sub)}</div>` : ''}
        ${q.speak && q.type !== 'choose_es' && q.prompt !== '🔊' ? `<div style="text-align:center"><button class="ic" data-act="say" data-text="${esc(q.speak)}">🔊</button></div>` : ''}
      </div>
      ${area}
      <div id="fb"></div>`;
    if (q.autoSpeak) setTimeout(() => speak(q.speak), 250);
    if (q.options) view.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (view.querySelector('.opt.ok,.opt.bad')) return;
      const o = q.options[+b.dataset.k];
      view.querySelectorAll('.opt').forEach((x, k) => { if (q.options[k].correct) x.classList.add('ok'); });
      if (!o.correct) b.classList.add('bad');
      done(o.correct, false, correctText(q));
    });
    else if (q.type === 'order') {
      const ans = $('#ans'), pool = $('#pool');
      view.querySelectorAll('.tile').forEach(t => t.onclick = () => { (t.parentElement === pool ? ans : pool).appendChild(t); });
      $('#chk').onclick = () => {
        if ($('#fb').innerHTML) return;
        const got = [...ans.children].map(t => t.textContent).join(' ');
        done(got === q.words.join(' '), false, q.words.join(' '));
      };
    } else {
      const inp = $('#inp'); setTimeout(() => inp.focus(), 50);
      view.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { const s = inp.selectionStart ?? inp.value.length; inp.value = inp.value.slice(0, s) + b.dataset.ch + inp.value.slice(inp.selectionEnd ?? s); inp.focus(); inp.setSelectionRange(s + 1, s + 1); });
      const check = () => {
        if ($('#fb').innerHTML) return next();
        if (!inp.value.trim()) return;
        const lvl = q.item ? levelOf(q.item.lessonId) : levelOf(q.lessonId);
        const r = checkTyped(inp.value, q.expected, lvl, q.article);
        done(r.ok, r.almost, correctText(q), r.msg);
      };
      $('#chk').onclick = check;
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); check(); } };
      $('#skip').onclick = () => { if (!$('#fb').innerHTML) done(false, false, correctText(q)); };
      const h = $('#hint'); if (h) h.onclick = () => toast(hintFor(q), 3500);
    }
  };
  const correctText = q => q.correct ? q.correct : q.type === 'dictation' ? q.expected[0] : q.type === 'write_es' ? (q.article ? q.article + ' ' + q.item.es : withArt(q.item))
    : q.type === 'conj_write' || q.type === 'conj' ? q.answerSpeak
    : q.options ? (q.type === 'pick_img' ? `${withArt(q.item)} — ${q.item.ru}` : q.type === 'article' ? `${q.options.find(o => o.correct).label} ${q.item.es}` : (q.item ? `${withArt(q.item)} — ${q.item.ru}` : q.options.find(o => o.correct).label)) : '';
  function done(ok, almost, correct, msg) {
    const q = qs[i];
    if (ok) right++; else wrong.push({ q, correct });
    if (q.item) answer(q.item.id, ok, almost);
    else tickDay();
    const sp = q.answerSpeak || (q.item && withArt(q.item));
    $('#fb').innerHTML = `<div class="fb ${ok ? (almost ? 'almost' : 'ok') : 'bad'} stack">
      <div class="row"><b>${ok ? (almost ? '🟡 Почти' : '✅ Верно') : '❌ Неверно'}</b>${sp ? `<button class="ic" data-act="say" data-text="${esc(sp)}">🔊</button>` : ''}</div>
      ${msg ? `<div>${esc(msg)}</div>` : ''}${!ok || almost ? `<div>Правильно: <b>${esc(correct)}</b></div>` : ''}${!ok && q.explain ? `<div class="small">${esc(q.explain)}</div>` : ''}
    </div><button class="btn" id="next" style="margin-top:10px">${i + 1 < qs.length ? 'Дальше' : 'Результат'}</button>`;
    if (sp && ok) speak(sp);
    $('#next').onclick = next;
    $('#next').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function next() { i++; draw(); }
  function finish() {
    const score = right / qs.length;
    let lvlMsg = '';
    if (isLessonTest) {
      const r = recordTest(lid0, score);
      lvlMsg = r.up ? `🎉 Урок переходит на уровень «${LEVELS[r.level]}»!`
        : r.level >= 2 ? 'Урок на сложном уровне.'
        : score >= 0.8 ? `Ещё ${2 - r.streak} ${plural(2 - r.streak, 'тест', 'теста', 'тестов')} на 80%+ подряд — и уровень повысится.`
        : 'Для повышения уровня нужно 2 теста подряд на 80% и больше.';
    }
    view.innerHTML = `
      <div class="c stack" style="text-align:center">
        <div style="font-size:40px">${score >= 0.8 ? '🏆' : score >= 0.5 ? '👍' : '💪'}</div>
        <div class="q-prompt">${right} из ${qs.length}</div>
        <div class="mut">${Math.round(score * 100)}% верных ответов</div>
        ${lvlMsg ? `<div>${lvlMsg}</div>` : ''}
      </div>
      ${wrong.length ? `<div class="sec-title">Ошибки — они чаще попадут в повторение</div><div class="c">${wrong.map(w => `<div class="word-row"><div class="grow"><div class="es">${esc(w.correct)}</div><div class="ru">${esc(w.q.prompt === '🔊' ? 'на слух' : w.q.prompt)}</div></div>${w.q.item?.es || w.q.answerSpeak ? `<button class="ic" data-act="say" data-text="${esc(w.q.item?.es || w.q.answerSpeak)}">🔊</button>` : ''}</div>`).join('')}</div>` : ''}
      <div class="btns"><button class="btn ghost" id="again">Ещё раз</button>${lid0 && lid0 !== 'my' ? `<a class="btn ghost" href="#/lesson/${lid0}">К уроку</a>` : `<a class="btn ghost" href="#/today">На главную</a>`}</div>`;
    $('#again').onclick = () => route();
    scheduleSync();
  }
  draw();
});

// ---------- Мои слова ----------
let photoRows = null;
on(/^\/my(?:\/(\w+))?$/, mode => {
  setTitle('Мои слова');
  const items = book.byLesson.get('my') || [];
  mode = mode || '';
  let form = '';
  if (mode === 'add') form = `<div class="c stack"><b>Новое слово</b>
      <div class="field"><label>По-испански</label><input class="inp" id="nes" lang="es" autocapitalize="off"></div>
      <div class="field"><label>Перевод</label><input class="inp" id="nru"></div>
      <div class="btns"><a class="btn ghost" href="#/my">Отмена</a><button class="btn" id="saveOne">Сохранить</button></div></div>`;
  else if (mode === 'list') form = `<div class="c stack"><b>Вставить списком</b>
      <div class="mut small">По одному слову в строке: <code>слово — перевод</code>. Разделитель: тире, дефис, двоеточие, = или табуляция.</div>
      <textarea class="inp" id="lst" lang="es" placeholder="perro — собака&#10;gato — кошка"></textarea>
      <div class="btns"><a class="btn ghost" href="#/my">Отмена</a><button class="btn" id="saveList">Добавить</button></div></div>`;
  else if (mode === 'photo') form = photoForm();
  view.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(${providerInfo().vision || !onlyShared() ? 3 : 2},1fr);gap:8px">
      <a class="c tight" href="#/my/add" style="text-align:center;text-decoration:none;color:inherit"><div style="font-size:22px">✍️</div><div class="mut">Вручную</div></a>
      <a class="c tight" href="#/my/list" style="text-align:center;text-decoration:none;color:inherit"><div style="font-size:22px">📋</div><div class="mut">Списком</div></a>
      ${providerInfo().vision || !onlyShared() ? `<a class="c tight" href="#/my/photo" style="text-align:center;text-decoration:none;color:inherit"><div style="font-size:22px">📷</div><div class="mut">По фото</div></a>` : ''}
    </div>
    ${form}
    ${items.length ? `<div class="btns"><a class="btn ghost" href="#/cards/my">Карточки</a><a class="btn ghost" href="#/test/my">Тест</a></div>
      <div class="c">${items.map(it => wordRow(it, { del: true })).join('')}</div>`
      : !mode ? `<div class="empty-note">Здесь будут ваши слова не из учебника. Они тоже попадают в карточки и тесты.</div>` : ''}`;
  const s1 = $('#saveOne'); if (s1) { $('#nes').focus(); s1.onclick = () => { const n = addMy([{ es: $('#nes').value, ru: $('#nru').value }]); if (n) { toast('Слово добавлено'); location.hash = '#/my'; } else toast('Заполните оба поля'); }; }
  const s2 = $('#saveList'); if (s2) s2.onclick = () => {
    const rows = parseList($('#lst').value);
    const n = addMy(rows); toast(n ? `Добавлено слов: ${n}` : 'Не нашёл строк вида «слово — перевод»'); if (n) location.hash = '#/my';
  };
  if (mode === 'photo') bindPhoto();
});

function parseList(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(.+?)\s*(?:\s[—–-]\s|[—–]|\t|=|:|\s-\s)\s*(.+)$/) || l.match(/^(.+?)\s+-\s*(.+)$/);
    return m ? { es: m[1].replace(/^\d+[.)]\s*/, ''), ru: m[2] } : null;
  }).filter(Boolean);
}
function addMy(rows) {
  let n = 0;
  const existing = new Set(Object.values(state.my).filter(w => !w.del).map(w => w.es.toLowerCase()));
  for (const r of rows) {
    const es = (r.es || '').trim(), ru = (r.ru || '').trim();
    if (!es || !ru || existing.has(es.toLowerCase())) continue;
    const id = uid(); state.my[id] = { id, es, ru, t: Date.now() }; state.cards['M|' + id] = { due: Date.now(), ivl: 0, ease: 2.5, reps: 0, lapses: 0, streak: 0, t: Date.now() };
    existing.add(es.toLowerCase()); n++;
  }
  if (n) { save(); refreshMyItems(); }
  return n;
}

function photoForm() {
  const hasKey = aiHasKey();
  if (photoRows) return `<div class="c stack"><div class="row"><b>Найдено на фото</b><span class="chip">проверьте</span></div>
      <div class="mut small">Исправьте ошибки и снимите галочки с лишнего.</div>
      ${photoRows.map((r, k) => `<div class="row" style="gap:6px"><input type="checkbox" data-pk="${k}" checked style="width:20px;height:20px;accent-color:var(--acc)">
        <input class="inp" data-pes="${k}" value="${esc(r.es)}" lang="es" style="padding:8px"><input class="inp" data-pru="${k}" value="${esc(r.ru)}" style="padding:8px"></div>`).join('')}
      <div class="btns"><button class="btn ghost" id="photoCancel">Отмена</button><button class="btn" id="photoSave">Сохранить</button></div></div>`;
  if (onlyShared() && !providerInfo().vision) return `<div class="c stack"><b>Слова с фото</b><div class="mut small">Распознавание по фото пока выключено: DeepSeek не читает картинки. Добавляйте слова вручную или списком.</div></div>`;
  return `<div class="c stack"><b>Слова с фото</b>
    <div class="mut small">${hasKey ? 'Сфотографируйте страницу или записи, ИИ' + (providerInfo().noKey ? '' : ' (' + providerInfo().name + ')') + ' найдёт испанские слова, а вы проверите их перед сохранением.' : 'Для распознавания нужен ключ ИИ (есть бесплатные, добавляется в профиле). Без ключа: выберите фото, нажмите «Спросить Gemini», затем скопируйте ответ сюда через «Списком».'}</div>
    ${hasKey && !providerInfo().vision ? `<div class="fb almost small">${esc(providerInfo().name)} не читает фото. Выберите в <a href="#/profile">профиле</a> другой сервис (например, бесплатный Gemini или Groq).</div>` : ''}
    <div class="btns"><label class="btn" style="cursor:pointer">📷 Сфотографировать<input type="file" class="photoIn" accept="image/*" capture="environment" hidden></label>
      <label class="btn ghost" style="cursor:pointer">🖼 Из галереи<input type="file" class="photoIn" accept="image/*" hidden></label></div>
    <div id="photoMsg" class="mut small"></div>
    ${!hasKey ? `<a class="mut small" href="#/profile">Добавить ключ ИИ ›</a>` : ''}</div>`;
}
async function shrink(file, max = 1600) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return { b64: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(file); }), mime: file.type };
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { b64: c.toDataURL('image/jpeg', 0.85).split(',')[1], mime: 'image/jpeg' };
}
function bindPhoto() {
  view.querySelectorAll('.photoIn').forEach(inp => inp.onchange = async () => {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    const msg = $('#photoMsg');
    if (!aiHasKey()) {
      msg.innerHTML = `<button class="btn ghost" id="askPhoto">Спросить Gemini про это фото</button>`;
      $('#askPhoto').onclick = async () => {
        const r = await askGeminiApp('Выпиши все испанские слова с этого фото с русским переводом, по одному в строке, в формате: слово — перевод. Без пояснений.', [f]);
        toast(r === 'shared' ? 'Выберите Gemini в меню. Ответ скопируйте в «Списком»' : 'Запрос скопирован. Прикрепите фото в Gemini и вставьте запрос', 5000);
      };
      return;
    }
    msg.textContent = 'Распознаю… это может занять до 30 секунд';
    try {
      const { b64, mime } = await shrink(f);
      const rows = await wordsFromPhoto(b64, mime);
      if (!rows.length) { msg.textContent = 'Слов не нашлось. Попробуйте фото чётче.'; return; }
      photoRows = rows; route();
    } catch (e) { msg.textContent = e.message; }
  });
  const c = $('#photoCancel'); if (c) c.onclick = () => { photoRows = null; location.hash = '#/my'; };
  const s = $('#photoSave'); if (s) s.onclick = () => {
    const rows = photoRows.map((_, k) => ({ on: $(`[data-pk="${k}"]`).checked, es: $(`[data-pes="${k}"]`).value, ru: $(`[data-pru="${k}"]`).value })).filter(r => r.on);
    const n = addMy(rows); photoRows = null; toast(`Добавлено слов: ${n}`); location.hash = '#/my';
  };
}

// ---------- Помощник ----------
// История чатов: список разговоров в localStorage, chatLog — сообщения открытого разговора
const CHATS_KEY = 'espanola.chats', CUR_KEY = 'espanola.chat.cur';
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
let chats = lsGet(CHATS_KEY, null);
if (!chats) { const old = lsGet('espanola.chat', []); chats = old.length ? [{ id: uid(), t: Date.now(), msgs: old }] : []; try { localStorage.removeItem('espanola.chat'); } catch {} }
// при каждом запуске и после выхода из Помощника — новый чат; прошлые лежат в «Истории» (просьба Александра)
let chatCur = uid();
const chatLog = [...(chats.find(c => c.id === chatCur)?.msgs || [])];
let chatPending = false, lastExQ = null; // ждём ответа ИИ (переживает перерисовку экрана)
const chatTitle = c => { const u = c.msgs.find(m => m.role === 'user'); const t = (u?.show || u?.text || 'Новый чат').split('\n')[0]; return t.length > 60 ? t.slice(0, 58) + '…' : t; };
const writeChats = () => { try { localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, 50))); localStorage.setItem(CUR_KEY, JSON.stringify(chatCur)); } catch {} };
const saveChat = () => {
  let c = chats.find(x => x.id === chatCur);
  if (!chatLog.length) { if (c) chats = chats.filter(x => x !== c); writeChats(); return; }
  if (!c) { c = { id: chatCur }; chats.unshift(c); }
  c.msgs = chatLog.slice(-60); c.t = Date.now();
  chats.sort((a, b) => b.t - a.t); writeChats();
};
function openChat(id) { chatCur = id || uid(); chatLog.length = 0; chatLog.push(...(chats.find(c => c.id === chatCur)?.msgs || [])); writeChats(); }
function aiContext() {
  const lid = state.last?.lesson; const L = lid && book.lessons.get(lid); const m = lid && lessonMeta(lid);
  if (!L) return '';
  return `студент сейчас на уроке ${m.lesson} (Unidad ${m.unit}). Грамматика урока: ${(L.grammar || []).map(g => g.id + ' ' + g.title).join('; ')}.`;
}
// Для ИИ берём только тестовые и переводные упражнения (разговорные не нужны — просьба пользователя)
const EX_OK = /переведите|переведите|вставьте|раскройте|трансформир|расставьте|проспрягайте|замените|закончите|поставьте|соотнесите|образуйте|употребл|выберите|дополните|соедините|напишите/i;
const EX_NO = /^(расскажите|составьте рассказ|составьте свое|прочитайте, следя|сравните|сосчитайте|скажите)|повторите диалог|по ролям/i;
const aiExercise = x => x.kind ? x.kind === 'closed' : EX_OK.test(x.instruction_ru || '') && !EX_NO.test(x.instruction_ru || '');
// «стр. 45 упр. 3», «45 3», «упр 3 стр 45», «урок 2 упр 5» → упражнение учебника
const PART = { 'а': 'A', 'б': 'B', 'в': 'C', 'г': 'D', 'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D' };
function parseExerciseQuery(text) {
  const t = ' ' + String(text).toLowerCase().replace(/ё/g, 'е') + ' ';
  const NUM = '(\\d{1,2})\\s*\\*?\\s*(?:[\\s.(-]*([абвгabcd])(?![а-яa-z]))?';
  const LIST = NUM + '(?:\\s*(?:,|;|\\+|и|and|&)\\s*(?:упр(?:ажнени[еяю]|ажн)?\\.?\\s*)?' + '\\d{1,2}\\s*\\*?\\s*(?:[\\s.(-]*[абвгabcd](?![а-яa-z]))?' + ')*';
  const pg = t.match(/(?<![а-яa-z])(?:стр(?:аниц[аеуы])?|с)\.?\s*(\d{1,3})(?!\d)/);
  const exm = t.match(new RegExp('(?:упр(?:ажнени[еяю]|ажн)?|№|номер|задани[еяю])\\.?\\s*(' + LIST + ')'));
  const ls = t.match(/урок\S*\s*(\d{1,2})/);
  // «17б и 19» → [{num:'17', part:'B'}, {num:'19', part:null}]
  const items = s => [...s.matchAll(new RegExp(NUM, 'g'))].map(m => ({ num: m[1], part: m[2] ? PART[m[2]] : null }));
  const res = (list, extra) => ({ ...list[0], items: list, ...extra });
  if (exm && pg) return res(items(exm[1]), { page: +pg[1] });
  if (exm && ls) return res(items(exm[1]), { lesson: +ls[1] });
  if (exm) return res(items(exm[1]), { noPage: true }); // «а теперь упр 19» — страницу возьмём из прошлого запроса
  const m = t.trim().match(new RegExp('^(\\d{1,3})[\\s,./:-]+(' + LIST + ')$'));
  if (m) return res(items(m[2]), { page: +m[1] });
  return null;
}
function lookupExercise(q) {
  const out = [];
  for (const l of loadedLessons()) {
    const L = book.lessons.get(l.id);
    for (const ex of L.exercises || []) {
      if (String(ex.number).replace('*', '') !== q.num.replace('*', '')) continue;
      const [a, b] = ex.pages || [ex.page, ex.page];
      if (q.page ? (q.page === ex.page || (q.page >= a && q.page <= (b ?? a))) : l.lesson === q.lesson) out.push({ lid: l.id, L, ex, m: l });
    }
  }
  return out;
}
function findExercise(spec) {
  const [lidS, ...rest] = String(spec).split(':'); const lid = +lidS; const num = decodeURIComponent(rest.join(':'));
  const L = book.lessons.get(lid); const ex = L && (L.exercises || []).find(x => String(x.number) === num && aiExercise(x));
  return ex ? { lid, L, ex, m: lessonMeta(lid) } : null;
}
// Запрос к ИИ: текст упражнения + словарь и грамматика урока (только из учебника)
// Части упражнения: строки, начинающиеся с «A.», «B.», «C.» (латиницей, как в данных учебника)
function exerciseParts(text) {
  const re = /^[ \t]*([A-DАБ])[.)]?[ \t]*(?=\n|$|[ \t])/gm, marks = [];
  let m; while ((m = re.exec(text))) marks.push({ k: ({ 'А': 'A', 'Б': 'B' })[m[1]] || m[1], i: m.index, end: re.lastIndex });
  if (new Set(marks.map(x => x.k)).size < 2) return null;
  const parts = {};
  marks.forEach((x, n) => { parts[x.k] = (parts[x.k] ? parts[x.k] + '\n' : '') + text.slice(x.end, marks[n + 1]?.i ?? text.length).trim(); });
  return { intro: text.slice(0, marks[0].i).trim(), parts };
}
function exerciseBlock({ L, ex, m }, part) {
  const pg = ex.page ?? (ex.pages || []).join('–');
  const sp = ex.text && exerciseParts(ex.text);
  let body = ex.text, partNote = '';
  if (part && sp?.parts[part]) { body = `${sp.intro}\nЧасть ${part}:\n${sp.parts[part]}`; partNote = `(Студент просит только часть ${part}, ниже дан только её текст.)\n`; }
  else if (part && sp) partNote = `(Студент просит часть ${part}, но в упражнении есть только части ${Object.keys(sp.parts).join(', ')}. Скажи об этом и выполни упражнение целиком.)\n`;
  else if (part) partNote = `(Студент просит часть ${part}, но в этом упражнении нет частей. Скажи об этом коротко и выполни упражнение целиком.)\n`;
  const extra = ex.text ? '' : Object.entries(ex).filter(([k]) => !['number', 'instruction_ru', 'page', 'pages', 'kind'].includes(k))
    .map(([k, v]) => Array.isArray(v) ? v.map((x, i) => `${i + 1}) ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n') : (typeof v === 'string' ? v : JSON.stringify(v))).join('\n');
  // если задание ссылается на другое упражнение («слова из упражнения 2») — добавим и его текст
  const refN = (ex.instruction_ru || '').match(/упр(?:ажнени[ея]|\.)\s*(\d+)/i)?.[1];
  const refEx = refN && (L.exercises || []).find(x => String(x.number) === refN && x !== ex);
  const refTxt = refEx ? `\nУпражнение ${refN} (на него ссылается задание): ${refEx.text || (refEx.instruction_ru || '') + '\n' + (refEx.items || []).map((x, i) => `${i + 1}) ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n')}` : '';
  return `=== Упражнение ${ex.number}${part ? ', часть ' + part : ''} (Unidad ${m.unit}, урок ${m.lesson}${pg ? `, с. ${pg}` : ''}) ===\n${partNote}${ex.text ? body : (ex.instruction_ru || '') + (extra ? '\n' + extra : '')}${refTxt}`;
}
// sel: [{f, part}] — одно или несколько упражнений в одном запросе
function exercisePrompt(sel, wish) {
  const lessons = [...new Map(sel.map(x => [x.f.m.id, x.f])).values()];
  const gram = lessons.flatMap(f => f.L.grammar || []).map(g => `${g.id} ${g.title}${g.points?.length ? ': ' + g.points.join(' ') : ''}`).join('\n').slice(0, 2500);
  const vocab = lessons.flatMap(f => (book.byLesson.get(f.m.id) || []).filter(hasRu)).slice(0, 80).map(i => `${i.es} — ${i.ru}`).join('; ');
  const many = sel.length > 1;
  return `Помоги выполнить ${many ? 'упражнения' : 'упражнение'} из учебника «Español Actual. Начальный курс». Ниже полный текст${many ? ' каждого упражнения' : ''} из учебника.

${sel.map(x => exerciseBlock(x.f, x.part)).join('\n\n')}

${wish ? `Просьба студента: «${wish}». Учти её (например, если просят только ответы — дай только ответы без объяснений).\n` : ''}${many ? 'Ответь по каждому упражнению отдельно, с заголовком «Упражнение N». ' : ''}Дай ответы по пунктам, с номерами, и к каждому одно короткое объяснение по-русски (какое правило работает), без длинных вступлений. Используй слова и грамматику урока (ниже). Если для упражнения нужен текст, картинка или диалог из учебника, которых здесь нет, так и скажи и сделай то, что возможно.

Грамматика урока:
${gram}

Словарь урока: ${vocab}`;
}

// Мини-Markdown для ответов ИИ: заголовки, жирный/курсив, списки, таблицы, код. Сначала экранируем — HTML из ответа не выполняется.
function md(src) {
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  const lines = String(src).replace(/\r/g, '').split('\n');
  let out = '', i = 0;
  const isRow = l => /^\s*\|.*\|\s*$/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { let code = []; i++; while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]); i++; out += `<pre>${esc(code.join('\n'))}</pre>`; continue; }
    if (isRow(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]));
      out += `<div class="md-table"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { out += `<h4>${inline(m[2])}</h4>`; i++; continue; }
    if (/^\s*([-*•])\s+/.test(l)) { out += '<ul>'; while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*[-*•]\s+/, ''))}</li>`; out += '</ul>'; continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { const start = +l.match(/\d+/)[0]; out += `<ol start="${start}">`; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))}</li>`; out += '</ol>'; continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { out += '<hr>'; i++; continue; }
    if (!l.trim()) { i++; continue; }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\s*[-*•]\s|\s*\d+[.)]\s)/.test(lines[i]) && !isRow(lines[i])) para.push(inline(lines[i++]));
    out += `<p>${para.join('<br>')}</p>`;
  }
  return out;
}

const ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const ICON_HIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>';
function showHistory() {
  const ago = t => { const d = (Date.now() - t) / 864e5; return d < 1 ? new Date(t).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : d < 2 ? 'вчера' : new Date(t).toLocaleDateString('ru', { day: 'numeric', month: 'short' }); };
  const el = document.createElement('div'); el.className = 'sheet-wrap';
  const render = () => {
    el.innerHTML = `<div class="sheet"><div class="row"><b style="font-size:17px">История чатов</b><button class="icon-btn" data-close>✕</button></div>
      <button class="btn" data-new style="margin:10px 0">＋ Новый чат</button>
      <div class="hist-list">${chats.length ? chats.map(c => `<div class="hist-item ${c.id === chatCur ? 'on' : ''}"><button class="hist-open" data-open="${c.id}"><span>${esc(chatTitle(c))}</span><small>${ago(c.t)} · ${c.msgs.length} сообщ.</small></button><button class="icon-btn" data-del="${c.id}" aria-label="Удалить">🗑</button></div>`).join('') : '<div class="empty-note">Пока нет сохранённых чатов</div>'}</div></div>`;
  };
  render(); document.body.appendChild(el);
  const close = () => el.remove();
  el.onclick = e => {
    if (e.target === el) return close();
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if ('close' in d) close();
    else if ('new' in d) { openChat(); close(); route(); }
    else if (d.open) { openChat(d.open); close(); route(); }
    else if (d.del) { chats = chats.filter(c => c.id !== d.del); if (d.del === chatCur) openChat(); writeChats(); render(); route(); }
  };
}
const ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15V8a2 2 0 0 0-2-2h-3l-2-3h-4L8 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9"/><circle cx="12" cy="12" r="3.5"/><path d="M19 17v6M16 20h6"/></svg>';
const ICON_NEW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

const TYPING = `<div class="msg ai" id="wait"><div class="ai-ava">ES</div><div class="typing"><i></i><i></i><i></i></div></div>`;
function msgHtml(m, k) {
  if (m.role === 'user') return `<div class="msg me"><div class="me-col">${m.thumb ? `<img class="msg-img" src="${m.thumb}" alt="фото">` : ''}${m.show || m.text ? `<div class="bubble me">${esc(m.show || m.text)}</div>` : ''}</div></div>`;
  return `<div class="msg ai${m.err ? ' err' : ''}"><div class="ai-ava">ES</div><div class="ai-body"><div class="md">${m.err ? esc(m.text) : md(m.text)}</div>
    ${m.err || m.local ? '' : `<div class="msg-acts"><button class="icon-btn" data-copy="${k}" aria-label="Копировать">${ICON_COPY}<span>Копировать</span></button></div>`}</div></div>`;
}

function chatSuggestions() {
  const lid = state.last?.lesson; const L = lid && book.lessons.get(lid);
  const ex = (L?.exercises || []).find(aiExercise) || [...book.lessons.values()].flatMap(x => x.exercises || []).find(aiExercise);
  const g = L?.grammar?.[0];
  const out = [];
  if (ex) { const pg = ex.page ?? ex.pages?.[0]; out.push({ t: `стр. ${pg} упр. ${ex.number}`, d: 'Ответы на упражнение из учебника' }); }
  out.push({ t: 'Переведи на испанский: Я учусь в университете', d: 'Перевод с объяснением' });
  if (g) out.push({ t: `Объясни ${g.id} «${g.title}» простыми словами`, d: 'Грамматика текущего урока' });
  out.push({ t: 'Проспрягай глагол ser в Presente', d: 'Спряжение' });
  out.push({ t: 'Как сказать «Приятно познакомиться»?', d: 'Фразы' });
  return out.slice(0, 4);
}

on(/^\/ai(?:\?(q|ex|new)=?(.*))?$/, (kind, val) => {
  if (kind === 'new') { if (chatLog.length && !chatPending) openChat(); kind = null; history.replaceState(null, '', location.pathname + '#/ai'); }
  setTitle('Помощник');
  view.classList.add('chatmode');
  cleanup = () => { view.classList.remove('chatmode'); if (!/^#\/ai/.test(location.hash) && chatLog.length && !chatPending) openChat(); };
  const pre = kind === 'q' && val ? decodeURIComponent(val) : '';
  const exSel = kind === 'ex' ? findExercise(val) : null;
  if (kind) history.replaceState(null, '', location.pathname + '#/ai');
  const hasKey = aiHasKey();
  const emptyHtml = () => `<div class="chat-empty"><div class="chat-logo">ES</div><h2>Чем помочь?</h2>
      <div class="mut">Спросите про перевод или грамматику. Для ответов на упражнение напишите страницу и номер: <b>стр. 45 упр. 3</b> или <b>45 3</b>.</div>
      <div class="sugg-grid">${chatSuggestions().map(s => `<button class="sugg" data-sugg="${esc(s.t)}"><b>${esc(s.t)}</b><span>${esc(s.d)}</span></button>`).join('')}</div></div>`;
  view.innerHTML = `
    <div class="chat-scroll" id="chatScroll"><div class="chat" id="chat">${chatLog.length ? chatLog.map(msgHtml).join('') : emptyHtml()}${chatPending ? TYPING : ''}</div></div>
    <div class="composer">
      ${hasKey ? '' : `<div class="mut small" style="padding:0 4px 6px">Нет ключа ИИ: вопрос откроется в приложении Gemini. <a href="#/profile">Добавить ключ</a></div>`}
      <div class="attach-prev" id="attPrev" hidden></div>
      <div class="composer-box">
        ${providerInfo().vision ? `<label class="attach-btn" aria-label="Прикрепить фото">${ICON_CAM}<input type="file" id="attach" accept="image/*" hidden></label>` : ''}
        <textarea id="q" rows="1" placeholder="Спросите что-нибудь…" enterkeyhint="send">${esc(pre)}</textarea>
        <button class="send-btn" id="send" aria-label="Отправить" disabled>${ICON_SEND}</button>
      </div>
      <div class="composer-foot"><button class="icon-btn" id="histBtn">${ICON_HIST}<span>История${chats.length ? ' (' + chats.length + ')' : ''}</span></button><span class="mut small grow" style="text-align:center">ИИ может ошибаться</span>${chatLog.length ? `<button class="icon-btn" id="newChat">${ICON_NEW}<span>Новый чат</span></button>` : ''}</div>
    </div>`;
  const ta = $('#q'), send = $('#send'), box = $('#chat'), scroller = $('#chatScroll');
  const toBottom = (smooth) => scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  let att = null; // прикреплённое фото {b64, mime, thumb}
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; send.disabled = (!ta.value.trim() && !att) || busy; };
  const showAtt = () => { const pv = $('#attPrev'); pv.hidden = !att; pv.innerHTML = att ? `<img src="${att.thumb}" alt=""><span class="mut small">Фото прикреплено</span><button class="icon-btn" id="attDel" aria-label="Убрать фото">✕</button>` : ''; if (att) $('#attDel').onclick = () => { att = null; showAtt(); grow(); }; };
  const attIn = $('#attach');
  if (attIn) attIn.onchange = async () => {
    const f = attIn.files[0]; attIn.value = ''; if (!f) return;
    try { const big = await shrink(f, 1400), small = await shrink(f, 220); att = { b64: big.b64, mime: big.mime, thumb: `data:${small.mime};base64,${small.b64}` }; showAtt(); grow(); ta.focus(); }
    catch { toast('Не удалось открыть фото'); }
  };
  let busy = chatPending;
  ta.addEventListener('input', grow); grow(); toBottom();
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); send.click(); } });
  const bindMsgs = () => {
    box.querySelectorAll('[data-sugg]').forEach(b => b.onclick = () => { ta.value = b.dataset.sugg; grow(); send.click(); });
    box.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
      try { await navigator.clipboard.writeText(chatLog[+b.dataset.copy].text); toast('Ответ скопирован'); } catch { toast('Не удалось скопировать'); }
    });
  };
  bindMsgs();
  const nc = $('#newChat'); if (nc) nc.onclick = () => { if (busy) return; openChat(); route(); };
  $('#histBtn').onclick = () => showHistory();
  const ensureStarted = () => { if (box.querySelector('.chat-empty')) box.innerHTML = ''; };
  const push = m => { chatLog.push(m); saveChat(); ensureStarted(); box.insertAdjacentHTML('beforeend', msgHtml(m, chatLog.length - 1)); bindMsgs(); };
  function localReply(q, a) { push({ role: 'user', text: q }); push({ role: 'model', text: a, local: true }); toBottom(true); }
  async function sendText(text, show, image) {
    if (!hasKey) { const r = await askGeminiApp(text + (aiContext() ? '\n(' + aiContext() + ')' : '')); if (r === 'copied') toast('Запрос скопирован — вставьте его в Gemini', 4000); return; }
    push({ role: 'user', text, show, ...(image ? { thumb: image.thumb } : {}) });
    box.insertAdjacentHTML('beforeend', TYPING);
    toBottom(true); busy = true; chatPending = true; grow();
    try {
      // длинные запросы-упражнения из прошлого заменяем короткой подписью, чтобы запрос не разрастался
      // экономия: в истории только 8 последних сообщений, старые ответы ИИ обрезаны до 600 символов
      const hist = chatLog.filter(m => !m.err && !m.local).slice(-8).map((m, i, a) => i === a.length - 1 ? m : m.thumb ? { ...m, text: (m.show || 'Вопрос') + ' [к сообщению было приложено фото]' } : m.show ? { ...m, text: m.show } : m.role !== 'user' && m.text.length > 600 ? { ...m, text: m.text.slice(0, 600) + '…' } : m);
      const ans = await chat(hist, aiContext(), image);
      chatPending = false; $('#wait')?.remove(); push({ role: 'model', text: ans });
    } catch (e) {
      chatPending = false; $('#wait')?.remove(); push({ role: 'model', text: e.message, err: true });
    }
    // если экран успели перерисовать (или ушли на другую вкладку) — не трогаем старые элементы
    if (!box.isConnected) { if (/^#\/ai/.test(location.hash)) route(); return; }
    busy = false; grow();
    const last = box.lastElementChild; scroller.scrollTo({ top: last.offsetTop - 8, behavior: 'smooth' });
    if (!$('#newChat')) { $('.composer-foot').insertAdjacentHTML('beforeend', `<button class="icon-btn" id="newChat">${ICON_NEW}<span>Новый чат</span></button>`); $('#newChat').onclick = () => { openChat(); route(); }; }
  }
  const shortIns = ex => { const ins = ex.instruction_ru || ''; return ins.length > 60 ? ins.slice(0, 58).replace(/\s+\S*$/, '') + '…' : ins; };
  function sendExercises(sel, label, notes = []) {
    const lines = sel.map(({ f, part }) => `📘 Урок ${f.m.lesson}, упр. ${f.ex.number}${part ? ', часть ' + part : ''}: ${shortIns(f.ex)}`);
    return sendText(exercisePrompt(sel, label), `${label}\n${lines.join('\n')}${notes.length ? '\n⚠️ ' + notes.join('\n⚠️ ') : ''}`);
  }
  const sendExercise = (f, label, part) => sendExercises([{ f, part }], label);
  send.onclick = () => {
    const text = ta.value.trim(); if ((!text && !att) || busy) return; ta.value = '';
    if (att) {
      const img = att; att = null; showAtt(); grow();
      return sendText(text || 'Что на фото? Если это упражнение из учебника — выполни его: ответы по пунктам с короткими объяснениями.', text || '📷 Что на фото?', img);
    }
    grow();
    const q = parseExerciseQuery(text);
    if (q?.noPage) { if (lastExQ) Object.assign(q, lastExQ); else return localReply(text, 'Напишите ещё и страницу, например: «стр. 48 упр. 19».'); }
    if (q) {
      lastExQ = q.page ? { page: q.page } : { lesson: q.lesson };
      const where = q.page ? `на странице ${q.page}` : `в уроке ${q.lesson}`;
      const sel = [], notes = [];
      for (const it of q.items) {
        const found = lookupExercise({ ...q, ...it });
        const ok = found.filter(f => aiExercise(f.ex));
        if (!found.length) notes.push(`Упражнения ${it.num} ${where} не нашёл. Проверьте номер страницы и упражнения (страница — как в учебнике).`);
        else if (!ok.length) notes.push(`Упражнение ${it.num} ${where} разговорное (рассказ о себе, диалог или чтение вслух), у него нет одного правильного ответа, поэтому ответы на него не даю. Задание: ${found[0].ex.instruction_ru || ''}`);
        else if (!sel.some(x => x.f.ex === ok[0].ex && x.part === it.part)) sel.push({ f: ok[0], part: it.part });
      }
      if (!sel.length) return localReply(text, notes.join('\n\n'));
      return sendExercises(sel, text, notes);
    }
    sendText(text);
  };
  if (exSel) sendExercise(exSel, `Ответы: урок ${exSel.m.lesson}, упр. ${exSel.ex.number}`);
  else if (pre && hasKey) setTimeout(() => send.click(), 100);
});

// ---------- Профиль ----------
on(/^\/profile$/, () => {
  setTitle('Профиль', true);
  const cid = clientId();
  const vs = esVoices();
  const last = settings.lastSync ? new Date(settings.lastSync).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  view.innerHTML = `
    ${cloud.configured() ? `<div class="c stack">
      <b>Аккаунт и сохранение прогресса</b>
      ${settings.signedIn ? `<div class="row start">${settings.picture ? `<img src="${esc(settings.picture)}" referrerpolicy="no-referrer" style="width:36px;height:36px;border-radius:50%">` : ''}<div><div>${esc(settings.name || '')}</div><div class="mut small">${esc(settings.email || '')}</div></div></div>
          <div class="mut small">${last ? 'Последняя синхронизация: ' + last : ''}</div>
          <div class="btns"><button class="btn ghost" id="cSync">Синхронизировать</button><button class="btn line" id="cOut">Выйти</button></div>`
        : `<div class="mut small">Войдите, чтобы прогресс и свои слова сохранялись в аккаунте и были доступны на любом устройстве. Без входа всё хранится только на этом телефоне.</div>
          <button class="btn" id="cGoogle">Войти через Google</button>
          <div class="mut small" style="text-align:center">или по почте</div>
          <input class="inp" id="cEmail" type="email" inputmode="email" autocomplete="email" placeholder="почта@example.com" value="${esc(settings.pendingEmail || '')}">
          <div id="cCodeBox" ${settings.pendingEmail ? '' : 'hidden'} class="stack"><input class="inp" id="cCode" inputmode="numeric" autocomplete="one-time-code" placeholder="Код из письма"><button class="btn" id="cVerify">Войти</button></div>
          <button class="btn ghost" id="cSend">${settings.pendingEmail ? 'Отправить код ещё раз' : 'Получить код на почту'}</button>`}
    </div>` : `    <div class="c stack">
      <b>Google-аккаунт и синхронизация</b>
      ${settings.signedIn ? `<div class="row start">${settings.picture ? `<img src="${esc(settings.picture)}" referrerpolicy="no-referrer" style="width:36px;height:36px;border-radius:50%">` : ''}<div><div>${esc(settings.name || '')}</div><div class="mut small">${esc(settings.email || '')}</div></div></div>
          <div class="mut small" id="syncInfo">${last ? 'Последняя синхронизация: ' + last : ''}</div>
          <div class="btns"><button class="btn ghost" id="syncBtn">Синхронизировать</button><button class="btn line" id="outBtn">Выйти</button></div>`
        : `<div class="mut small">Прогресс и свои слова сохраняются в скрытой папке приложения на вашем Google Диске. Без входа всё хранится только на этом телефоне.</div>
          ${cid ? `<button class="btn" id="inBtn">Войти через Google</button>` : `<div class="mut small">Вход ещё не настроен: нужен OAuth Client ID.</div>`}`}
      ${!window.ESPANOLA_CONFIG?.googleClientId ? `<details><summary class="mut small">OAuth Client ID${cid ? ' (задан)' : ''}</summary>
          <div class="stack" style="margin-top:8px"><input class="inp" id="cid" value="${esc(settings.clientId)}" placeholder="…apps.googleusercontent.com"><button class="btn ghost sm" id="cidSave">Сохранить</button>
          <a class="small" href="#/setup">Как получить Client ID ›</a></div></details>` : ''}
    </div>
`}
    ${onlyShared() ? `<div class="c stack"><b>ИИ-помощник</b><div class="mut small">ИИ-помощник (Gemini) работает у всех сразу, ключ не нужен. Задавайте вопросы во вкладке «Помощник» или нажимайте «🤖 Ответы» у упражнений.</div></div>` : `<div class="c stack">
      <b>ИИ-помощник</b>
      <div class="field"><label>Сервис</label><select class="inp" id="aiProv">${providerList().map(([k, P]) => `<option value="${k}" ${k === provider() ? 'selected' : ''}>${esc(P.name)} · ${P.free ? 'бесплатно' : 'платно'}${aiKeys.get(k) ? ' ✓' : ''}</option>`).join('')}</select></div>
      ${providerInfo().noKey ? `<div class="mut small">${esc(providerInfo().note)} Фото распознаёт Gemini Flash.</div>` : `
      <div class="mut small">${esc(providerInfo().note)}${providerInfo().vision ? '' : ' <b>Фото не читает.</b>'}<br>Где взять ключ: <a href="${providerInfo().keyUrl}" target="_blank" rel="noopener">${esc(providerInfo().keyHint)}</a>. Ключ хранится только на этом устройстве и не синхронизируется.</div>
      <input class="inp" id="gkey" type="password" autocomplete="off" value="${esc(aiKeys.get(provider()))}" placeholder="${esc(providerInfo().keyPrefix || 'API-ключ')}">
      <div class="btns"><button class="btn ghost" id="gSave">Сохранить ключ</button>${aiKeys.get(provider()) ? `<button class="btn line" id="gDel">Удалить</button>` : ''}</div>
      <details><summary class="mut small">Модель</summary><input class="inp" id="gmodel" value="${esc((settings.models || {})[provider()] || '')}" placeholder="${esc(providerInfo().model)}" style="margin-top:8px"></details>
      `}
      ${providerInfo().noKey ? "" : `<div class="mut small">Без ключа в Помощнике работает кнопка «Спросить Gemini».</div>`}
    </div>`}
    <div class="c stack">
      <b>Стиль</b>
      <div class="styles">
        <button data-style="a" class="${settings.style === 'a' ? 'on' : ''}"><span class="sw" style="background:#d6372b"></span>Сиеста</button>
        <button data-style="b" class="${settings.style === 'b' ? 'on' : ''}"><span class="sw" style="background:#2f5bd3"></span>Тетрадь</button>
        <button data-style="c" class="${settings.style === 'c' ? 'on' : ''}"><span class="sw" style="background:#121212;border:2px solid #8ab4f8"></span>Тёмная</button>
        <button data-style="d" class="${settings.style === 'd' ? 'on' : ''}"><span class="sw" style="background:#0d0d0d;border:2px solid #ffd000"></span>Чёрно-жёлтая</button>
        <button data-style="e" class="${settings.style === 'e' ? 'on' : ''}"><span class="sw" style="background:#0d0d0d;border:2px solid #e53935"></span>Чёрно-красная</button>
      </div>
    </div>
    <div class="c stack">
      <b>Озвучка</b>
      ${vs.length ? `<select class="inp" id="voice"><option value="">Автоматически</option>${vs.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === settings.voice ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>` : `<div class="mut small">Испанский голос не найден. В Android: Настройки → Специальные возможности → Синтез речи → установить испанский язык.</div>`}
      <div class="field"><label>Скорость: <span id="rv">${settings.rate}</span></label><input type="range" id="rate" min="0.5" max="1.3" step="0.1" value="${settings.rate}"></div>
      <button class="btn ghost" data-act="say" data-text="Hola, ¿qué tal? Me llamo Ana.">🔊 Проверить</button>
    </div>
    ${installBlock()}
    <div class="c stack">
      <b>Данные</b>
      <div class="btns"><button class="btn ghost" id="exp">Скачать копию</button><label class="btn ghost" style="cursor:pointer">Загрузить копию<input type="file" id="imp" accept="application/json,.json" hidden></label></div>
      <button class="btn line" id="reset" style="color:var(--bad)">Сбросить прогресс на этом устройстве</button>
    </div>
    <p class="mut small" style="text-align:center">espanol.uchit ${VERSION} · по учебнику «Español Actual. Начальный курс» (Гринина Е.А., Микаэлян Ю.И.).</p>`;
  const b = id => $('#' + id);
  if (b('cGoogle')) b('cGoogle').onclick = () => cloud.signInGoogle();
  if (b('cSend')) b('cSend').onclick = async () => {
    const em = b('cEmail').value.trim(); if (!/.+@.+\..+/.test(em)) return toast('Введите почту');
    b('cSend').disabled = true;
    try { await cloud.sendCode(em); settings.pendingEmail = em; saveSettings(); toast('Код отправлен на ' + em + '. Проверьте и папку «Спам»', 5000); route(); }
    catch (e) { toast(e.message, 5000); b('cSend').disabled = false; }
  };
  if (b('cVerify')) b('cVerify').onclick = async () => {
    try { await cloud.verifyCode(b('cEmail').value || settings.pendingEmail, b('cCode').value); delete settings.pendingEmail; saveSettings(); toast('Вход выполнен, прогресс сохранён'); renderAva(); route(); }
    catch (e) { toast(e.message, 5000); }
  };
  if (b('cSync')) b('cSync').onclick = async () => { await cloud.syncNow(); route(); };
  if (b('cOut')) b('cOut').onclick = () => { cloud.signOut(); renderAva(); route(); toast('Вы вышли. Прогресс остался на телефоне и в аккаунте'); };
  if (b('inBtn')) b('inBtn').onclick = async () => { try { await signIn(); toast('Вход выполнен, прогресс синхронизирован'); renderAva(); route(); } catch (e) { toast(e.message, 4000); } };
  if (b('syncBtn')) b('syncBtn').onclick = async () => { try { if (!hasToken()) await signIn(''); else await syncNow(); route(); } catch (e) { toast(e.message, 4000); } };
  if (b('outBtn')) b('outBtn').onclick = () => { signOut(); renderAva(); route(); toast('Вы вышли. Прогресс остался на телефоне и на Диске'); };
  if (b('cidSave')) b('cidSave').onclick = () => { settings.clientId = b('cid').value.trim(); saveSettings(); route(); toast('Сохранено'); };
  if (b('aiProv')) b('aiProv').onchange = e => { settings.aiProvider = e.target.value; settings.aiChosen = true; saveSettings(); route(); };
  if (b('gSave')) b('gSave').onclick = () => { const p = provider(); const v = b('gkey').value.trim(); aiKeys.set(p, v); settings.models = { ...(settings.models || {}), [p]: b('gmodel').value.trim() }; saveSettings(); toast(v ? 'Ключ сохранён на этом устройстве' : 'Ключ удалён'); route(); };
  if (b('gDel')) b('gDel').onclick = () => { aiKeys.set(provider(), ''); route(); };
  view.querySelectorAll('[data-style]').forEach(x => x.onclick = () => { settings.style = x.dataset.style; saveSettings(); applyStyle(); route(); });
  if (b('voice')) b('voice').onchange = e => { settings.voice = e.target.value; saveSettings(); };
  b('rate').oninput = e => { settings.rate = +e.target.value; b('rv').textContent = settings.rate; saveSettings(); };
  b('exp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' }));
    a.download = `espanola-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  b('imp').onchange = async e => {
    try { const s = JSON.parse(await e.target.files[0].text()); replaceState(merge(state, s)); refreshMyItems(); toast('Копия загружена и объединена'); scheduleSync(); route(); }
    catch { toast('Не удалось прочитать файл'); }
  };
  b('reset').onclick = () => {
    if (b('reset').dataset.sure) { replaceState({}); refreshMyItems(); toast('Прогресс сброшен'); route(); }
    else { b('reset').dataset.sure = 1; b('reset').textContent = 'Нажмите ещё раз для подтверждения'; }
  };
});

on(/^\/credits$/, () => {
  setTitle('Источники картинок', true);
  const rows = Object.entries(book.images);
  view.innerHTML = rows.length ? `<div class="c">${rows.map(([es, im]) => `<div class="word-row"><img class="thumb" src="textbook/${esc(im.file)}" alt=""><div class="grow"><div class="es">${esc(es)}</div><div class="credit">${esc(im.author || '')} · ${esc(im.license || '')}${im.source ? ` · <a href="${esc(im.source)}" target="_blank" rel="noopener">источник</a>` : ''}</div></div></div>`).join('')}</div>`
    : `<div class="empty-note">Картинок пока нет.</div>`;
});

on(/^\/setup$/, () => {
  setTitle('Настройка входа Google', true);
  const origin = location.origin;
  view.innerHTML = `<div class="c stack small">
    <div>Это делается один раз владельцем приложения (≈10 минут). Одногруппникам ничего настраивать не нужно.</div>
    <ol class="steps">
      <li>Откройте <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a>, войдите и создайте проект, например «Espanola».</li>
      <li>Включите Google Drive API: <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">страница API</a> → «Включить».</li>
      <li>Откройте <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Google Auth Platform</a> → «Начать». Название: Еспаньола, почта поддержки — ваша, аудитория — <b>Внешняя (External)</b>, контактная почта — ваша → «Создать».</li>
      <li>Раздел «Доступ к данным» (Data access) → «Добавить области» → найдите <code>.../auth/drive.appdata</code> → отметьте → «Обновить» → «Сохранить».</li>
      <li>Раздел «Аудитория» (Audience) → «Опубликовать приложение» (Publish app), чтобы могли входить одногруппники. Или оставьте режим тестирования и добавьте их почты в «Тестовые пользователи».</li>
      <li>Раздел «Клиенты» (Clients) → «Создать клиента» → тип <b>Веб-приложение</b>. В «Разрешённые источники JavaScript» добавьте <code>${esc(origin)}</code> → «Создать».</li>
      <li>Скопируйте <b>Client ID</b> (оканчивается на <code>.apps.googleusercontent.com</code>) и вставьте его в профиле или пришлите Claude, чтобы встроить в приложение для всех.</li>
    </ol>
    <div class="mut">Client ID не секретный. Приложение получает доступ только к своей скрытой папке на Диске, ваши файлы оно не видит.</div>
  </div>`;
});

// ---------- статус синхронизации ----------
onSyncStatus((s, msg) => {
  const d = $('#syncDot');
  d.className = 'sync-dot ' + ({ on: 'on', busy: 'busy', err: 'err', need: 'err' }[s] || '');
  d.title = msg || { on: 'Синхронизировано', busy: 'Синхронизация…', offline: 'Нет сети', need: 'Нужно войти заново' }[s] || '';
});
$('#syncDot').onclick = () => { if (settings.signedIn) location.hash = '#/profile'; };
window.addEventListener('espanola:synced', () => { refreshMyItems(); renderAva(); if (!/test|cards|ai|photo|add|list/.test(location.hash)) route(); });
onChange(scheduleSync);

// ---------- запуск ----------
async function start() {
  applyStyle(); renderAva();
  view.innerHTML = '<div class="empty-note">Загрузка…</div>';
  if (cloud.configured()) {
    try { if (await cloud.consumeRedirect()) toast('Вход выполнен'); } catch (e) { toast('Вход не удался: ' + e.message, 5000); }
    renderAva();
  }
  try { await loadBook(); }
  catch (e) { view.innerHTML = `<div class="empty-note">Не удалось загрузить учебник: ${esc(e.message)}<br>Проверьте интернет и обновите страницу.</div>`; return; }
  route();
  initSync();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data !== 'updated') return;
      // новая версия: сразу перезагружаемся, если человек не посреди теста или ответа ИИ
      if (/test|cards|train/.test(location.hash) || chatPending) toast('Приложение обновлено — перезапустите его');
      else location.reload();
    });
  }
}
start();
