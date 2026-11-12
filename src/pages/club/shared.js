// Общее для экранов «Клуба»: загрузка данных из таблицы и формат рублей.
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { clubCall, readCache } from '../../lib/club';

/** Данные из таблицы: сразу из кэша устройства, затем свежие. Возвращает { data, err, busy, reload, setData }. */
export function useClub(action, payload) {
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

export const rub = (n) => (n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('ru-RU')} ₽`);
