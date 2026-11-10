// Клиент к Google-таблице клуба через Apps Script (backend/apps-script/Code.gs).
// В демо-режиме отвечает выдуманными данными той же структуры.
import { APPS_SCRIPT_URL, DEMO } from '../config';
import { ymd, addDays, fmt } from './dates';

export const DEFAULT_LISTS = {
  payStatuses: ['Оплачен', 'Не оплачен', 'Возврат'],
  payMethods: ['Перевод', 'Наличные', 'По реквизитам'],
  abonements: ['Разовая', '1 раз/нед.', '2 раза/нед.', '3 раза/нед.', 'Безлимит'],
  leadStatuses: ['Новая', 'Связались', 'Пробная назначена', 'Пробная прошла', 'Клиент', 'Отказ'],
  sources: ['Рекомендация', 'Telegram', 'Instagram', 'Сайт', 'Реклама', 'Другое'],
  owners: ['Антон', 'Кузьма', 'Серафим'],
  groups: ['Junior', 'Взрослые'],
};

export const PRICES = { 'Разовая': 1600, '1 раз/нед.': 9000, '2 раза/нед.': 11500, '3 раза/нед.': 14500 };

/** «⚠ Через 0 дн.» из таблицы → «Истекает сегодня». */
export function reminderText(r) {
  const t = String(r || '').replace('⚠', '').trim();
  const m = t.match(/Через\s+(-?\d+)/);
  if (!m) return t;
  const n = Number(m[1]);
  if (n <= 0) return 'Истекает сегодня';
  if (n === 1) return 'Истекает завтра';
  return `Истекает через ${n} дн.`;
}

export const clubConfigured = () => DEMO || Boolean(APPS_SCRIPT_URL);

const CACHE = 'apex-club-cache:';
export function readCache(key) {
  try { return JSON.parse(localStorage.getItem(CACHE + key)); } catch { return null; }
}
function writeCache(key, data) {
  try { localStorage.setItem(CACHE + key, JSON.stringify({ at: Date.now(), data })); } catch { /* */ }
}

export async function clubCall(action, payload = {}, getIdToken) {
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 250));
    return demoClub(action, payload);
  }
  if (!APPS_SCRIPT_URL) throw new Error('Таблица не подключена: задайте VITE_APPS_SCRIPT_URL.');
  const idToken = await getIdToken();
  let res;
  try {
    res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      // text/plain — чтобы браузер не делал preflight-запрос, который Apps Script не поддерживает
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, idToken, ...payload }),
    });
  } catch {
    throw new Error('Нет связи с таблицей. Проверьте интернет.');
  }
  const json = await res.json().catch(() => null);
  if (!json) throw new Error('Таблица ответила непонятно. Проверьте, что Apps Script опубликован как веб-приложение с доступом «Все».');
  if (!json.ok) throw new Error(json.error || 'Ошибка таблицы');
  if (['summary', 'players', 'leads', 'payRecent'].includes(action)) writeCache(action, json.data);
  return json.data;
}

/* ───────────────────────── демо-данные ───────────────────────── */

const DEMO_KEY = 'apex-demo-club-v2';
function demoDb() {
  try {
    const s = JSON.parse(localStorage.getItem(DEMO_KEY));
    if (s && s.players) return s;
  } catch { /* */ }
  const names = [
    ['Артём Белов', 'Junior'], ['Глеб Воронин', 'Junior'], ['Даниил Громов', 'Junior'], ['Егор Журавлёв', 'Junior'],
    ['Илья Зайцев', 'Junior'], ['Кирилл Лебедев', 'Junior'], ['Марк Новиков', 'Junior'], ['Никита Орлов', 'Junior'],
    ['Тимофей Павлов', 'Junior'], ['Фёдор Рябов', 'Junior'], ['Павел Смирнов', 'Взрослые'], ['Роман Титов', 'Взрослые'],
    ['Олег Устинов', 'Взрослые'], ['Сергей Фомин', 'Взрослые'],
  ];
  const players = names.map(([fio, group], i) => ({
    id: 'P-DEMO' + String(i + 1).padStart(3, '0'), fio, group, status: i === 13 ? 'Пауза' : 'Активен',
    parent: group === 'Junior' ? 'Родитель: ' + fio.split(' ')[1] : '', parentPhone: '+7 900 000-00-' + String(10 + i),
  }));
  const month = ymd(new Date()).slice(0, 7);
  const journal = [];
  players.filter((p) => p.status === 'Активен').forEach((p, i) => {
    if (i === 7) { // пример игрока на разовых оплатах
      [2, 6].forEach((day) => journal.push({ payId: 'PAY-' + String(journal.length + 1).padStart(4, '0'), id: p.id, fio: p.fio, group: p.group,
        date: month + '-0' + day, amount: 1600, status: 'Оплачен', method: 'Наличные', abonement: 'Разовая', comment: '' }));
      return;
    }
    if (i % 4 === 3) return;
    journal.push({ payId: 'PAY-' + String(journal.length + 1).padStart(4, '0'), id: p.id, fio: p.fio, group: p.group,
      date: month + '-0' + (1 + (i % 6)), amount: i % 3 === 0 ? 14500 : 11500, status: 'Оплачен', method: 'Перевод',
      abonement: i % 3 === 0 ? '3 раза/нед.' : '2 раза/нед.', comment: '' });
  });
  const leads = [
    { row: 2, date: ymd(addDays(new Date(), -1)), fio: 'Лев Ковалёв', group: 'Junior', age: '12', phone: '+7 900 111-22-33', source: 'Instagram', status: 'Новая', trialDate: '', owner: 'Кузьма', comment: 'Пишет мама, хотят во вторник' },
    { row: 3, date: ymd(addDays(new Date(), -3)), fio: 'Матвей Соколов', group: 'Junior', age: '14', phone: '+7 900 222-33-44', source: 'Рекомендация', status: 'Пробная назначена', trialDate: ymd(addDays(new Date(), 2)), owner: 'Антон', comment: '' },
    { row: 4, date: ymd(addDays(new Date(), -6)), fio: 'Виктор Егоров', group: 'Взрослые', age: '27', phone: '+7 900 333-44-55', source: 'Telegram', status: 'Связались', trialDate: '', owner: 'Серафим', comment: '' },
    { row: 5, date: ymd(addDays(new Date(), -12)), fio: 'Алиса Фролова', group: 'Junior', age: '13', phone: '+7 900 444-55-66', source: 'Сайт', status: 'Клиент', trialDate: ymd(addDays(new Date(), -8)), owner: 'Антон', comment: 'Взяла 2 раза/нед.' },
  ];
  const db = { players, journal, leads, attendance: {} };
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch { /* */ }
  return db;
}
function saveDemo(db) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch { /* */ } }

function demoSummary(db) {
  const month = ymd(new Date()).slice(0, 7);
  const end = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  const daysLeft = Math.round((end - new Date(ymd(new Date()))) / 86400000);
  const active = db.players.filter((p) => p.status === 'Активен');
  const payments = active.map((p) => {
    const mine = db.journal.filter((j) => j.id === p.id && j.date.startsWith(month) && j.status === 'Оплачен');
    // Разовые оплаты не делают игрока «оплатившим месяц» — как в таблице. Это отдельные оплаты занятий.
    const paid = [...mine].reverse().find((j) => j.abonement !== 'Разовая');
    const once = mine.filter((j) => j.abonement === 'Разовая');
    const status = paid ? 'Оплачен' : 'Не оплачен';
    return {
      id: p.id, fio: p.fio, group: p.group, period: month, status,
      date: paid ? fmt(paid.date, 'dd.MM.yyyy') : '', amount: paid ? paid.amount : null, method: paid?.method || '',
      abonement: paid?.abonement || '', until: paid ? fmt(end, 'dd.MM.yyyy') : '', daysLeft: paid ? daysLeft : null,
      reminder: !paid && !once.length ? '⚠ Не оплачен' : paid && daysLeft <= 5 ? `⚠ Через ${daysLeft} дн.` : '',
      oneOff: once.length ? { count: once.length, sum: once.reduce((s, j) => s + j.amount, 0), last: fmt(once.map((j) => j.date).sort().pop(), 'dd.MM.yyyy') } : null,
      paidMonth: mine.reduce((s, j) => s + j.amount, 0),
    };
  });
  const paidN = payments.filter((p) => p.status === 'Оплачен').length;
  const revenue = db.journal.filter((j) => j.date.startsWith(month)).reduce((s, j) => s + (j.status === 'Возврат' ? -j.amount : j.status === 'Оплачен' ? j.amount : 0), 0);
  return {
    month,
    kpi: {
      active: active.length, junior: active.filter((p) => p.group === 'Junior').length,
      adults: active.filter((p) => p.group === 'Взрослые').length, paused: db.players.filter((p) => p.status === 'Пауза').length,
      paid: paidN, unpaid: payments.filter((p) => p.status === 'Не оплачен').length, oneOff: payments.filter((p) => p.status !== 'Оплачен' && p.oneOff).length, revenue, alerts: payments.filter((p) => p.reminder).length,
      newLeads: db.leads.filter((l) => l.status === 'Новая').length, trials: db.leads.filter((l) => l.status === 'Пробная назначена').length,
      attJunior: 0.82, attAdults: 0.7,
    },
    payments,
    league: [
      { league: 'Лига u14', fio: 'Глеб Воронин', debt: 3000 },
      { league: 'Лига u16', fio: 'Егор Журавлёв', debt: 6000 },
    ],
  };
}

function demoClub(action, p) {
  const db = demoDb();
  switch (action) {
    case 'summary': return demoSummary(db);
    case 'players': return { players: db.players, lists: DEFAULT_LISTS };
    case 'payRecent': return [...db.journal].reverse().slice(0, 15).map((j) => ({ ...j, date: fmt(j.date, 'dd.MM.yyyy') }));
    case 'payAdd': {
      p = p.pay;
      const pl = db.players.find((x) => x.fio === p.fio);
      db.journal.push({ payId: 'PAY-' + String(db.journal.length + 1).padStart(4, '0'), id: pl?.id || '', fio: p.fio, group: pl?.group || '',
        date: p.date, amount: Number(p.amount), status: p.status, method: p.method, abonement: p.abonement, comment: p.comment || '' });
      saveDemo(db);
      return { row: db.journal.length + 1 };
    }
    case 'attGet': {
      const key = p.group + '|' + p.date;
      const marks = db.attendance[key] || {};
      return {
        exists: Boolean(db.attendance[key]),
        players: db.players.filter((x) => x.group === p.group && x.status === 'Активен')
          .map((x) => ({
            id: x.id, fio: x.fio, mark: marks[x.id] || '',
            pay: db.journal.some((j) => j.id === x.id && j.date === p.date && j.abonement === 'Разовая' && j.status === 'Оплачен')
              ? 'Разовая оплачена' : demoSummary(db).payments.find((y) => y.id === x.id)?.status || '',
          })),
      };
    }
    case 'attSet': {
      db.attendance[p.group + '|' + p.date] = p.marks;
      saveDemo(db);
      return { saved: Object.keys(p.marks).length };
    }
    case 'leads': return db.leads;
    case 'leadAdd': {
      const row = Math.max(1, ...db.leads.map((l) => l.row)) + 1;
      db.leads.push({ ...p.lead, row });
      saveDemo(db);
      return { row };
    }
    case 'leadUpdate': {
      db.leads = db.leads.map((l) => (l.row === p.row ? { ...l, ...p.patch } : l));
      saveDemo(db);
      return { row: p.row };
    }
    default: throw new Error('Неизвестное действие: ' + action);
  }
}
