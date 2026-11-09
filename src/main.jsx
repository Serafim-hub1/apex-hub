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
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
