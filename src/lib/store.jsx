import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { DEMO, TEAM } from '../config';
import { computeRemindAt, ymd, addDays, parseYmd, todayStr } from './dates';
import { DEFAULT_SCHEDULE, DEFAULT_LOCATION, expandSchedule, isRule, yesterdayStr } from './schedule';
import { reloadOnce } from './reload';

const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);

async function loadBackend() {
  // Условие написано прямо на import.meta.env, чтобы в демо-сборке Firebase вообще не попадал в бандл.
  if (import.meta.env.VITE_FORCE_DEMO === '1' || !import.meta.env.VITE_FIREBASE_API_KEY) {
    const m = await import('./backend/demo');
    return m.createDemoBackend();
  }
  const m = await import('./backend/firebase');
  return m.createFirebaseBackend();
}

const nowIso = () => new Date().toISOString();

export function StoreProvider({ children }) {
  const [backend, setBackend] = useState(null);
  const [auth, setAuth] = useState({ status: 'loading', user: null });
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [ready, setReady] = useState({ tasks: false, events: false, notes: false, users: false });
  const [syncError, setSyncError] = useState(null);
  const [eventsFromServer, setEventsFromServer] = useState(false);
  const profileEnsured = useRef(false);
  const scheduleSeeded = useRef(false);

  useEffect(() => {
    let unsub = () => {};
    loadBackend().then((b) => {
      setBackend(b);
      unsub = b.onAuth((u) => setAuth({ status: u ? 'in' : 'out', user: u }));
    }).catch((e) => {
      console.error(e);
      if (reloadOnce()) return; // старая версия не нашла свой модуль после выкладки — берём новую
      setAuth({ status: 'error', user: null, error: e.message });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!backend || auth.status !== 'in') return undefined;
    const mark = (k) => setReady((r) => (r[k] ? r : { ...r, [k]: true }));
    const onErr = (e) => setSyncError(e?.code === 'permission-denied'
      ? 'Нет доступа к данным. Проверьте, что ваша почта есть в правилах Firestore.'
      : 'Нет связи с базой. Изменения сохранятся и отправятся, когда появится интернет.');
    const subs = [
      backend.listen('users', (l) => { setUsers(l); mark('users'); }, onErr),
      backend.listen('tasks', (l) => { setTasks(l); mark('tasks'); }, onErr),
      backend.listen('events', (l, meta) => { setEvents(l); mark('events'); if (!meta?.fromCache) setEventsFromServer(true); }, onErr),
      backend.listen('notes', (l) => { setNotes(l); mark('notes'); }, onErr),
    ];
    return () => subs.forEach((u) => u && u());
  }, [backend, auth.status]);

  // Создаём профиль при первом входе.
  useEffect(() => {
    if (!backend || auth.status !== 'in' || !ready.users || profileEnsured.current) return;
    profileEnsured.current = true;
    const { uid, email } = auth.user;
    if (users.some((u) => u.id === uid)) return;
    const t = TEAM.find((x) => x.email === email) || { name: email.split('@')[0], color: '#58D6FF' };
    backend.set('users', uid, {
      name: t.name, email, color: t.color, role: 'admin',
      digestEnabled: true, digestTime: '08:30', defaultReminder: 60, createdAt: nowIso(),
    });
  }, [backend, auth, ready.users, users]);

  // Правила постоянного расписания живут в events без даты; наружу отдаём обычные события + развёрнутые занятия.
  const { rules, allEvents } = useMemo(() => {
    const r = events.filter(isRule);
    const real = events.filter((e) => !isRule(e));
    return { rules: r, allEvents: [...real, ...expandSchedule(r, real)] };
  }, [events]);

  // Первый запуск: записываем стандартное расписание. Только по ответу сервера (не по пустому кэшу), id фиксированные.
  useEffect(() => {
    if (!backend || auth.status !== 'in' || !eventsFromServer || rules.length || scheduleSeeded.current) return;
    scheduleSeeded.current = true;
    DEFAULT_SCHEDULE.forEach(({ id, ...slot }) => backend.set('events', id, { ...slot, createdAt: nowIso() }));
  }, [backend, auth.status, eventsFromServer, rules.length]);

  const me = auth.user?.uid;
  const profile = users.find((u) => u.id === me) || null;
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  const notify = useCallback(async (to, title, body, url) => {
    const recipients = (to || []).filter((x) => x && x !== me);
    if (!backend || !recipients.length) return;
    try {
      await backend.add('outbox', { to: recipients, title, body, url: url || '/', from: me, createdAt: nowIso(), sent: false });
    } catch (e) { console.warn('outbox', e); }
  }, [backend, me]);

  const actions = useMemo(() => {
    if (!backend) return {};
    const myName = () => userById[me]?.name || 'Коллега';

    const withReminder = (t) => ({
      ...t,
      remindAt: t.status === 'done' ? null : computeRemindAt(t.dueDate, t.dueTime, t.remind),
    });

    return {
      signIn: (e, p) => backend.signIn(e, p),
      signOut: () => { profileEnsured.current = false; return backend.signOut(); },
      getIdToken: () => backend.getIdToken(),
      enablePush: () => backend.enablePush(me),
      resetDemo: backend.resetDemo,

      async createTask(data) {
        const t = withReminder({
          title: '', notes: '', status: 'todo', priority: 'med', area: 'admin',
          assignees: [me], dueDate: null, dueTime: null, remind: null, checklist: [],
          order: Date.now(), ...data,
          createdBy: me, createdAt: nowIso(), updatedAt: nowIso(),
        });
        const id = await backend.add('tasks', t);
        notify(t.assignees, `Новая задача от ${myName()}`, t.title, `/tasks?open=${id}`);
        return id;
      },
      async updateTask(task, patch) {
        const next = { ...task, ...patch };
        const full = { ...patch, updatedAt: nowIso() };
        if ('dueDate' in patch || 'dueTime' in patch || 'remind' in patch || 'status' in patch) {
          full.remindAt = withReminder(next).remindAt;
        }
        if ('status' in patch) full.doneAt = patch.status === 'done' ? nowIso() : null;
        await backend.update('tasks', task.id, full);
        if (patch.assignees) {
          const added = patch.assignees.filter((x) => !(task.assignees || []).includes(x));
          notify(added, `${myName()} добавил вас в задачу`, next.title, `/tasks?open=${task.id}`);
        }
      },
      deleteTask: (id) => backend.remove('tasks', id),

      /** repeat: 0 — без повтора, 7 — каждую неделю, 14 — раз в две недели; until — 'yyyy-MM-dd'. */
      async createEvent(data, { repeat = 0, until = null } = {}) {
        const base = {
          title: '', type: 'other', notes: '', location: '', group: '', allDay: false,
          start: null, end: null, remind: 60, ...data, createdBy: me, createdAt: nowIso(),
        };
        if (!repeat || !until) {
          return backend.add('events', { ...base, remindAt: computeRemindAt(base.date, base.allDay ? null : base.start, base.remind) });
        }
        const seriesId = 'S' + Date.now().toString(36);
        const items = [];
        for (let d = parseYmd(base.date); ymd(d) <= until && items.length < 120; d = addDays(d, repeat)) {
          const date = ymd(d);
          items.push({ ...base, date, seriesId, remindAt: computeRemindAt(date, base.allDay ? null : base.start, base.remind) });
        }
        return backend.addMany('events', items);
      },
      async updateEvent(ev, patch, { series = false } = {}) {
        // Занятие из расписания: правка создаёт отдельное событие на эту дату, само расписание не меняется.
        if (ev.virtual) {
          const { id, virtual, ...base } = ev; // eslint-disable-line no-unused-vars
          const n = { ...base, ...patch };
          return backend.add('events', { ...n, createdBy: me, createdAt: nowIso(), remindAt: computeRemindAt(n.date, n.allDay ? null : n.start, n.remind) });
        }
        const apply = (e) => {
          const n = { ...e, ...patch, date: series ? e.date : (patch.date ?? e.date) };
          return { ...patch, date: n.date, remindAt: computeRemindAt(n.date, n.allDay ? null : n.start, n.remind) };
        };
        if (series && ev.seriesId) {
          const list = events.filter((e) => e.seriesId === ev.seriesId && e.date >= ev.date);
          await Promise.all(list.map((e) => backend.update('events', e.id, apply(e))));
        } else {
          await backend.update('events', ev.id, apply(ev));
        }
      },
      async deleteEvent(ev, { series = false } = {}) {
        // Отмена занятия из расписания на одну дату — дата попадает в skip правила.
        if (ev.ruleId && ev.ruleDate) {
          const rule = events.find((r) => r.id === ev.ruleId);
          if (rule) await backend.update('events', rule.id, { skip: [...new Set([...(rule.skip || []), ev.ruleDate])] });
          if (ev.virtual) return undefined;
        }
        if (series && ev.seriesId) {
          const ids = events.filter((e) => e.seriesId === ev.seriesId && e.date >= ev.date).map((e) => e.id);
          return backend.removeMany('events', ids);
        }
        return backend.remove('events', ev.id);
      },

      /** Правка слота расписания. Прошедшие занятия сохраняют старое время: старый слот закрывается вчерашним днём. */
      async saveScheduleSlot(old, data) {
        const t = todayStr();
        const clean = {
          kind: 'weekly', type: 'training', weekday: Number(data.weekday), start: data.start, end: data.end,
          group: data.group, title: `Тренировка · ${data.group}`, location: data.location || old?.location || DEFAULT_LOCATION,
          until: null, updatedAt: nowIso(), updatedBy: me,
        };
        if (old && (!old.from || old.from >= t)) return backend.update('events', old.id, clean);
        if (old) await backend.update('events', old.id, { until: yesterdayStr(), updatedAt: nowIso(), updatedBy: me });
        return backend.add('events', { ...clean, from: t, skip: (old?.skip || []).filter((d) => d >= t), createdAt: nowIso(), createdBy: me });
      },
      async removeScheduleSlot(old) {
        if (old.from && old.from >= todayStr()) return backend.remove('events', old.id);
        return backend.update('events', old.id, { until: yesterdayStr(), updatedAt: nowIso(), updatedBy: me });
      },

      async createNote(data = {}) {
        return backend.add('notes', {
          title: '', icon: '📄', content: '', parentId: null, pinned: false,
          ...data, createdAt: nowIso(), updatedAt: nowIso(), updatedBy: me,
        });
      },
      updateNote: (id, patch) => backend.update('notes', id, { ...patch, updatedAt: nowIso(), updatedBy: me }),
      async deleteNote(id) {
        const ids = [id];
        for (let i = 0; i < ids.length; i++) notes.filter((n) => n.parentId === ids[i]).forEach((n) => ids.push(n.id));
        return backend.removeMany('notes', ids);
      },

      updateProfile: (patch) => backend.set('users', me, patch),
      sendTestPush: () => backend.add('outbox', {
        to: [me], title: 'APEX: проверка связи', body: 'Push-уведомления на этом устройстве работают.', url: '/',
        from: me, createdAt: nowIso(), sent: false,
      }),
    };
  }, [backend, me, userById, events, notes, notify]);

  const value = {
    demo: DEMO,
    mode: backend?.mode,
    auth, me, profile, users, userById,
    tasks, events: allEvents, schedule: rules, notes,
    loaded: ready.tasks && ready.events && ready.notes,
    syncError,
    ...actions,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
