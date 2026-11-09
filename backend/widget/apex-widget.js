// APEX — виджет «Сегодня» для iPhone (приложение Scriptable, бесплатно в App Store).
// 1) Вставьте ниже ссылку из «Настройки → Виджет на экран» в приложении APEX.
// 2) Добавьте на экран «Домой» виджет Scriptable (маленький или средний) и выберите этот скрипт.
const URL_WIDGET = 'https://script.google.com/macros/s/ВАШ_ID/exec?action=widget&key=ВАШ_КЛЮЧ';
// Адрес самого приложения — откроется по нажатию на виджет.
const APP_URL = 'https://ВАШ-ЛОГИН.github.io/apex-hub/';

const C = { bg: new Color('#111315'), fg: new Color('#F5F6F4'), muted: new Color('#8B9198'), ice: new Color('#58D6FF'), red: new Color('#FF6B6B') };

async function load() {
  try {
    const r = new Request(URL_WIDGET);
    r.timeoutInterval = 20;
    const j = await r.loadJSON();
    if (!j.ok) throw new Error(j.error);
    Keychain.set('apex-widget-cache', JSON.stringify(j.data));
    return j.data;
  } catch (e) {
    if (Keychain.contains('apex-widget-cache')) return { ...JSON.parse(Keychain.get('apex-widget-cache')), stale: true };
    return { error: String(e.message || e) };
  }
}

function text(stack, s, size, color, weight = 'regular') {
  const t = stack.addText(s);
  t.font = weight === 'bold' ? Font.boldSystemFont(size) : weight === 'semibold' ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  return t;
}

async function build(d) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.url = APP_URL;
  w.setPadding(14, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const family = config.widgetFamily || 'medium';
  const max = family === 'small' ? 3 : family === 'large' ? 9 : 4;

  const head = w.addStack();
  head.centerAlignContent();
  text(head, '▲ APEX', 13, C.ice, 'bold');
  head.addSpacer();
  if (d.tasks) text(head, `${d.tasks.length} ${d.late ? `· ${d.late} просроч.` : 'на сегодня'}`, 11, d.late ? C.red : C.muted, 'semibold');
  w.addSpacer(8);

  if (d.error) {
    text(w, 'Не удалось загрузить', 13, C.fg, 'semibold');
    const e = text(w, d.error, 11, C.muted); e.lineLimit = 3;
    return w;
  }
  if (!d.tasks.length) text(w, 'Задач на сегодня нет', 14, C.fg, 'semibold');
  d.tasks.slice(0, max).forEach((t) => {
    const row = w.addStack();
    row.centerAlignContent();
    text(row, t.high ? '●' : '○', 10, t.late ? C.red : t.high ? C.ice : C.muted);
    row.addSpacer(6);
    if (t.time) { text(row, t.time + ' ', 12, C.muted, 'semibold'); }
    text(row, t.title, 13, t.late ? C.red : C.fg, 'semibold');
    w.addSpacer(4);
  });
  if (d.tasks.length > max) text(w, `и ещё ${d.tasks.length - max}`, 11, C.muted);
  w.addSpacer();
  if (d.next && family !== 'small') {
    const n = w.addStack();
    text(n, '🏀 ', 11, C.fg);
    text(n, `${d.next.when}${d.next.start ? ' ' + d.next.start : ''} · ${d.next.title}`, 11, C.muted, 'semibold');
  }
  if (d.stale) text(w, 'нет связи — показаны старые данные', 9, C.muted);
  return w;
}

const data = await load();
const widget = await build(data);
if (config.runsInWidget) Script.setWidget(widget); else await widget.presentMedium();
Script.complete();
