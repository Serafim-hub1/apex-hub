import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, eachDayOfInterval, isSameMonth } from 'date-fns';
import { useStore } from '../lib/store';
import { useEditors } from '../components/Layout';
import { TaskRow } from '../components/Tasks';
import { typeLabel } from '../components/EventEditor';
import { Empty } from '../components/ui';
import { EVENT_TYPES } from '../config';
import { fmt, ymd, todayStr, humanDay } from '../lib/dates';

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function Calendar() {
  const { events, tasks, me } = useStore();
  const { openEvent, openTask } = useEditors();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [sel, setSel] = useState(todayStr());
  const [types, setTypes] = useState(() => new Set([...EVENT_TYPES.map((t) => t.key), 'task']));
  const [onlyMine, setOnlyMine] = useState(false);
  const today = todayStr();

  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  }), [month]);

  const byDay = useMemo(() => {
    const map = {};
    events.forEach((e) => { if (types.has(e.type)) (map[e.date] ||= { ev: [], t: [] }).ev.push(e); });
    if (types.has('task')) {
      tasks.forEach((t) => {
        if (!t.dueDate) return;
        if (onlyMine && !(t.assignees || []).includes(me)) return;
        (map[t.dueDate] ||= { ev: [], t: [] }).t.push(t);
      });
    }
    Object.values(map).forEach((v) => v.ev.sort((a, b) => (a.start || '').localeCompare(b.start || '')));
    return map;
  }, [events, tasks, types, onlyMine, me]);

  const toggle = (k) => setTypes((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const selData = byDay[sel] || { ev: [], t: [] };

  return (
    <div className="page wide">
      <div className="page-head">
        <div className="lead">
          <span className="eyebrow acc">Календарь клуба</span>
          <h1 className="h1">{fmt(month, 'LLLL yyyy')}</h1>
        </div>
        <div className="tools">
          <button className="icon-btn" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Предыдущий месяц"><ChevronLeft size={20} /></button>
          <button className="btn sm" onClick={() => { setMonth(startOfMonth(new Date())); setSel(today); }}>Сегодня</button>
          <button className="icon-btn" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Следующий месяц"><ChevronRight size={20} /></button>
          <button className="btn primary hide-m" onClick={() => openEvent(null, { date: sel })}><Plus size={16} /> Событие</button>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 14, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
        {EVENT_TYPES.map((t) => <button key={t.key} className={`chip ${types.has(t.key) ? 'on' : ''}`} onClick={() => toggle(t.key)}>{t.label}</button>)}
        <button className={`chip ${types.has('task') ? 'on' : ''}`} onClick={() => toggle('task')}>Задачи</button>
        {types.has('task') && <button className={`chip ${onlyMine ? 'on' : ''}`} onClick={() => setOnlyMine(!onlyMine)}>Только мои задачи</button>}
      </div>

      <div className="cal-split">
        <div style={{ minWidth: 0 }}>
          <div className="cal-head">{WD.map((d) => <div key={d}>{d}</div>)}</div>
          <div className="cal" key={ymd(month)}>
            {days.map((d) => {
              const k = ymd(d);
              const data = byDay[k] || { ev: [], t: [] };
              const chips = [...data.ev.map((e) => ({ id: e.id, cls: e.type, text: `${e.start ? e.start + ' ' : ''}${e.title}`, onClick: () => openEvent(e) })),
                ...data.t.map((t) => ({ id: t.id, cls: `task ${t.status === 'done' ? 'done' : ''}`, text: t.title, onClick: () => openTask(t) }))];
              return (
                <div key={k} className={`day ${isSameMonth(d, month) ? '' : 'out'} ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''}`}
                  onClick={() => setSel(k)} onDoubleClick={() => openEvent(null, { date: k })} role="button" aria-label={fmt(d, 'd MMMM')}>
                  <span className="dn">{d.getDate()}</span>
                  {chips.slice(0, 3).map((c) => (
                    <div key={c.id} className={`ev-chip ${c.cls}`} onClick={(e) => { e.stopPropagation(); c.onClick(); }} title={c.text}>{c.text}</div>
                  ))}
                  {chips.length > 3 && <span className="more">ещё {chips.length - 3}</span>}
                  {chips.length > 0 && (
                    <div className="dots">{chips.slice(0, 4).map((c) => <i key={c.id} className={c.cls.split(' ')[0]} />)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="panel">
          <div className="panel-h">
            <div>
              <span className="eyebrow">{humanDay(sel)}</span>
              <h2 className="h2">{fmt(sel, 'd MMMM, EEEE')}</h2>
            </div>
            <button className="btn sm" onClick={() => openEvent(null, { date: sel })}><Plus size={14} /> Событие</button>
          </div>
          <div className="panel-b">
            <div className="agenda">
              {selData.ev.map((e) => (
                <div key={e.id} className="ag-row" onClick={() => openEvent(e)}>
                  <div className="tm">{e.allDay ? 'Весь день' : e.start}<small>{e.end}</small></div>
                  <div className={`bar ${e.type}`} />
                  <div style={{ minWidth: 0 }}>
                    <div className="tt">{e.title}</div>
                    <div className="sub">{typeLabel(e.type)}{e.group ? ` · ${e.group}` : ''}{e.location ? ` · ${e.location}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
            {selData.t.length > 0 && <div className="eyebrow" style={{ margin: '14px 4px 2px' }}>Задачи со сроком</div>}
            <div className="tlist">{selData.t.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} showArea={false} />)}</div>
            {!selData.ev.length && !selData.t.length && (
              <Empty icon={CalendarDays} action={<button className="btn sm" onClick={() => openTask(null, { dueDate: sel })}>Задача на этот день</button>}>
                В этот день ничего не запланировано.
              </Empty>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
