// Экран «Финансы»: плитки текущего месяца, столбики по месяцам и таблица.
// Все суммы посчитаны в таблице — приложение только показывает.
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { Empty, SkelRows } from '../../components/ui';
import { CountUp } from '../../components/motion';
import { todayStr } from '../../lib/dates';
import { useClub, rub } from './shared';
import '../../styles/finance.css';

const SERIES = [
  { key: 'training', name: 'Тренировки', cls: 'tr' },
  { key: 'league', name: 'Лига', cls: 'lg' },
  { key: 'total', name: 'Общий', cls: 'tt' },
];

// Рубли со знаком: «+1 200 ₽» / «−500 ₽»
const signed = (n) => {
  const v = Math.round(Number(n) || 0);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('ru-RU')} ₽`;
};
const neg = (n) => (Number(n) < 0 ? 'neg' : '');

function Tile({ title, value }) {
  return (
    <div className={`stat fin-tile ${neg(value)}`}>
      <b><CountUp value={Number(value) || 0} format={signed} /></b>
      <span>{title}</span>
    </div>
  );
}

// Столбики на чистом SVG. Масштаб — только для рисования, цифры берём как есть.
function Chart({ months, curYm }) {
  const GW = 48, BW = 12, GAP = 2, TOP = 10, PLOT = 150, LBL = 22;
  const W = months.length * GW, H = TOP + PLOT + LBL;
  const vals = months.flatMap((m) => SERIES.map((s) => Number(m[s.key]) || 0));
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  const span = hi - lo || 1;
  const y0 = TOP + (hi / span) * PLOT; // линия нуля
  const k = PLOT / span;
  return (
    <div className="fin-scroll">
      <svg className="fin-svg" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.max(320, W) }} role="img" aria-label="Динамика по месяцам">
        {months.map((m, i) => {
          const x = i * GW;
          const gx = x + (GW - (3 * BW + 2 * GAP)) / 2;
          return (
            <g key={m.ym || i}>
              {m.ym === curYm && <rect className="fin-cur" x={x + 1} y={0} width={GW - 2} height={H - LBL + 4} rx={4} />}
              {SERIES.map((s, j) => {
                const v = Number(m[s.key]) || 0;
                const h = Math.abs(v) * k;
                return <rect key={s.key} className={`fin-bar ${s.cls}`} x={gx + j * (BW + GAP)} y={v >= 0 ? y0 - h : y0} width={BW} height={Math.max(h, v ? 1 : 0)} rx={2}><title>{`${m.label} · ${s.name}: ${signed(v)}`}</title></rect>;
              })}
              <text className={`fin-x ${m.ym === curYm ? 'cur' : ''}`} x={x + GW / 2} y={H - 7} textAnchor="middle">{String(m.label || '').replace('.', '').split(' ')[0]}</text>
            </g>
          );
        })}
        <line className="fin-zero" x1={0} x2={W} y1={y0} y2={y0} />
      </svg>
    </div>
  );
}

export default function Finance() {
  const fin = useClub('finance');
  const d = fin.data;
  const months = d?.monthly || [];
  const curYm = todayStr().slice(0, 7);

  return (
    <div className="fin">
      {fin.err && <div className="banner warn" style={{ marginBottom: 14 }}><AlertTriangle size={18} /><span className="grow">{fin.err}</span><button className="btn sm" onClick={fin.reload}>Повторить</button></div>}
      {!d && fin.busy && <div className="panel"><div className="panel-b"><SkelRows n={4} /></div></div>}
      {!d && !fin.busy && !fin.err && <Empty icon={TrendingUp}>Данных по финансам пока нет</Empty>}
      {d && (
        <>
          <h3 className="fin-h">Текущий месяц: {d.monthLabel}</h3>
          <div className="fin-tiles">
            <Tile title="Тренировки — доход" value={d.training} />
            <Tile title="Лига — результат" value={d.league} />
            <Tile title="Общий результат" value={d.total} />
          </div>

          <div className="panel fin-panel">
            <div className="panel-b">
              <h3 className="fin-h">Динамика по месяцам</h3>
              <div className="fin-legend">
                {SERIES.map((s) => <span key={s.key}><i className={`fin-dot ${s.cls}`} />{s.name}</span>)}
              </div>
              {months.length ? <Chart months={months} curYm={curYm} /> : <div className="fin-none">Нет данных по месяцам</div>}
              {months.length > 0 && (
                <div className="fin-scroll">
                  <table className="fin-table">
                    <thead><tr><th>Месяц</th><th>Тренировки</th><th>Лига</th><th>Итого</th></tr></thead>
                    <tbody>
                      {months.map((m) => {
                        const zero = !Number(m.training) && !Number(m.league) && !Number(m.total);
                        return (
                          <tr key={m.ym || m.label} className={`${zero ? 'zero' : ''} ${m.ym === curYm ? 'cur' : ''}`}>
                            <td>{m.label}</td>
                            <td>{rub(m.training)}</td>
                            <td className={neg(m.league)}>{rub(m.league)}</td>
                            <td className={neg(m.total)}><b>{rub(m.total)}</b></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
