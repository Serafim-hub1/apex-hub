import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Calendar, Bell, User, Flag, Tag, CircleDot, Trash2, Plus, ListChecks, AlignLeft, Clock } from 'lucide-react';
import { useStore } from '../lib/store';
import { AREAS, PRIORITIES, REMINDERS, STATUSES } from '../config';
import { dueLabel, daysFromToday } from '../lib/dates';
import { parseQuick } from '../lib/quick';
import { Avatar, AvatarStack, Confirm, Modal, ModalHead, Prio, TitleArea, useToast } from './ui';

export const areaLabel = (k) => AREAS.find((a) => a.key === k)?.label || '';
export const statusLabel = (k) => STATUSES.find((a) => a.key === k)?.label || '';

export function dueClass(t) {
  if (!t.dueDate || t.status === 'done') return '';
  const d = daysFromToday(t.dueDate);
  if (d < 0) return 'late';
  if (d === 0 && t.dueTime) {
    const [h, m] = t.dueTime.split(':').map(Number);
    const now = new Date();
    if (h * 60 + m < now.getHours() * 60 + now.getMinutes()) return 'late';
  }
  return d === 0 ? 'soon' : '';
}

export function TaskCheck({ task }) {
  const { updateTask } = useStore();
  const toast = useToast();
  const done = task.status === 'done';
  return (
    <button
      className={`check ${done ? 'on' : ''} ${task.priority === 'high' && !done ? 'high' : ''}`}
      aria-label={done ? 'Вернуть в работу' : 'Отметить выполненной'}
      onClick={(e) => {
        e.stopPropagation();
        const prev = task.status;
        updateTask(task, { status: done ? 'todo' : 'done' });
        if (!done) toast('Задача выполнена', { undo: () => updateTask({ ...task, status: 'done' }, { status: prev }) });
      }}
    >
      <Check size={13} strokeWidth={3.5} />
    </button>
  );
}

export function TaskRow({ task, onOpen, showArea = true }) {
  const cl = task.checklist || [];
  const doneN = cl.filter((c) => c.done).length;
  const dc = dueClass(task);
  return (
    <div className={`trow ${task.status === 'done' ? 'done' : ''}`} onClick={() => onOpen(task)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task); }}>
      <TaskCheck task={task} />
      <div style={{ minWidth: 0 }}>
        <div className="tt">{task.title || 'Без названия'}</div>
        <div className="meta">
          {task.dueDate && <span className={dc}>{dc === 'late' ? 'Просрочено · ' : ''}{dueLabel(task)}</span>}
          {task.status === 'doing' && <span className="pill acc">В работе</span>}
          {task.status === 'review' && <span className="pill">На проверке</span>}
          {showArea && task.area && <span>{areaLabel(task.area)}</span>}
          {cl.length > 0 && <span><ListChecks size={12} style={{ verticalAlign: -1 }} /> {doneN}/{cl.length}</span>}
          {task.remindAt && <Bell size={12} aria-label="Есть напоминание" />}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Prio p={task.priority} />
        <AvatarStack ids={task.assignees} />
      </div>
    </div>
  );
}

/* ── Редактор задачи: новая — по кнопке «Создать», существующая — сохраняется сама ── */
export function TaskEditor({ task, initial, onClose }) {
  const { users, me, createTask, updateTask, deleteTask, profile } = useStore();
  const toast = useToast();
  const isNew = !task;
  const [d, setD] = useState(() => task ? { ...task } : {
    title: '', notes: '', status: 'todo', priority: 'med', area: 'admin', assignees: [me],
    dueDate: null, dueTime: null, remind: profile?.defaultReminder ?? 60, checklist: [], ...initial,
  });
  const [confirm, setConfirm] = useState(false);
  const [newItem, setNewItem] = useState('');
  const titleRef = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => { if (isNew) setTimeout(() => titleRef.current?.focus(), 60); }, [isNew]);

  const dRef = useRef(d);
  const saved = useRef(task ? { ...task } : null); // что уже ушло в базу
  const pending = useRef({});
  const flush = () => {
    clearTimeout(saveTimer.current);
    const patch = pending.current;
    pending.current = {};
    if (isNew || !Object.keys(patch).length) return;
    const base = saved.current;
    saved.current = { ...base, ...patch };
    updateTask(base, patch).catch(() => toast('Не сохранилось — нет связи', { bad: true }));
  };
  const change = (patch, { debounce = false } = {}) => {
    dRef.current = { ...dRef.current, ...patch };
    setD(dRef.current);
    if (isNew) return;
    pending.current = { ...pending.current, ...patch };
    clearTimeout(saveTimer.current);
    if (debounce) saveTimer.current = setTimeout(flush, 600); else flush();
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const submit = async () => {
    if (!d.title.trim()) { titleRef.current?.focus(); return; }
    await createTask({ ...d, title: d.title.trim() });
    toast('Задача создана');
    onClose();
  };

  const toggleWho = (id) => {
    const has = d.assignees.includes(id);
    change({ assignees: has ? d.assignees.filter((x) => x !== id) : [...d.assignees, id] });
  };
  const cl = d.checklist || [];
  const setCl = (next) => change({ checklist: next });

  return (
    <Modal onClose={onClose}>
      <ModalHead onClose={onClose}>
        <span className="eyebrow acc">{isNew ? 'Новая задача' : 'Задача'}</span>
        {!isNew && d.status === 'done' && <span className="pill ok">Готово</span>}
      </ModalHead>
      <div className="modal-b">
        <TitleArea
          ref={titleRef} placeholder="Что нужно сделать?" value={d.title}
          onChange={(e) => change({ title: e.target.value.replace(/\n/g, ' ') }, { debounce: true })}
          onEnter={() => { if (isNew) submit(); }}
          id="task-title"
        />
        <div className="props">
          <div className="k"><CircleDot size={15} /> Статус</div>
          <select className="select" value={d.status} onChange={(e) => change({ status: e.target.value })} id="task-status">
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>

          <div className="k"><User size={15} /> Кто делает</div>
          <div className="who-pick">
            {users.map((u) => (
              <button key={u.id} type="button" className={d.assignees.includes(u.id) ? 'on' : ''} onClick={() => toggleWho(u.id)}>
                <Avatar user={u} /> {u.name}
              </button>
            ))}
          </div>

          <div className="k"><Calendar size={15} /> Срок</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" className="input" value={d.dueDate || ''} onChange={(e) => change({ dueDate: e.target.value || null })} id="task-date" />
            <input type="time" className="input" style={{ maxWidth: 130 }} value={d.dueTime || ''} disabled={!d.dueDate}
              onChange={(e) => change({ dueTime: e.target.value || null })} id="task-time" aria-label="Время" />
          </div>

          <div className="k"><Bell size={15} /> Напомнить</div>
          <select className="select" value={d.remind ?? ''} disabled={!d.dueDate} id="task-remind"
            onChange={(e) => change({ remind: e.target.value === '' ? null : Number(e.target.value) })}>
            {REMINDERS.map((r) => <option key={String(r.v)} value={r.v ?? ''}>{r.label}{!d.dueTime && r.v !== null ? (r.v >= 1440 ? '' : ' (от 9:00)') : ''}</option>)}
          </select>

          <div className="k"><Flag size={15} /> Приоритет</div>
          <div className="seg">
            {PRIORITIES.map((p) => (
              <button key={p.key} type="button" className={d.priority === p.key ? 'on' : ''} onClick={() => change({ priority: p.key })}>
                <Prio p={p.key} /> {p.label}
              </button>
            ))}
          </div>

          <div className="k"><Tag size={15} /> Направление</div>
          <select className="select" value={d.area} onChange={(e) => change({ area: e.target.value })} id="task-area">
            {AREAS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>

        <div className="field">
          <span className="lbl"><ListChecks size={13} style={{ verticalAlign: -2 }} /> ЧЕК-ЛИСТ {cl.length > 0 && `· ${cl.filter((c) => c.done).length}/${cl.length}`}</span>
          {cl.length > 0 && <div className="progress"><i style={{ width: `${(cl.filter((c) => c.done).length / cl.length) * 100}%` }} /></div>}
          <div className="checklist">
            {cl.map((c, i) => (
              <div key={c.id} className={`cl-item ${c.done ? 'done' : ''}`}>
                <button type="button" className={`box ${c.done ? 'on' : ''}`} aria-label="Отметить пункт"
                  onClick={() => setCl(cl.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}><Check size={11} strokeWidth={3.5} /></button>
                <input type="text" value={c.text} aria-label="Пункт чек-листа"
                  onChange={(e) => change({ checklist: cl.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }, { debounce: true })} />
                <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Удалить пункт"
                  onClick={() => setCl(cl.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="cl-item">
              <Plus size={16} style={{ color: 'var(--muted)', marginLeft: 1 }} />
              <input type="text" placeholder="Добавить пункт и нажать Enter" value={newItem} id="task-cl-new"
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItem.trim()) {
                    e.preventDefault();
                    setCl([...cl, { id: Math.random().toString(36).slice(2, 8), text: newItem.trim(), done: false }]);
                    setNewItem('');
                  }
                }} />
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="task-notes"><AlignLeft size={13} style={{ verticalAlign: -2 }} /> ОПИСАНИЕ</label>
          <textarea id="task-notes" className="textarea" placeholder="Детали, ссылки, контакты…" value={d.notes || ''}
            onChange={(e) => change({ notes: e.target.value }, { debounce: true })} />
        </div>
        {!isNew && (
          <div className="muted" style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
            <Clock size={13} /> Изменения сохраняются автоматически
          </div>
        )}
      </div>
      <div className="modal-f">
        {!isNew && <button className="btn danger" onClick={() => setConfirm(true)}><Trash2 size={16} /> Удалить</button>}
        <span className="sp" />
        {isNew ? (
          <>
            <button className="btn ghost" onClick={onClose}>Отмена</button>
            <button className="btn primary" onClick={submit} disabled={!d.title.trim()}>Создать задачу</button>
          </>
        ) : (
          <button className="btn" onClick={onClose}>Готово</button>
        )}
      </div>
      {confirm && (
        <Confirm title="Удалить задачу?" text={`«${d.title}» исчезнет у всей команды.`}
          onNo={() => setConfirm(false)}
          onYes={async () => { pending.current = {}; clearTimeout(saveTimer.current); await deleteTask(task.id); toast('Задача удалена'); onClose(); }} />
      )}
    </Modal>
  );
}

/* ── Строка быстрого добавления с разбором фразы ── */
export function QuickAdd({ defaults = {}, placeholder = 'Новая задача: «Позвонить в школу завтра в 15:00 @кузьма !»', autoFocus = false, onDone }) {
  const { users, createTask, me, profile } = useStore();
  const toast = useToast();
  const [v, setV] = useState('');
  const parsed = useMemo(() => (v.trim() ? parseQuick(v, users) : null), [v, users]);
  const submit = async () => {
    if (!parsed?.title) return;
    await createTask({
      ...defaults,
      title: parsed.title,
      dueDate: parsed.dueDate ?? defaults.dueDate ?? null,
      dueTime: parsed.dueTime ?? null,
      priority: parsed.priority || defaults.priority || 'med',
      assignees: parsed.assignees.length ? parsed.assignees : defaults.assignees || [me],
      remind: parsed.dueDate || defaults.dueDate ? profile?.defaultReminder ?? 60 : null,
    });
    toast('Задача добавлена');
    setV('');
    onDone?.();
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} id="quick-add" aria-label="Быстрая задача" />
        <button className="btn primary" onClick={submit} disabled={!parsed?.title} aria-label="Добавить"><Plus size={18} /></button>
      </div>
      {parsed && (parsed.dueDate || parsed.assignees.length > 0 || parsed.priority) && (
        <div className="chips" style={{ fontSize: 12 }}>
          {parsed.dueDate && <span className="pill acc"><Calendar size={11} /> {dueLabel(parsed)}</span>}
          {parsed.assignees.map((id) => <span key={id} className="pill">{users.find((u) => u.id === id)?.name}</span>)}
          {parsed.priority === 'high' && <span className="pill warn">Высокий приоритет</span>}
        </div>
      )}
    </div>
  );
}
