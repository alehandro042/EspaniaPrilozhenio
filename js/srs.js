// Интервальное повторение (упрощённый SM-2). Ошибки возвращают слово в повторение быстро и чаще.
import { state, save, tickDay } from './store.js';
import { book, hasRu } from './data.js';

const DAY = 86400000;
const MIN = 60000;

export function card(id) { return state.cards[id]; }

export function ensureCard(id) {
  if (!state.cards[id]) state.cards[id] = { due: Date.now(), ivl: 0, ease: 2.5, reps: 0, lapses: 0, streak: 0, t: Date.now() };
  return state.cards[id];
}

// grade: 0 = не помню, 1 = трудно, 2 = знаю
export function grade(id, g) {
  const c = ensureCard(id); const now = Date.now();
  if (g === 0) {
    c.lapses++; c.streak = 0; c.ease = Math.max(1.3, c.ease - 0.2); c.ivl = 0;
    c.due = now + 2 * MIN;
  } else if (g === 1) {
    c.streak++; c.ease = Math.max(1.3, c.ease - 0.15);
    c.ivl = c.ivl < 1 ? 0.5 : Math.max(1, c.ivl * 1.2);
    c.due = now + c.ivl * DAY;
  } else {
    c.streak++;
    c.ivl = c.ivl < 1 ? (c.reps === 0 ? 1 : 2) : Math.round(c.ivl * c.ease * 10) / 10;
    // слова с частыми ошибками повторяем чаще
    if (c.lapses > 2) c.ivl = Math.max(1, c.ivl * 0.7);
    c.due = now + c.ivl * DAY;
  }
  c.reps++; c.t = now;
  tickDay();
  save();
}

// Результат теста тоже двигает карточку
export function answer(id, correct, almost) { grade(id, correct ? (almost ? 1 : 2) : 0); }

export const isLearned = c => !!c && (c.ivl >= 2 || c.streak >= 3);

export function testable(lid) { return (book.byLesson.get(lid) || []).filter(hasRu); }

export function lessonProgress(lid) {
  const items = testable(lid);
  if (!items.length) return 0;
  const n = items.filter(it => isLearned(state.cards[it.id])).length;
  return Math.round(100 * n / items.length);
}

export function dueCards(lessonIds) {
  const now = Date.now(); const out = [];
  for (const [id, c] of Object.entries(state.cards)) {
    if (c.due > now) continue;
    const it = book.items.get(id); if (!it || !hasRu(it)) continue;
    if (lessonIds && !lessonIds.includes(it.lessonId)) continue;
    out.push(it);
  }
  // сначала слова с ошибками, потом самые просроченные
  out.sort((a, b) => (state.cards[b.id].lapses - state.cards[a.id].lapses) || (state.cards[a.id].due - state.cards[b.id].due));
  return out;
}

export function addToCards(ids) {
  let n = 0;
  for (const id of ids) if (!state.cards[id]) { ensureCard(id); n++; }
  if (n) save();
  return n;
}

export function mistakes() {
  return Object.entries(state.cards).filter(([, c]) => c.lapses > 0 && !isLearned(c)).map(([id]) => book.items.get(id)).filter(Boolean);
}
