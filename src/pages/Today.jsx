import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, CalendarDays, CheckCircle2, Wallet, ArrowRight, Plus } from 'lucide-react';
import { useStore } from '../lib/store';
import { useEditors } from '../components/Layout';
import { TaskRow, QuickAdd } from '../components/Tasks';
import { typeLabel } from '../components/EventEditor';
import { Avatar, Empty } from '../components/ui';
import { Peak, Topo } from '../components/Brand';
import { todayStr, ymd, addDays, fmt, greeting, humanDay } from '../lib/dates';
import { clubCall, clubConfigured, readCache, reminderText } from '../lib/club';

const timeKey = (t) => (t.dueTime || '99:99');

export function pushState() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // granted | denied | default
}

export default function Today() {
  const { tasks, events, me, profile, users, getIdToken, loaded } = useStore();
  const { openTask, openEvent } = useEditors();
  const [scope, setScope] = useState('me');
  const [club, setClub] = useState(() => readCache('summary')?.data || null);
  const today = todayStr();
  const weekEnd = ymd(addDays(new Date(), 7));

  useEffect(() => {
    if (!clubConfigured()) return;
    clubCall('summary', {}, getIdToken).then(setClub).catch(() => {});
  }, [getIdToken]);

  const mineFilter = (t) => scope === 'all' || (t.assignees || []).includes(me);
  const open = tasks.filter((t) => t.status !== 'done' && mineFilter(t));
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueToday = open.filter((t) => t.dueDate === today).sort((a, b) => timeKey(a).localeCompare(timeKey(b)));
  const doneToday = tasks.filter((t) => t.status === 'done' && mineFilter(t) && (t.doneAt || '').slice(0, 10) === today);
  const week = open.filter((t) => t.dueDate > today && t.dueDate <= weekEnd).sort((a, b) => (a.dueDate + timeKey(a)).localeCompare(b.dueDate + timeKey(b)));
  const noDate = open.filter((t) => !t.dueDate && t.priority === 'high');

  const todayEvents = events.filter((e) => e.date === today).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const nextEvents = events.filter((e) => e.date > today && e.date <= ymd(addDays(new Date(), 4)))
    .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''))).slice(0, 5);
  const nowHM = fmt(new Date(), 'HH:mm');

  const load = useMemo(() => users.map((u) => ({
    u, n: tasks.filter((t) => t.status !== 'done' && (t.assignees || []).includes(u.id)).length,
    late: tasks.filter((t) => t.status !== 'done' && (t.assignees || []).includes(u.id) && t.dueDate && t.dueDate < today).length,
  })), [users, tasks, today]);

  const payAlerts = (club?.payments || []).filter((p) => p.reminder).slice(0, 6);
  const ps = pushState();

  return (
    <div className="page">
      <section className="hero">
        <Topo />
        <Peak />
        <div className="hero-in">
          <span className="eyebrow acc">{fmt(new Date(), 'EEEE, d MMMM')}</span>
          <h1 className="h1">{greeting()},<br /><em>{profile?.name || 'команда'}</em></h1>
          <div className="stats">
            <div className="stat hot"><b>{dueToday.length}</b><span>на сегодня</span></div>
            <div className={`stat ${overdue.length ? 'bad' : ''}`}><b>{overdue.length}</b><span>просрочено</span></div>
            <div className="stat"><b>{todayEvents.length}</b><span>{todayEvents.length === 1 ? 'событие' : 'событий'} сегодня</span></div>
            <div className="stat"><b>{doneToday.length}</b><span>закрыто сегодня</span></div>
          </div>
        </div>
      </section>

      {ps === 'default' && (
        <div className="banner" style={{ marginBottom: 16, alignItems: 'center' }}>
          <BellRing size={18} />
          <span className="grow">Включите уведомления — утром придёт список задач на день, а перед сроком — напоминание.</span>
          <Link className="btn sm primary" to="/settings#push">Включить</Link>
        </div>
      )}

      <div className="dash">
        <div className="colm">
          <section className="panel">
            <div className="panel-h">
              <h2 className="h2">Задачи на сегодня</h2>
              <div className="seg" role="tablist">
                <button className={scope === 'me' ? 'on' : ''} onClick={() => setScope('me')}>Мои</button>
                <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>Команда</button>
              </div>
            </div>
            <div className="panel-b">
              <QuickAdd defaults={{ dueDate: today }} placeholder="Добавить на сегодня: «Купить сетки в 18:00 !»" />
              <div className="tlist" style={{ marginTop: 8 }}>
                {!loaded && [1, 2, 3].map((i) => <div key={i} className="skel" style={{ margin: '14px 4px', width: `${80 - i * 12}%` }} />)}
                {overdue.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}
                {dueToday.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}
                {noDate.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}
                {loaded && !overdue.length && !dueToday.length && !noDate.length && (
                  <Empty icon={CheckCircle2}>На сегодня всё чисто. Можно взять что-то из недели.</Empty>
                )}
                {doneToday.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-h">
              <h2 className="h2">Дальше на неделе</h2>
              <Link to="/tasks" className="btn ghost sm">Все задачи <ArrowRight size={14} /></Link>
            </div>
            <div className="panel-b">
              <div className="tlist">
                {week.length === 0 && <Empty>На ближайшие 7 дней задач нет.</Empty>}
                {week.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />)}
              </div>
            </div>
          </section>
        </div>

        <div className="colm">
          <section className="panel">
            <div className="panel-h">
              <h2 className="h2">Расписание</h2>
              <button className="btn ghost sm" onClick={() => openEvent(null, { date: today })}><Plus size={14} /> Событие</button>
            </div>
            <div className="panel-b">
              <div className="agenda">
                {todayEvents.length === 0 && <Empty icon={CalendarDays}>Сегодня без тренировок и встреч.</Empty>}
                {todayEvents.map((e) => (
                  <div key={e.id} className={`ag-row ${e.end && e.end < nowHM ? 'past' : ''}`} onClick={() => openEvent(e)}>
                    <div className="tm">{e.allDay ? 'Весь день' : e.start}<small>{e.end}</small></div>
                    <div className={`bar ${e.type}`} />
                    <div style={{ minWidth: 0 }}>
                      <div className="tt">{e.title}</div>
                      <div className="sub">{typeLabel(e.type)}{e.location ? ` · ${e.location}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
              {nextEvents.length > 0 && (
                <>
                  <div className="eyebrow" style={{ margin: '14px 4px 4px' }}>Ближайшие дни</div>
                  <div className="agenda">
                    {nextEvents.map((e) => (
                      <div key={e.id} className="ag-row" onClick={() => openEvent(e)}>
                        <div className="tm">{e.allDay ? '—' : e.start}<small>{humanDay(e.date)}</small></div>
                        <div className={`bar ${e.type}`} />
                        <div style={{ minWidth: 0 }}><div className="tt">{e.title}</div><div className="sub">{typeLabel(e.type)}</div></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {clubConfigured() && (
            <section className="panel">
              <div className="panel-h">
                <h2 className="h2">Оплаты</h2>
                <Link to="/club" className="btn ghost sm">Клуб <ArrowRight size={14} /></Link>
              </div>
              <div className="panel-b">
                {!club && <div className="skel" style={{ margin: '10px 0', width: '70%' }} />}
                {club && (
                  <div style={{ display: 'flex', gap: 22, marginBottom: 8 }}>
                    <div className="stat"><b className="num">{club.kpi.paid}</b><span>оплатили</span></div>
                    <div className={`stat ${club.kpi.unpaid ? 'bad' : ''}`}><b className="num">{club.kpi.unpaid}</b><span>не оплатили</span></div>
                    <div className="stat"><b className="num">{Math.round((club.kpi.revenue || 0) / 1000)}к</b><span>₽ за месяц</span></div>
                  </div>
                )}
                {payAlerts.map((p) => (
                  <div key={p.id} className="alert-row">
                    <Wallet size={15} className="muted" />
                    <span className="n">{p.fio}</span>
                    <span className={`pill ${p.status === 'Оплачен' ? 'warn' : 'bad'}`}>{reminderText(p.reminder)}</span>
                  </div>
                ))}
                {club && payAlerts.length === 0 && <Empty>Все оплатили, напоминать некому.</Empty>}
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-h"><h2 className="h2">Нагрузка команды</h2></div>
            <div className="panel-b">
              {load.map(({ u, n, late }) => (
                <div key={u.id} className="alert-row">
                  <Avatar user={u} />
                  <span className="n">{u.name}</span>
                  <span className="num muted" style={{ fontSize: 13 }}>{n} в работе</span>
                  {late > 0 && <span className="pill bad">{late} просроч.</span>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
