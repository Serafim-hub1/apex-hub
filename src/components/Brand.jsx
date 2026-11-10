// Графика Summit Core: знак Summit и вершина. Топография — картинкой из брендбука (src/assets/brand), см. app.css.

/** Знак Summit: три шеврона. data-summit — цель, в которую «прилетает» знак с заставки. */
export function SummitMark({ size = 30, mono = false }) {
  return (
    <svg data-summit="" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <polygon className="sm-a" points="50,2 66,32 50,22 34,32" fill={mono ? 'currentColor' : '#58D6FF'} />
      <polygon className="sm-b" points="50,26 90,96 70,96 50,58 30,96 10,96" fill="currentColor" />
      <polygon className="sm-c" points="50,66 64,92 50,84 36,92" fill={mono ? 'currentColor' : '#70757C'} opacity={mono ? 0.6 : 1} />
    </svg>
  );
}

export function Wordmark({ sub = 'Basketball club' }) {
  return (
    <span style={{ display: 'grid' }}>
      <span className="brand-word">APEX</span>
      {sub && <span className="brand-sub">{sub}</span>}
    </span>
  );
}

/** Вершина: грани (свет/тень), снежная шапка и одно ледяное ребро. Цвета — токены --pk-* в app.css. */
export function Peak({ className = 'peak' }) {
  return (
    <svg className={className} viewBox="0 0 480 260" aria-hidden="true">
      {/* дальний хребет */}
      <polygon className="pk-far" points="0,260 70,172 118,204 190,112 240,164 300,260" />
      <polygon className="pk-far" points="330,260 410,120 440,152 480,112 480,260" />
      {/* главная вершина: левый склон на свету, правый в тени */}
      <polygon className="pk-lit" points="300,22 312,90 296,150 222,124" />
      <polygon className="pk-lit2" points="222,124 296,150 322,205 306,260 120,260" />
      <polygon className="pk-shade" points="300,22 350,96 372,118 312,90" />
      <polygon className="pk-shade2" points="312,90 372,118 400,150 322,205 296,150" />
      <polygon className="pk-shade" points="322,205 400,150 470,260 306,260" />
      <polygon className="pk-snow" points="300,22 262,72 276,82 284,70 297,90 305,76 312,90" />
      <polygon className="pk-snow2" points="300,22 312,90 321,78 333,92 340,80 350,96" />
      {/* передняя вершина */}
      <polygon className="pk-lit" points="110,132 20,260 112,260 118,202 104,166" />
      <polygon className="pk-shade" points="110,132 160,196 212,260 112,260 118,202 104,166" />
      <polygon className="pk-snow" points="110,132 91,159 100,165 106,157 104,166" />
      <polygon className="pk-snow2" points="110,132 104,166 113,160 123,149" />
      <polyline className="pk-edge" points="110,132 104,166 118,202 112,260" />
      {/* ледяное ребро */}
      <polyline className="pk-ridge" pathLength="1" points="300,22 312,90 296,150 322,205 306,260" />
    </svg>
  );
}
