import { createContext, forwardRef, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { useStore } from '../lib/store';

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
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        {children}
      </div>
    </div>
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

export function Empty({ icon: Icon, children, action }) {
  return (
    <div className="empty">
      {Icon && <Icon size={30} strokeWidth={1.5} />}
      <div>{children}</div>
      {action}
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
