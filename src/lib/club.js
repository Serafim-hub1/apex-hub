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

/** Лига U15/U17: типы оплат как в «Журнале оплат лиги» и цены по умолчанию (сумму можно поправить, 0 допустим). */
export const LEAGUES = ['U15', 'U17'];
export const LEAGUE_TYPES = ['Вступительный взнос', 'Полгода', 'Год', 'Матч'];
export const LEAGUE_PRICES = { 'Вступительный взнос': 3000, 'Полгода': 20000, 'Год': 40000, 'Матч': 3000 };

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

/** Телефон из таблицы («8926…», «7(985)261-34-24») → «79261234567» для ссылок. Пусто, если номер не похож на российский. */
export function phoneDigits(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10 && d[0] === '9') d = '7' + d;
  return d.length === 11 && d[0] === '7' ? d : '';
}

/** Кому писать об оплате: у Junior — родителю, у взрослых — самому игроку (если нет — второй номер). */
export function payContact(info) {
  const kid = info.group === 'Junior';
  const first = kid ? info.parentPhone : info.phone;
  const second = kid ? info.phone : info.parentPhone;
  const phone = phoneDigits(first) || phoneDigits(second);
  const who = kid && phoneDigits(first) ? info.parent : !kid && phoneDigits(first) ? info.fio : (kid ? info.fio : info.parent);
  return { phone, who: String(who || '').trim() };
}

/** Текст напоминания об оплате. p — строка из summary (статус, «действует до»), info — карточка игрока. */
export function reminderMessage(info, p, monthName) {
  const kid = info.group === 'Junior';
  const parts = String(info.fio || '').trim().split(/\s+/);
  const childName = parts[1] || parts[0] || '';
  const { who } = payContact(info);
  const wp = who.split(/\s+/);
  // В «Игроках» ФИО: Фамилия Имя Отчество → обращаемся по имени и отчеству, если они есть.
  const hello = wp.length >= 3 ? `${wp[1]} ${wp[2]}` : wp[1] || wp[0] || '';
  const greet = `Здравствуйте${hello ? ', ' + hello : ''}!`;
  // Имя ребёнка в скобках — чтобы не склонять («для Александра»).
  const forWhom = kid && childName ? ` (${childName})` : '';
  if (p?.status === 'Оплачен' && p.until) {
    return `${greet} Напоминаем: абонемент APEX${forWhom} действует до ${p.until}. Чтобы тренировки продолжились без перерыва, продлите его, пожалуйста. Спасибо!`;
  }
  return `${greet} Напоминаем об оплате тренировок APEX за ${monthName}${forWhom}. Спасибо!`;
}

export const clubConfigured = () => DEMO || Boolean(APPS_SCRIPT_URL);

const CACHE = 'apex-club-cache:';
/** Ответ таблицы нужной формы? Иначе страницы, читающие kpi/payments, падают целиком. */
const SHAPE = { summary: (d) => Boolean(d && d.kpi && Array.isArray(d.payments)) };
const shapeOk = (action, data) => !SHAPE[action] || SHAPE[action](data);
export function readCache(key) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE + key));
    return c && shapeOk(key, c.data) ? c : null; // кэш в старой форме игнорируем
  } catch { return null; }
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
  if (!shapeOk(action, json.data)) throw new Error('Таблица прислала ответ в неожиданной форме. Нажмите «Повторить»; если не проходит — скрипт таблицы не обновился.');
  if (['summary', 'players', 'leads', 'payRecent', 'league', 'finance'].includes(action)) writeCache(action, json.data);
  return json.data;
}

/* ── Карточка игрока: кэш на устройстве. Открывается сразу из кэша и тихо обновляется из таблицы. ── */
const CARD = 'player:';
const cardMem = new Map(); // id → { at, data }
const cardBusy = new Map(); // id → идущий запрос (чтобы не слать второй такой же)
const cardHit = (id) => {
  const k = String(id);
  if (!cardMem.has(k)) { const c = readCache(CARD + k); if (c?.data) cardMem.set(k, c); }
  return cardMem.get(k) || null;
};
export const cachedPlayer = (id) => cardHit(id)?.data || null;
/** Карточка из таблицы; если есть копия свежее fresh мс — отдаём её без запроса. */
export function loadPlayer(id, getIdToken, { fresh = 20000 } = {}) {
  const k = String(id);
  const hit = cardHit(k);
  if (hit && Date.now() - hit.at < fresh) return Promise.resolve(hit.data);
  if (cardBusy.has(k)) return cardBusy.get(k);
  const p = clubCall('player', { id }, getIdToken)
    .then((data) => { cardMem.set(k, { at: Date.now(), data }); writeCache(CARD + k, data); return data; })
    .finally(() => cardBusy.delete(k));
  cardBusy.set(k, p);
  return p;
}
/** Заранее подгружает карточки по одной (тех, кого вероятнее всего откроют). */
export async function prefetchPlayers(ids, getIdToken) {
  for (const id of ids) {
    try { await loadPlayer(id, getIdToken, { fresh: 5 * 60000 }); } catch { return; }
  }
}
/** После записи оплаты или посещаемости копии устарели: забыть одну карточку или все. */
export function forgetPlayers(id) {
  if (id !== undefined && id !== null) {
    cardMem.delete(String(id));
    try { localStorage.removeItem(CACHE + CARD + id); } catch { /* */ }
    return;
  }
  cardMem.clear();
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(CACHE + CARD)).forEach((k) => localStorage.removeItem(k));
  } catch { /* */ }
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
  };
}

/* Демо лиги: выдуманные игроки и суммы, статусы считаются так же, как формулы таблицы (абонемент покрывает 7 / 15 матчей). */
const DEMO_LEAGUE = {
  U15: ['Артём Беляев', 'Глеб Воронов', 'Данил Крылов', 'Егор Фомин', 'Макар Ильин'],
  U17: ['Никита Осипов', 'Руслан Тихонов', 'Савва Дроздов', 'Тимур Мартынов'],
};
const demoMatchDates = () => [-20, -5, 10].map((n) => ymd(addDays(new Date(), n)));
function demoLeagueJournal(db) {
  if (db.leagueJournal) return db.leagueJournal;
  const d = (n) => ymd(addDays(new Date(), n));
  const row = (league, fio, date, type, match, amount) => ({ league, fio, date, type, match, amount, comment: '' });
  db.leagueJournal = [
    row('U15', 'Артём Беляев', d(-30), 'Вступительный взнос', '', 3000),
    row('U15', 'Глеб Воронов', d(-30), 'Вступительный взнос', '', 3000),
    row('U15', 'Данил Крылов', d(-30), 'Вступительный взнос', '', 3000),
    row('U15', 'Данил Крылов', d(-30), 'Полгода', '', 20000),
    row('U15', 'Артём Беляев', d(-20), 'Матч', 'Матч 1', 3000),
    row('U15', 'Глеб Воронов', d(-5), 'Матч', 'Матч 2', 2000),
    row('U17', 'Никита Осипов', d(-30), 'Вступительный взнос', '', 3000),
    row('U17', 'Руслан Тихонов', d(-30), 'Вступительный взнос', '', 0),
    row('U17', 'Никита Осипов', d(-20), 'Матч', 'Матч 1', 3000),
    row('U17', 'Руслан Тихонов', d(-5), 'Матч', 'Матч 2', 3000),
  ].map((j, i) => ({ ...j, id: 'LP-' + String(i + 1).padStart(4, '0') }));
  return db.leagueJournal;
}
const demoRowMonth = (j) => (j.type === 'Матч' ? demoMatchDates()[Number(String(j.match).split(' ')[1]) - 1] || '' : j.date).slice(0, 7);

function demoLeague(db) {
  const jr = demoLeagueJournal(db);
  const month = ymd(new Date()).slice(0, 7);
  const dates = demoMatchDates();
  const matches = Array.from({ length: 15 }, (_, i) => ({ name: 'Матч ' + (i + 1), date: dates[i] ? fmt(dates[i], 'dd.MM.yyyy') : '' }));
  const sum = (arr) => arr.reduce((s, j) => s + j.amount, 0);
  const out = {};
  Object.keys(DEMO_LEAGUE).forEach((code) => {
    const mine = jr.filter((j) => j.league === code);
    const grid = DEMO_LEAGUE[code].map((fio) => {
      const my = mine.filter((j) => j.fio === fio);
      const has = (t) => my.some((j) => j.type === t);
      const plan = has('Год') ? 'Год' : has('Полгода') ? 'Полгода' : has('Матч') ? 'Разовая' : '';
      const cells = matches.map((m, i) => {
        if (!m.date) return '';
        if ((has('Год') && i < 15) || (has('Полгода') && i < 7)) return 'Абонемент';
        return my.some((j) => j.type === 'Матч' && j.match === m.name) ? 'Оплачен' : 'Не оплачен';
      });
      return {
        fio, entry: has('Вступительный взнос') ? 'Оплачен' : 'Не оплачен', plan, planStatus: plan === 'Разовая' ? 'По матчам' : plan ? 'Оплачен' : '',
        covered: cells.filter((c) => c === 'Оплачен' || c === 'Абонемент').length, total: sum(my), cells,
      };
    });
    const inMonth = mine.filter((j) => demoRowMonth(j) === month);
    const income = sum(inMonth);
    const expense = dates.filter((x) => x.startsWith(month)).length * 10000;
    out[code] = {
      players: DEMO_LEAGUE[code], matches, grid,
      month: {
        label: fmt(month + '-01', 'LLLL'), players: grid.length, income, expense, net: income - expense,
        incomeBy: { entry: sum(inMonth.filter((j) => j.type === 'Вступительный взнос')), plans: sum(inMonth.filter((j) => j.type === 'Полгода' || j.type === 'Год')), matches: sum(inMonth.filter((j) => j.type === 'Матч')) },
        expenseBy: { matches: expense, entry: 0 }, matchPrice: 10000, entryFee: 17000,
      },
      monthly: [{ label: fmt(month + '-01', 'LLL yyyy'), ym: month, income, expense, net: income - expense }],
      byMatch: matches.map((m, i) => ({ m, i })).filter((x) => x.m.date).map(({ m, i }) => ({
        name: m.name, date: m.date, covered: grid.filter((g) => g.cells[i] !== 'Не оплачен').length,
        income: sum(mine.filter((j) => j.match === m.name)), expense: 10000, net: sum(mine.filter((j) => j.match === m.name)) - 10000,
      })),
    };
  });
  out.recent = [...jr].reverse().slice(0, 20).map((j) => {
    const i = Number(String(j.match).split(' ')[1]) - 1;
    return { id: j.id, league: j.league, fio: j.fio, date: fmt(j.date, 'dd.MM.yyyy'), month: demoRowMonth(j), type: j.type, match: j.match,
      matchDate: j.match && dates[i] ? fmt(dates[i], 'dd.MM.yyyy') : '', amount: j.amount, comment: j.comment };
  });
  return out;
}

function demoFinance(db) {
  const lg = demoLeague(db);
  const month = ymd(new Date()).slice(0, 7);
  const training = demoSummary(db).kpi.revenue;
  const league = lg.U15.month.net + lg.U17.month.net;
  const past = [[190000, 0], [220000, 60000], [205000, 34000]]; // выдуманные прошлые месяцы
  const monthly = past.map(([t, l], i) => {
    const ym = ymd(addDays(new Date(month + '-15'), -30 * (past.length - i))).slice(0, 7);
    return { label: fmt(ym + '-01', 'LLL yyyy'), ym, training: t, league: l, total: t + l };
  });
  monthly.push({ label: fmt(month + '-01', 'LLL yyyy'), ym: month, training, league, total: training + league });
  return { monthLabel: fmt(month + '-01', 'LLLL yyyy'), training, league, total: training + league, monthly };
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
        date: p.date, amount: Number(p.amount), status: p.status, method: p.method, abonement: p.abonement, comment: p.comment || '', by: 'Демо' });
      saveDemo(db);
      return { row: db.journal.length + 1 };
    }
    case 'league': return demoLeague(db);
    case 'finance': return demoFinance(db);
    case 'leagueAdd': {
      p = p.pay;
      const jr = demoLeagueJournal(db);
      const match = p.type === 'Матч' ? p.match : '';
      const dup = !p.force && jr.find((j) => j.league === p.league && j.fio === p.fio && j.type === p.type && j.match === match);
      if (dup) return { duplicate: { id: dup.id, date: fmt(dup.date, 'dd.MM.yyyy'), amount: dup.amount, type: dup.type, match: dup.match } };
      const id = 'LP-' + String(jr.length + 1).padStart(4, '0');
      jr.push({ id, league: p.league, fio: p.fio, date: p.date, type: p.type, match, amount: Number(p.amount) || 0, comment: p.comment || '' });
      saveDemo(db);
      return { row: jr.length + 1, id, warnings: [] };
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
    case 'player': {
      const x = db.players.find((y) => y.id === p.id);
      if (!x) throw new Error('Игрок не найден на листе «Игроки»');
      const visits = Object.keys(db.attendance).filter((k) => k.startsWith(x.group + '|')).sort()
        .map((k) => ({ date: fmt(k.split('|')[1], 'dd.MM'), mark: db.attendance[k][x.id] || '' }));
      return {
        info: { id: x.id, fio: x.fio, group: x.group, birth: '', age: x.group === 'Junior' ? '13' : '', phone: x.phone || '',
          parent: x.parent || '', parentPhone: x.parentPhone || '', parentEmail: '', joined: '01.09.2026', status: x.status, source: '', comment: '' },
        payments: db.journal.filter((j) => j.id === x.id).reverse()
          .map((j) => ({ ...j, period: j.date.slice(0, 7), date: fmt(j.date, 'dd.MM.yyyy'), by: j.by || '' })),
        visits,
      };
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
