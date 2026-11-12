import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useStore } from '../../lib/store';
import { clubCall, LEAGUES, LEAGUE_TYPES, LEAGUE_PRICES } from '../../lib/club';
import { Modal, ModalHead, Confirm, SkelRows, useToast } from '../../components/ui';
import { todayStr } from '../../lib/dates';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е');

/* Выбор игрока лиги: поиск + список (datalist на iPhone не работает). players — строки ФИО как пришли. */
function LeaguePicker({ players, value, onChange }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(false);
  const matches = useMemo(() => {
    const n = norm(q);
    return players.filter((p) => !n || norm(p).includes(n)).slice(0, n ? 30 : 100);
  }, [q, players]);

  if (value && !editing) {
    return (
      <div className="picked">
        <div style={{ minWidth: 0, flex: 1 }}><b>{value.trim()}</b></div>
        <button type="button" className="btn sm" onClick={() => { setEditing(true); setQ(''); }}>Сменить</button>
      </div>
    );
  }
  return (
    <div>
      <div className="search-box" style={{ maxWidth: 'none', margin: 0 }}>
        <Search size={15} />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фамилия или имя" autoComplete="off" />
      </div>
      <div className="picker-list" role="listbox" aria-label="Игроки лиги">
        {!players.length && <div className="empty" style={{ padding: 14 }}>В этой лиге пока нет игроков</div>}
        {!!players.length && !matches.length && <div className="empty" style={{ padding: 14 }}>Никого не нашли</div>}
        {matches.map((p) => (
          <button type="button" key={p} className="picker-item" role="option" aria-selected={value === p}
            onClick={() => { onChange(p); setEditing(false); }}>
            <span className="n">{p.trim()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LeaguePayForm({ initial = {}, data, onClose, onSaved }) {
  const { getIdToken } = useStore();
  const toast = useToast();
  const [league, setLeague] = useState(initial.league || LEAGUES[0]);
  const [fio, setFio] = useState(initial.fio || '');
  const [type, setType] = useState(initial.type || LEAGUE_TYPES[0]);
  const [amount, setAmount] = useState(String(LEAGUE_PRICES[initial.type || LEAGUE_TYPES[0]] ?? ''));
  const [touched, setTouched] = useState(false); // сумму правили руками — цену не подставляем
  const [date, setDate] = useState(todayStr());
  const [match, setMatch] = useState(initial.match || '');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dup, setDup] = useState(null);

  const L = data?.[league];
  const players = L?.players || [];
  const matches = (L?.matches || []).filter((m) => m.date);

  const changeLeague = (l) => {
    setLeague(l);
    const list = data?.[l]?.players || [];
    if (fio && !list.includes(fio)) setFio('');
    setMatch('');
  };
  const changeType = (t) => {
    setType(t);
    if (!touched) setAmount(String(LEAGUE_PRICES[t] ?? ''));
  };

  const save = async (force = false) => {
    if (busy) return;
    if (amount === '' || isNaN(Number(amount))) { setErr('Укажите сумму (0 допустим)'); return; }
    setBusy(true); setErr('');
    try {
      const res = await clubCall('leagueAdd', {
        pay: { league, fio, date, type, match: type === 'Матч' ? match : '', amount: Number(amount), comment, force },
      }, getIdToken);
      if (res?.duplicate) { setDup(res.duplicate); return; }
      setDup(null);
      toast(`Записано · ${res.id}`);
      if (res.warnings?.length) toast(`Записано, но: ${res.warnings.join('; ')}`, { bad: true, ms: 6000 });
      onSaved?.(res); onClose();
    } catch (e) { setDup(null); setErr(e.message); } finally { setBusy(false); }
  };

  const canSave = !busy && data && fio && (type !== 'Матч' || match);

  if (dup) {
    return (
      <Confirm title="Такая оплата уже есть" action={busy ? 'Записываем…' : 'Да, записать'}
        text={`Уже есть ${dup.id}: ${dup.type}${dup.match ? ' · ' + dup.match : ''}, ${dup.date}, ${dup.amount} ₽. Записать ещё одну (доплата)?`}
        onYes={() => save(true)} onNo={() => setDup(null)} />
    );
  }

  return (
    <Modal onClose={onClose}>
      <ModalHead onClose={onClose}><span className="eyebrow acc">Лига · оплата</span></ModalHead>
      <div className="modal-b">
        <h2 className="h2" style={{ fontSize: 24 }}>Внести оплату лиги</h2>
        {!data ? <div style={{ padding: '8px 0' }}><SkelRows n={3} dense /><div className="empty">Загрузка списка…</div></div> : (
          <>
            <div className="field">
              <span className="lbl">Лига</span>
              <div className="seg">{LEAGUES.map((l) => <button key={l} type="button" className={league === l ? 'on' : ''} onClick={() => changeLeague(l)}>{l}</button>)}</div>
            </div>
            <div className="field">
              <span className="lbl">Игрок</span>
              <LeaguePicker key={league} players={players} value={fio} onChange={setFio} />
            </div>
            <div className="field">
              <label htmlFor="lp-type">Тип оплаты</label>
              <select id="lp-type" className="select" value={type} onChange={(e) => changeType(e.target.value)}>
                {LEAGUE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            {type === 'Матч' && (
              <div className="field">
                <label htmlFor="lp-match">Матч</label>
                <select id="lp-match" className="select" value={match} onChange={(e) => setMatch(e.target.value)}>
                  <option value="">Выберите матч</option>
                  {matches.map((m) => <option key={m.name} value={m.name}>{m.name} · {m.date}</option>)}
                </select>
              </div>
            )}
            <div className="grid2">
              <div className="field"><label htmlFor="lp-sum">Сумма, ₽</label><input id="lp-sum" type="number" inputMode="numeric" className="input" value={amount} onChange={(e) => { setTouched(true); setAmount(e.target.value); }} /></div>
              <div className="field"><label htmlFor="lp-date">Дата оплаты</label><input id="lp-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
            <div className="field"><label htmlFor="lp-comment">Комментарий</label><input id="lp-comment" className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" /></div>
          </>
        )}
        {err && <div className="err">{err}</div>}
      </div>
      <div className="modal-f">
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={() => save(false)} disabled={!canSave}>{busy ? 'Записываем…' : 'Записать'}</button>
      </div>
    </Modal>
  );
}
