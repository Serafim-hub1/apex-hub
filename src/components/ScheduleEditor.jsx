import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { GROUPS } from '../config';
import { WEEKDAYS, WEEKDAYS_SHORT, activeRules } from '../lib/schedule';
import { Confirm, useToast } from './ui';

const BLANK = { weekday: 1, start: '18:00', end: '19:30', group: 'Junior' };

/** Постоянное расписание тренировок: каждую неделю попадает в календарь, «Сегодня» и посещаемость. */
export function ScheduleEditor() {
  const { schedule, saveScheduleSlot, removeScheduleSlot } = useStore();
  const toast = useToast();
  const [edit, setEdit] = useState(null); // { slot|null, d }
  const [del, setDel] = useState(null);
  const list = activeRules(schedule || []);

  const save = async () => {
    const { slot, d } = edit;
    if (!d.start || !d.end || d.end <= d.start) { toast('Конец занятия должен быть позже начала', { bad: true }); return; }
    await saveScheduleSlot(slot, d);
    toast(slot ? 'Расписание обновлено — прошедшие занятия не изменились' : 'Занятие добавлено в расписание');
    setEdit(null);
  };
  const set = (p) => setEdit((x) => ({ ...x, d: { ...x.d, ...p } }));

  const form = edit && (
    <div className="sched-form">
      <select className="select" value={edit.d.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })} aria-label="День недели" id="sch-day">
        {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
      </select>
      <div className="sched-time">
        <input type="time" className="input" value={edit.d.start} onChange={(e) => set({ start: e.target.value })} aria-label="Начало" id="sch-start" />
        <span className="muted">—</span>
        <input type="time" className="input" value={edit.d.end} onChange={(e) => set({ end: e.target.value })} aria-label="Конец" id="sch-end" />
      </div>
      <select className="select" value={edit.d.group} onChange={(e) => set({ group: e.target.value })} aria-label="Группа" id="sch-group">
        {GROUPS.map((g) => <option key={g}>{g}</option>)}
      </select>
      <div className="sched-actions">
        <button className="btn ghost sm" onClick={() => setEdit(null)}>Отмена</button>
        <button className="btn primary sm" onClick={save}>Сохранить</button>
      </div>
    </div>
  );

  return (
    <div className="sched">
      {list.length === 0 && !edit && <div className="muted" style={{ fontSize: 13.5, padding: '6px 2px' }}>Расписание пустое.</div>}
      {list.map((r) => (edit?.slot?.id === r.id ? <div key={r.id}>{form}</div> : (
        <div key={r.id} className="sched-row">
          <span className="sched-day">{WEEKDAYS_SHORT[Number(r.weekday) - 1]}</span>
          <span className="num sched-tm">{r.start}–{r.end}</span>
          <span className="sched-g">{r.group}</span>
          <button className="icon-btn" aria-label="Изменить" onClick={() => setEdit({ slot: r, d: { weekday: Number(r.weekday), start: r.start, end: r.end, group: r.group } })}><Pencil size={15} /></button>
          <button className="icon-btn" aria-label="Убрать из расписания" onClick={() => setDel(r)}><Trash2 size={15} /></button>
        </div>
      )))}
      {edit && !edit.slot && form}
      {!edit && <button className="btn sm" style={{ justifySelf: 'start', marginTop: 6 }} onClick={() => setEdit({ slot: null, d: BLANK })}><Plus size={14} /> Добавить занятие</button>}
      <p className="muted" style={{ fontSize: 12.5, margin: '8px 2px 0' }}>
        Изменения действуют с сегодняшнего дня, прошедшие тренировки остаются как были. Отменить одно занятие (праздник, перенос) можно прямо в календаре.
      </p>
      {del && (
        <Confirm title="Убрать из расписания?" action="Убрать"
          text={`${WEEKDAYS[Number(del.weekday) - 1]}, ${del.start}–${del.end}, ${del.group}: занятия перестанут появляться с сегодняшнего дня. Прошедшие останутся в календаре.`}
          onNo={() => setDel(null)}
          onYes={async () => { await removeScheduleSlot(del); toast('Занятие убрано из расписания'); setDel(null); }} />
      )}
    </div>
  );
}
