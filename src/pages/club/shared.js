// Общее для экранов «Клуба»: загрузка данных из таблицы и формат рублей.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { cacheKey, clubCall, readCache } from '../../lib/club';

/** Данные из таблицы: сразу из кэша устройства (для этих же параметров), затем свежие. Возвращает { data, err, busy, reload, setData }. */
export function useClub(action, payload) {
  const { getIdToken } = useStore();
  const key = JSON.stringify(payload || {});
  const ckey = cacheKey(action, JSON.parse(key));
  const [state, setState] = useState(() => ({ ckey, data: readCache(ckey)?.data || null }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Параметры сменились — сразу кэш именно этих параметров или null.
  let cur = state;
  if (state.ckey !== ckey) {
    cur = { ckey, data: readCache(ckey)?.data || null };
    setState(cur);
  }

  const load = useCallback(async () => {
    const my = ++seq.current;
    setBusy(true); setErr('');
    try {
      const d = await clubCall(action, JSON.parse(key), getIdToken);
      if (alive.current && my === seq.current) setState({ ckey, data: d });
    } catch (e) {
      if (alive.current && my === seq.current) setErr(e.message);
    } finally {
      if (alive.current && my === seq.current) setBusy(false);
    }
  }, [action, key, ckey, getIdToken]);
  useEffect(() => { load(); }, [load]);

  const setData = useCallback((v) => setState((s) => ({ ckey, data: typeof v === 'function' ? v(s.data) : v })), [ckey]);
  return { data: cur.data, err, busy, reload: load, setData };
}

export const rub = (n) => (n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('ru-RU')} ₽`);
