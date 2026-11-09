/**
 * APEX Hub — серверная часть на Google Apps Script (бесплатно).
 *
 * Что делает:
 *  1) Мост «приложение ⇄ Google-таблица клуба»: оплаты, посещаемость, заявки (doPost).
 *  2) Каждые 5 минут (tick): напоминания о задачах и событиях, уведомления о назначениях,
 *     утренний список задач — через Firebase Cloud Messaging (+ Telegram по желанию).
 *  3) Данные для виджета на iPhone (doGet?action=widget&key=…).
 *
 * Настройки — в «Параметры проекта → Свойства скрипта» (Script properties):
 *   FIREBASE_API_KEY        Web API key из Firebase (тот же, что VITE_FIREBASE_API_KEY)
 *   SERVICE_ACCOUNT_JSON    весь JSON сервисного аккаунта Firebase (Project settings → Service accounts → Generate new private key)
 *   ALLOWED_EMAILS          почты трёх кабинетов через запятую
 *   SPREADSHEET_ID          ID таблицы (не нужен, если скрипт создан из самой таблицы: Расширения → Apps Script)
 *   TELEGRAM_BOT_TOKEN      необязательно: токен бота от @BotFather для дублирования уведомлений
 *
 * После вставки кода: выполните функцию setup() один раз (выдаст разрешения и создаст триггер),
 * затем «Начать развертывание → Новое развертывание → Веб-приложение»: запуск от моего имени, доступ «Все».
 */

const TZ = 'Europe/Moscow';
const SHEETS = {
  players: 'Игроки', payments: 'Оплаты', journal: 'Журнал оплат', leads: 'Заявки', lists: 'Справочники',
  leagues: ['Лига u14', 'Лига u16'], attendance: (g) => 'Посещаемость — ' + g,
};

/* ───────────────────────── входные точки ───────────────────────── */

function doPost(e) {
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

function doGet(e) {
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
  payAdd: (b) => withLock_(() => payAdd_(b.pay)),
  attGet: (b) => attGet_(b.group, b.date),
  attSet: (b) => withLock_(() => attSet_(b.group, b.date, b.marks)),
  leads: () => leads_(),
  leadAdd: (b) => withLock_(() => leadAdd_(b.lead)),
  leadUpdate: (b) => withLock_(() => leadUpdate_(b.row, b.patch)),
};

/** Однократная настройка: разрешения + триггер каждые 5 минут. */
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
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

const ymd_ = (d) => Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
const dmy_ = (d) => Utilities.formatDate(d, TZ, 'dd.MM.yyyy');
const thisMonth_ = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
const num_ = (v) => (typeof v === 'number' ? v : Number(String(v).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0);
const asYmd_ = (v) => (v instanceof Date ? ymd_(v) : /^\d{2}\.\d{2}\.\d{4}$/.test(String(v)) ? String(v).split('.').reverse().join('-') : String(v || ''));
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
    id: String(r[0]), fio: String(r[1]).trim(), group: String(r[2]), status: String(r[10] || 'Активен'),
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
      id: r[0], fio: r[1], group: r[2], period: r[3], status: r[4], date: r[5],
      amount: vals[i][6] === '' ? null : num_(vals[i][6]), method: r[7], abonement: r[8], until: r[9],
      daysLeft: r[10] === '' ? null : Number(r[10]), reminder: r[11],
    });
  });
  const players = activePlayers_();
  const active = players.filter((p) => p.status !== 'Пауза' && p.status !== 'Выбыл');
  const month = thisMonth_();
  const jv = sheet_(SHEETS.journal).getDataRange().getValues().slice(1);
  let revenue = 0;
  jv.forEach((r) => {
    const period = r[5] instanceof Date ? Utilities.formatDate(r[5], TZ, 'yyyy-MM') : String(r[2]);
    if (period !== month) return;
    if (r[7] === 'Оплачен') revenue += num_(r[6]);
    if (r[7] === 'Возврат') revenue -= num_(r[6]);
  });
  const leadStatuses = column_(sheet_(SHEETS.leads), 7);
  const league = [];
  SHEETS.leagues.forEach((name) => {
    const sh2 = ss_().getSheetByName(name);
    if (!sh2) return;
    sh2.getDataRange().getValues().slice(1).forEach((r) => {
      const debt = num_(r[22]);
      if (r[0] && debt > 0) league.push({ league: name, fio: String(r[0]), debt: debt });
    });
  });
  return {
    month: month,
    kpi: {
      active: active.length,
      junior: active.filter((p) => p.group === 'Junior').length,
      adults: active.filter((p) => p.group === 'Взрослые').length,
      paused: players.filter((p) => p.status === 'Пауза').length,
      paid: payments.filter((p) => p.status === 'Оплачен').length,
      unpaid: payments.filter((p) => p.status !== 'Оплачен').length,
      revenue: revenue,
      alerts: payments.filter((p) => p.reminder).length,
      newLeads: leadStatuses.filter((s) => s === 'Новая').length,
      trials: leadStatuses.filter((s) => s === 'Пробная назначена').length,
    },
    payments: payments,
    league: league,
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

function payRecent_() {
  const sh = sheet_(SHEETS.journal);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const from = Math.max(2, last - 40);
  const vals = sh.getRange(from, 1, last - from + 1, 11).getValues();
  return vals.filter((r) => r[3]).reverse().slice(0, 15).map((r) => ({
    payId: String(r[0]), id: String(r[1]), fio: String(r[3]), group: String(r[4]),
    date: r[5] instanceof Date ? dmy_(r[5]) : String(r[5]), amount: num_(r[6]), status: String(r[7]),
    method: String(r[8]), abonement: String(r[9]), comment: String(r[10] || ''),
  }));
}

function payAdd_(pay) {
  if (!pay || !pay.fio) throw new Error('Не указан игрок');
  const known = activePlayers_().some((p) => p.fio === String(pay.fio).trim());
  if (!known) throw new Error('Игрока «' + pay.fio + '» нет на листе «Игроки»');
  const sh = sheet_(SHEETS.journal);
  const row = firstEmptyRow_(sh, 4); // колонка D — ФИО; A, B, C, E заполняют формулы
  sh.getRange(row, 4).setValue(String(pay.fio).trim());
  sh.getRange(row, 6, 1, 6).setValues([[
    parseYmd_(pay.date), Number(pay.amount) || 0, pay.status || 'Оплачен', pay.method || 'Перевод', pay.abonement || '', pay.comment || '',
  ]]);
  SpreadsheetApp.flush();
  return { row: row };
}

/* ───────────────────────── Посещаемость ───────────────────────── */

function dateCol_(headers, dateStr) {
  const d = parseYmd_(dateStr);
  for (let c = 3; c < headers.length; c++) {
    const h = headers[c];
    if (h instanceof Date) { if (h.getDate() === d.getDate() && h.getMonth() === d.getMonth()) return c; continue; }
    const m = String(h).trim().match(/^(\d{1,2})\.(\d{1,2})/);
    if (m && Number(m[1]) === d.getDate() && Number(m[2]) === d.getMonth() + 1) return c;
  }
  return -1;
}

function attGet_(group, date) {
  const sh = sheet_(SHEETS.attendance(group));
  const v = sh.getDataRange().getValues();
  const c = dateCol_(v[0], date);
  return {
    exists: c >= 0,
    players: v.slice(1).filter((r) => r[0] && r[1]).map((r) => ({
      id: String(r[0]), fio: String(r[1]), pay: String(r[2] || ''), mark: c >= 0 ? String(r[c] || '') : '',
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

function tick() {
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
    const events = fsQuery_('events', 'date', 'EQUAL', today).sort((a, b) => String(a.start).localeCompare(String(b.start)));
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
