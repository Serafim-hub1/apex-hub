import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, CalendarDays, CheckCircle2, Wallet, ArrowRight, Plus } from 'lucide-react';
import { useStore } from '../lib/store';
import { useEditors } from '../components/Layout';
import { TaskRow, QuickAdd } from '../components/Tasks';
import { typeLabel } from '../components/EventEditor';
import { Avatar, Empty, SkelRows } from '../components/ui';
import { Peak } from '../components/Brand';
import { CountUp, Words } from '../components/motion';
import { todayStr, ymd, addDays, fmt, greeting, humanDay } from '../lib/dates';
import { clubCall, clubConfigured, readCache, reminderText } from '../lib/club';

const timeKey = (t) => (t.dueTime || '99:99');

/** «через 40 мин», «Идёт сейчас», «Завтра», «чт, 12 нояб.» */
function whenLabel(e, today) {
  if (e.date !== today) return humanDay(e.date);
  if (e.allDay || !e.start) return 'Сегодня';
  const [h, m] = e.start.split(':').map(Number);
  const now = new Date();
  const diff = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
  if (diff <= 0) return 'Идёт сейчас';
  if (diff < 60) return `через ${diff} мин`;
  return diff % 60 ? `через ${Math.floor(diff / 60)} ч ${diff % 60} мин` : `через ${diff / 60} ч`;
}

/** Кольцо доли (оплатили / всего). */
function Ring({ value }) {
  const C = 2 * Math.PI * 44;
  return (
    <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle className="ring-t" cx="50" cy="50" r="44" />
      <circle className="ring-v" cx="50" cy="50" r="44" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, Math.max(0, value)))} transform="rotate(-90 50 50)" />
    </svg>
  );
}

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
  const [, setTick] = useState(0); // раз в полминуты пересчитываем «через N мин»
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
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
  // Ближайшая тренировка или игра — для плашки под приветствием (ещё не закончилась сегодня либо в следующие дни).
  const sport = events.filter((e) => (e.type === 'training' || e.type === 'game')
    && (e.date > today || (e.date === today && (e.allDay || (e.end || e.start || '99:99') >= nowHM))))
    .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  const [next, after] = sport;
  const when = next ? whenLabel(next, today) : '';

  const load = useMemo(() => users.map((u) => ({
    u, n: tasks.filter((t) => t.status !== 'done' && (t.assignees || []).includes(u.id)).length,
    late: tasks.filter((t) => t.status !== 'done' && (t.assignees || []).includes(u.id) && t.dueDate && t.dueDate < today).length,
  })), [users, tasks, today]);

  const payAlerts = (club?.payments || []).filter((p) => p.reminder).slice(0, 6);
  const ps = pushState();

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-top">
          <Peak />
          <div className="hero-in">
            <span className="eyebrow acc">{fmt(new Date(), 'EEEE, d MMMM')}</span>
            <h1 className="h1"><Words text={`${greeting()},`} /><br /><em><Words text={profile?.name || 'команда'} delay={160} /></em></h1>
            <i className="rule" />
          </div>
        </div>
      </section>

      <div className="today-top">
        <div className="tiles">
          <div className="tile hot"><b><CountUp value={dueToday.length} /></b><span className="l">на сегодня</span></div>
          <div className={`tile ${overdue.length ? 'bad' : ''}`}><b><CountUp value={overdue.length} /></b><span className="l">просрочено</span></div>
          {clubConfigured() ? (
            <Link to="/club" className="tile pay" aria-label="Оплаты за месяц — открыть «Клуб»">
              <span className="tile-in">
                <b>{club ? <><CountUp value={club.kpi.paid} /><small>/{club.kpi.paid + club.kpi.unpaid}</small></> : <i className="skel num" />}</b>
                <span className="l">оплатили</span>
              </span>
              <Ring value={club ? club.kpi.paid / Math.max(1, club.kpi.paid + club.kpi.unpaid) : 0} />
            </Link>
          ) : (
            <div className="tile"><b><CountUp value={doneToday.length} /></b><span className="l">закрыто</span></div>
          )}
        </div>

        {!loaded && <i className="skel card" style={{ height: 118 }} />}
        {loaded && next && (
          <button type="button" className={`next-card ${next.type}`} onClick={() => openEvent(next)}>
            <span className="nc-top">
              <span className="eyebrow">{next.type === 'game' ? 'Ближайшая игра' : 'Ближайшая тренировка'}</span>
              <span className={`pill acc ${when === 'Идёт сейчас' ? 'live' : ''}`}>{when === 'Идёт сейчас' && <span className="pdot" />}{when}</span>
            </span>
            <span className="nc-main">
              <b className="nc-time num">{next.allDay || !next.start ? '—' : next.start}</b>
              <span className="nc-info">
                <span className="tt">{next.title}</span>
                <span className="sub">{[String(next.location || '').split(',')[0], next.end && `до ${next.end}`].filter(Boolean).join(' · ') || typeLabel(next.type)}</span>
              </span>
            </span>
            {after && (
              <span className="nc-next">
                <span>Затем</span>
                <b className="num">{after.start || '—'}</b>
                <span className="t">{after.title}</span>
                {after.date !== today && <span>{humanDay(after.date).toLowerCase()}</span>}
              </span>
            )}
          </button>
        )}
      </div>

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
                {!loaded && <SkelRows n={3} dot />}
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
                {!loaded && <SkelRows n={2} dot />}
                {loaded && week.length === 0 && <Empty>На ближайшие 7 дней задач нет.</Empty>}
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
                {!loaded && <SkelRows n={2} dense />}
                {loaded && todayEvents.length === 0 && <Empty icon={CalendarDays}>Сегодня без тренировок и встреч.</Empty>}
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
                {!club && <SkelRows n={3} pill dense />}
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
