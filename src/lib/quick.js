// Быстрый ввод задачи обычной фразой:
// «Позвонить в школу 121 завтра в 15:00 @кузьма !» → срок завтра 15:00, исполнитель Кузьма, высокий приоритет.
import { ymd, addDays } from './dates';

const WEEKDAYS = [
  [/\b(в\s+)?(пн|понедельник\w*)\b/i, 1], [/\b(во?\s+)?(вт|вторник\w*)\b/i, 2], [/\b(в\s+)?(ср|сред[ау])\b/i, 3],
  [/\b(в\s+)?(чт|четверг\w*)\b/i, 4], [/\b(в\s+)?(пт|пятниц[ау])\b/i, 5], [/\b(в\s+)?(сб|суббот[ау])\b/i, 6],
  [/\b(в\s+)?(вс|воскресень[ея])\b/i, 0],
];

// \b в JS не понимает кириллицу, поэтому границы слов задаём вручную.
const B = '(^|[\\s,.;])';
const E = '(?=$|[\\s,.;!])';
const rx = (s, f = 'i') => new RegExp(B + s + E, f);

export function parseQuick(input, users = []) {
  let text = ` ${input} `;
  const out = { dueDate: null, dueTime: null, priority: null, assignees: [] };
  const now = new Date();
  const cut = (re) => { text = text.replace(re, ' '); };

  // приоритет
  if (/(^|\s)!{1,3}(?=\s|$)/.test(text) || rx('срочно').test(text)) { out.priority = 'high'; cut(/(^|\s)!{1,3}(?=\s|$)/); cut(rx('срочно')); }

  // исполнители: @имя
  text = text.replace(/@([а-яёa-z]+)/gi, (m, name) => {
    const u = users.find((x) => (x.name || '').toLowerCase().startsWith(name.toLowerCase().slice(0, 3)));
    if (u && !out.assignees.includes(u.id)) out.assignees.push(u.id);
    return u ? ' ' : m;
  });

  // время: «в 15:00», «15:30», «в 9»
  // «15:00» — всегда время; «18.30» — время, если это не может быть датой (минуты > 12) или стоит «в».
  let m = text.match(new RegExp(B + '(в\\s+)?([01]?\\d|2[0-3])([:.])([0-5]\\d)' + E, 'i'));
  if (m && m[4] === '.' && !m[2] && Number(m[5]) <= 12) m = null;
  if (m) { out.dueTime = `${m[3].padStart(2, '0')}:${m[5]}`; text = text.replace(m[0], m[1] + ' '); }
  else {
    m = text.match(new RegExp(B + 'в\\s+([01]?\\d|2[0-3])(\\s*час\\w*)?' + E, 'i'));
    if (m) { out.dueTime = `${m[2].padStart(2, '0')}:00`; text = text.replace(m[0], m[1] + ' '); }
  }

  // дата
  const setDays = (n) => { out.dueDate = ymd(addDays(now, n)); };
  if (rx('послезавтра').test(text)) { setDays(2); cut(rx('послезавтра')); }
  else if (rx('завтра').test(text)) { setDays(1); cut(rx('завтра')); }
  else if (rx('сегодня').test(text)) { setDays(0); cut(rx('сегодня')); }
  else if ((m = text.match(new RegExp(B + 'через\\s+(\\d{1,2})\\s+(дн[а-яё]*|день|недел[а-яё]*)' + E, 'i')))) {
    setDays(Number(m[2]) * (/недел/i.test(m[3]) ? 7 : 1)); text = text.replace(m[0], m[1] + ' ');
  } else if ((m = text.match(new RegExp(B + '(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?' + E)))) {
    const day = Number(m[2]); const mon = Number(m[3]) - 1;
    let year = m[4] ? Number(m[4].length === 2 ? '20' + m[4] : m[4]) : now.getFullYear();
    let d = new Date(year, mon, day);
    if (!m[4] && d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(year + 1, mon, day);
    if (d.getDate() === day) { out.dueDate = ymd(d); text = text.replace(m[0], m[1] + ' '); }
  } else {
    for (const [re, dow] of WEEKDAYS) {
      const r2 = new RegExp(B + re.source.replace(/\\b/g, '') + E, 'i');
      const mm = text.match(r2);
      if (mm) {
        let diff = (dow - now.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        setDays(diff);
        text = text.replace(mm[0], mm[1] + ' ');
        break;
      }
    }
  }
  if (out.dueTime && !out.dueDate) out.dueDate = ymd(now);

  out.title = text.replace(/\s+/g, ' ').trim().replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, '');
  out.title = out.title.charAt(0).toUpperCase() + out.title.slice(1);
  return out;
}
