import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { NavLink, Link, Outlet, useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import {
  Sun, CheckSquare, CalendarDays, Trophy, FileText, Settings, Search, Plus, CalendarPlus, FilePlus,
  Wallet, ClipboardCheck, ArrowRight, WifiOff,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { todayStr } from '../lib/dates';
import { EMBED } from '../config';
import { reduced } from './motion';
import { SummitMark, Wordmark } from './Brand';
import { Avatar, ErrorBoundary } from './ui';
import { TaskEditor } from './Tasks';
import { EventEditor } from './EventEditor';

/* ── Открытие редакторов из любого места ── */
const EditorsCtx = createContext(null);
export const useEditors = () => useContext(EditorsCtx);

export function useMyCounts() {
  const { tasks, me } = useStore();
  return useMemo(() => {
    const t = todayStr();
    const mine = tasks.filter((x) => x.status !== 'done' && (x.assignees || []).includes(me));
    return {
      today: mine.filter((x) => x.dueDate && x.dueDate <= t).length,
      open: mine.length,
    };
  }, [tasks, me]);
}

function useAppBadge(count) {
  useEffect(() => {
    try {
      if ('setAppBadge' in navigator) {
        if (count > 0) navigator.setAppBadge(count).catch(() => {});
        else navigator.clearAppBadge().catch(() => {});
      }
    } catch { /* не поддерживается */ }
  }, [count]);
}

const NAV = [
  { to: '/', icon: Sun, label: 'Сегодня', end: true },
  { to: '/tasks', icon: CheckSquare, label: 'Задачи' },
  { to: '/calendar', icon: CalendarDays, label: 'Календарь' },
  { to: '/club', icon: Trophy, label: 'Клуб' },
  { to: '/notes', icon: FileText, label: 'База знаний' },
];
const navIndex = (path) => NAV.findIndex((n) => (n.end ? path === n.to : path.startsWith(n.to)));

/** Плавная смена раздела: ссылки внутри приложения переключаются через View Transitions (где они есть). */
function useRouteTransitions(nav, loc) {
  const path = useRef(loc.pathname);
  path.current = loc.pathname;
  useEffect(() => {
    if (EMBED || !document.startViewTransition || reduced()) return undefined;
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href^="#/"]');
      if (!a || a.target) return;
      const to = a.getAttribute('href').slice(1);
      if (to.split('?')[0] === path.current) return; // тот же раздел — обычное поведение
      e.preventDefault();
      document.startViewTransition(() => flushSync(() => nav(to)));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [nav]);
}

/** Кнопка «+» прячется, пока листаем вниз, чтобы не закрывать содержимое, и возвращается при движении вверх. */
function useFabHidden(pathname) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 10) return;
      setHidden(y > last && y > 80);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);
  return hidden;
}

export default function Layout() {
  const { profile, notes, demo, syncError } = useStore();
  const [task, setTask] = useState(null); // { task, initial }
  const [event, setEvent] = useState(null);
  const [cmd, setCmd] = useState(false);
  const counts = useMyCounts();
  const nav = useNavigate();
  const loc = useLocation();
  const navType = useNavigationType();
  useAppBadge(counts.today);
  useRouteTransitions(nav, loc);
  const fabHidden = useFabHidden(loc.pathname);
  const active = navIndex(loc.pathname);
  // Новый раздел открывается сверху; «назад» оставляет место, где были.
  useLayoutEffect(() => { if (navType !== 'POP') window.scrollTo(0, 0); }, [loc.pathname, navType]);

  const editors = useMemo(() => ({
    openTask: (t, initial) => setTask({ task: t || null, initial }),
    openEvent: (e, initial) => setEvent({ event: e || null, initial }),
    openSearch: () => setCmd(true),
  }), []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd((x) => !x); }
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); editors.openTask(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editors]);

  const pinned = notes.filter((n) => n.pinned && !n.parentId).sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
  const fabAction = () => {
    if (loc.pathname.startsWith('/calendar')) editors.openEvent(null);
    else if (loc.pathname.startsWith('/notes')) nav('/notes?new=1');
    else editors.openTask(null);
  };

  return (
    <EditorsCtx.Provider value={editors}>
      <div className="shell">
        <aside className="sidebar">
          <Link to="/" className="brand"><SummitMark size={30} /><Wordmark sub="Командный центр" /></Link>
          <button className="side-search" onClick={() => setCmd(true)}><Search size={15} /> Поиск и команды <kbd>⌘K</kbd></button>
          <nav className="nav">
            <i className="nav-ind" style={{ '--i': Math.max(active, 0), opacity: active < 0 ? 0 : 1 }} />
            {NAV.map(({ to, icon: Icon, label, end }) => (
              <NavLink key={to} to={to} end={end} className="nav-main">
                <Icon size={17} /> {label}
                {to === '/' && counts.today > 0 && <span className="count hot">{counts.today}</span>}
                {to === '/tasks' && counts.open > 0 && <span className="count">{counts.open}</span>}
              </NavLink>
            ))}
            <div className="nav-sec eyebrow">Создать</div>
            <button className="nav-item" onClick={() => editors.openTask(null)}><Plus size={17} /> Задача <span className="count">N</span></button>
            <button className="nav-item" onClick={() => editors.openEvent(null)}><CalendarPlus size={17} /> Событие</button>
            <button className="nav-item" onClick={() => nav('/notes?new=1')}><FilePlus size={17} /> Страница</button>
            {pinned.length > 0 && <div className="nav-sec eyebrow">Закреплено</div>}
            {pinned.map((n) => (
              <NavLink key={n.id} to={`/notes/${n.id}`} className="nav-note">
                <span className="ico">{n.icon || '📄'}</span><span className="t">{n.title || 'Без названия'}</span>
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            <Avatar user={profile} size="lg" />
            <div className="who">
              <b>{profile?.name || '…'} {demo && <span className="demo-flag">демо</span>}</b>
              <span>{profile?.email}</span>
            </div>
            <NavLink to="/settings" className="icon-btn" aria-label="Настройки"><Settings size={18} /></NavLink>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <Link to="/" className="brand"><SummitMark size={26} /><span className="brand-word">APEX</span></Link>
            {demo && <span className="demo-flag">демо</span>}
            <span className="sp" />
            <button className="icon-btn" onClick={() => setCmd(true)} aria-label="Поиск"><Search size={20} /></button>
            <NavLink to="/settings" aria-label="Профиль и настройки" style={{ display: 'grid' }}><Avatar user={profile} size="lg" /></NavLink>
          </header>
          {syncError && (
            <div className="banner warn" style={{ margin: '12px max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left))' }}>
              <WifiOff size={18} /><span className="grow">{syncError}</span>
            </div>
          )}
          {/* key по адресу — при переходе между разделами страница заново проигрывает вход */}
          <div className="route" key={loc.pathname}><ErrorBoundary><Outlet /></ErrorBoundary></div>
        </div>

        <nav className="tabbar" aria-label="Разделы">
          <i className="tab-ind" style={{ '--i': Math.max(active, 0), opacity: active < 0 ? 0 : 1 }} />
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={22} />
              <span>{label === 'База знаний' ? 'Заметки' : label}</span>
              {to === '/' && counts.today > 0 && <span className="dot">{counts.today}</span>}
            </NavLink>
          ))}
        </nav>
        {!loc.pathname.startsWith('/settings') && (
          <button className={`fab ${fabHidden ? 'hide' : ''}`} onClick={fabAction} aria-label="Создать"><Plus size={26} /></button>
        )}
      </div>

      {task && <TaskEditor key={task.task?.id || 'new'} task={task.task} initial={task.initial} onClose={() => setTask(null)} />}
      {event && <EventEditor key={event.event?.id || 'new'} event={event.event} initial={event.initial} onClose={() => setEvent(null)} />}
      {cmd && <CommandPalette onClose={() => setCmd(false)} />}
    </EditorsCtx.Provider>
  );
}

/* ── Палитра команд (⌘K): поиск по задачам, событиям, страницам и быстрые действия ── */
function CommandPalette({ onClose }) {
  const { tasks, events, notes } = useStore();
  const editors = useEditors();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const acts = [
      { sec: 'Действия', icon: Plus, label: 'Новая задача', k: 'N', run: () => editors.openTask(null) },
      { sec: 'Действия', icon: CalendarPlus, label: 'Новое событие', run: () => editors.openEvent(null) },
      { sec: 'Действия', icon: FilePlus, label: 'Новая страница', run: () => nav('/notes?new=1') },
      { sec: 'Действия', icon: Wallet, label: 'Внести оплату', run: () => nav('/club?tab=payments&add=1') },
      { sec: 'Действия', icon: ClipboardCheck, label: 'Отметить посещаемость', run: () => nav('/club?tab=attendance') },
      ...NAV.map((n) => ({ sec: 'Перейти', icon: n.icon, label: n.label, run: () => nav(n.to) })),
      { sec: 'Перейти', icon: Settings, label: 'Настройки и уведомления', run: () => nav('/settings') },
    ].filter((a) => !s || a.label.toLowerCase().includes(s));
    if (!s) return acts;
    const found = [
      ...tasks.filter((t) => (t.title || '').toLowerCase().includes(s) || (t.notes || '').toLowerCase().includes(s)).slice(0, 8)
        .map((t) => ({ sec: 'Задачи', icon: CheckSquare, label: t.title, sub: t.status === 'done' ? 'готово' : '', run: () => editors.openTask(t) })),
      ...events.filter((e) => (e.title || '').toLowerCase().includes(s)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6)
        .map((e) => ({ sec: 'События', icon: CalendarDays, label: e.title, sub: e.date.split('-').reverse().join('.'), run: () => editors.openEvent(e) })),
      ...notes.filter((n) => (n.title || '').toLowerCase().includes(s) || (n.content || '').toLowerCase().includes(s)).slice(0, 6)
        .map((n) => ({ sec: 'Страницы', icon: FileText, label: `${n.icon || ''} ${n.title || 'Без названия'}`, run: () => nav(`/notes/${n.id}`) })),
    ];
    return [...found, ...acts];
  }, [q, tasks, events, notes, editors, nav]);

  useEffect(() => setI(0), [q]);
  const run = (it) => { onClose(); setTimeout(it.run, 0); };

  let lastSec = '';
  return (
    <div className="overlay" style={{ alignItems: 'flex-start' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Поиск и команды">
      <div className="cmd-in">
        <Search size={18} className="muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти задачу, событие, страницу…" id="cmd-input"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, items.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
            if (e.key === 'Enter' && items[i]) run(items[i]);
            if (e.key === 'Escape') onClose();
          }} />
      </div>
      <div className="cmd-list">
        {items.length === 0 && <div className="empty">Ничего не нашлось</div>}
        {items.map((it, idx) => {
          const head = it.sec !== lastSec ? <div className="cmd-sec eyebrow">{it.sec}</div> : null;
          lastSec = it.sec;
          const Icon = it.icon;
          return (
            <div key={idx}>
              {head}
              <div className={`cmd-item ${idx === i ? 'on' : ''}`} onMouseEnter={() => setI(idx)} onClick={() => run(it)}>
                <Icon size={16} className="muted" /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                {it.sub && <span className="k">{it.sub}</span>}
                {it.k && <span className="k">{it.k}</span>}
                {idx === i && !it.k && !it.sub && <ArrowRight size={14} className="k" />}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
