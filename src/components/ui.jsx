import { Component, createContext, forwardRef, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ChevronDown } from 'lucide-react';
import { useStore } from '../lib/store';

/* ── Защита от «белого экрана»: если страница упала, остальное приложение живо ── */
export class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.error('Страница упала:', e); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page">
        <div className="banner warn" style={{ display: 'grid', gap: 10 }}>
          <span>Этот раздел не открылся из-за ошибки. Остальное приложение работает.</span>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => this.setState({ failed: false })}>Попробовать ещё раз</button>
            <button className="btn sm ghost" onClick={() => window.location.reload()}>Перезагрузить</button>
          </span>
        </div>
      </div>
    );
  }
}

/* ── Аватар ── */
export function Avatar({ user, size = '', title }) {
  if (!user) return null;
  const letter = (user.name || '?').slice(0, 1).toUpperCase();
  return (
    <span className={`av ${size}`} style={{ background: user.color || '#58D6FF' }} title={title || user.name}>{letter}</span>
  );
}
export function AvatarStack({ ids = [], max = 3 }) {
  const { userById } = useStore();
  const list = ids.map((id) => userById[id]).filter(Boolean);
  if (!list.length) return null;
  return (
    <span className="avs">
      {list.slice(0, max).map((u) => <Avatar key={u.id} user={u} />)}
      {list.length > max && <span className="av" style={{ background: 'var(--line-strong)' }}>+{list.length - max}</span>}
    </span>
  );
}

/* ── Модальное окно / нижняя шторка ── */
export function Modal({ onClose, children, size = '', labelledBy }) {
  const ref = useRef(null);
  const overlayRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // iPhone: клавиатура уменьшает только «видимую» область, а шторка остаётся на весь экран и кнопка уезжает под клавиатуру.
    // Подгоняем высоту подложки под видимую область — тогда шторка (и кнопка внизу) всегда на виду.
    const vv = window.visualViewport;
    const fit = () => {
      const el = overlayRef.current; if (!el || !vv) return;
      el.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
      el.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
    };
    fit();
    vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit);
    return () => {
      document.removeEventListener('keydown', onKey); document.body.style.overflow = prev;
      vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit);
    };
  }, [onClose]);
  // Рисуем поверх всего приложения (в body): у страниц свой слой, и без этого нижняя панель и «+» перекрывали кнопки окна.
  return createPortal(
    <div className="overlay" ref={overlayRef} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function ModalHead({ children, onClose }) {
  return (
    <div className="modal-h">
      <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 8, alignItems: 'center' }}>{children}</div>
      <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
    </div>
  );
}

/* ── Подтверждение внутри страницы (без confirm()) ── */
export function Confirm({ title, text, action = 'Удалить', onYes, onNo, extra }) {
  return (
    <Modal onClose={onNo} size="sm">
      <ModalHead onClose={onNo}><span className="h2">{title}</span></ModalHead>
      <div className="modal-b"><p style={{ margin: 0, color: 'var(--fg-2)' }}>{text}</p></div>
      <div className="modal-f">
        <button className="btn ghost" onClick={onNo}>Отмена</button>
        {extra}
        <button className="btn primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }} onClick={onYes}>{action}</button>
      </div>
    </Modal>
  );
}

/* ── Тосты ── */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, opts = {}) => {
    const id = Math.random();
    setItems((l) => [...l, { id, text, ...opts }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), opts.ms || 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.bad ? 'bad' : ''}`}>
            {!t.bad && <Check size={16} />}
            <span>{t.text}</span>
            {t.undo && <button onClick={() => { t.undo(); setItems((l) => l.filter((x) => x.id !== t.id)); }}>Вернуть</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Switch({ on, onChange, label }) {
  return <button type="button" className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={!!on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Prio({ p }) {
  return <span className={`prio ${p || 'med'}`} title={{ high: 'Высокий', med: 'Средний', low: 'Низкий' }[p || 'med']}><i /><i /><i /></span>;
}

/** Пустое состояние. С иконкой — значок в «контурных» кольцах (мотив топографии), без иконки — короткая строка. */
export function Empty({ icon: Icon, children, action }) {
  return (
    <div className={`empty ${Icon ? 'rich' : ''}`}>
      {Icon && <span className="empty-ic"><Icon size={22} strokeWidth={1.75} /></span>}
      <div className="empty-t">{children}</div>
      {action}
    </div>
  );
}

/** Скелетон списка на время загрузки: строки той же формы, что и настоящие (кружок/название/подпись/пилюля). */
const SKEL_W = [[62, 34], [46, 26], [70, 40], [38, 22], [56, 30], [50, 36]];
export function SkelRows({ n = 3, dot = false, pill = false, dense = false }) {
  return (
    <div className={`skel-rows ${dense ? 'dense' : ''}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const [a, b] = SKEL_W[i % SKEL_W.length];
        const d = { animationDelay: `${i * 110}ms` };
        return (
          <div key={i} className="skel-row">
            {dot && <i className="skel dot" style={d} />}
            <div className="l">
              <i className="skel s1" style={{ ...d, width: `${a}%` }} />
              <i className="skel s2" style={{ ...d, width: `${b}%` }} />
            </div>
            {pill && <i className="skel pill" style={d} />}
          </div>
        );
      })}
    </div>
  );
}

/* ── Раскрывающийся блок. Состояние (открыт/закрыт) запоминается на устройстве по id. ── */
export function Collapse({ id, title, count, defaultOpen = true, forceOpen = false, extra, className = '', children }) {
  const key = id ? `apex-open-${id}` : null;
  const [open, setOpen] = useState(() => {
    if (!key) return defaultOpen;
    try { const v = localStorage.getItem(key); return v === null ? defaultOpen : v === '1'; } catch { return defaultOpen; }
  });
  const isOpen = forceOpen || open;
  const toggle = () => {
    const next = !isOpen;
    setOpen(next);
    try { if (key) localStorage.setItem(key, next ? '1' : '0'); } catch { /* приватный режим */ }
  };
  return (
    <div className={`collapse ${isOpen ? 'open' : ''} ${className}`}>
      <div className="collapse-h">
        <button type="button" className="collapse-t" onClick={toggle} aria-expanded={isOpen}>
          <ChevronDown size={16} className="chev" />
          <span className="ttl">{title}</span>
          {count !== undefined && count !== null && <span className="cnt">{count}</span>}
        </button>
        {extra}
      </div>
      <div className="collapse-b" inert={isOpen ? undefined : ''}><div>{children}</div></div>
    </div>
  );
}

/* ── Заголовок, который растёт по высоте вместо обрезания ── */
export const TitleArea = forwardRef(function TitleArea({ value, onChange, onEnter, ...rest }, outer) {
  const inner = useRef(null);
  const ref = outer || inner;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value, ref]);
  return (
    <textarea ref={ref} rows={1} className="title-input" value={value} onChange={onChange}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } }} {...rest} />
  );
});
