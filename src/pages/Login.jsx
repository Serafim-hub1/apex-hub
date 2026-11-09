import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useStore } from '../lib/store';
import { TEAM } from '../config';
import { Peak, SummitMark, Topo } from '../components/Brand';

export default function Login() {
  const { signIn, demo } = useStore();
  const [who, setWho] = useState(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (t) => { setWho(t.key); setEmail(t.email); setErr(''); setTimeout(() => document.getElementById('login-pw')?.focus(), 30); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await signIn(email, pw); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-art">
        <Topo />
        <Peak />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, color: '#f5f6f4' }}>
          <SummitMark size={34} />
          <span style={{ display: 'grid' }}>
            <span className="brand-word">APEX</span>
            <span className="brand-sub" style={{ color: '#9aa0a6' }}>Командный центр</span>
          </span>
        </div>
        <div className="big">Твоя вершина<br /><em>начинается здесь.</em></div>
        <div className="tag">Задачи · календарь · оплаты · посещаемость</div>
      </div>
      <div className="login-form">
        <form className="login-card" onSubmit={submit}>
          <div style={{ display: 'grid', gap: 6 }}>
            <span className="eyebrow acc">Вход для команды</span>
            <h1 className="h1" style={{ fontSize: 34 }}>Кто заходит?</h1>
            <span className="muted" style={{ fontSize: 14 }}>Войдите один раз — дальше приложение будет открываться сразу.</span>
          </div>
          <div className="who-cards">
            {TEAM.map((t) => (
              <button type="button" key={t.key} className={`who-card ${who === t.key ? 'on' : ''}`} onClick={() => pick(t)}>
                <span className="av xl" style={{ background: t.color }}>{t.name[0]}</span>
                {t.name}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="login-email">Почта</label>
            <input id="login-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="login-pw">Пароль</label>
            <input id="login-pw" className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)}
              required={!demo} placeholder={demo ? 'В демо — любой' : ''} />
          </div>
          {err && <div className="err" role="alert">{err}</div>}
          <button className="btn primary lg block" disabled={busy || !email}><Lock size={16} /> {busy ? 'Входим…' : 'Войти'}</button>
          {demo && (
            <div className="banner" style={{ fontSize: 13 }}>
              <span className="grow">Демо-режим: данные хранятся только в этом браузере. Выберите любую карточку и нажмите «Войти».</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
