import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, closestCorners } from '@dnd-kit/core';
import { List, Columns3, Table2, Search, Plus, ListChecks, Inbox } from 'lucide-react';
import { useStore } from '../lib/store';
import { useEditors } from '../components/Layout';
import { TaskRow, TaskCheck, QuickAdd, areaLabel, dueClass } from '../components/Tasks';
import { AvatarStack, Prio, Empty } from '../components/ui';
import { AREAS, STATUSES, PRIORITIES } from '../config';
import { todayStr, ymd, addDays, dueLabel } from '../lib/dates';

const LS = 'apex-tasks-view';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
const PR = { high: 0, med: 1, low: 2 };

function bucket(t, today, weekEnd) {
  if (!t.dueDate) return 'Без срока';
  if (t.dueDate < today) return 'Просрочено';
  if (t.dueDate === today) return 'Сегодня';
  if (t.dueDate === ymd(addDays(new Date(), 1))) return 'Завтра';
  if (t.dueDate <= weekEnd) return 'На этой неделе';
  return 'Позже';
}
const BUCKETS = ['Просрочено', 'Сегодня', 'Завтра', 'На этой неделе', 'Позже', 'Без срока'];

export default function Tasks() {
  const { tasks, users, me, updateTask } = useStore();
  const { openTask } = useEditors();
  const [params, setParams] = useSearchParams();
  const prefs = loadPrefs();
  const [view, setView] = useState(prefs.view || 'list');
  const [who, setWho] = useState(prefs.who || 'me');
  const [area, setArea] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ view, who })); } catch { /* */ } }, [view, who]);

  // Открытие задачи по ссылке из уведомления: #/tasks?open=ID
  useEffect(() => {
    const id = params.get('open');
    if (!id) return;
    const t = tasks.find((x) => x.id === id);
    if (t) { openTask(t); params.delete('open'); setParams(params, { replace: true }); }
  }, [params, tasks, openTask, setParams]);

  const today = todayStr();
  const weekEnd = ymd(addDays(new Date(), 7));
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (who === 'me' && !(t.assignees || []).includes(me)) return false;
      if (who !== 'me' && who !== 'all' && !(t.assignees || []).includes(who)) return false;
      if (area && t.area !== area) return false;
      if (s && !(t.title || '').toLowerCase().includes(s) && !(t.notes || '').toLowerCase().includes(s)) return false;
      return true;
    }).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || (a.dueTime || '99').localeCompare(b.dueTime || '99') || PR[a.priority] - PR[b.priority]);
  }, [tasks, who, me, area, q]);

  const active = filtered.filter((t) => t.status !== 'done');
  const done = filtered.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const quickDefaults = { assignees: who === 'all' ? [me] : who === 'me' ? [me] : [who], area: area || 'admin' };

  return (
    <div className={`page ${view === 'board' ? 'wide' : ''}`}>
      <div className="page-head">
        <div className="lead">
          <span className="eyebrow acc">База задач</span>
          <h1 className="h1">Задачи</h1>
        </div>
        <div className="tools">
          <div className="seg" aria-label="Вид">
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><List size={15} /> Список</button>
            <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}><Columns3 size={15} /> Доска</button>
            <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}><Table2 size={15} /> <span className="hide-m">Таблица</span></button>
          </div>
          <button className="btn primary hide-m" onClick={() => openTask(null, quickDefaults)}><Plus size={16} /> Задача</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="chips">
            <button className={`chip ${who === 'me' ? 'on' : ''}`} onClick={() => setWho('me')}>Мои</button>
            <button className={`chip ${who === 'all' ? 'on' : ''}`} onClick={() => setWho('all')}>Все</button>
            {users.filter((u) => u.id !== me).map((u) => (
              <button key={u.id} className={`chip ${who === u.id ? 'on' : ''}`} onClick={() => setWho(u.id)}>{u.name}</button>
            ))}
          </div>
          <div className="search-box">
            <Search size={15} />
            <input className="input" placeholder="Поиск по задачам" value={q} onChange={(e) => setQ(e.target.value)} id="tasks-search" />
          </div>
        </div>
        <div className="chips" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
          <button className={`chip ${!area ? 'on' : ''}`} onClick={() => setArea('')}>Все направления</button>
          {AREAS.map((a) => (
            <button key={a.key} className={`chip ${area === a.key ? 'on' : ''}`} onClick={() => setArea(area === a.key ? '' : a.key)}>{a.label}</button>
          ))}
        </div>
      </div>

      {view !== 'board' && (
        <div style={{ marginBottom: 14 }}><QuickAdd defaults={quickDefaults} /></div>
      )}

      {view === 'list' && (
        <>
          {active.length === 0 && <Empty icon={Inbox}>Открытых задач нет. Добавьте первую строкой выше.</Empty>}
          {BUCKETS.map((b) => {
            const list = active.filter((t) => bucket(t, today, weekEnd) === b);
            if (!list.length) return null;
            return (
              <section key={b}>
                <div className="group-h"><span className="h2" style={{ fontSize: 16, color: b === 'Просрочено' ? 'var(--danger)' : undefined }}>{b}</span><span className="n">{list.length}</span></div>
                <div className="panel" style={{ padding: '2px 8px' }}><div className="tlist">{list.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}</div></div>
              </section>
            );
          })}
        </>
      )}

      {view === 'table' && <TaskTable list={showDone ? [...active, ...done] : active} onOpen={openTask} updateTask={updateTask} />}
      {view === 'board' && <Board list={filtered} onOpen={openTask} updateTask={updateTask} defaults={quickDefaults} />}

      {view !== 'board' && done.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button className="btn ghost sm" onClick={() => setShowDone(!showDone)}>
            {showDone ? 'Скрыть выполненные' : `Показать выполненные · ${done.length}`}
          </button>
          {showDone && view === 'list' && (
            <div className="panel" style={{ padding: '2px 8px', marginTop: 8 }}>
              <div className="tlist">{done.slice(0, 50).map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskTable({ list, onOpen, updateTask }) {
  const { users } = useStore();
  if (!list.length) return <Empty icon={Inbox}>Задач по этим фильтрам нет.</Empty>;
  return (
    <div className="table-wrap">
      <table className="db">
        <thead>
          <tr><th>Задача</th><th>Статус</th><th>Исполнители</th><th>Срок</th><th>Приоритет</th><th>Направление</th></tr>
        </thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.id}>
              <td><div className="cell-title" onClick={() => onOpen(t)}><TaskCheck task={t} /><span style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'var(--muted)' : undefined }}>{t.title}</span></div></td>
              <td>
                <select className="inline" value={t.status} onChange={(e) => updateTask(t, { status: e.target.value })} aria-label="Статус">
                  {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </td>
              <td><AvatarStack ids={t.assignees} max={3} /> {users.length === 0 && '—'}</td>
              <td className={`num ${dueClass(t) === 'late' ? 'late' : ''}`} style={{ whiteSpace: 'nowrap', color: dueClass(t) === 'late' ? 'var(--danger)' : undefined }}>{dueLabel(t) || '—'}</td>
              <td>
                <select className="inline" value={t.priority} onChange={(e) => updateTask(t, { priority: e.target.value })} aria-label="Приоритет">
                  {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </td>
              <td className="muted" style={{ whiteSpace: 'nowrap' }}>{areaLabel(t.area)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Канбан с перетаскиванием (мышь и палец) ── */
function Board({ list, onOpen, updateTask, defaults }) {
  const { createTask } = useStore();
  const [dragId, setDragId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
  const cols = STATUSES.map((s) => ({
    ...s,
    items: list.filter((t) => t.status === s.key).sort((a, b) => s.key === 'done' ? (b.doneAt || '').localeCompare(a.doneAt || '') : 0)
      .slice(0, s.key === 'done' ? 30 : 500),
  }));
  const dragTask = list.find((t) => t.id === dragId);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners}
      onDragStart={(e) => setDragId(e.active.id)}
      onDragCancel={() => setDragId(null)}
      onDragEnd={(e) => {
        setDragId(null);
        const t = list.find((x) => x.id === e.active.id);
        const to = e.over?.id;
        if (t && to && t.status !== to) updateTask(t, { status: to });
      }}>
      <div className="board">
        {cols.map((c) => (
          <Column key={c.key} col={c}>
            {c.items.map((t) => <Card key={t.id} task={t} onOpen={onOpen} />)}
            {c.key !== 'done' && <InlineAdd onAdd={(title) => createTask({ ...defaults, title, status: c.key })} />}
          </Column>
        ))}
      </div>
      <DragOverlay>{dragTask ? <CardBody task={dragTask} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ col, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div ref={setNodeRef} className={`col ${isOver ? 'over' : ''}`}>
      <div className="col-h"><span className="h2" style={{ fontSize: 15 }}>{col.label}</span><span className="n">{col.items.length}</span></div>
      {children}
    </div>
  );
}

function Card({ task, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={() => onOpen(task)} className={isDragging ? 'dragging' : ''}>
      <CardBody task={task} />
    </div>
  );
}

function CardBody({ task, overlay }) {
  const cl = task.checklist || [];
  const dc = dueClass(task);
  return (
    <div className={`card ${overlay ? 'overlay' : ''}`}>
      <div className="tt">{task.title}</div>
      <div className="row">
        <span className={dc === 'late' ? 'late' : ''} style={{ color: dc === 'late' ? 'var(--danger)' : dc === 'soon' ? 'var(--accent-text)' : undefined, fontWeight: dc ? 700 : 500 }}>
          {dueLabel(task) || areaLabel(task.area)}
        </span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {cl.length > 0 && <span><ListChecks size={12} style={{ verticalAlign: -1 }} /> {cl.filter((x) => x.done).length}/{cl.length}</span>}
          <Prio p={task.priority} />
          <AvatarStack ids={task.assignees} />
        </span>
      </div>
    </div>
  );
}

function InlineAdd({ onAdd }) {
  const [on, setOn] = useState(false);
  const [v, setV] = useState('');
  if (!on) return <button className="add-inline" onClick={() => setOn(true)}><Plus size={15} /> Добавить</button>;
  return (
    <input className="input" autoFocus value={v} placeholder="Название и Enter" onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (!v.trim()) setOn(false); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); }
        if (e.key === 'Escape') { setV(''); setOn(false); }
      }} />
  );
}
