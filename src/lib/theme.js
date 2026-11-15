// Тема оформления: «Системная / Светлая / Тёмная». Отдельный файл, чтобы main.jsx не тянул всю страницу настроек.
export function getTheme() { try { return localStorage.getItem('apex-theme') || 'system'; } catch { return 'system'; } }
const lightMq = () => window.matchMedia?.('(prefers-color-scheme: light)');
/** Цвет системной панели (Android, установленное приложение) — под цвет фона выбранной темы. */
function syncThemeColor(t) {
  const light = t === 'light' || (t === 'system' && !!lightMq()?.matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f5f6f4' : '#111315');
}
export function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  try { localStorage.setItem('apex-theme', t); } catch { /* */ }
  syncThemeColor(t);
}
lightMq()?.addEventListener?.('change', () => syncThemeColor(getTheme()));
