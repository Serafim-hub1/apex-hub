// Постоянное недельное расписание тренировок.
// Каждое занятие — документ-правило в коллекции events: { kind: 'weekly', weekday, start, end, group, ... } без поля date,
// поэтому старые запросы по дате (утренний список, виджет) его не видят. В календаре правила разворачиваются в занятия на лету.
import { ymd, addDays, todayStr } from './dates';

export const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const DEFAULT_LOCATION = 'Академия Спартак, Большая Тихоновская, 2';

const slot = (id, weekday, group, start, end) => ({
  id, kind: 'weekly', type: 'training', weekday, group, start, end,
  title: `Тренировка · ${group}`, location: DEFAULT_LOCATION, from: '2026-09-01', until: null, skip: [],
});

/** Расписание, с которым клуб стартует. Записывается в базу при первом запуске (id фиксированные — дублей не будет). */
export const DEFAULT_SCHEDULE = [
  slot('sched-junior-mon', 1, 'Junior', '19:30', '20:30'),
  slot('sched-junior-tue', 2, 'Junior', '17:30', '19:00'),
  slot('sched-junior-thu', 4, 'Junior', '18:30', '20:00'),
  slot('sched-adult-tue', 2, 'Взрослые', '20:30', '22:00'),
  slot('sched-adult-fri', 5, 'Взрослые', '21:00', '22:30'),
];

export const isRule = (e) => e?.kind === 'weekly';

/** Понедельник = 1 … воскресенье = 7. */
const isoWeekday = (d) => ((d.getDay() + 6) % 7) + 1;

/**
 * Разворачивает правила в занятия на окно [сегодня − back; сегодня + ahead] дней.
 * Занятие не показывается, если на эту дату есть отмена (skip), своя правка (ruleId + ruleDate)
 * или вручную созданная тренировка той же группы — так старые серии не задвоятся.
 */
export function expandSchedule(rules, real, { back = 200, ahead = 400 } = {}) {
  if (!rules.length) return [];
  const taken = new Set();
  real.forEach((e) => {
    if (e.ruleId && e.ruleDate) taken.add(`${e.ruleId}|${e.ruleDate}`);
    if (e.type === 'training' && e.group && e.date) taken.add(`${e.group}|${e.date}`);
  });
  const today = new Date();
  const from = addDays(today, -back);
  const out = [];
  for (let i = 0; i <= back + ahead; i++) {
    const d = addDays(from, i);
    const date = ymd(d);
    const wd = isoWeekday(d);
    rules.forEach((r) => {
      if (Number(r.weekday) !== wd) return;
      if (r.from && date < r.from) return;
      if (r.until && date > r.until) return;
      if ((r.skip || []).includes(date)) return;
      if (taken.has(`${r.id}|${date}`) || taken.has(`${r.group}|${date}`)) return;
      out.push({
        id: `${r.id}@${date}`, virtual: true, ruleId: r.id, ruleDate: date,
        title: r.title || `Тренировка · ${r.group}`, type: r.type || 'training', group: r.group || '',
        date, start: r.start, end: r.end, allDay: false, location: r.location || '', notes: r.notes || '', remind: null,
      });
    });
  }
  return out;
}

/** Действующие сейчас и будущие правила, по дням недели и времени. */
export function activeRules(rules) {
  const t = todayStr();
  return rules.filter((r) => !r.until || r.until >= t)
    .sort((a, b) => Number(a.weekday) - Number(b.weekday) || String(a.start).localeCompare(String(b.start)));
}

export const yesterdayStr = () => ymd(addDays(new Date(), -1));
