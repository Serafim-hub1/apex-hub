import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, Bell, Users, Repeat, Trash2, Tag, AlignLeft, CalendarClock } from 'lucide-react';
import { useStore } from '../lib/store';
import { EVENT_TYPES, GROUPS, REMINDERS } from '../config';
import { todayStr, ymd, addDays, parseYmd, fmt } from '../lib/dates';
import { Confirm, Modal, ModalHead, TitleArea, useToast } from './ui';

export const typeLabel = (k) => EVENT_TYPES.find((t) => t.key === k)?.label || 'Событие';

export function EventEditor({ event, initial, onClose }) {
  const { createEvent, updateEvent, deleteEvent } = useStore();
  const toast = useToast();
  const isNew = !event;
  const [d, setD] = useState(() => event ? { ...event } : {
    title: '', type: 'training', group: 'Junior', date: todayStr(), allDay: false, start: '18:00', end: '19:30',
    location: 'Академия Спартак, Большая Тихоновская, 2', remind: 60, notes: '', ...initial,
  });
  const [repeat, setRepeat] = useState(0);
  const [until, setUntil] = useState(() => ymd(addDays(parseYmd(initial?.date || todayStr()), 56)));
  const [series, setSeries] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (p) => setD((x) => ({ ...x, ...p }));
  const inSeries = !isNew && event.seriesId;
  const fromSchedule = !isNew && !!event.ruleId;

  const save = async () => {
    if (!d.title.trim()) return;
    const clean = {
      title: d.title.trim(), type: d.type, group: d.group || '', date: d.date, allDay: !!d.allDay,
      start: d.allDay ? null : d.start || null, end: d.allDay ? null : d.end || null,
      location: d.location || '', remind: d.remind, notes: d.notes || '',
    };
    if (isNew) {
      await createEvent(clean, { repeat, until: repeat ? until : null });
      toast(repeat ? 'Серия событий создана' : 'Событие создано');
    } else {
      const { date, ...rest } = clean;
      await updateEvent(event, series ? rest : clean, { series });
      toast(series ? 'Серия обновлена' : fromSchedule ? 'Изменено только это занятие' : 'Событие сохранено');
    }
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <ModalHead onClose={onClose}><span className="eyebrow acc">{isNew ? 'Новое событие' : typeLabel(d.type)}</span></ModalHead>
      <div className="modal-b">
        <TitleArea placeholder="Название события" value={d.title} autoFocus={isNew} id="ev-title"
          onChange={(e) => set({ title: e.target.value.replace(/\n/g, ' ') })} />
        <div className="props">
          <div className="k"><Tag size={15} /> Тип</div>
          <div className="chips">
            {EVENT_TYPES.map((t) => (
              <button key={t.key} type="button" className={`chip ${d.type === t.key ? 'on' : ''}`} onClick={() => set({ type: t.key })}>{t.label}</button>
            ))}
          </div>
          <div className="k"><Users size={15} /> Группа</div>
          <select className="select" value={d.group || ''} onChange={(e) => set({ group: e.target.value })} id="ev-group">
            <option value="">Вся команда</option>
            {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <div className="k"><Calendar size={15} /> Дата</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" className="input" style={{ maxWidth: 180 }} value={d.date} onChange={(e) => set({ date: e.target.value })} id="ev-date"
              disabled={series} />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, color: 'var(--fg-2)' }}>
              <input type="checkbox" checked={!!d.allDay} onChange={(e) => set({ allDay: e.target.checked })} /> Весь день
            </label>
          </div>
          {!d.allDay && (
            <>
              <div className="k"><Clock size={15} /> Время</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="time" className="input" value={d.start || ''} onChange={(e) => set({ start: e.target.value })} id="ev-start" aria-label="Начало" />
                <span className="muted">—</span>
                <input type="time" className="input" value={d.end || ''} onChange={(e) => set({ end: e.target.value })} id="ev-end" aria-label="Конец" />
              </div>
            </>
          )}
          <div className="k"><MapPin size={15} /> Место</div>
          <input className="input" value={d.location || ''} onChange={(e) => set({ location: e.target.value })} placeholder="Зал, адрес или ссылка" id="ev-loc" />
          <div className="k"><Bell size={15} /> Напомнить</div>
          <select className="select" value={d.remind ?? ''} onChange={(e) => set({ remind: e.target.value === '' ? null : Number(e.target.value) })} id="ev-remind">
            {REMINDERS.map((r) => <option key={String(r.v)} value={r.v ?? ''}>{r.label}</option>)}
          </select>
          {isNew && (
            <>
              <div className="k"><Repeat size={15} /> Повтор</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="select" style={{ maxWidth: 200 }} value={repeat} onChange={(e) => setRepeat(Number(e.target.value))} id="ev-repeat">
                  <option value={0}>Не повторять</option>
                  <option value={7}>Каждую неделю</option>
                  <option value={14}>Раз в две недели</option>
                </select>
                {repeat > 0 && (
                  <>
                    <span className="muted" style={{ fontSize: 13 }}>до</span>
                    <input type="date" className="input" style={{ maxWidth: 170 }} value={until} min={d.date} onChange={(e) => setUntil(e.target.value)} id="ev-until" />
                  </>
                )}
              </div>
            </>
          )}
        </div>
        {repeat > 0 && isNew && (
          <div className="muted" style={{ fontSize: 13 }}>
            Каждый {fmt(d.date, 'EEEE')}{repeat === 14 ? ' через неделю' : ''} с {fmt(d.date, 'd MMMM')} по {fmt(until, 'd MMMM')}.
          </div>
        )}
        <div className="field">
          <label htmlFor="ev-notes"><AlignLeft size={13} style={{ verticalAlign: -2 }} /> ЗАМЕТКИ</label>
          <textarea id="ev-notes" className="textarea" placeholder="План тренировки, состав, что взять…" value={d.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
        </div>
        {fromSchedule && (
          <div className="banner">
            <CalendarClock size={18} />
            <span className="grow">
              Занятие из постоянного расписания. Правки и отмена касаются только {fmt(event.ruleDate, 'd MMMM')}.
              {' '}Расписание целиком — в <Link to="/settings#schedule" onClick={onClose}>настройках</Link>.
            </span>
          </div>
        )}
        {inSeries && (
          <label className="banner" style={{ cursor: 'pointer', alignItems: 'center' }}>
            <input type="checkbox" checked={series} onChange={(e) => setSeries(e.target.checked)} />
            <span className="grow">Применить изменения ко всем следующим событиям серии</span>
          </label>
        )}
      </div>
      <div className="modal-f">
        {!isNew && <button className="btn danger" onClick={() => setConfirm(true)}><Trash2 size={16} /> {fromSchedule ? 'Отменить занятие' : 'Удалить'}</button>}
        <span className="sp" />
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save} disabled={!d.title.trim()}>{isNew ? 'Создать' : 'Сохранить'}</button>
      </div>
      {confirm && (
        <Confirm
          title={fromSchedule ? 'Отменить занятие?' : 'Удалить событие?'}
          text={fromSchedule ? `Тренировка ${fmt(event.ruleDate, 'd MMMM')} пропадёт из календаря у всех. Остальные недели не изменятся.`
            : inSeries ? 'Это событие повторяется. Удалить только его или его и все следующие?' : `«${d.title}» исчезнет из календаря у всех.`}
          action={fromSchedule ? 'Отменить занятие' : inSeries ? 'Только это' : 'Удалить'}
          extra={inSeries && (
            <button className="btn" onClick={async () => { await deleteEvent(event, { series: true }); toast('Серия удалена'); onClose(); }}>Это и следующие</button>
          )}
          onNo={() => setConfirm(false)}
          onYes={async () => { await deleteEvent(event); toast(fromSchedule ? 'Занятие отменено' : 'Событие удалено'); onClose(); }}
        />
      )}
    </Modal>
  );
}
