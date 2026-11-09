import { format, parseISO, isValid, addDays, differenceInCalendarDays } from 'date-fns';
import { ru } from 'date-fns/locale';

export const ymd = (d = new Date()) => format(d, 'yyyy-MM-dd');
export const todayStr = () => ymd(new Date());
export const parseYmd = (s) => (s ? parseISO(s) : null);

export function fmt(d, pattern) {
  const date = typeof d === 'string' ? parseISO(d) : d;
  if (!date || !isValid(date)) return '';
  return format(date, pattern, { locale: ru });
}

/** «Сегодня», «Завтра», «Вчера», «пн, 3 нояб.» */
export function humanDay(dateStr) {
  if (!dateStr) return '';
  const diff = differenceInCalendarDays(parseISO(dateStr), new Date());
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчера';
  const sameYear = dateStr.slice(0, 4) === String(new Date().getFullYear());
  return fmt(dateStr, sameYear ? 'EEEEEE, d MMM' : 'd MMM yyyy');
}

export function dueLabel(task) {
  if (!task.dueDate) return '';
  return humanDay(task.dueDate) + (task.dueTime ? `, ${task.dueTime}` : '');
}

export function daysFromToday(dateStr) {
  if (!dateStr) return null;
  return differenceInCalendarDays(parseISO(dateStr), new Date());
}

/** Момент напоминания в ISO (UTC) или null, если напоминание не нужно или уже в прошлом. */
export function computeRemindAt(dateStr, timeStr, offsetMin) {
  if (!dateStr || offsetMin === null || offsetMin === undefined || offsetMin === '') return null;
  const base = new Date(`${dateStr}T${timeStr || '09:00'}:00`);
  if (!isValid(base)) return null;
  const at = new Date(base.getTime() - Number(offsetMin) * 60000);
  if (at.getTime() < Date.now() - 60000) return null;
  return at.toISOString();
}

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
};

export { addDays, format, parseISO, differenceInCalendarDays };
export const locale = ru;
