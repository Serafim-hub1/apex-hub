import { Fragment, useEffect, useRef, useState } from 'react';
import { SummitMark } from './Brand';

/* Движение: заставка, досчёт цифр, заголовок по словам. Всё выключается при «уменьшить движение». */
export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Пока заставка закрывает экран, анимации входа стоят на паузе (класс booting на <html>) и цифры не считаются.
let revealed = reduced();
const waiters = new Set();
if (!revealed) {
  document.documentElement.classList.add('booting');
  setTimeout(() => reveal(), 4000); // страховка: если заставка не отработала, не держать экран на паузе
}
export function reveal() {
  if (revealed) return;
  revealed = true;
  document.documentElement.classList.remove('booting');
  waiters.forEach((fn) => fn());
  waiters.clear();
}
function onReveal(fn) {
  if (revealed) { fn(); return () => {}; }
  waiters.add(fn);
  return () => waiters.delete(fn);
}

/** Заставка при запуске: знак собирается из трёх шевронов и улетает на своё место в шапке. */
export function Splash({ ready }) {
  const [gone, setGone] = useState(() => reduced());
  const root = useRef(null);
  const t0 = useRef(typeof performance !== 'undefined' ? performance.now() : 0);

  useEffect(() => { if (gone) reveal(); }, [gone]);
  useEffect(() => {
    if (gone || !ready) return undefined;
    const wait = Math.max(0, 560 - (performance.now() - t0.current));
    const t = setTimeout(() => {
      const el = root.current;
      const mark = el?.querySelector('.splash-mark');
      if (!el || !mark?.animate) { setGone(true); return; }
      reveal();
      const target = [...document.querySelectorAll('[data-summit]')]
        .find((n) => !el.contains(n) && n.getBoundingClientRect().width > 0);
      const opts = { duration: 440, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' };
      el.querySelector('.splash-bg').animate([{ opacity: 1 }, { opacity: 0 }], opts);
      let frames = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.12)' }];
      if (target) {
        const a = mark.getBoundingClientRect();
        const b = target.getBoundingClientRect();
        const dx = b.left + b.width / 2 - (a.left + a.width / 2);
        const dy = b.top + b.height / 2 - (a.top + a.height / 2);
        frames = [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${b.width / a.width})`, color: getComputedStyle(target).color }];
      }
      mark.animate(frames, opts).onfinish = () => setGone(true);
      setTimeout(() => setGone(true), 1200); // страховка: в фоновой вкладке анимация может не завершиться
    }, wait);
    return () => clearTimeout(t);
  }, [ready, gone]);

  if (gone) return null;
  return (
    <div className="splash-x" ref={root} aria-hidden="true">
      <div className="splash-bg" />
      <div className="splash-mark"><SummitMark size={72} /></div>
    </div>
  );
}

/** Число, которое «досчитывается» до значения (и плавно меняется при обновлении данных). */
export function CountUp({ value, format = (n) => Math.round(n), ms = 800 }) {
  const ok = typeof value === 'number' && Number.isFinite(value);
  const from = useRef(reduced() ? value : 0);
  const [shown, setShown] = useState(from.current);
  useEffect(() => {
    if (!ok) return undefined;
    if (reduced()) { from.current = value; setShown(value); return undefined; }
    let raf = 0;
    const off = onReveal(() => {
      const a = from.current;
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / ms);
        const v = a + (value - a) * (1 - (1 - p) ** 4);
        from.current = v;
        setShown(v);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => { off(); cancelAnimationFrame(raf); };
  }, [value, ms, ok]);
  return ok ? format(shown) : '—';
}

/** Текст, выезжающий из маски по словам. */
export function Words({ text, delay = 0, step = 70 }) {
  return String(text || '').split(' ').filter(Boolean).map((w, i) => (
    <Fragment key={i}>
      <span className="rw"><i style={{ animationDelay: `${delay + i * step}ms` }}>{w}</i></span>{' '}
    </Fragment>
  ));
}
