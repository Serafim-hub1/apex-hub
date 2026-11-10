import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/oswald/cyrillic-500.css';
import '@fontsource/oswald/cyrillic-600.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/oswald/latin-600.css';
import '@fontsource/manrope/cyrillic-400.css';
import '@fontsource/manrope/cyrillic-500.css';
import '@fontsource/manrope/cyrillic-600.css';
import '@fontsource/manrope/cyrillic-700.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import './styles/app.css';
import App from './App';
import { EMBED } from './config';
import { applyTheme, getTheme } from './pages/Settings';

applyTheme(getTheme());

if (!EMBED && 'serviceWorker' in navigator) {
  // autoUpdate: когда новая версия встала, страница сама перезагружается.
  // Установленное приложение почти не перезапускается (его разворачивают из фона),
  // поэтому проверяем обновление при каждом возврате в приложение и раз в час.
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      let last = Date.now();
      const check = () => {
        if (!navigator.onLine || Date.now() - last < 60e3) return;
        last = Date.now();
        reg.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      setInterval(check, 60 * 60e3);
    },
  })).catch(() => {});
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
