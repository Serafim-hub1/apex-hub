const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const VAPID_KEY = env.VITE_FIREBASE_VAPID_KEY || '';
export const APPS_SCRIPT_URL = env.VITE_APPS_SCRIPT_URL || '';

/** Без ключей Firebase приложение работает в демо-режиме: данные живут в браузере. */
export const DEMO = !firebaseConfig.apiKey || env.VITE_FORCE_DEMO === '1';
/** Сборка для превью внутри iframe: без service worker и hash-роутинга. */
export const EMBED = env.VITE_EMBED === '1';

export const TEAM = [
  { key: 'serafim', name: 'Серафим', email: (env.VITE_EMAIL_SERAFIM || 'serafim@apex.demo').toLowerCase(), color: '#58D6FF' },
  { key: 'kuzma', name: 'Кузьма', email: (env.VITE_EMAIL_KUZMA || 'kuzma@apex.demo').toLowerCase(), color: '#F5F6F4' },
  { key: 'anton', name: 'Антон', email: (env.VITE_EMAIL_ANTON || 'anton@apex.demo').toLowerCase(), color: '#A7ADB4' },
];

export const AREAS = [
  { key: 'training', label: 'Тренировки' },
  { key: 'league', label: 'Лига и игры' },
  { key: 'finance', label: 'Финансы' },
  { key: 'marketing', label: 'Маркетинг и SMM' },
  { key: 'schools', label: 'Школы и партнёры' },
  { key: 'admin', label: 'Организация' },
];

export const STATUSES = [
  { key: 'todo', label: 'К выполнению' },
  { key: 'doing', label: 'В работе' },
  { key: 'review', label: 'На проверке' },
  { key: 'done', label: 'Готово' },
];

export const PRIORITIES = [
  { key: 'high', label: 'Высокий' },
  { key: 'med', label: 'Средний' },
  { key: 'low', label: 'Низкий' },
];

export const EVENT_TYPES = [
  { key: 'training', label: 'Тренировка' },
  { key: 'game', label: 'Игра' },
  { key: 'meeting', label: 'Встреча' },
  { key: 'deadline', label: 'Дедлайн' },
  { key: 'other', label: 'Другое' },
];

export const GROUPS = ['Junior', 'Взрослые', 'Лига U15', 'Лига U17'];

/** Варианты напоминаний (минуты до срока). Для задач без времени точка отсчёта — 9:00 дня срока. */
export const REMINDERS = [
  { v: null, label: 'Без напоминания' },
  { v: 0, label: 'В момент срока' },
  { v: 15, label: 'За 15 минут' },
  { v: 60, label: 'За 1 час' },
  { v: 180, label: 'За 3 часа' },
  { v: 1440, label: 'За 1 день' },
  { v: 2880, label: 'За 2 дня' },
];
