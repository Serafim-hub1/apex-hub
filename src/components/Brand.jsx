// Графика Summit Core: знак Summit, топографический узор, линия вершины.

export function SummitMark({ size = 30, mono = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="50,2 66,32 50,22 34,32" fill={mono ? 'currentColor' : '#58D6FF'} />
      <polygon points="50,26 90,96 70,96 50,58 30,96 10,96" fill="currentColor" />
      <polygon points="50,66 64,92 50,84 36,92" fill={mono ? 'currentColor' : '#70757C'} opacity={mono ? 0.6 : 1} />
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

// Контурные линии «Performance Topography»: тонкие, спокойные, без хаоса.
function contour(cx, cy, r, seed, k) {
  const pts = [];
  const n = 72;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + 0.16 * Math.sin(a * 3 + seed) + 0.09 * Math.sin(a * 5 - seed * 1.7) + 0.05 * Math.sin(a * 2 + k);
    pts.push([cx + Math.cos(a) * r * w * 1.35, cy + Math.sin(a) * r * w]);
  }
  return 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
}
const TOPO_PATHS = [
  ...Array.from({ length: 9 }, (_, i) => contour(760, 120, 30 + i * 34, 0.6, i * 0.3)),
  ...Array.from({ length: 6 }, (_, i) => contour(120, 420, 24 + i * 38, 2.1, i * 0.5)),
];

export function Topo({ className = 'topo' }) {
  return (
    <svg className={className} viewBox="0 0 900 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        {TOPO_PATHS.map((d, i) => <path key={i} d={d} />)}
      </g>
    </svg>
  );
}

// Линия вершины: белые грани и одна ледяная траектория.
export function Peak({ className = 'peak' }) {
  return (
    <svg className={className} viewBox="0 0 400 220" aria-hidden="true">
      <polyline points="0,214 92,120 128,150 214,40 262,96 300,70 400,190" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2" />
      <polyline points="40,214 150,96 186,124 236,62 284,118 330,92 400,150" fill="none" stroke="#58D6FF" strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points="214,40 236,62" fill="none" stroke="#58D6FF" strokeWidth="2.5" />
    </svg>
  );
}
