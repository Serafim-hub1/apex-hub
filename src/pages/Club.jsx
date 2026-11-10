import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Wallet, RefreshCw, Plus, ClipboardCheck, UserPlus, Search, CheckCheck, Phone, FileSpreadsheet, AlertTriangle, Send, Copy } from 'lucide-react';
import { useStore } from '../lib/store';
import { clubCall, clubConfigured, readCache, reminderText, reminderMessage, payContact, phoneDigits, cachedPlayer, loadPlayer, prefetchPlayers, forgetPlayers, DEFAULT_LISTS, PRICES } from '../lib/club';
import { Modal, ModalHead, Empty, TitleArea, Collapse, SkelRows, useToast } from '../components/ui';
import { todayStr, fmt, humanDay } from '../lib/dates';
import { CountUp } from '../components/motion';

const STATUS_ORDER = { 'Не оплачен': 0, 'Оплачен': 2 };
/** Группы списка абонементов. Важное открыто, остальное свёрнуто (выбор запоминается на устройстве).
 *  Разовые — не отдельная группа: это обычные оплаты занятий, статус месяца зависит только от абонемента. */
const PAY_SECTIONS = [
  { key: 'unpaid', label: 'Не оплатили абонемент', open: true, test: (p) => p.status !== 'Оплачен' },
  { key: 'soon', label: 'Скоро заканчивается', open: true, test: (p) => p.status === 'Оплачен' && !!p.reminder },
  { key: 'paid', label: 'Оплатили', open: false, test: (p) => p.status === 'Оплачен' && !p.reminder },
];
const LEADS_CLOSED = ['Клиент', 'Отказ'];
/** Старые ответы скрипта (и кэш) ещё могут прислать статус «Разовые». */
const normPay = (p) => (p.status === 'Разовые' ? { ...p, status: 'Не оплачен' } : p);

const rub = (n) => (n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('ru-RU')} ₽`);

/** Пилюля статуса оплаты: зелёная — абонемент, нейтральная — без абонемента, но платит за разовые, красная — ничего. */
export function PayPill({ p }) {
  if (p.status === 'Оплачен') {
    return <span className={`pill ${p.reminder ? 'warn' : 'ok'}`}><span className="pdot" />{p.reminder ? reminderText(p.reminder) : 'Оплачен'}</span>;
  }
  if (p.oneOff?.sum) {
    return <span className="pill"><span className="pdot" />Разовые · {rub(p.oneOff.sum)}</span>;
  }
  return <span className="pill bad"><span className="pdot" />{p.status || 'Не оплачен'}</span>;
}

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
  const { getIdToken } = useStore();
  const pl = useClub('players'); // телефоны для кнопки «Напомнить» прямо в списке
  const contacts = useMemo(() => Object.fromEntries((pl.data?.players || []).map((x) => [x.id, x])), [pl.data]);
  const [form, setForm] = useState(openAdd ? {} : null);
  const [card, setCard] = useState(null);
  const [g, setG] = useState('');
  const [q, setQ] = useState('');
  const s = sum.data;
  const payments = useMemo(() => (s?.payments || []).map(normPay), [s]);

  const list = useMemo(() => payments.filter((p) => {
    if (g && p.group !== g) return false;
    if (q && !p.fio.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1) || !!a.oneOff - !!b.oneOff || a.fio.localeCompare(b.fio, 'ru')), [payments, g, q]);
  const sections = useMemo(() => PAY_SECTIONS.map((sec) => ({ ...sec, items: list.filter(sec.test) })), [list]);

  const reload = () => { sum.reload(); recent.reload(); };
  const warm = (id) => { loadPlayer(id, getIdToken).catch(() => {}); };
  useEffect(() => {
    const ids = payments.filter((p) => p.status !== 'Оплачен' || p.reminder).slice(0, 6).map((p) => p.id);
    if (ids.length) prefetchPlayers(ids, getIdToken);
  }, [payments, getIdToken]);

  return (
    <>
      {sum.err && <div className="banner warn" style={{ marginBottom: 14 }}><AlertTriangle size={18} /><span className="grow">{sum.err}</span><button className="btn sm" onClick={reload}>Повторить</button></div>}
      <div className="statbar" style={{ marginBottom: 16 }}>
        <div className="stat"><b>{s ? <CountUp value={s.kpi.active} /> : <i className="skel num" />}</b><span>игроков</span></div>
        <div className="stat hot"><b>{s ? <CountUp value={s.kpi.paid} /> : <i className="skel num" />}</b><span>оплатили</span></div>
        <div className={`stat ${s?.kpi.unpaid ? 'bad' : ''}`}><b>{s ? <CountUp value={s.kpi.unpaid} /> : <i className="skel num" />}</b><span>без абонемента</span></div>
        <div className="stat"><b className="num">{s ? <CountUp value={s.kpi.revenue} format={(n) => `${n >= 1e5 ? Math.round(n / 1000) : Math.round(n / 100) / 10}к`} /> : <i className="skel num" />}</b><span>₽ за месяц</span></div>
        {s && (s.kpi.paid + s.kpi.unpaid) > 0 && (
          <div className="meter">
            <div className="meter-h">
              <span>Абонементы за {fmt(s.month + '-01', 'LLLL')}{s.kpi.oneOff ? ` · разово ходят: ${s.kpi.oneOff}` : ''}</span>
              <b className="num">{s.kpi.paid} из {s.kpi.paid + s.kpi.unpaid}</b>
            </div>
            <div className="meter-bar" role="img" aria-label={`Оплатили ${s.kpi.paid} из ${s.kpi.paid + s.kpi.unpaid}`}>
              <i style={{ width: `${Math.round((s.kpi.paid / (s.kpi.paid + s.kpi.unpaid)) * 100)}%` }} />
            </div>
          </div>
        )}
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
          {!s && sum.busy && <SkelRows n={5} pill />}
          {s && list.length === 0 && <Empty>По этому фильтру никого.</Empty>}
          {sections.filter((sec) => sec.items.length > 0).map((sec) => (
            <Collapse key={sec.key} id={`pay-${sec.key}`} title={sec.label} count={sec.items.length} defaultOpen={sec.open} forceOpen={!!q} className={`pay-sec ${sec.key}`}>
              {sec.items.map((p) => (
                <div key={p.id} className="prow" onPointerDown={() => warm(p.id)} onClick={() => setCard(p)} style={{ cursor: 'pointer' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="n">{p.fio}</div>
                    <div className="s">
                      {p.group}
                      {p.status !== 'Оплачен' && p.oneOff ? ` · разовых: ${p.oneOff.count}, последнее ${p.oneOff.last}` : ''}
                      {p.status === 'Оплачен' && p.abonement ? ` · ${p.abonement}` : ''}
                      {p.status === 'Оплачен' && p.date ? ` · оплата ${p.date}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ display: 'grid', justifyItems: 'end', gap: 3 }}>
                      <PayPill p={p} />
                      {p.status === 'Оплачен' && p.amount ? <span className="s num">{rub(p.amount)}</span> : null}
                    </div>
                    {(p.status !== 'Оплачен' || p.reminder) && contacts[p.id] && <RemindButtons info={contacts[p.id]} row={p} compact />}
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
            {!recent.data && recent.busy && <SkelRows n={3} pill dense />}
            {!(recent.busy && !recent.data) && (recent.data || []).length === 0 && <Empty icon={Wallet}>Записей пока нет.</Empty>}
            {(recent.data || []).map((r) => (
              <div key={r.payId} className="prow">
                <div style={{ minWidth: 0 }}><div className="n">{r.fio}</div><div className="s">{r.date} · {r.method || '—'} · {r.abonement || '—'}{r.by ? ` · внёс ${r.by}` : ''}</div></div>
                <div style={{ display: 'grid', justifyItems: 'end' }}><b className="num">{rub(r.amount)}</b><span className="s">{r.status}</span></div>
              </div>
            ))}
          </div>
        </Collapse>
        <Collapse id="pay-league" className="panel" title={<span className="h2">Долги по лиге</span>} count={s?.league?.length}>
          <div className="panel-b">
            {!s && sum.busy && <SkelRows n={2} pill dense />}
            {s && (s.league || []).length === 0 && <Empty icon={CheckCheck}>Долгов нет.</Empty>}
            {(s?.league || []).map((l, i) => (
              <div key={i} className="alert-row"><span className="pill">{l.league}</span><span className="n">{l.fio}</span><b className="num" style={{ color: 'var(--danger)' }}>{rub(l.debt)}</b></div>
            ))}
          </div>
        </Collapse>
      </div>

      {card && <PlayerCard id={card.id} row={card} onClose={() => setCard(null)} onPay={(f) => { setCard(null); setForm(f); }} />}
      {form && <PayForm initial={form} onClose={() => setForm(null)} onSaved={reload} payments={payments} />}
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
          <span>{value.group}{st ? ` · ${st.status !== 'Оплачен' && st.oneOff ? `разовых: ${st.oneOff.count} на ${rub(st.oneOff.sum)}` : st.status}` : ''}</span>
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
        {loading && !players.length && <div style={{ padding: '0 12px' }}><SkelRows n={3} dense /></div>}
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
    date: initial.date || todayStr(), abonement: startAb, amount: PRICES[startAb] || '',
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
    // Кто в этом месяце ходит разово — скорее всего платит ещё за одно разовое. Абонемент выбирается вручную.
    const ab = st && st.status !== 'Оплачен' && st.oneOff ? 'Разовая' : d.abonement;
    set({ abonement: ab, amount: priceFor(ab, p.group) ?? d.amount });
  };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await clubCall('payAdd', { pay: { ...d, fio: player.fio, amount: Number(d.amount) } }, getIdToken);
      forgetPlayers(player.id);
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

/* ───────────── Карточка игрока ───────────── */
const MARK_CLASS = { '✓': 'y', '✕': 'n', 'У': 'u' };

/** «Написать» — только Telegram: чат по номеру с уже подставленным текстом (t.me/+номер?text=…).
 *  Текст заодно копируем: если Telegram его не подставил, остаётся вставить. */
export function RemindButtons({ info, row, compact = false }) {
  const toast = useToast();
  const { phone } = payContact(info);
  const msg = reminderMessage(info, row, fmt(todayStr().slice(0, 7) + '-01', 'LLLL'));
  const href = phone ? `https://t.me/+${phone}?text=${encodeURIComponent(msg)}` : '';
  const copy = async (silent) => {
    try { await navigator.clipboard.writeText(msg); if (!silent) toast('Текст напоминания скопирован'); return true; } catch { if (!silent) toast('Не удалось скопировать', { bad: true }); return false; }
  };
  if (compact) {
    return phone
      ? <a className="icon-btn" href={href} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation(); copy(true); }} aria-label={`Напомнить в Telegram: ${info.fio}`} title="Напомнить в Telegram"><Send size={17} /></a>
      : null;
  }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {phone && <a className="btn sm primary" href={href} target="_blank" rel="noreferrer" onClick={() => { copy(true); }}><Send size={15} /> Написать в Telegram</a>}
      <button type="button" className="btn sm ghost" onClick={() => copy(false)}><Copy size={15} /> Скопировать текст</button>
      {!phone && <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>В «Игроках» нет телефона для связи</span>}
    </div>
  );
}

function PlayerCard({ id, row, onClose, onPay }) {
  const { getIdToken } = useStore();
  const [data, setData] = useState(() => cachedPlayer(id));
  const [err, setErr] = useState('');
  // Телефоны уже есть в списке игроков — контакты и напоминание видны сразу, не дожидаясь таблицы.
  const known = useMemo(() => (readCache('players')?.data?.players || []).find((x) => String(x.id) === String(id)) || null, [id]);
  useEffect(() => {
    let on = true;
    setData(cachedPlayer(id)); setErr('');
    loadPlayer(id, getIdToken).then((d) => on && setData(d)).catch((e) => on && !cachedPlayer(id) && setErr(e.message));
    return () => { on = false; };
  }, [id, getIdToken]);

  const info = data?.info || { fio: row?.fio || '', group: row?.group || '', ...(known || {}) };
  const visits = data?.visits || [];
  const marked = visits.filter((v) => v.mark);
  const was = marked.filter((v) => v.mark === '✓').length;
  const lastVisit = [...visits].reverse().find((v) => v.mark === '✓')?.date;
  const months = useMemo(() => {
    const out = [];
    (data?.payments || []).forEach((x) => {
      let m = out[out.length - 1];
      if (!m || m.period !== x.period) out.push(m = { period: x.period, items: [], sum: 0 });
      m.items.push(x);
      m.sum += x.status === 'Оплачен' ? x.amount : x.status === 'Возврат' ? -x.amount : 0;
    });
    return out;
  }, [data]);
  const needsReminder = !row || row.status !== 'Оплачен' || !!row.reminder;
  const sub = [info.group, info.age && `${info.age} лет`, info.status && info.status !== 'Активен' && info.status, info.joined && `в клубе с ${info.joined}`].filter(Boolean).join(' · ');

  return (
    <Modal onClose={onClose}>
      <ModalHead onClose={onClose}><span className="eyebrow acc">Карточка игрока</span></ModalHead>
      <div className="modal-b">
        <div>
          <h2 className="h2" style={{ fontSize: 24 }}>{info.fio}</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {sub}{row && <PayPill p={row} />}
          </div>
        </div>
        {err && <div className="banner warn"><AlertTriangle size={18} /><span className="grow">{err}</span></div>}
        {(data || known) && (
          <>
            <div className="pc-contacts">
              {[[info.parent || (info.group === 'Junior' ? 'Родитель' : ''), info.parentPhone], [info.group === 'Junior' ? 'Игрок' : info.fio.split(' ')[1] || 'Телефон', info.phone]]
                .filter(([, ph]) => ph).map(([who, ph]) => (
                  <a key={ph} className="pc-contact" href={phoneDigits(ph) ? `tel:+${phoneDigits(ph)}` : undefined}>
                    <Phone size={15} /><span><b>{who || 'Телефон'}</b><span className="num">{ph}</span></span>
                  </a>
                ))}
              {!info.parentPhone && !info.phone && <span className="muted" style={{ fontSize: 13 }}>Телефонов в «Игроках» нет.</span>}
            </div>

            <section>
              <div className="lbl">Напоминание об оплате</div>
              {needsReminder
                ? <p className="muted" style={{ fontSize: 13, margin: '4px 0 8px' }}>{reminderMessage(info, row, fmt(todayStr().slice(0, 7) + '-01', 'LLLL'))}</p>
                : <p className="muted" style={{ fontSize: 13, margin: '4px 0 8px' }}>Абонемент оплачен — напоминать не нужно, но написать можно.</p>}
              <RemindButtons info={info} row={row} />
            </section>
          </>
        )}
        {!data && !err && <SkelRows n={3} pill dense />}

        {data && (
          <>
            <section>
              <div className="lbl">Посещаемость</div>
              {marked.length ? (
                <>
                  <div style={{ fontSize: 14, margin: '4px 0 8px' }}>
                    Был на <b>{was}</b> из {marked.length} ({Math.round((was / marked.length) * 100)}%){lastVisit ? ` · последний раз ${lastVisit}` : ''}
                  </div>
                  <div className="visit-strip" aria-label="Последние тренировки">
                    {visits.slice(-20).map((v, i) => <span key={i} className={MARK_CLASS[v.mark] || ''} title={`${v.date}: ${v.mark || 'нет отметки'}`} />)}
                  </div>
                </>
              ) : <div className="muted" style={{ fontSize: 13 }}>Отметок пока нет.</div>}
            </section>

            <section>
              <div className="lbl">Оплаты</div>
              {!months.length && <div className="muted" style={{ fontSize: 13 }}>Оплат в журнале нет.</div>}
              {months.map((m) => (
                <div key={m.period} className="pc-month">
                  <div className="pc-month-h"><span>{fmt(m.period + '-01', 'LLLL yyyy')}</span><b className="num">{rub(m.sum)}</b></div>
                  {m.items.map((x) => (
                    <div key={x.payId} className="prow">
                      <div style={{ minWidth: 0 }}>
                        <div className="n">{x.abonement || '—'}</div>
                        <div className="s">{[x.date, x.method, x.by && `внёс ${x.by}`, x.comment].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div style={{ display: 'grid', justifyItems: 'end' }}><b className="num">{rub(x.amount)}</b><span className="s">{x.status}</span></div>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          </>
        )}
      </div>
      <div className="modal-f">
        <button className="btn ghost" onClick={onClose}>Закрыть</button>
        <button className="btn primary" onClick={() => onPay({ fio: info.fio, abonement: row && row.status !== 'Оплачен' && row.oneOff ? 'Разовая' : row?.abonement })}><Plus size={15} /> Внести оплату</button>
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
  const [card, setCard] = useState(null);
  const [form, setForm] = useState(null);
  const summaryRows = useMemo(() => (readCache('summary')?.data?.payments || []).map(normPay), [form]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowById = useMemo(() => Object.fromEntries(summaryRows.map((x) => [x.id, x])), [summaryRows]);
  // Был на тренировке (✓), но нет ни абонемента, ни разовой оплаты за этот день
  const unpaidHere = (p) => marks[p.id] === '✓' && p.pay === 'Не оплачен';

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
      forgetPlayers();
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
        <span className="muted num" style={{ fontSize: 13 }}>Пришли: <b style={{ color: 'var(--fg)' }}>{present}</b> из {att.data?.players.length ?? '—'}
          {att.data && att.data.players.some(unpaidHere) ? <> · <b style={{ color: 'var(--danger)' }}>{att.data.players.filter(unpaidHere).length}</b> без оплаты</> : null}</span>
      </div>
      <div className="panel-b">
        {recent.length > 0 && (
          <div className="chips" style={{ marginBottom: 10 }}>
            {recent.map((e) => <button key={e.id} className={`chip ${e.date === date ? 'on' : ''}`} onClick={() => setDate(e.date)}>{humanDay(e.date)}</button>)}
          </div>
        )}
        {att.err && <div className="banner warn"><AlertTriangle size={18} /><span className="grow">{att.err}</span></div>}
        {att.busy && !att.data && <SkelRows n={6} pill />}
        {att.data && att.data.players.length === 0 && <Empty icon={ClipboardCheck}>В группе нет активных игроков.</Empty>}
        {att.data?.players.map((p) => (
          <div key={p.id} className="att-row">
            <div style={{ minWidth: 0 }}>
              <button type="button" className="link-name" onClick={() => setCard(rowById[p.id] || { id: p.id, fio: p.fio, group })}>{p.fio}</button>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                {p.pay === 'Разовая оплачена' && <span className="pill ok">Разовая оплачена</span>}
                {p.pay === 'Не оплачен' && <span className="pill bad">{unpaidHere(p) ? 'Был без оплаты' : 'Не оплачен'}</span>}
                {unpaidHere(p) && <button type="button" className="btn sm" style={{ height: 24, padding: '0 8px', fontSize: 12 }} onClick={() => setForm({ fio: p.fio, abonement: 'Разовая', date })}><Plus size={13} /> Разовая</button>}
              </div>
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
      {card && <PlayerCard id={card.id} row={card.status ? card : null} onClose={() => setCard(null)} onPay={(f) => { setCard(null); setForm({ ...f, date }); }} />}
      {form && <PayForm initial={form} onClose={() => setForm(null)} onSaved={() => att.reload()} payments={summaryRows} />}
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
                {!leads.data && leads.busy && <i className="skel card" />}
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
