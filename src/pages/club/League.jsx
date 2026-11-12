// Экран «Лига» (Клуб → Оплаты → Лига): взносы, абонементы и матчи U15/U17. Всё считает таблица, тут только показ.
import { useState } from 'react';
import { Plus, RefreshCw, AlertTriangle, Trophy } from 'lucide-react';
import { Empty, SkelRows, Collapse } from '../../components/ui';
import { CountUp } from '../../components/motion';
import { useClub, rub } from './shared';
import LeaguePayForm from './LeaguePayForm';
import '../../styles/league.css';

const LEAGUES = ['U15', 'U17'];
const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString("ru-RU");
const money = (n) => (n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('ru-RU')} ₽`);

/** Пилюля одной ячейки матча. */
function CellPill({ v, onPay }) {
  if (v === 'Оплачен') return <span className="pill ok"><span className="pdot" />Оплачен</span>;
  if (v === 'Абонемент') return <span className="pill acc"><span className="pdot" />Абонемент</span>;
  if (v === 'Не оплачен') {
    return <button type="button" className="pill bad lg-pillbtn" onClick={onPay} title="Внести оплату"><span className="pdot" />Не оплачен</button>;
  }
  return <span className="lg-dash">—</span>;
}

/** Строка «подпись: значение / значение / значение». */
function Breakdown({ title, items }) {
  return (
    <div className="lg-bd">
      <b>{title}</b>
      {items.map(([k, v]) => <span key={k}>{k} <i className="num">{money(v)}</i></span>)}
    </div>
  );
}

export default function League() {
  const lg = useClub('league');
  const [league, setLeague] = useState('U15');
  const [form, setForm] = useState(null);

  const d = lg.data;
  const L = d?.[league];
  const month = L?.month;
  const matches = (L?.matches || []).map((m, i) => ({ ...m, i })).filter((m) => m.date);
  const recent = (d?.recent || []).filter((r) => r.league === league);
  const neg = month && month.net < 0;

  return (
    <>
      {lg.err && <div className="banner warn" style={{ marginBottom: 14 }}><AlertTriangle size={18} /><span className="grow">{lg.err}</span><button className="btn sm" onClick={lg.reload}>Повторить</button></div>}

      <div className="lg-head">
        <div className="seg" role="tablist" aria-label="Лига">
          {LEAGUES.map((x) => <button key={x} role="tab" aria-selected={league === x} className={league === x ? 'on' : ''} onClick={() => setLeague(x)}>{x}</button>)}
        </div>
        <div className="lg-head-r">
          <button className="icon-btn" onClick={lg.reload} aria-label="Обновить" title="Обновить из таблицы"><RefreshCw size={17} className={lg.busy ? 'spin' : ''} /></button>
          <button className="btn primary sm" onClick={() => setForm({ league })}><Plus size={15} /> Оплата лиги</button>
        </div>
      </div>

      {!d && lg.busy && <SkelRows n={5} pill />}
      {!d && !lg.busy && !lg.err && <Empty icon={Trophy}>Данных по лиге пока нет.</Empty>}

      {d && !L && <Empty icon={Trophy}>По лиге {league} данных нет.</Empty>}

      {L && (
        <>
          {month && (
            <section className="panel lg-month">
              <div className="lg-kpis">
                <div className="stat"><b className="num"><CountUp value={month.income} format={fmtN} /></b><span>доход, ₽</span></div>
                <div className="stat"><b className="num"><CountUp value={month.expense} format={fmtN} /></b><span>расходы, ₽</span></div>
                <div className={`stat ${neg ? 'bad' : 'hot'}`}><b className="num"><CountUp value={month.net} format={fmtN} /></b><span>итог, ₽</span></div>
              </div>
              <div className="lg-cap">за {month.label} · игроков: {month.players}</div>
              <Breakdown title="Доходы" items={[['вступительные', month.incomeBy?.entry], ['абонементы', month.incomeBy?.plans], ['за матчи', month.incomeBy?.matches]]} />
              <Breakdown title="Расходы" items={[['матчи', month.expenseBy?.matches], ['вступление в лигу', month.expenseBy?.entry]]} />
            </section>
          )}

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><h2 className="h2">Матчи</h2></div>
            <div className="panel-b">
              {L.grid.length === 0 && <Empty>В лиге пока нет игроков.</Empty>}
              {L.grid.length > 0 && (
                <div className="lg-scroll">
                  <table className="lg-table">
                    <thead>
                      <tr>
                        <th className="lg-sticky">Игрок</th>
                        <th>Взнос</th>
                        <th>Тариф</th>
                        {matches.map((m) => <th key={m.i}><span className="lg-mn">{m.name}</span><span className="lg-md">{m.date}</span></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {L.grid.map((r) => (
                        <tr key={r.fio}>
                          <th className="lg-sticky" scope="row">{r.fio}</th>
                          <td><CellPill v={r.entry} onPay={() => setForm({ league, fio: r.fio, type: 'Вступительный взнос' })} /></td>
                          <td>
                            {r.plan ? <span className="lg-plan">{r.plan}{r.planStatus ? <small>{r.planStatus}</small> : null}</span> : <span className="lg-dash">—</span>}
                          </td>
                          {matches.map((m) => (
                            <td key={m.i}><CellPill v={r.cells?.[m.i]} onPay={() => setForm({ league, fio: r.fio, type: 'Матч', match: m.name })} /></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <div className="dash">
            <Collapse id="lg-bymatch" className="panel" defaultOpen={false} title={<span className="h2">Итоги по матчам</span>} count={L.byMatch?.length}>
              <div className="panel-b">
                {(L.byMatch || []).length === 0 && <Empty>Матчей пока нет.</Empty>}
                {(L.byMatch || []).map((m) => (
                  <div key={m.name} className="prow">
                    <div style={{ minWidth: 0 }}>
                      <div className="n">{m.name}{m.date ? ` · ${m.date}` : ''}</div>
                      <div className="s">покрыто: {m.covered} · доход {money(m.income)} · расход {money(m.expense)}</div>
                    </div>
                    <b className={`num ${m.net < 0 ? 'lg-neg' : ''}`}>{money(m.net)}</b>
                  </div>
                ))}
              </div>
            </Collapse>

            <Collapse id="lg-recent" className="panel" defaultOpen={false} title={<span className="h2">Последние оплаты лиги</span>} count={recent.length}>
              <div className="panel-b">
                {recent.length === 0 && <Empty icon={Trophy}>Оплат пока нет.</Empty>}
                {recent.map((r) => (
                  <div key={r.id} className="prow">
                    <div style={{ minWidth: 0 }}>
                      <div className="n">{r.fio}</div>
                      <div className="s">{[r.date, r.type, r.match].filter(Boolean).join(' · ')}</div>
                    </div>
                    <b className="num">{rub(r.amount === '' || r.amount == null ? 0 : r.amount)}</b>
                  </div>
                ))}
              </div>
            </Collapse>
          </div>
        </>
      )}

      {form && <LeaguePayForm initial={form} data={lg.data} onClose={() => setForm(null)} onSaved={() => lg.reload()} />}
    </>
  );
}
