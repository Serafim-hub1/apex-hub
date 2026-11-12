/**
 * APEX Hub — серверная часть на Google Apps Script (бесплатно).
 *
 * Что делает:
 *  1) Мост «приложение ⇄ Google-таблица клуба»: оплаты, посещаемость, заявки (doPost).
 *  2) Каждые 5 минут (apexTick): напоминания о задачах и событиях, уведомления о назначениях,
 *     утренний список задач — через Firebase Cloud Messaging (+ Telegram по желанию).
 *  3) Данные для виджета на iPhone (doGet?action=widget&key=…).
 *  4) Каждую ночь около 03:00 (apexBackup): копия задач, событий и страниц в JSON на Google Диск,
 *     папка «APEX Hub — бэкапы», хранятся последние 30 дней.
 *
 * Настройки — в «Параметры проекта → Свойства скрипта» (Script properties):
 *   FIREBASE_API_KEY        Web API key из Firebase (тот же, что VITE_FIREBASE_API_KEY)
 *   SERVICE_ACCOUNT_JSON    весь JSON сервисного аккаунта Firebase (Project settings → Service accounts → Generate new private key)
 *   ALLOWED_EMAILS          почты трёх кабинетов через запятую
 *   SPREADSHEET_ID          ID таблицы (не нужен, если скрипт создан из самой таблицы: Расширения → Apps Script)
 *   TELEGRAM_BOT_TOKEN      необязательно: токен бота от @BotFather для дублирования уведомлений
 *
 * После вставки кода: выполните функцию apexSetup() один раз (выдаст разрешения и создаст триггер),
 * затем «Начать развертывание → Новое развертывание → Веб-приложение»: запуск от моего имени, доступ «Все».
 */

// Весь код APEX Hub спрятан внутри APEX_HUB, чтобы не пересекаться с другими скриптами таблицы
// (например, с onEdit для «Реестра ID»). Снаружи видны только функции ниже.

function doPost(e) { return APEX_HUB.doPost(e); }
function doGet(e) { return APEX_HUB.doGet(e); }
function apexSetup() { return APEX_HUB.setup(); }
function apexTick() { return APEX_HUB.tick(); }
function apexBackup() { return APEX_HUB.backup(); }

var APEX_HUB = (function () {
const TZ = 'Europe/Moscow';
const SHEETS = {
  players: 'Игроки', payments: 'Оплаты', journal: 'Журнал оплат', leads: 'Заявки', lists: 'Справочники',
  leagueJournal: 'Журнал оплат лиги', league: { U15: 'Лига U15', U17: 'Лига U17' }, dashboard: 'Dashboard',
  attendance: (g) => 'Посещаемость — ' + g,
};

/* ───────────────────────── входные точки ───────────────────────── */

function doPost_(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const email = verifyUser_(body.idToken);
    const fn = ACTIONS[body.action];
    if (!fn) throw new Error('Неизвестное действие: ' + body.action);
    return json_({ ok: true, data: fn(body, email) });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doGet_(e) {
  try {
    const p = e.parameter || {};
    if (p.action === 'widget') return json_({ ok: true, data: widget_(p.key) });
    return json_({ ok: true, data: 'APEX Hub API работает' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

const ACTIONS = {
  summary: () => summary_(),
  players: () => players_(),
  payRecent: () => payRecent_(),
  payAdd: (b, email) => withLock_(() => payAdd_(b.pay, email)),
  player: (b) => player_(b.id),
  attGet: (b) => attGet_(b.group, b.date),
  attSet: (b) => withLock_(() => attSet_(b.group, b.date, b.marks)),
  leads: () => leads_(),
  leadAdd: (b) => withLock_(() => leadAdd_(b.lead)),
  leadUpdate: (b) => withLock_(() => leadUpdate_(b.row, b.patch)),
  league: () => league_(),
  leagueAdd: (b) => withLock_(() => leagueAdd_(b.pay)),
  finance: () => finance_(),
};

/** Однократная настройка: разрешения + триггер каждые 5 минут. */
function setup_() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === 'apexTick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('apexTick').timeBased().everyMinutes(5).create();
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === 'apexBackup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('apexBackup').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Бэкап: каждую ночь около 03:00, папка на Диске «%s»', backupFolder_().getName());
  ss_().getName();
  const sa = serviceAccount_();
  Logger.log('Готово. Таблица: %s. Firebase-проект: %s', ss_().getName(), sa.project_id);
  Logger.log('Проверка Firestore: пользователей в базе — %s', fsList_('users').length);
}

/* ───────────────────────── доступ ───────────────────────── */

function prop_(k, required) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (required && !v) throw new Error('Не задано свойство скрипта ' + k);
  return v || '';
}
function ss_() {
  const id = prop_('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('В таблице нет листа «' + name + '»');
  return sh;
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Проверяем Firebase ID-токен через Identity Toolkit и сверяем почту со списком. */
function verifyUser_(idToken) {
  if (!idToken) throw new Error('Нужен вход в приложение');
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)).slice(0, 40);
  const hit = cache.get(key);
  if (hit) return hit;
  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + prop_('FIREBASE_API_KEY', true), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('Сессия устарела. Обновите страницу.');
  const user = (JSON.parse(res.getContentText()).users || [])[0] || {};
  const email = String(user.email || '').toLowerCase();
  const allowed = prop_('ALLOWED_EMAILS', true).toLowerCase().split(/[,\s]+/).filter(String);
  if (allowed.indexOf(email) < 0) throw new Error('У этой почты нет доступа к таблице');
  cache.put(key, email, 1800);
  return email;
}

/* ───────────────────────── помощники таблицы ───────────────────────── */

const isDate_ = (v) => Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
const ymd_ = (d) => Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
const dmy_ = (d) => Utilities.formatDate(d, TZ, 'dd.MM.yyyy');
const thisMonth_ = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
const num_ = (v) => (typeof v === 'number' ? v : Number(String(v).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0);
const asYmd_ = (v) => (isDate_(v) ? ymd_(v) : /^\d{2}\.\d{2}\.\d{4}$/.test(String(v)) ? String(v).split('.').reverse().join('-') : String(v || ''));
function parseYmd_(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function firstEmptyRow_(sh, col) {
  const last = Math.max(sh.getLastRow(), 2);
  const vals = sh.getRange(2, col, last - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) if (vals[i][0] === '' || vals[i][0] === null) return i + 2;
  return last + 1;
}
function column_(sh, idx) { // idx с 1
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, idx, n, 1).getValues().map((r) => r[0]) : [];
}

/* ───────────────────────── Оплаты ───────────────────────── */

function activePlayers_() {
  const v = sheet_(SHEETS.players).getDataRange().getValues().slice(1);
  return v.filter((r) => r[1] !== '').map((r) => ({
    id: String(r[0]), fio: String(r[1]).trim(), raw: String(r[1]), group: String(r[2]), status: String(r[10] || 'Активен'),
    phone: String(r[5] || ''), parent: String(r[6] || ''), parentPhone: String(r[7] || ''),
  }));
}

function summary_() {
  const sh = sheet_(SHEETS.payments);
  const disp = sh.getDataRange().getDisplayValues().slice(1);
  const vals = sh.getDataRange().getValues().slice(1);
  const payments = [];
  disp.forEach((r, i) => {
    if (!r[0] || !r[1]) return;
    payments.push({
      // «Разовые» — старый статус из формул до 10.11.2026; теперь это просто «Не оплачен» с внесёнными деньгами
      id: r[0], fio: r[1], group: r[2], period: r[3], status: r[4] === 'Разовые' ? 'Не оплачен' : r[4], date: r[5],
      amount: vals[i][6] === '' ? null : num_(vals[i][6]), method: r[7], abonement: r[8], until: r[9],
      daysLeft: r[10] === '' ? null : Number(r[10]), reminder: r[11],
    });
  });
  const players = activePlayers_();
  const active = players.filter((p) => p.status !== 'Пауза' && p.status !== 'Выбыл');
  const month = thisMonth_();
  let revenue = 0;
  const oneOff = {}; // ID игрока → { count, sum, last } — разовые оплаты в этом месяце (с абонементом не связаны)
  const paidMonth = {}; // ID игрока → всего внесено за месяц (все оплаты минус возвраты)
  journalRows_().forEach((r) => {
    if (periodOf_(r) !== month) return;
    const id = String(r[1]);
    if (r[7] === 'Оплачен') { revenue += num_(r[6]); paidMonth[id] = (paidMonth[id] || 0) + num_(r[6]); }
    if (r[7] === 'Возврат') { revenue -= num_(r[6]); paidMonth[id] = (paidMonth[id] || 0) - num_(r[6]); }
    if (r[7] === 'Оплачен' && isOneOff_(r)) {
      const d = isDate_(r[5]) ? dmy_(r[5]) : String(r[5]);
      const o = oneOff[id] || (oneOff[id] = { count: 0, sum: 0, last: '' });
      o.count++;
      o.sum += num_(r[6]);
      if (!o.last || d.split('.').reverse().join('') > o.last.split('.').reverse().join('')) o.last = d;
    }
  });
  payments.forEach((p) => { p.oneOff = oneOff[p.id] || null; p.paidMonth = paidMonth[p.id] || 0; });
  const leadStatuses = column_(sheet_(SHEETS.leads), 7);
  return {
    month: month,
    kpi: {
      active: active.length,
      junior: active.filter((p) => p.group === 'Junior').length,
      adults: active.filter((p) => p.group === 'Взрослые').length,
      paused: players.filter((p) => p.status === 'Пауза').length,
      paid: payments.filter((p) => p.status === 'Оплачен').length,
      unpaid: payments.filter((p) => p.status === 'Не оплачен').length,
      oneOff: payments.filter((p) => p.status !== 'Оплачен' && p.oneOff).length,
      revenue: revenue,
      alerts: payments.filter((p) => p.reminder).length,
      newLeads: leadStatuses.filter((s) => s === 'Новая').length,
      trials: leadStatuses.filter((s) => s === 'Пробная назначена').length,
    },
    payments: payments,
  };
}

function players_() {
  const v = sheet_(SHEETS.lists).getDataRange().getValues().slice(1);
  const col = (i) => v.map((r) => r[i]).filter((x) => x !== '' && x !== null).map(String);
  return {
    players: activePlayers_(),
    lists: {
      groups: col(0), sources: col(2), payStatuses: col(3), payMethods: col(4), abonements: col(5),
      leadStatuses: col(6), owners: col(8),
    },
  };
}

/** Строки «Журнала оплат», где заполнено ФИО (колонка D).
 *  getLastRow() здесь не годится: формулы ARRAYFORMULA в A–E «занимают» весь лист до конца. */
function journalRows_() {
  return sheet_(SHEETS.journal).getDataRange().getValues().slice(1).filter((r) => String(r[3]).trim() !== '');
}
const periodOf_ = (r) => (isDate_(r[5]) ? Utilities.formatDate(r[5], TZ, 'yyyy-MM') : String(r[2]));
const isOneOff_ = (r) => String(r[9]).trim() === 'Разовая';

function payRecent_() {
  return journalRows_().reverse().slice(0, 15).map((r) => ({
    payId: String(r[0]), id: String(r[1]), fio: String(r[3]), group: String(r[4]),
    date: isDate_(r[5]) ? dmy_(r[5]) : String(r[5]), amount: num_(r[6]), status: String(r[7]),
    method: String(r[8]), abonement: String(r[9]), comment: String(r[10] || ''), by: String(r[11] || ''),
  }));
}

/** Карточка игрока: данные из «Игроков», все его оплаты и посещаемость по листу его группы. */
function player_(id) {
  id = String(id || '');
  const row = sheet_(SHEETS.players).getDataRange().getValues().slice(1).filter((r) => String(r[0]) === id)[0];
  if (!row) throw new Error('Игрок не найден на листе «Игроки»');
  const s = (v) => (isDate_(v) ? dmy_(v) : String(v === null || v === undefined ? '' : v).trim());
  const info = {
    id: id, fio: s(row[1]), group: s(row[2]), birth: s(row[3]), age: s(row[4]), phone: s(row[5]),
    parent: s(row[6]), parentPhone: s(row[7]), parentEmail: s(row[8]), joined: s(row[9]),
    status: s(row[10]) || 'Активен', source: s(row[11]), comment: s(row[12]),
  };
  const payments = journalRows_().filter((r) => String(r[1]) === id).reverse().map((r) => ({
    payId: String(r[0]), period: periodOf_(r), date: isDate_(r[5]) ? dmy_(r[5]) : String(r[5]), amount: num_(r[6]),
    status: String(r[7]), method: String(r[8]), abonement: String(r[9]), comment: String(r[10] || ''), by: String(r[11] || ''),
  }));
  // Посещаемость: заголовки — даты (или текст «дд.мм»), строки — игроки. Пустые колонки (нет отметок ни у кого) пропускаем.
  const visits = [];
  const name = SHEETS.attendance(info.group);
  const ash = ss_().getSheetByName(name);
  if (ash) {
    const v = ash.getDataRange().getValues();
    const me = v.slice(1).filter((r) => String(r[0]) === id)[0];
    if (me) {
      for (let c = 3; c < v[0].length; c++) {
        const h = v[0][c];
        if (h === '' || h === null) continue;
        const label = isDate_(h) ? Utilities.formatDate(h, TZ, 'dd.MM') : String(h).trim().slice(0, 5);
        const anyMark = v.slice(1).some((r) => String(r[c] || '').trim() !== '');
        if (anyMark) visits.push({ date: label, mark: String(me[c] || '').trim() });
      }
    }
  }
  return { info: info, payments: payments, visits: visits };
}

/** Имя пользователя по почте (из Firestore users), кэш на 6 часов. Если не вышло — пишем почту. */
function ownerName_(email) {
  email = String(email || '').toLowerCase();
  const cache = CacheService.getScriptCache();
  const hit = cache.get('name_' + email);
  if (hit) return hit;
  let name = email;
  try { fsList_('users').forEach((u) => { if (String(u.email || '').toLowerCase() === email && u.name) name = u.name; }); } catch (e) { /* без имён */ }
  cache.put('name_' + email, name, 21600);
  return name;
}

function payAdd_(pay, email) {
  if (!pay || !pay.fio) throw new Error('Не указан игрок');
  const player = activePlayers_().filter((p) => p.fio === String(pay.fio).trim())[0];
  if (!player) throw new Error('Игрока «' + pay.fio + '» нет на листе «Игроки»');
  const sh = sheet_(SHEETS.journal);
  const row = firstEmptyRow_(sh, 4); // колонка D — ФИО; A, B, C, E заполняют формулы
  // Пишем имя ровно как на листе «Игроки» (с пробелами, если они там есть), иначе формулы не найдут ID.
  sh.getRange(row, 4).setValue(player.raw);
  sh.getRange(row, 6, 1, 6).setValues([[
    parseYmd_(pay.date), Number(pay.amount) || 0, pay.status || 'Оплачен', pay.method || 'Перевод', pay.abonement || '', pay.comment || '',
  ]]);
  // Колонка L «Внёс» — кто из команды записал оплату. Создаём её, если листа не хватает.
  if (sh.getMaxColumns() < 12) sh.insertColumnsAfter(sh.getMaxColumns(), 12 - sh.getMaxColumns());
  if (String(sh.getRange(1, 12).getValue()).trim() === '') sh.getRange(1, 12).setValue('Внёс');
  sh.getRange(row, 12).setValue(ownerName_(email));
  SpreadsheetApp.flush();
  return { row: row };
}

/* ───────────────────────── Лига U15 / U17 ───────────────────────── */
// Все расчёты (статусы матчей, доходы, расходы, итоги) делает таблица; здесь только чтение готовых значений и запись строки в журнал.
// Подписи блоков ищем по тексту, а не по номеру строки: перестановка строк в таблице ничего не ломает.

const LEAGUE_TYPES_ = ['Вступительный взнос', 'Полгода', 'Год', 'Матч'];
const MONTHS_RU_ = { 'янв.': 1, 'февр.': 2, 'мар.': 3, 'апр.': 4, 'мая': 5, 'июн.': 6, 'июл.': 7, 'авг.': 8, 'сент.': 9, 'окт.': 10, 'нояб.': 11, 'дек.': 12 };
const money_ = (v) => num_(String(v === undefined || v === null ? 0 : v).replace(/−/g, '-'));
/** «нояб. 2026» → «2026-11» (пусто, если не разобрали). */
function monthYm_(label) {
  const m = String(label).trim().split(/\s+/);
  const n = MONTHS_RU_[m[0]];
  return n && /^\d{4}$/.test(m[1] || '') ? m[1] + '-' + (n < 10 ? '0' : '') + n : '';
}

/** Один лист лиги: игроки со статусами матчей, финансы месяца, помесячная динамика, итоги по матчам. */
function leagueSheet_(code) {
  const v = sheet_(SHEETS.league[code]).getDataRange().getDisplayValues();
  const head = (v[0] || []).map((h) => String(h).trim());
  const dates = v[1] || [];
  const ix = (name, fb) => { const i = head.indexOf(name); return i >= 0 ? i : fb; };
  const matches = [];
  head.forEach((h, c) => { if (/^Матч \d+$/.test(h)) matches.push({ col: c, name: h, date: String(dates[c] || '').trim() }); });
  const cEntry = ix('Вступительный взнос', 1), cPlan = ix('Тариф (из журнала)', 2), cPlanSt = ix('Статус тарифа', 3);
  const cCov = ix('Покрыто матчей', 19), cTotal = ix('Получено всего, ₽', 20);
  const grid = v.slice(2).filter((r) => String(r[0]).trim() !== '').map((r) => ({
    fio: String(r[0]), entry: String(r[cEntry]).trim(), plan: String(r[cPlan]).trim(), planStatus: String(r[cPlanSt]).trim(),
    covered: num_(r[cCov]), total: money_(r[cTotal]), cells: matches.map((m) => String(r[m.col] || '').trim()),
  }));
  // Блок «Финансы лиги»: пары «название → значение» справа от матрицы
  const lc = head.indexOf('Финансы лиги');
  const kv = {};
  if (lc >= 0) for (let i = 1; i < Math.min(v.length, 40); i++) { const k = String(v[i][lc] || '').trim(); if (k) kv[k] = v[i][lc + 1]; }
  const k = (name) => money_(kv[name]);
  const month = {
    label: lc >= 0 ? String(head[lc + 1] || '').replace(/^Текущий месяц:\s*/, '') : '',
    players: k('Игроков'), income: k('Доход за месяц, ₽'), expense: k('Расходы за месяц, ₽'), net: k('Чистый результат за месяц, ₽'),
    incomeBy: { entry: k('Вступительные от игроков, ₽'), plans: k('Абонементы, ₽'), matches: k('Оплаты за матчи, ₽') },
    expenseBy: { matches: k('Расходы на матчи, ₽'), entry: k('Вступление в лигу, ₽') },
    matchPrice: k('Стоимость матча, ₽'), entryFee: k('Вступительный взнос лиги, ₽'),
  };
  // Динамика по месяцам и итоги по матчам — таблицы под заголовком «Месяц» / «Матч»
  const mc = head.indexOf('Месяц');
  const monthly = [], byMatch = [];
  if (mc >= 0) {
    for (let i = 1; i < v.length && String(v[i][mc]).trim() !== '' && String(v[i][mc]).trim() !== 'Матч'; i++) {
      monthly.push({ label: String(v[i][mc]).trim(), ym: monthYm_(v[i][mc]), income: money_(v[i][mc + 1]), expense: money_(v[i][mc + 2]), net: money_(v[i][mc + 3]) });
    }
    for (let i = 1; i < v.length; i++) {
      if (String(v[i][mc]).trim() !== 'Матч') continue;
      for (let j = i + 1; j < v.length && String(v[j][mc]).trim() !== ''; j++) {
        const date = String(v[j][mc + 1] || '').trim();
        if (date) byMatch.push({ name: String(v[j][mc]).trim(), date: date, covered: num_(v[j][mc + 2]), income: money_(v[j][mc + 3]), expense: money_(v[j][mc + 4]), net: money_(v[j][mc + 5]) });
      }
      break;
    }
  }
  return {
    players: grid.map((g) => g.fio), matches: matches.map((m) => ({ name: m.name, date: m.date })),
    grid: grid, month: month, monthly: monthly, byMatch: byMatch,
  };
}

/** Строки «Журнала оплат лиги» (значения как в таблице), где заполнено ФИО (колонка C): A–E, H — формулы на весь лист. */
function leagueJournalRows_() {
  return sheet_(SHEETS.leagueJournal).getDataRange().getDisplayValues().slice(1).filter((r) => String(r[2]).trim() !== '');
}

function league_() {
  const out = { U15: leagueSheet_('U15'), U17: leagueSheet_('U17') };
  out.recent = leagueJournalRows_().reverse().slice(0, 20).map((r) => ({
    id: String(r[0]), league: String(r[1]), fio: String(r[2]).trim(), date: String(r[3]), month: String(r[4]),
    type: String(r[5]), match: String(r[6]), matchDate: String(r[7]), amount: money_(r[8]), comment: String(r[9] || ''),
  }));
  return out;
}

/** Запись оплаты лиги. Пишем только B, C, D, F, G, I, J; A (ID), E и H считают формулы / скрипт таблицы.
 *  Если такая оплата уже есть, возвращаем { duplicate } и ничего не пишем — приложение спросит и повторит с force. */
function leagueAdd_(pay) {
  pay = pay || {};
  const code = String(pay.league || '').trim();
  if (!SHEETS.league[code]) throw new Error('Не указана лига (U15 или U17)');
  const type = String(pay.type || '').trim();
  if (LEAGUE_TYPES_.indexOf(type) < 0) throw new Error('Неизвестный тип оплаты: ' + type);
  const match = type === 'Матч' ? String(pay.match || '').trim() : '';
  if (type === 'Матч' && !match) throw new Error('Для оплаты за матч выберите матч');
  const amount = Number(pay.amount);
  if (pay.amount === '' || pay.amount === null || pay.amount === undefined || isNaN(amount) || amount < 0) throw new Error('Укажите сумму (0 допустим)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(pay.date || ''))) throw new Error('Укажите дату оплаты');
  const lg = leagueSheet_(code);
  const want = String(pay.fio || '');
  const player = lg.grid.filter((g) => g.fio === want)[0] || lg.grid.filter((g) => g.fio.trim() === want.trim())[0];
  if (!player) throw new Error('Игрока «' + want.trim() + '» нет в списке лиги ' + code);
  if (match && !lg.matches.some((m) => m.name === match && m.date)) throw new Error('У «' + match + '» нет даты в листе «' + SHEETS.league[code] + '»');

  const jsh = sheet_(SHEETS.leagueJournal);
  if (!pay.force) {
    const dup = leagueJournalRows_().filter((r) => String(r[1]).trim() === code && String(r[2]).trim() === player.fio.trim()
      && String(r[5]).trim() === type && (type !== 'Матч' || String(r[6]).trim() === match))[0];
    if (dup) return { duplicate: { id: String(dup[0]), date: String(dup[3]), amount: money_(dup[8]), type: type, match: match } };
  }
  const row = firstEmptyRow_(jsh, 3); // колонка C — ФИО
  if (row > jsh.getMaxRows()) throw new Error('«' + SHEETS.leagueJournal + '» заполнен до конца: добавьте строки с формулами.');
  // ФИО — ровно как в листе лиги (с пробелом на конце, если он там есть): по нему считают формулы и список проверки
  jsh.getRange(row, 2, 1, 3).setValues([[code, player.fio, parseYmd_(pay.date)]]);
  jsh.getRange(row, 6, 1, 2).setValues([[type, match]]);
  jsh.getRange(row, 9, 1, 2).setValues([[amount, String(pay.comment || '')]]);
  SpreadsheetApp.flush();
  // onEdit при записи из скрипта не срабатывает, поэтому ID и проверку вызываем явно (функции лежат в «Код.gs» таблицы)
  const warnings = [];
  try {
    if (typeof apexEnsureJournalRowId === 'function') apexEnsureJournalRowId(SHEETS.leagueJournal, row);
    else warnings.push('В проекте нет apexEnsureJournalRowId: ID оплаты временный.');
  } catch (err) { warnings.push('ID оплаты: ' + String(err.message || err)); }
  try {
    if (typeof validateLeaguePaymentRow_ === 'function') validateLeaguePaymentRow_(jsh, row);
  } catch (err) { warnings.push('Проверка строки: ' + String(err.message || err)); }
  SpreadsheetApp.flush();
  return { row: row, id: String(jsh.getRange(row, 1).getDisplayValue()).trim(), warnings: warnings };
}

/** Сводка из «Dashboard»: тренировки, лига, общий результат за месяц и динамика по месяцам. */
function finance_() {
  const v = sheet_(SHEETS.dashboard).getDataRange().getDisplayValues();
  const after = (label) => {
    for (let i = 0; i < Math.min(v.length, 7); i++) for (let c = 0; c < v[i].length - 1; c++) if (String(v[i][c]).trim() === label) return v[i][c + 1];
    return '';
  };
  const monthly = [];
  for (let i = 0; i < v.length && !monthly.length; i++) {
    for (let c = 0; c < v[i].length - 3; c++) {
      if (String(v[i][c]).trim() !== 'Месяц' || String(v[i][c + 1]).indexOf('Тренировки') !== 0) continue;
      for (let j = i + 1; j < v.length && String(v[j][c]).trim() !== ''; j++) {
        monthly.push({ label: String(v[j][c]).trim(), ym: monthYm_(v[j][c]), training: money_(v[j][c + 1]), league: money_(v[j][c + 2]), total: money_(v[j][c + 3]) });
      }
      break;
    }
  }
  return {
    monthLabel: String(after('Текущий месяц:')).trim(), training: money_(after('Тренировки — доход')),
    league: money_(after('Лига — результат')), total: money_(after('Общий результат')), monthly: monthly,
  };
}

/* ───────────────────────── Посещаемость ───────────────────────── */

function dateCol_(headers, dateStr) {
  const d = parseYmd_(dateStr);
  for (let c = 3; c < headers.length; c++) {
    const h = headers[c];
    if (isDate_(h)) { if (h.getDate() === d.getDate() && h.getMonth() === d.getMonth()) return c; continue; }
    const m = String(h).trim().match(/^(\d{1,2})\.(\d{1,2})/);
    if (m && Number(m[1]) === d.getDate() && Number(m[2]) === d.getMonth() + 1) return c;
  }
  return -1;
}

function attGet_(group, date) {
  const sh = sheet_(SHEETS.attendance(group));
  const v = sh.getDataRange().getValues();
  const c = dateCol_(v[0], date);
  // Кто оплатил разовое занятие именно на эту дату
  const paidThatDay = {};
  journalRows_().forEach((r) => {
    if (r[7] === 'Оплачен' && isOneOff_(r) && isDate_(r[5]) && ymd_(r[5]) === date) paidThatDay[String(r[1])] = true;
  });
  return {
    exists: c >= 0,
    players: v.slice(1).filter((r) => r[0] && r[1]).map((r) => ({
      id: String(r[0]), fio: String(r[1]), mark: c >= 0 ? String(r[c] || '') : '',
      pay: paidThatDay[String(r[0])] ? 'Разовая оплачена' : String(r[2] || '').replace('Разовые', 'Не оплачен'),
    })),
  };
}

function attSet_(group, date, marks) {
  const sh = sheet_(SHEETS.attendance(group));
  const v = sh.getDataRange().getValues();
  let c = dateCol_(v[0], date);
  if (c < 0) {
    c = v[0].findIndex((h, i) => i >= 3 && (h === '' || h === null));
    if (c < 0) {
      c = sh.getLastColumn();
      if (c + 1 > sh.getMaxColumns()) sh.insertColumnAfter(sh.getMaxColumns());
    }
    const head = sh.getRange(1, c + 1);
    head.setNumberFormat('@').setValue(Utilities.formatDate(parseYmd_(date), TZ, 'dd.MM'));
    const rows = Math.max(sh.getLastRow() - 1, 1);
    const rule = sh.getRange(2, 4, rows, 1).getDataValidations();
    sh.getRange(2, c + 1, rows, 1).setDataValidations(rule);
  }
  const ids = v.slice(1).map((r) => String(r[0]));
  const out = ids.map((id, i) => [Object.prototype.hasOwnProperty.call(marks, id) ? marks[id] : (v[i + 1][c] || '')]);
  if (out.length) sh.getRange(2, c + 1, out.length, 1).setValues(out);
  return { saved: Object.keys(marks).length, column: c + 1 };
}

/* ───────────────────────── Заявки ───────────────────────── */

function leads_() {
  const sh = sheet_(SHEETS.leads);
  const v = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    if (!r[1]) continue;
    out.push({
      row: i + 1, date: asYmd_(r[0]), fio: String(r[1]), group: String(r[2]), age: String(r[3]), phone: String(r[4]),
      source: String(r[5]), status: String(r[6] || 'Новая'), trialDate: asYmd_(r[7]), owner: String(r[8]), comment: String(r[9] || ''),
    });
  }
  return out;
}
function leadRow_(l) {
  return [l.date ? parseYmd_(l.date) : new Date(), l.fio || '', l.group || '', l.age || '', l.phone || '', l.source || '',
    l.status || 'Новая', l.trialDate ? parseYmd_(l.trialDate) : '', l.owner || '', l.comment || ''];
}
function leadAdd_(lead) {
  const sh = sheet_(SHEETS.leads);
  const row = firstEmptyRow_(sh, 2);
  sh.getRange(row, 1, 1, 10).setValues([leadRow_(lead)]);
  return { row: row };
}
function leadUpdate_(row, patch) {
  const sh = sheet_(SHEETS.leads);
  if (!row || row < 2) throw new Error('Неверная строка');
  sh.getRange(row, 1, 1, 10).setValues([leadRow_(patch)]);
  return { row: row };
}

/* ───────────────────────── Firestore REST + FCM ───────────────────────── */

function serviceAccount_() {
  const raw = prop_('SERVICE_ACCOUNT_JSON', true);
  try { return JSON.parse(raw); } catch (e) { throw new Error('SERVICE_ACCOUNT_JSON: это должен быть весь JSON-файл ключа'); }
}
function gToken_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('g_token');
  if (hit) return hit;
  const sa = serviceAccount_();
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, '');
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({
    iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
  });
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(unsigned, sa.private_key)).replace(/=+$/, '');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + sig },
  });
  const token = JSON.parse(res.getContentText()).access_token;
  cache.put('g_token', token, 3300);
  return token;
}
function fsBase_() { return 'https://firestore.googleapis.com/v1/projects/' + serviceAccount_().project_id + '/databases/(default)/documents'; }
function fsFetch_(url, opt) {
  const res = UrlFetchApp.fetch(url, Object.assign({ headers: { Authorization: 'Bearer ' + gToken_() }, muteHttpExceptions: true, contentType: 'application/json' }, opt || {}));
  const code = res.getResponseCode();
  if (code >= 300) throw new Error('Firestore ' + code + ': ' + res.getContentText().slice(0, 300));
  return res.getContentText() ? JSON.parse(res.getContentText()) : {};
}
function fromFs_(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs_);
  if ('mapValue' in v) { const o = {}; Object.keys(v.mapValue.fields || {}).forEach((k) => { o[k] = fromFs_(v.mapValue.fields[k]); }); return o; }
  return null;
}
function docOf_(d) {
  const o = { id: d.name.split('/').pop() };
  Object.keys(d.fields || {}).forEach((k) => { o[k] = fromFs_(d.fields[k]); });
  return o;
}
function fsList_(col) {
  let out = [], token = '';
  do {
    const r = fsFetch_(fsBase_() + '/' + col + '?pageSize=300' + (token ? '&pageToken=' + token : ''));
    out = out.concat((r.documents || []).map(docOf_));
    token = r.nextPageToken || '';
  } while (token);
  return out;
}
function fsQuery_(col, field, op, value, limit) {
  const v = typeof value === 'boolean' ? { booleanValue: value } : { stringValue: String(value) };
  const q = { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: op, value: v } } };
  if (limit) { q.orderBy = [{ field: { fieldPath: field }, direction: 'ASCENDING' }]; q.limit = limit; }
  const r = fsFetch_(fsBase_() + ':runQuery', { method: 'post', payload: JSON.stringify({ structuredQuery: q }) });
  return r.filter((x) => x.document).map((x) => docOf_(x.document));
}
function fsSet_(col, id, fields) {
  const mask = Object.keys(fields).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const body = {};
  Object.keys(fields).forEach((k) => {
    const v = fields[k];
    body[k] = v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
  });
  fsFetch_(fsBase_() + '/' + col + '/' + id + '?' + mask, { method: 'patch', payload: JSON.stringify({ fields: body }) });
}
function fsDelete_(col, id) { fsFetch_(fsBase_() + '/' + col + '/' + id, { method: 'delete' }); }

let DEVICES_ = null;
function devicesOf_(uid) {
  if (!DEVICES_) DEVICES_ = fsList_('devices');
  return DEVICES_.filter((d) => d.uid === uid);
}

/** Push на все устройства пользователя (+ Telegram, если указан chat id). */
function notifyUser_(user, title, body, url, tag, badge) {
  let sent = 0;
  devicesOf_(user.id).forEach((d) => {
    const msg = { message: { token: d.token, data: { title: title, body: body || '', url: url || '/', tag: tag || '' }, webpush: { headers: { Urgency: 'high', TTL: '86400' } } } };
    if (badge !== undefined) msg.message.data.badge = String(badge);
    const res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + serviceAccount_().project_id + '/messages:send', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(msg),
      headers: { Authorization: 'Bearer ' + gToken_() }, muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code === 200) sent++;
    else if (code === 404 || /UNREGISTERED|registration-token-not-registered/.test(res.getContentText())) fsDelete_('devices', d.id);
    else Logger.log('FCM %s: %s', code, res.getContentText().slice(0, 200));
  });
  const bot = prop_('TELEGRAM_BOT_TOKEN');
  if (bot && user.telegramChatId) {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + bot + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: user.telegramChatId, text: '<b>' + esc_(title) + '</b>\n' + esc_(body || ''), parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  }
  return sent;
}
const esc_ = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ───────────────────────── планировщик (каждые 5 минут) ───────────────────────── */

function tick_() {
  const nowIso = new Date().toISOString();
  const users = fsList_('users');
  const byId = {};
  users.forEach((u) => { byId[u.id] = u; });
  const everyone = users.map((u) => u.id);

  // 1. Напоминания о задачах
  fsQuery_('tasks', 'remindAt', 'LESS_THAN_OR_EQUAL', nowIso).forEach((t) => {
    if (t.status !== 'done') {
      const to = (t.assignees && t.assignees.length) ? t.assignees : [t.createdBy];
      const when = t.dueTime ? 'Срок: ' + humanDate_(t.dueDate) + ', ' + t.dueTime : 'Срок: ' + humanDate_(t.dueDate);
      to.forEach((uid) => byId[uid] && notifyUser_(byId[uid], '⏰ ' + t.title, when, '/tasks?open=' + t.id, 'task-' + t.id));
    }
    fsSet_('tasks', t.id, { remindAt: null });
  });

  // 2. Напоминания о событиях
  fsQuery_('events', 'remindAt', 'LESS_THAN_OR_EQUAL', nowIso).forEach((e) => {
    const body = (e.allDay ? 'Весь день' : e.start + (e.end ? '–' + e.end : '')) + (e.location ? ' · ' + e.location : '');
    everyone.forEach((uid) => notifyUser_(byId[uid], '🏀 ' + e.title, humanDate_(e.date) + ', ' + body, '/calendar', 'event-' + e.id));
    fsSet_('events', e.id, { remindAt: null });
  });

  // 3. Мгновенные уведомления (назначили задачу, тест)
  fsList_('outbox').forEach((m) => {
    (m.to || []).forEach((uid) => byId[uid] && notifyUser_(byId[uid], m.title, m.body, m.url, ''));
    fsDelete_('outbox', m.id);
  });

  // 4. Утренний список
  const today = ymd_(new Date());
  const hm = Utilities.formatDate(new Date(), TZ, 'HH:mm');
  const due = users.filter((u) => u.digestEnabled !== false && u.lastDigest !== today && hm >= (u.digestTime || '08:30') && minutesBetween_(u.digestTime || '08:30', hm) < 120);
  if (due.length) {
    const tasks = fsQuery_('tasks', 'dueDate', 'LESS_THAN_OR_EQUAL', today).filter((t) => t.status !== 'done');
    const events = fsQuery_('events', 'date', 'EQUAL', today).concat(scheduleFor_(today)).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    let pay = null;
    try { pay = summary_().kpi; } catch (err) { Logger.log(err); }
    due.forEach((u) => {
      const mine = tasks.filter((t) => (t.assignees || []).indexOf(u.id) >= 0);
      const late = mine.filter((t) => t.dueDate < today);
      const now = mine.filter((t) => t.dueDate === today).sort((a, b) => String(a.dueTime || '99').localeCompare(String(b.dueTime || '99')));
      const lines = now.slice(0, 6).map((t) => '• ' + (t.dueTime ? t.dueTime + ' ' : '') + t.title);
      if (now.length > 6) lines.push('…и ещё ' + (now.length - 6));
      if (late.length) lines.push('⚠ Просрочено: ' + late.length);
      events.slice(0, 3).forEach((e) => lines.push('🏀 ' + (e.allDay ? '' : e.start + ' ') + e.title));
      if (pay && pay.unpaid) lines.push('💳 Не оплатили за месяц: ' + pay.unpaid);
      const title = now.length ? 'План на сегодня: ' + now.length + ' ' + plural_(now.length, 'задача', 'задачи', 'задач') : 'Сегодня задач нет — ' + (u.name || '');
      notifyUser_(u, '☀️ ' + title, lines.join('\n') || 'Хорошего дня!', '/', 'digest', now.length + late.length);
      fsSet_('users', u.id, { lastDigest: today });
    });
  }
}

/**
 * Занятия постоянного расписания на дату (правила kind = 'weekly' в events, см. src/lib/schedule.js).
 * Пропускаем отменённые (skip) и те, у которых на эту дату есть своё событие.
 */
function scheduleFor_(date) {
  const wd = Number(Utilities.formatDate(new Date(date + 'T12:00:00'), TZ, 'u'));
  const real = fsQuery_('events', 'date', 'EQUAL', date);
  return fsQuery_('events', 'kind', 'EQUAL', 'weekly').filter((r) => Number(r.weekday) === wd
      && (!r.from || r.from <= date) && (!r.until || r.until >= date) && (r.skip || []).indexOf(date) < 0
      && !real.some((e) => (e.ruleId === r.id && e.ruleDate === date) || (e.type === 'training' && e.group === r.group)))
    .map((r) => ({ title: r.title || 'Тренировка · ' + r.group, start: r.start, end: r.end, allDay: false, date: date }));
}

function minutesBetween_(a, b) {
  const m = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return m(b) - m(a);
}
function plural_(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
function humanDate_(s) {
  if (!s) return '';
  const today = ymd_(new Date());
  const tomorrow = ymd_(new Date(Date.now() + 86400000));
  if (s === today) return 'сегодня';
  if (s === tomorrow) return 'завтра';
  return Utilities.formatDate(parseYmd_(s), TZ, 'dd.MM');
}

/* ───────────────────────── ночной бэкап на Google Диск ───────────────────────── */

const BACKUP_COLLECTIONS = ['users', 'tasks', 'events', 'notes'];
const BACKUP_KEEP_DAYS = 30;

function backupFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('BACKUP_FOLDER_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* папку удалили — создадим заново */ }
  }
  const name = 'APEX Hub — бэкапы';
  const it = DriveApp.getFoldersByName(name);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

/** Выгружает задачи, события, страницы и профили в JSON и удаляет копии старше 30 дней. */
function backup_() {
  const data = { createdAt: new Date().toISOString(), project: serviceAccount_().project_id, version: 1 };
  const counts = {};
  BACKUP_COLLECTIONS.forEach((c) => { data[c] = fsList_(c); counts[c] = data[c].length; });
  const folder = backupFolder_();
  const name = 'apex-backup-' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd_HH-mm') + '.json';
  folder.createFile(name, JSON.stringify(data, null, 1), 'application/json');

  const cutoff = Date.now() - BACKUP_KEEP_DAYS * 86400000;
  let removed = 0;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().indexOf('apex-backup-') === 0 && f.getDateCreated().getTime() < cutoff) { f.setTrashed(true); removed++; }
  }
  Logger.log('Бэкап сохранён: %s. Записей: %s. Удалено старых копий: %s', name, JSON.stringify(counts), removed);
  return { file: name, counts: counts, removed: removed };
}

/* ───────────────────────── виджет ───────────────────────── */

function widget_(key) {
  if (!key || key.length < 20) throw new Error('Нет ключа виджета');
  const user = fsQuery_('users', 'widgetKey', 'EQUAL', key)[0];
  if (!user) throw new Error('Ключ не найден. Создайте новый в настройках приложения.');
  const today = ymd_(new Date());
  const tasks = fsQuery_('tasks', 'dueDate', 'LESS_THAN_OR_EQUAL', today)
    .filter((t) => t.status !== 'done' && (t.assignees || []).indexOf(user.id) >= 0)
    .sort((a, b) => (a.dueDate + (a.dueTime || '99')).localeCompare(b.dueDate + (b.dueTime || '99')));
  const soon = fsQuery_('events', 'date', 'GREATER_THAN_OR_EQUAL', today, 12)
    .filter((e) => e.date > today || e.allDay || (e.end || e.start || '23:59') >= Utilities.formatDate(new Date(), TZ, 'HH:mm'))
    .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  const next = soon[0];
  return {
    name: user.name, date: today,
    late: tasks.filter((t) => t.dueDate < today).length,
    tasks: tasks.slice(0, 8).map((t) => ({ title: t.title, time: t.dueTime || '', late: t.dueDate < today, high: t.priority === 'high' })),
    next: next ? { title: next.title, date: next.date, start: next.start || '', when: humanDate_(next.date) } : null,
  };
}

return {
  doPost: doPost_, doGet: doGet_, setup: setup_, tick: tick_, backup: backup_,
  _test: { summary_: summary_, players_: players_, payRecent_: payRecent_, payAdd_: payAdd_, player_: player_, attGet_: attGet_, attSet_: attSet_, leads_: leads_, leadAdd_: leadAdd_ },
};
})();
