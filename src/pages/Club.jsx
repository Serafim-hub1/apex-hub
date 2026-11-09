import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet, RefreshCw, Plus, ClipboardCheck, UserPlus, Search, CheckCheck, Phone, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { useStore } from '../lib/store';
import { clubCall, clubConfigured, readCache, reminderText, DEFAULT_LISTS, PRICES } from '../lib/club';
import { Modal, ModalHead, Empty, TitleArea, Collapse, useToast } from '../components/ui';
import { todayStr, fmt, humanDay } from '../lib/dates';

const STATUS_ORDER = { 'Не оплачен': 0, 'Разовые': 1, 'Оплачен': 2 };
/** Группы списка абонементов. Важное открыто, остальное свёрнуто (выбор запоминается на устройстве). */
const PAY_SECTIONS = [
  { key: 'unpaid', label: 'Не оплатили', open: true, test: (p) => p.status !== 'Оплачен' && p.status !== 'Разовые' },
  { key: 'soon', label: 'Скоро заканчивается', open: true, test: (p) => p.status === 'Оплачен' && !!p.reminder },
  { key: 'oneoff', label: 'Разовые', open: false, test: (p) => p.status === 'Разовые' },
  { key: 'paid', label: 'Оплатили', open: false, test: (p) => p.status === 'Оплачен' && !p.reminder },
];
const LEADS_CLOSED = ['Клиент', 'Отказ'];

/** Пилюля статуса оплаты: красная — нет оплаты, нейтральная — разовые, зелёная — абонемент. */
export function PayPill({ p }) {
  if (p.status === 'Оплачен') {
    return <span className={`pill ${p.reminder ? 'warn' : 'ok'}`}><span className="pdot" />{p.reminder ? reminderText(p.reminder) : 'Оплачен'}</span>;
  }
  if (p.status === 'Разовые') {
    const o = p.oneOff;
    return <span className="pill"><span className="pdot" />Разовые{o ? ` · ${o.count}` : ''}</span>;
  }
  return <span className="pill bad"><span className="pdot" />{p.status || 'Не оплачен'}</span>;
}

const rub = (n) => (n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('ru-RU')} ₽`);

function useClub(action, payload) {
  const { getIdToken } = useStore();
  const [data, setData] = useState(() => readCache(action)?.data || null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(payload || {});
  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try { setData(await clubCall(action, JSON.parse(key), getIdToken)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }, [action, key, getIdToken]);
  useEffect(() => { load(); }, [load]);
  return { data, err, busy, reload: load, setData };
}

export default function Club() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'payments';
  const setTab = (t) => setParams({ tab: t }, { replace: true });

  if (!clubConfigured()) {
    return (
      <div className="page">
        <div className="page-head"><div className="lead"><span className="eyebrow acc">Google-таблица</span><h1 className="h1">Клуб</h1></div></div>
        <div className="banner"><FileSpreadsheet size={18} /><span className="grow">Таблица ещё не подключена. Опубликуйте Apps Script из папки <b>backend/apps-script</b> и впишите его адрес в <b>VITE_APPS_SCRIPT_URL</b> — инструкция в README.</span></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="lead"><span className="eyebrow acc">Связано с Google-таблицей</span><h1 className="h1">Клуб</h1></div>
        <div className="seg">
          <button className={tab === 'payments' ? 'on' : ''} onClick={() => setTab('payments')}><Wallet size={15} /> Оплаты</button>
          <button className={tab === 'attendance' ? 'on' : ''} onClick={() => setTab('attendance')}><ClipboardCheck size={15} /> Посещения</button>
          <button className={tab === 'leads' ? 'on' : ''} onClick={() => setTab('leads')}><UserPlus size={15} /> Заявки</button>
        </div>
      </div>
      {tab === 'payments' && <Payments openAdd={params.get('add') === '1'} />}
      {tab === 'attendance' && <Attendance />}
      {tab === 'leads' && <Leads />}
    </div>
  );
}

/* ───────────── Оплаты ───────────── */
function Payments({ openAdd }) {
  const sum = useClub('summary');
  const recent = useClub('payRecent');
  const [form, setForm] = useState(openAdd ? {} : null);
  const [g, setG] = useState('');
  const [q, setQ] = useState('');
  const s = sum.data;

  const list = useMemo(() => (s?.payments || []).filter((p) => {
    if (g && p.group !== g) return false;
    if (q && !p.fio.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1) || a.fio.localeCompare(b.fio, 'ru')), [s, g, q]);
  const sections = useMemo(() => PAY_SECTIONS.map((sec) => ({ ...sec, items: list.filter(sec.test) })), [list]);

  const reload = () => { sum.reload(); recent.reload(); };

  return (
    <>
      {sum.err && <div className="banner warn" style={{ marginBottom: 14 }}><AlertTriangle size={18} /><span className="grow">{sum.err}</span><button className="btn sm" onClick={reload}>Повторить</button></div>}
      <div className="kpis">
        <div className="kpi"><b>{s ? s.kpi.active : '—'}</b><span>активных игроков</span></div>
        <div className="kpi hot"><b>{s ? s.kpi.paid : '—'}</b><span>оплатили за {s ? fmt(s.month + '-01', 'LLLL') : 'месяц'}</span></div>
        <div className={`kpi ${s?.kpi.unpaid ? 'bad' : ''}`}><b>{s ? s.kpi.unpaid : '—'}</b><span>не оплатили{s?.kpi.oneOff ? ` · ещё ${s.kpi.oneOff} на разовых` : ''}</span></div>
        <div className="kpi"><b className="num">{s ? `${Math.round(s.kpi.revenue / 100) / 10}к` : '—'}</b><span>₽ выручка месяца</span></div>
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h" style={{ flexWrap: 'wrap' }}>
          <h2 className="h2">Абонементы</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="icon-btn" onClick={reload} aria-label="Обновить" title="Обновить из таблицы"><RefreshCw size={17} className={sum.busy ? 'spin' : ''} /></button>
            <button className="btn primary sm" onClick={() => setForm({})}><Plus size={15} /> Внести оплату</button>
          </div>
        </div>
        <div className="panel-b">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div className="chips">
              <button className={`chip ${!g ? 'on' : ''}`} onClick={() => setG('')}>Все группы</button>
              {DEFAULT_LISTS.groups.map((x) => <button key={x} className={`chip ${g === x ? 'on' : ''}`} onClick={() => setG(g === x ? '' : x)}>{x}</button>)}
            </div>
            <div className="search-box">
              <Search size={15} />
              <input className="input" placeholder="Найти игрока" value={q} onChange={(e) => setQ(e.target.value)} id="pay-search" />
            </div>
          </div>
          {!s && sum.busy && [1, 2, 3, 4].map((i) => <div key={i} className="skel" style={{ margin: '16px 0', width: `${90 - i * 10}%` }} />)}
          {s && list.length === 0 && <Empty>По этому фильтру никого.</Empty>}
          {sections.filter((sec) => sec.items.length > 0).map((sec) => (
            <Collapse key={sec.key} id={`pay-${sec.key}`} title={sec.label} count={sec.items.length} defaultOpen={sec.open} forceOpen={!!q} className={`pay-sec ${sec.key}`}>
              {sec.items.map((p) => (
                <div key={p.id} className="prow" onClick={() => setForm({ fio: p.fio, abonement: p.status === 'Разовые' ? 'Разовая' : p.abonement })} style={{ cursor: 'pointer' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="n">{p.fio}</div>
                    <div className="s">
                      {p.group}
                      {p.status === 'Разовые' && p.oneOff ? ` · разовых в этом месяце: ${p.oneOff.count}, последнее ${p.oneOff.last}` : ''}
                      {p.status === 'Оплачен' && p.abonement ? ` · ${p.abonement}` : ''}
                      {p.status === 'Оплачен' && p.date ? ` · оплата ${p.date}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'grid', justifyItems: 'end', gap: 3 }}>
                    <PayPill p={p} />
                    {p.amount ? <span className="s num">{rub(p.amount)}</span> : null}
                  </div>
                </div>
              ))}
            </Collapse>
          ))}
        </div>
      </section>

      <div className="dash">
        <Collapse id="pay-recent" className="panel" defaultOpen={false} title={<span className="h2">Последние оплаты</span>} count={recent.data?.length}>
          <div className="panel-b">
            {(recent.data || []).length === 0 && <Empty>{recent.busy ? 'Загружаем…' : 'Записей пока нет.'}</Empty>}
            {(recent.data || []).map((r) => (
              <div key={r.payId} className="prow">
                <div style={{ minWidth: 0 }}><div className="n">{r.fio}</div><div className="s">{r.date} · {r.method || '—'} · {r.abonement || '—'}</div></div>
                <div style={{ display: 'grid', justifyItems: 'end' }}><b className="num">{rub(r.amount)}</b><span className="s">{r.status}</span></div>
              </div>
            ))}
          </div>
        </Collapse>
        <Collapse id="pay-league" className="panel" title={<span className="h2">Долги по лиге</span>} count={s?.league?.length}>
          <div className="panel-b">
            {(s?.league || []).length === 0 && <Empty>Долгов нет.</Empty>}
            {(s?.league || []).map((l, i) => (
              <div key={i} className="alert-row"><span className="pill">{l.league}</span><span className="n">{l.fio}</span><b className="num" style={{ color: 'var(--danger)' }}>{rub(l.debt)}</b></div>
            ))}
          </div>
        </Collapse>
      </div>

      {form && <PayForm initial={form} onClose={() => setForm(null)} onSaved={reload} payments={s?.payments || []} />}
    </>
  );
}

const normName = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
/** Цена по умолчанию: у взрослых разовое занятие дороже. Сумму всегда можно поправить вручную. */
const priceFor = (ab, group) => (ab === 'Разовая' && group === 'Взрослые' ? 2600 : PRICES[ab]);

/* Выбор игрока: поиск + список. Обычный <datalist> на iPhone почти не работает, поэтому свой список. */
function PlayerPicker({ players, loading, value, onChange, statusById }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(false);
  const matches = useMemo(() => {
    const n = normName(q);
    return players.filter((p) => !n || normName(p.fio).includes(n)).slice(0, n ? 30 : 100);
  }, [q, players]);

  if (value && !editing) {
    const st = statusById[value.id];
    return (
      <div className="picked">
        <div style={{ minWidth: 0, flex: 1 }}>
          <b>{value.fio}</b>
          <span>{value.group}{st ? ` · ${st.status === 'Разовые' && st.oneOff ? `разовых: ${st.oneOff.count}` : st.status}` : ''}</span>
        </div>
        <button type="button" className="btn sm" onClick={() => { setEditing(true); setQ(''); }}>Сменить</button>
      </div>
    );
  }
  return (
    <div>
      <div className="search-box" style={{ maxWidth: 'none', margin: 0 }}>
        <Search size={15} />
        <input id="pay-fio" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фамилия или имя" autoComplete="off" />
      </div>
      <div className="picker-list" role="listbox" aria-label="Игроки">
        {loading && !players.length && [1, 2, 3].map((i) => <div key={i} className="skel" style={{ margin: 12, width: '60%' }} />)}
        {!loading && !matches.length && <div className="empty" style={{ padding: 14 }}>Никого не нашли</div>}
        {matches.map((p) => {
          const st = statusById[p.id];
          return (
            <button type="button" key={p.id} className="picker-item" role="option" aria-selected={value?.id === p.id}
              onClick={() => { onChange(p); setEditing(false); }}>
              <span className="n">{p.fio}</span>
              <span className="s">{p.group}</span>
              {st && <PayPill p={st} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PayForm({ initial, onClose, onSaved, payments = [] }) {
  const { getIdToken } = useStore();
  const toast = useToast();
  const pl = useClub('players');
  const lists = { ...DEFAULT_LISTS, ...(pl.data?.lists || {}) };
  const players = useMemo(() => (pl.data?.players || []).filter((p) => p.status !== 'Выбыл')
    .sort((a, b) => a.fio.localeCompare(b.fio, 'ru')), [pl.data]);
  const statusById = useMemo(() => Object.fromEntries(payments.map((p) => [p.id, p])), [payments]);
  const startAb = initial.abonement || '2 раза/нед.';
  const [player, setPlayer] = useState(null);
  const [d, setD] = useState({
    date: todayStr(), abonement: startAb, amount: PRICES[startAb] || '',
    method: 'Перевод', status: 'Оплачен', comment: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (p) => setD((x) => ({ ...x, ...p }));

  // Если форму открыли из строки игрока — подставляем его, когда загрузится список.
  useEffect(() => {
    if (player || !initial.fio || !players.length) return;
    const p = players.find((x) => normName(x.fio) === normName(initial.fio));
    if (p) { setPlayer(p); set({ amount: priceFor(d.abonement, p.group) ?? d.amount }); }
  }, [players]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (p) => {
    setPlayer(p);
    const st = statusById[p.id];
    const ab = st?.status === 'Разовые' ? 'Разовая' : d.abonement;
    set({ abonement: ab, amount: priceFor(ab, p.group) ?? d.amount });
  };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await clubCall('payAdd', { pay: { ...d, fio: player.fio, amount: Number(d.amount) } }, getIdToken);
      toast(`Оплата ${player.fio.split(' ')[0]} записана в таблицу`);
      onSaved(); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <ModalHead onClose={onClose}><span className="eyebrow acc">Журнал оплат</span></ModalHead>
      <div className="modal-b">
        <h2 className="h2" style={{ fontSize: 24 }}>Внести оплату</h2>
        <div className="field">
          <span className="lbl">Игрок</span>
          <PlayerPicker players={players} loading={pl.busy} value={player} onChange={pick} statusById={statusById} />
          {pl.err && <span className="err">{pl.err}</span>}
        </div>
        <div className="grid2">
          <div className="field"><label htmlFor="pay-date">{d.abonement === 'Разовая' ? 'Дата занятия' : 'Дата оплаты'}</label><input id="pay-date" type="date" className="input" value={d.date} onChange={(e) => set({ date: e.target.value })} /></div>
          <div className="field">
            <label htmlFor="pay-ab">Абонемент</label>
            <select id="pay-ab" className="select" value={d.abonement} onChange={(e) => set({ abonement: e.target.value, amount: priceFor(e.target.value, player?.group) ?? d.amount })}>
              {lists.abonements.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="pay-sum">Сумма, ₽</label><input id="pay-sum" type="number" inputMode="numeric" className="input" value={d.amount} onChange={(e) => set({ amount: e.target.value })} /></div>
          <div className="field">
            <label htmlFor="pay-method">Способ</label>
            <select id="pay-method" className="select" value={d.method} onChange={(e) => set({ method: e.target.value })}>{lists.payMethods.map((a) => <option key={a}>{a}</option>)}</select>
          </div>
        </div>
        <div className="field">
          <span className="lbl">Статус</span>
          <div className="seg">{lists.payStatuses.map((s) => <button key={s} type="button" className={d.status === s ? 'on' : ''} onClick={() => set({ status: s })}>{s}</button>)}</div>
        </div>
        <div className="field"><label htmlFor="pay-comment">Комментарий</label><input id="pay-comment" className="input" value={d.comment} onChange={(e) => set({ comment: e.target.value })} placeholder="Например: за ноябрь + разовое" /></div>
        {err && <div className="err">{err}</div>}
      </div>
      <div className="modal-f">
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save} disabled={busy || !player || !d.amount}>{busy ? 'Записываем…' : 'Записать в таблицу'}</button>
      </div>
    </Modal>
  );
}

/* ───────────── Посещаемость ───────────── */
function Attendance() {
  const { getIdToken, events } = useStore();
  const toast = useToast();
  const todays = events.filter((e) => e.date === todayStr() && e.type === 'training' && ['Junior', 'Взрослые'].includes(e.group));
  const [group, setGroup] = useState(todays[0]?.group || 'Junior');
  const [date, setDate] = useState(todayStr());
  const att = useClub('attGet', { group, date });
  const [marks, setMarks] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (att.data) setMarks(Object.fromEntries(att.data.players.map((p) => [p.id, p.mark || ''])));
  }, [att.data]);

  const recent = events.filter((e) => e.type === 'training' && e.group === group && e.date <= todayStr()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const present = Object.values(marks).filter((m) => m === '✓').length;
  const changed = att.data && att.data.players.some((p) => (p.mark || '') !== (marks[p.id] || ''));

  const save = async () => {
    setBusy(true);
    try {
      await clubCall('attSet', { group, date, marks }, getIdToken);
      toast(`Посещаемость за ${fmt(date, 'd MMMM')} сохранена`);
      att.reload();
    } catch (e) { toast(e.message, { bad: true }); } finally { setBusy(false); }
  };

  return (
    <section className="panel">
      <div className="panel-h" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="seg">{['Junior', 'Взрослые'].map((g) => <button key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{g}</button>)}</div>
          <input type="date" className="input" style={{ width: 170, height: 36 }} value={date} onChange={(e) => setDate(e.target.value)} id="att-date" aria-label="Дата тренировки" />
        </div>
        <span className="muted num" style={{ fontSize: 13 }}>Пришли: <b style={{ color: 'var(--fg)' }}>{present}</b> из {att.data?.players.length ?? '—'}</span>
      </div>
      <div className="panel-b">
        {recent.length > 0 && (
          <div className="chips" style={{ marginBottom: 10 }}>
            {recent.map((e) => <button key={e.id} className={`chip ${e.date === date ? 'on' : ''}`} onClick={() => setDate(e.date)}>{humanDay(e.date)}</button>)}
          </div>
        )}
        {att.err && <div className="banner warn"><AlertTriangle size={18} /><span className="grow">{att.err}</span></div>}
        {att.busy && !att.data && [1, 2, 3].map((i) => <div key={i} className="skel" style={{ margin: '18px 0', width: '70%' }} />)}
        {att.data && att.data.players.length === 0 && <Empty>В группе нет активных игроков.</Empty>}
        {att.data?.players.map((p) => (
          <div key={p.id} className="att-row">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.fio}</div>
              {p.pay === 'Разовая оплачена' && <span className="pill ok" style={{ marginTop: 3 }}>Разовая оплачена</span>}
              {p.pay === 'Разовые' && <span className="pill" style={{ marginTop: 3 }}>Разовые</span>}
              {p.pay === 'Не оплачен' && <span className="pill bad" style={{ marginTop: 3 }}>Не оплачен</span>}
            </div>
            <div className="att-btns" role="group" aria-label={`Отметка: ${p.fio}`}>
              {[['✓', 'y', 'Был'], ['✕', 'n', 'Не был'], ['У', 'u', 'Уважительная причина']].map(([m, c, title]) => (
                <button key={m} title={title} aria-label={title} className={`${c} ${marks[p.id] === m ? 'on' : ''}`}
                  onClick={() => setMarks((x) => ({ ...x, [p.id]: x[p.id] === m ? '' : m }))}>{m}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {att.data && att.data.players.length > 0 && (
        <div className="modal-f" style={{ borderRadius: '0 0 var(--r-lg) var(--r-lg)', position: 'static' }}>
          <button className="btn ghost" onClick={() => setMarks((x) => Object.fromEntries(Object.keys(x).map((k) => [k, x[k] || '✓'])))}><CheckCheck size={16} /> Остальные были</button>
          <span className="sp" />
          <button className="btn primary" onClick={save} disabled={busy || !changed}>{busy ? 'Сохраняем…' : 'Сохранить в таблицу'}</button>
        </div>
      )}
    </section>
  );
}

/* ───────────── Заявки (воронка) ───────────── */
function Leads() {
  const leads = useClub('leads');
  const [edit, setEdit] = useState(null);
  const statuses = DEFAULT_LISTS.leadStatuses;
  const list = leads.data || [];
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 }}>
        <span className="muted" style={{ fontSize: 13.5 }}>Лист «Заявки». Перевод по статусам сразу пишется в таблицу.</span>
        <button className="btn primary sm" onClick={() => setEdit({})}><Plus size={15} /> Заявка</button>
      </div>
      {leads.err && <div className="banner warn" style={{ marginBottom: 12 }}><AlertTriangle size={18} /><span className="grow">{leads.err}</span></div>}
      <div className="pipeline">
        {statuses.map((s) => {
          const items = list.filter((l) => (l.status || 'Новая') === s);
          return (
            <Collapse key={s} id={`lead-${s}`} className="col lead-col" title={s} count={items.length} defaultOpen={!LEADS_CLOSED.includes(s)}>
              <div className="col-cards">
                {items.map((l) => (
                  <div key={l.row} className="lead-card" onClick={() => setEdit(l)}>
                    <b>{l.fio || 'Без имени'}</b>
                    <span>{[l.group, l.age && `${l.age} лет`, l.source].filter(Boolean).join(' · ')}</span>
                    {l.trialDate && <span className="pill acc" style={{ justifySelf: 'start' }}>Пробная {humanDay(l.trialDate).toLowerCase()}</span>}
                    {l.owner && <span>Ведёт: {l.owner}</span>}
                  </div>
                ))}
              </div>
            </Collapse>
          );
        })}
      </div>
      {edit && <LeadForm lead={edit} onClose={() => setEdit(null)} onSaved={leads.reload} />}
    </>
  );
}

function LeadForm({ lead, onClose, onSaved }) {
  const { getIdToken, profile } = useStore();
  const toast = useToast();
  const isNew = !lead.row;
  const [d, setD] = useState({ date: todayStr(), fio: '', group: 'Junior', age: '', phone: '', source: 'Instagram', status: 'Новая', trialDate: '', owner: profile?.name || '', comment: '', ...lead });
  const [busy, setBusy] = useState(false);
  const set = (p) => setD((x) => ({ ...x, ...p }));
  const L = DEFAULT_LISTS;
  const save = async () => {
    setBusy(true);
    try {
      if (isNew) await clubCall('leadAdd', { lead: d }, getIdToken);
      else await clubCall('leadUpdate', { row: lead.row, patch: d }, getIdToken);
      toast(isNew ? 'Заявка добавлена в таблицу' : 'Заявка обновлена');
      onSaved(); onClose();
    } catch (e) { toast(e.message, { bad: true }); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose}>
      <ModalHead onClose={onClose}><span className="eyebrow acc">{isNew ? 'Новая заявка' : 'Заявка'}</span></ModalHead>
      <div className="modal-b">
        <TitleArea placeholder="ФИО" value={d.fio} onChange={(e) => set({ fio: e.target.value.replace(/\n/g, ' ') })} id="lead-fio" />
        <div className="field">
          <span className="lbl">Статус</span>
          <div className="chips">{L.leadStatuses.map((s) => <button key={s} type="button" className={`chip ${d.status === s ? 'on' : ''}`} onClick={() => set({ status: s })}>{s}</button>)}</div>
        </div>
        <div className="grid2">
          <div className="field"><label htmlFor="lead-group">Группа</label><select id="lead-group" className="select" value={d.group} onChange={(e) => set({ group: e.target.value })}>{L.groups.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label htmlFor="lead-age">Возраст</label><input id="lead-age" className="input" inputMode="numeric" value={d.age} onChange={(e) => set({ age: e.target.value })} /></div>
          <div className="field">
            <label htmlFor="lead-phone">Телефон</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input id="lead-phone" className="input" type="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />
              {d.phone && <a className="btn" href={`tel:${d.phone.replace(/[^\d+]/g, '')}`} aria-label="Позвонить"><Phone size={16} /></a>}
            </div>
          </div>
          <div className="field"><label htmlFor="lead-src">Источник</label><select id="lead-src" className="select" value={d.source} onChange={(e) => set({ source: e.target.value })}>{L.sources.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label htmlFor="lead-trial">Дата пробной</label><input id="lead-trial" type="date" className="input" value={d.trialDate || ''} onChange={(e) => set({ trialDate: e.target.value })} /></div>
          <div className="field"><label htmlFor="lead-owner">Ответственный</label><select id="lead-owner" className="select" value={d.owner} onChange={(e) => set({ owner: e.target.value })}><option value="">—</option>{L.owners.map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="lead-comment">Комментарий</label><textarea id="lead-comment" className="textarea" value={d.comment} onChange={(e) => set({ comment: e.target.value })} /></div>
      </div>
      <div className="modal-f">
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save} disabled={busy || !d.fio.trim()}>{busy ? 'Сохраняем…' : isNew ? 'Добавить' : 'Сохранить'}</button>
      </div>
    </Modal>
  );
}
