// Демо-бэкенд: всё хранится в localStorage этого браузера.
// Нужен, чтобы приложение открывалось и тестировалось без Firebase.
import { TEAM } from '../../config';
import { ymd, addDays, computeRemindAt } from '../dates';

const KEY = 'apex-hub-demo-v1';
const AUTH_KEY = 'apex-hub-demo-auth';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function safeGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* приватный режим */ }
}

function seed() {
  const now = new Date();
  const d = (n) => ymd(addDays(now, n));
  const iso = () => new Date().toISOString();
  const [S, K, A] = TEAM.map((t) => 'u-' + t.key);
  const users = TEAM.map((t) => ({
    id: 'u-' + t.key, name: t.name, email: t.email, color: t.color, role: 'admin',
    digestEnabled: true, digestTime: '08:30', defaultReminder: 60, createdAt: iso(),
  }));

  const t = (o) => ({
    id: uid(), notes: '', status: 'todo', priority: 'med', area: 'admin', assignees: [],
    dueDate: null, dueTime: null, remind: null, remindAt: null, checklist: [],
    createdBy: S, createdAt: iso(), updatedAt: iso(), order: Math.random(), ...o,
  });
  const tasks = [
    t({ title: 'Вписать ссылку на Telegram-канал в договор оферты', area: 'admin', priority: 'high', assignees: [S], dueDate: d(0), dueTime: '18:00', remind: 60,
      notes: 'Без ссылки не работает п. 3.4 об одностороннем изменении условий. Заодно заполнить раздел 16.' }),
    t({ title: 'Отправить юристу разделы 5 и 10 договора', area: 'admin', priority: 'med', assignees: [A], dueDate: d(2), status: 'doing' }),
    t({ title: 'Собрать оплаты за ноябрь', area: 'finance', priority: 'high', assignees: [A, S], dueDate: d(1), dueTime: '20:00', remind: 180,
      checklist: [{ id: 'c1', text: 'Напомнить в общем чате', done: true }, { id: 'c2', text: 'Отметить оплаты в приложении', done: false }, { id: 'c3', text: 'Пробить чеки в «Мой налог»', done: false }] }),
    t({ title: 'Решить, будет ли надбавка за просрочку оплаты', area: 'finance', priority: 'low', assignees: [S, K, A], dueDate: d(5) }),
    t({ title: 'Пост-анонс игры в субботу (шаблон «Матчевый день»)', area: 'marketing', priority: 'med', assignees: [K], dueDate: d(1), status: 'doing' }),
    t({ title: 'Обзвонить 5 школ ЮЗАО из реестра', area: 'schools', priority: 'med', assignees: [K], dueDate: d(3),
      checklist: [{ id: 'c1', text: 'Школа № 121', done: true }, { id: 'c2', text: 'Ещё 4 школы', done: false }] }),
    t({ title: 'План тренировки: неделя 10 — заслоны', area: 'training', priority: 'high', assignees: [A], dueDate: d(-1), dueTime: '21:00' }),
    t({ title: 'Продлить аренду зала в Академии Спартак на январь', area: 'admin', priority: 'high', assignees: [S], dueDate: d(9) }),
    t({ title: 'Заказать форму для лиги u14', area: 'league', priority: 'med', assignees: [S, K], dueDate: d(14), status: 'review' }),
    t({ title: 'Закрепить в чате правила оплаты', area: 'marketing', status: 'done', assignees: [K], dueDate: d(-3), doneAt: iso() }),
    t({ title: 'Взнос за лигу u16 — сверить должников', area: 'league', status: 'done', assignees: [A], dueDate: d(-2), doneAt: iso() }),
  ];
  tasks.forEach((x) => { x.remindAt = computeRemindAt(x.dueDate, x.dueTime, x.remind); });

  const events = [];
  const ev = (o) => events.push({ id: uid(), notes: '', location: 'Академия Спартак, Большая Тихоновская, 2', allDay: false, remind: 60, remindAt: null, createdBy: S, createdAt: iso(), ...o });
  for (let i = -10; i <= 24; i++) {
    const day = addDays(now, i);
    const dow = day.getDay();
    const date = ymd(day);
    // Тренировки Junior и взрослых приходят из постоянного расписания (lib/schedule.js).
    if (dow === 6 && i % 2 === 0) ev({ title: 'Игра лиги u14: APEX — Storm', type: 'game', group: 'Лига u14', date, start: '12:00', end: '13:30', location: 'Дворец спорта' });
  }
  ev({ title: 'Созвон команды: итоги месяца', type: 'meeting', date: d(2), start: '21:00', end: '21:45', location: 'Telegram' });
  ev({ title: 'Дедлайн оплат за месяц', type: 'deadline', date: d(4), allDay: true, start: null, end: null, location: '' });
  events.forEach((x) => { x.remindAt = computeRemindAt(x.date, x.start, x.remind); });

  const notes = [
    { id: 'n-price', icon: '💳', title: 'Прайс и расписание', pinned: true, parentId: null,
      content: '## Абонементы\n\n| Формат | Цена |\n|---|---|\n| 1 раз в неделю | 9 000 ₽ / мес |\n| 2 раза в неделю | 11 500 ₽ / мес |\n| 3 раза в неделю | 14 500 ₽ / мес |\n| Разовое занятие | 1 600 ₽ |\n| Пробное | 500 ₽ |\n\n## Расписание Junior\n\n- Пн 17:30 — игровой час\n- Вт 17:30–19:00\n- Чт 18:30–20:00\n\nЗал: Академия Спартак, Большая Тихоновская ул., 2.' },
    { id: 'n-pay', icon: '📌', title: 'Регламент оплаты', pinned: true, parentId: null,
      content: '1. Оплата переводом на счёт до 5 числа.\n2. Чек пробиваем в «Мой налог» в день оплаты.\n3. Оплату отмечаем в приложении: **Клуб → Оплаты → Внести оплату**. Запись сразу попадает в «Журнал оплат» таблицы.\n\n- [x] Шаблон напоминания в чат\n- [ ] Решение по надбавке за просрочку' },
    { id: 'n-msg', icon: '💬', title: 'Шаблоны сообщений', pinned: false, parentId: null,
      content: '### Напоминание об оплате\n\nДрузья, привет! Напоминаем, что оплата абонемента за месяц — до 5 числа. Если уже оплатили, спасибо 🙌\n\n### Отмена тренировки\n\nСегодняшняя тренировка отменяется. Занятие перенесём, детали напишем здесь.' },
    { id: 'n-season', icon: '🏔️', title: 'Сезон 2026/27', pinned: false, parentId: null,
      content: 'Цель сезона — **первое место**. Около 15 игр по выходным с октября по апрель.\n\nПорядок тем по неделям ведём в отдельной странице.' },
    { id: 'n-season-w', icon: '🗓️', title: 'Темы по неделям', pinned: false, parentId: 'n-season',
      content: '- Неделя 1 — дриблинг\n- Неделя 2 — финиш у кольца\n- Неделя 3 — передача под давлением\n- Неделя 4 — бросок\n- Неделя 5 — защита на мяче\n- Неделя 6 — подбор\n- Неделя 7 — переход' },
  ].map((n) => ({ ...n, createdAt: iso(), updatedAt: iso(), updatedBy: S }));

  return { users, tasks, events, notes, outbox: [], devices: [] };
}

export function createDemoBackend() {
  let db = safeGet(KEY);
  if (!db || !db.users) { db = seed(); safeSet(KEY, db); }
  const listeners = {};
  const authListeners = new Set();
  let session = safeGet(AUTH_KEY);

  const emit = (col) => {
    safeSet(KEY, db);
    (listeners[col] || []).forEach((cb) => cb([...(db[col] || [])]));
  };

  return {
    mode: 'demo',
    onAuth(cb) {
      authListeners.add(cb);
      setTimeout(() => cb(session), 0);
      return () => authListeners.delete(cb);
    },
    async signIn(email) {
      const u = db.users.find((x) => x.email === String(email).trim().toLowerCase());
      if (!u) throw new Error('Такой почты нет в команде. В демо подходит любая из трёх карточек.');
      session = { uid: u.id, email: u.email };
      safeSet(AUTH_KEY, session);
      authListeners.forEach((cb) => cb(session));
    },
    async signOut() {
      session = null;
      try { localStorage.removeItem(AUTH_KEY); } catch { /* */ }
      authListeners.forEach((cb) => cb(null));
    },
    async getIdToken() { return 'demo'; },
    listen(col, cb) {
      (listeners[col] ||= []).push(cb);
      setTimeout(() => cb([...(db[col] || [])]), 0);
      return () => { listeners[col] = listeners[col].filter((f) => f !== cb); };
    },
    async add(col, data) {
      const id = data.id || uid();
      (db[col] ||= []).push({ ...data, id });
      emit(col);
      return id;
    },
    async addMany(col, items) {
      const ids = items.map((it) => { const id = uid(); (db[col] ||= []).push({ ...it, id }); return id; });
      emit(col);
      return ids;
    },
    async set(col, id, data) {
      const list = (db[col] ||= []);
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) list[i] = { ...list[i], ...data, id }; else list.push({ ...data, id });
      emit(col);
    },
    async update(col, id, patch) {
      const list = db[col] || [];
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) { list[i] = { ...list[i], ...patch }; emit(col); }
    },
    async remove(col, id) {
      db[col] = (db[col] || []).filter((x) => x.id !== id);
      emit(col);
    },
    async removeMany(col, ids) {
      const set = new Set(ids);
      db[col] = (db[col] || []).filter((x) => !set.has(x.id));
      emit(col);
    },
    async enablePush() {
      if (!('Notification' in window)) return { ok: false, error: 'Этот браузер не умеет показывать уведомления.' };
      const p = await Notification.requestPermission();
      return p === 'granted'
        ? { ok: true, demo: true }
        : { ok: false, error: 'Разрешение на уведомления не выдано.' };
    },
    resetDemo() { db = seed(); ['users', 'tasks', 'events', 'notes'].forEach(emit); },
  };
}
