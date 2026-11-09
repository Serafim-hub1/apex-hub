import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { FilePlus, Pin, PinOff, Trash2, Eye, Pencil, Bold, Italic, Heading2, List, ListChecks, Quote, Link2, Table, ChevronRight, FileText, Minus } from 'lucide-react';
import { useStore } from '../lib/store';
import { Confirm, Empty, useToast } from '../components/ui';
import { fmt } from '../lib/dates';

marked.setOptions({ gfm: true, breaks: true });
const EMOJI = ['📄', '📌', '💳', '💬', '🏀', '🏔️', '🗓️', '📋', '🧾', '📣', '🎯', '🏆', '👕', '🏫', '🤝', '⚙️', '📈', '💡', '🔑', '📞', '🧠', '✅', '🎥', '🎵'];

function renderMd(src) {
  const html = marked.parse(src || '');
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
  return clean.replace(/<li>(\s*)<input/g, '<li class="task-li">$1<input').replace(/ disabled=""/g, '');
}

function toggleNthTask(src, n) {
  let i = -1;
  return src.replace(/^(\s*(?:[-*+]|\d+\.)\s+)\[( |x|X)\]/gm, (m, pre, mark) => {
    i += 1;
    if (i !== n) return m;
    return `${pre}[${mark === ' ' ? 'x' : ' '}]`;
  });
}

function useTree(notes) {
  return useMemo(() => {
    const kids = {};
    notes.forEach((n) => { (kids[n.parentId || 'root'] ||= []).push(n); });
    Object.values(kids).forEach((l) => l.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.title || '').localeCompare(b.title || '', 'ru')));
    return kids;
  }, [notes]);
}

export default function Notes() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { notes, createNote, loaded } = useStore();
  const nav = useNavigate();
  const kids = useTree(notes);
  const creating = useRef(false);

  useEffect(() => {
    if (params.get('new') === '1' && !creating.current) {
      creating.current = true;
      const parentId = params.get('parent') || null;
      createNote({ parentId }).then((nid) => { creating.current = false; nav(`/notes/${nid}?edit=1`, { replace: true }); });
    }
  }, [params, createNote, nav, setParams]);

  const note = id ? notes.find((n) => n.id === id) : null;

  return (
    <div className="page wide">
      <div className="notes-shell">
        <aside className="hide-m">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '6px 4px 10px' }}>
            <span className="eyebrow">Страницы</span>
            <Link to="/notes?new=1" className="icon-btn" aria-label="Новая страница"><FilePlus size={17} /></Link>
          </div>
          <div className="note-tree"><Tree kids={kids} parent="root" depth={0} /></div>
        </aside>
        <div style={{ minWidth: 0 }}>
          {!id && <NotesHome kids={kids} />}
          {id && note && <NotePage key={note.id} note={note} kids={kids} />}
          {id && !note && loaded && <Empty icon={FileText} action={<Link className="btn" to="/notes">Ко всем страницам</Link>}>Страница удалена или ещё не загрузилась.</Empty>}
        </div>
      </div>
    </div>
  );
}

function Tree({ kids, parent, depth }) {
  return (kids[parent] || []).map((n) => (
    <div key={n.id}>
      <NavLink to={`/notes/${n.id}`} style={{ paddingLeft: 8 + depth * 14 }}>
        <span>{n.icon || '📄'}</span><span className="t">{n.title || 'Без названия'}</span>
        {n.pinned && <Pin size={12} style={{ marginLeft: 'auto', color: 'var(--muted)', flex: 'none' }} />}
      </NavLink>
      {depth < 3 && <Tree kids={kids} parent={n.id} depth={depth + 1} />}
    </div>
  ));
}

function NotesHome({ kids }) {
  const { userById } = useStore();
  const top = kids.root || [];
  return (
    <>
      <div className="page-head">
        <div className="lead"><span className="eyebrow acc">Вики клуба</span><h1 className="h1">База знаний</h1></div>
        <Link to="/notes?new=1" className="btn primary"><FilePlus size={16} /> Новая страница</Link>
      </div>
      {top.length === 0 && <Empty icon={FileText}>Здесь будут регламенты, прайсы, шаблоны сообщений и планы тренировок.</Empty>}
      <div className="note-cards">
        {top.map((n) => (
          <Link key={n.id} to={`/notes/${n.id}`} className="note-card">
            <span className="ic">{n.icon || '📄'}</span>
            <b>{n.title || 'Без названия'}</b>
            <span>{(kids[n.id] || []).length ? `${(kids[n.id] || []).length} подстр. · ` : ''}{fmt(n.updatedAt, 'd MMM')}{userById[n.updatedBy] ? ` · ${userById[n.updatedBy].name}` : ''}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

function NotePage({ note, kids }) {
  const { updateNote, deleteNote, notes, userById } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [title, setTitle] = useState(note.title || '');
  const [content, setContent] = useState(note.content || '');
  const [edit, setEdit] = useState(params.get('edit') === '1' || !note.content);
  const [emoji, setEmoji] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(true);
  const timer = useRef(null);
  const ta = useRef(null);
  const pending = useRef({});

  // Чужие правки подтягиваем, пока страница не редактируется.
  useEffect(() => {
    if (!edit && saved) { setContent(note.content || ''); setTitle(note.title || ''); }
  }, [note.content, note.title]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = () => {
    clearTimeout(timer.current);
    const p = pending.current; pending.current = {};
    if (Object.keys(p).length) updateNote(note.id, p).then(() => setSaved(true));
  };
  const queue = (patch) => {
    pending.current = { ...pending.current, ...patch };
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const html = useMemo(() => renderMd(content), [content]);
  const parents = [];
  for (let p = notes.find((n) => n.id === note.parentId); p && parents.length < 4; p = notes.find((n) => n.id === p.parentId)) parents.unshift(p);

  const wrap = (before, after = before, placeholder = 'текст') => {
    const el = ta.current; if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = content.slice(s, e) || placeholder;
    const next = content.slice(0, s) + before + sel + after + content.slice(e);
    setContent(next); queue({ content: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length); });
  };
  const line = (prefix) => {
    const el = ta.current; if (!el) return;
    const s = el.selectionStart;
    const ls = content.lastIndexOf('\n', s - 1) + 1;
    const next = content.slice(0, ls) + prefix + content.slice(ls);
    setContent(next); queue({ content: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + prefix.length, s + prefix.length); });
  };
  const insert = (text) => {
    const el = ta.current; if (!el) return;
    const s = el.selectionStart;
    const next = content.slice(0, s) + text + content.slice(s);
    setContent(next); queue({ content: next });
  };

  return (
    <article className="note-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
        <Link to="/notes" style={{ color: 'inherit', textDecoration: 'none' }}>База знаний</Link>
        {parents.map((p) => (
          <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ChevronRight size={13} /><Link to={`/notes/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{p.icon} {p.title}</Link></span>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 12, marginRight: 6 }}>{saved ? `Изменено ${fmt(note.updatedAt, 'd MMM, HH:mm')}${userById[note.updatedBy] ? ` · ${userById[note.updatedBy].name}` : ''}` : 'Сохраняем…'}</span>
          <button className="icon-btn" onClick={() => updateNote(note.id, { pinned: !note.pinned })} aria-label={note.pinned ? 'Открепить' : 'Закрепить в меню'} title={note.pinned ? 'Открепить' : 'Закрепить в меню'}>
            {note.pinned ? <PinOff size={17} /> : <Pin size={17} />}
          </button>
          <button className="icon-btn" onClick={() => setConfirm(true)} aria-label="Удалить страницу"><Trash2 size={17} /></button>
        </span>
      </div>

      <div style={{ position: 'relative' }}>
        <button className="note-icon" onClick={() => setEmoji(!emoji)} aria-label="Сменить иконку">{note.icon || '📄'}</button>
        {emoji && (
          <div className="emoji-grid">
            {EMOJI.map((e) => <button key={e} onClick={() => { updateNote(note.id, { icon: e }); setEmoji(false); }}>{e}</button>)}
          </div>
        )}
      </div>
      <input className="note-title" value={title} placeholder="Без названия" id="note-title"
        onChange={(e) => { setTitle(e.target.value); queue({ title: e.target.value }); }} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '6px 0 10px' }}>
        <div className="seg">
          <button className={!edit ? 'on' : ''} onClick={() => { flush(); setEdit(false); }}><Eye size={14} /> Просмотр</button>
          <button className={edit ? 'on' : ''} onClick={() => setEdit(true)}><Pencil size={14} /> Правка</button>
        </div>
      </div>

      {edit ? (
        <>
          <div className="md-toolbar" role="toolbar" aria-label="Форматирование">
            <button onClick={() => line('## ')} title="Заголовок"><Heading2 size={16} /></button>
            <button onClick={() => wrap('**')} title="Жирный"><Bold size={16} /></button>
            <button onClick={() => wrap('*')} title="Курсив"><Italic size={16} /></button>
            <button onClick={() => line('- ')} title="Список"><List size={16} /></button>
            <button onClick={() => line('- [ ] ')} title="Чек-лист"><ListChecks size={16} /></button>
            <button onClick={() => line('> ')} title="Цитата"><Quote size={16} /></button>
            <button onClick={() => wrap('[', '](https://)', 'ссылка')} title="Ссылка"><Link2 size={16} /></button>
            <button onClick={() => insert('\n| Колонка | Колонка |\n|---|---|\n| | |\n')} title="Таблица"><Table size={16} /></button>
            <button onClick={() => insert('\n---\n')} title="Разделитель"><Minus size={16} /></button>
          </div>
          <textarea ref={ta} className="md-editor" value={content} id="note-content" autoFocus={params.get('edit') === '1'}
            placeholder={'Пишите как в мессенджере. Подсказки:\n## Заголовок\n- пункт списка\n- [ ] задача-чекбокс\n**жирный**'}
            onChange={(e) => { setContent(e.target.value); queue({ content: e.target.value }); }} />
        </>
      ) : (
        <div className="md" onClick={(e) => {
          if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
            const all = [...e.currentTarget.querySelectorAll('input[type=checkbox]')];
            const next = toggleNthTask(content, all.indexOf(e.target));
            setContent(next); queue({ content: next });
          }
        }} onDoubleClick={(e) => { if (e.target.tagName !== 'INPUT') setEdit(true); }}
          dangerouslySetInnerHTML={{ __html: html || '<p class="muted">Пустая страница. Нажмите «Правка», чтобы начать.</p>' }} />
      )}

      <div className="subpages">
        {(kids[note.id] || []).map((n) => <Link key={n.id} to={`/notes/${n.id}`}><span>{n.icon || '📄'}</span>{n.title || 'Без названия'}</Link>)}
        <Link to={`/notes?new=1&parent=${note.id}`} style={{ color: 'var(--muted)', borderStyle: 'dashed', fontWeight: 500 }}><FilePlus size={16} /> Подстраница</Link>
      </div>

      {confirm && (
        <Confirm title="Удалить страницу?" text={(kids[note.id] || []).length ? 'Вместе с ней удалятся все подстраницы.' : `«${note.title || 'Без названия'}» исчезнет у всей команды.`}
          onNo={() => setConfirm(false)}
          onYes={async () => { pending.current = {}; clearTimeout(timer.current); await deleteNote(note.id); toast('Страница удалена'); nav('/notes'); }} />
      )}
    </article>
  );
}
