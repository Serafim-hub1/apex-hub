import { useEffect, useState } from 'react';
import { Bell, BellOff, Smartphone, LogOut, Send, LayoutGrid, Palette, Copy, RotateCcw, CheckCircle2, MessageCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { APPS_SCRIPT_URL, REMINDERS } from '../config';
import { Avatar, Switch, Collapse, useToast } from '../components/ui';
import { ScheduleEditor } from '../components/ScheduleEditor';

const COLORS = ['#58D6FF', '#F5F6F4', '#A7ADB4', '#7EE3B8', '#FFC24B', '#FF8A8A'];
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function getTheme() { try { return localStorage.getItem('apex-theme') || 'system'; } catch { return 'system'; } }
export function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  try { localStorage.setItem('apex-theme', t); } catch { /* */ }
}

export default function Settings() {
  const { profile, updateProfile, signOut, enablePush, sendTestPush, demo, resetDemo } = useStore();
  const toast = useToast();
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [busy, setBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [theme, setTheme] = useState(getTheme());
  const [name, setName] = useState(profile?.name || '');

  useEffect(() => { setName(profile?.name || ''); }, [profile?.name]);
  const toSchedule = location.hash.includes('schedule');
  useEffect(() => {
    const target = location.hash.includes('push') ? 'push' : toSchedule ? 'schedule' : null;
    if (target) setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [toSchedule]);

  if (!profile) return <div className="page"><div className="skel" style={{ width: 200 }} /></div>;

  const turnOn = async () => {
    setBusy(true); setPushMsg('');
    try {
      const r = await enablePush();
      setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
      if (r.ok) toast('Уведомления включены на этом устройстве'); else setPushMsg(r.error);
    } catch (e) { setPushMsg(e.message); } finally { setBusy(false); }
  };

  const localTest = async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opts = { body: 'Так будут выглядеть напоминания о задачах.', icon: 'icons/icon-192.png', badge: 'icons/badge-72.png', tag: 'apex-test' };
      if (reg) await reg.showNotification('APEX · Напоминание', opts); else new Notification('APEX · Напоминание', opts);
    } catch { toast('Браузер не дал показать уведомление', { bad: true }); }
  };

  const widgetKey = profile.widgetKey;
  const makeWidgetKey = () => {
    const key = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, '0')).join('');
    updateProfile({ widgetKey: key });
  };
  const widgetUrl = widgetKey ? `${APPS_SCRIPT_URL || 'https://script.google.com/macros/s/…/exec'}?action=widget&key=${widgetKey}` : '';
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast('Скопировано'), () => toast('Скопируйте вручную', { bad: true }));

  return (
    <div className="page">
      <div className="page-head"><div className="lead"><span className="eyebrow acc">Личный кабинет</span><h1 className="h1">Настройки</h1></div></div>
      <div className="settings">
        <section className="panel">
          <div className="panel-b" style={{ paddingTop: 16 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <Avatar user={profile} size="xl" />
              <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 8 }}>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== profile.name && updateProfile({ name: name.trim() })} id="set-name" aria-label="Имя" />
                <div className="chips" aria-label="Цвет аватара">
                  {COLORS.map((c) => (
                    <button key={c} className="chip" aria-label={`Цвет ${c}`} onClick={() => updateProfile({ color: c })}
                      style={{ width: 30, padding: 0, justifyContent: 'center', background: c, borderColor: profile.color === c ? 'var(--fg)' : 'transparent', borderWidth: 2 }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>{profile.email} · администратор {demo && '· демо-режим'}</div>
          </div>
        </section>

        <section id="schedule">
          <Collapse id="settings-schedule" className="panel" defaultOpen={false} forceOpen={toSchedule}
            title={<span className="h2">Расписание тренировок</span>} count={null}>
            <div className="panel-b"><ScheduleEditor /></div>
          </Collapse>
        </section>

        <section className="panel" id="push">
          <div className="panel-h"><h2 className="h2"><Bell size={17} style={{ verticalAlign: -2 }} /> Уведомления</h2></div>
          <div className="panel-b">
            <div className="set-row">
              <div className="tx">
                <b>Push на этом устройстве</b>
                <span>{perm === 'granted' ? 'Разрешено. Каждое устройство включается отдельно.' : perm === 'denied' ? 'Запрещено в настройках браузера или телефона.' : perm === 'unsupported' ? 'Здесь push недоступен.' : 'Ещё не включены.'}</span>
              </div>
              {perm === 'granted'
                ? <span className="pill ok"><CheckCircle2 size={13} /> Включено</span>
                : <button className="btn primary" onClick={turnOn} disabled={busy || perm === 'denied'}><Bell size={16} /> {busy ? 'Подключаем…' : 'Включить'}</button>}
            </div>
            {perm === 'granted' && (
              <div className="set-row">
                <div className="tx"><b>Проверка</b><span>«Показать» — сразу на этом устройстве. «Через сервер» — придёт в течение 5 минут на все ваши устройства.</span></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn sm" onClick={localTest}>Показать</button>
                  {!demo && <button className="btn sm" onClick={() => { sendTestPush(); toast('Запрос отправлен, ждите push'); }}><Send size={14} /> Через сервер</button>}
                  {perm === 'granted' && <button className="btn sm ghost" onClick={turnOn} title="Переподключить устройство">Переподключить</button>}
                </div>
              </div>
            )}
            {pushMsg && <div className="banner warn" style={{ margin: '6px 0' }}><BellOff size={18} /><span className="grow">{pushMsg}</span></div>}
            {isIOS() && !isStandalone() && (
              <div className="banner" style={{ margin: '8px 0' }}>
                <Smartphone size={18} />
                <div className="grow">
                  <b>На iPhone push работает только из установленного приложения.</b>
                  <ol className="steps">
                    <li>Откройте этот сайт в Safari.</li>
                    <li>Нажмите «Поделиться» → «На экран „Домой“».</li>
                    <li>Запустите APEX с иконки, войдите и включите уведомления здесь.</li>
                  </ol>
                </div>
              </div>
            )}
            <div className="set-row">
              <div className="tx"><b>Утренний список задач</b><span>Каждый день — задачи на сегодня, просрочки, тренировки и должники.</span></div>
              <input type="time" className="input" style={{ width: 120 }} value={profile.digestTime || '08:30'} disabled={!profile.digestEnabled}
                onChange={(e) => updateProfile({ digestTime: e.target.value })} id="set-digest-time" aria-label="Время утреннего списка" />
              <Switch on={profile.digestEnabled !== false} onChange={(v) => updateProfile({ digestEnabled: v })} label="Утренний список" />
            </div>
            <div className="set-row">
              <div className="tx"><b>Напоминание по умолчанию</b><span>Подставляется в новые задачи со сроком.</span></div>
              <select className="select" style={{ width: 200 }} value={profile.defaultReminder ?? ''} id="set-default-remind"
                onChange={(e) => updateProfile({ defaultReminder: e.target.value === '' ? null : Number(e.target.value) })}>
                {REMINDERS.map((r) => <option key={String(r.v)} value={r.v ?? ''}>{r.label}</option>)}
              </select>
            </div>
            <div className="set-row">
              <div className="tx"><b><MessageCircle size={14} style={{ verticalAlign: -2 }} /> Дублировать в Telegram</b><span>Необязательно. Узнайте свой chat id у @userinfobot и напишите /start боту клуба.</span></div>
              <input className="input" style={{ width: 180 }} placeholder="chat id" defaultValue={profile.telegramChatId || ''} id="set-tg"
                onBlur={(e) => e.target.value !== (profile.telegramChatId || '') && updateProfile({ telegramChatId: e.target.value.trim() })} />
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-h"><h2 className="h2"><LayoutGrid size={17} style={{ verticalAlign: -2 }} /> Виджет на экран</h2></div>
          <div className="panel-b">
            <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
              Сайт-приложение не может само поставить виджет на iPhone. Поэтому виджет работает через бесплатное приложение Scriptable:
              он показывает ваши задачи на сегодня и ближайшую тренировку и обновляется сам.
            </p>
            {!widgetKey ? (
              <button className="btn" onClick={makeWidgetKey}>Создать личный ключ виджета</button>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <div className="codebox"><code>{widgetUrl}</code><button className="icon-btn" onClick={() => copy(widgetUrl)} aria-label="Скопировать"><Copy size={15} /></button></div>
                <ol className="steps">
                  <li>Установите Scriptable из App Store.</li>
                  <li>Создайте скрипт и вставьте код из файла <b>backend/widget/apex-widget.js</b>.</li>
                  <li>В первой строке замените адрес на ссылку выше.</li>
                  <li>Добавьте на экран виджет Scriptable и выберите этот скрипт.</li>
                </ol>
                <button className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={makeWidgetKey}><RotateCcw size={14} /> Выпустить новый ключ</button>
              </div>
            )}
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>На Android и iPhone на иконке приложения появляется число задач на сегодня.</p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-h"><h2 className="h2"><Palette size={17} style={{ verticalAlign: -2 }} /> Оформление</h2></div>
          <div className="panel-b">
            <div className="seg">
              {[['system', 'Как в системе'], ['dark', 'Тёмная'], ['light', 'Светлая']].map(([k, l]) => (
                <button key={k} className={theme === k ? 'on' : ''} onClick={() => { setTheme(k); applyTheme(k); }}>{l}</button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-h"><h2 className="h2"><Smartphone size={17} style={{ verticalAlign: -2 }} /> Установка на телефон</h2></div>
          <div className="panel-b">
            <ol className="steps">
              <li><b>iPhone:</b> Safari → «Поделиться» → «На экран „Домой“».</li>
              <li><b>Android:</b> Chrome → меню ⋮ → «Установить приложение».</li>
              <li><b>Компьютер:</b> Chrome или Edge → значок установки в адресной строке.</li>
            </ol>
            <p className="muted" style={{ fontSize: 13 }}>{isStandalone() ? 'Сейчас вы в установленном приложении.' : 'Сейчас вы в браузере.'} Вход сохраняется на устройстве: повторно вводить пароль не нужно.</p>
          </div>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={signOut}><LogOut size={16} /> Выйти из аккаунта</button>
          {demo && resetDemo && <button className="btn ghost" onClick={() => { resetDemo(); toast('Демо-данные сброшены'); }}><RotateCcw size={16} /> Сбросить демо-данные</button>}
        </div>
      </div>
    </div>
  );
}
