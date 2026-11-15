import { lazy } from 'react';
import { HashRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EMBED } from './config';
import { StoreProvider, useStore } from './lib/store';
import { reloadOnce } from './lib/reload';
import { ToastProvider } from './components/ui';
import { Splash } from './components/motion';
import Layout from './components/Layout';
import Login from './pages/Login';
import Today from './pages/Today';

// Остальные разделы грузятся при первом открытии — стартовый файл меньше.
// Ошибка загрузки = устаревшая версия после выкладки → один раз перезагружаемся.
const page = (load) => lazy(() => load().catch((e) => {
  if (reloadOnce()) return new Promise(() => {});
  throw e;
}));
const Tasks = page(() => import('./pages/Tasks'));
const Calendar = page(() => import('./pages/Calendar'));
const Club = page(() => import('./pages/Club'));
const Notes = page(() => import('./pages/Notes'));
const Settings = page(() => import('./pages/Settings'));

function Boot() {
  const { auth } = useStore();
  return <Splash ready={auth.status !== 'loading'} />;
}

function Gate() {
  const { auth } = useStore();
  if (auth.status === 'loading') return null; // экран закрыт заставкой
  if (auth.status === 'error') return <div className="splash"><div className="banner warn">Не удалось запустить приложение: {auth.error}</div></div>;
  if (auth.status === 'out') return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Today />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="club" element={<Club />} />
        <Route path="notes" element={<Notes />} />
        <Route path="notes/:id" element={<Notes />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const Router = EMBED ? MemoryRouter : HashRouter;
  return (
    <StoreProvider>
      <ToastProvider>
        <Router><Gate /></Router>
        <Boot />
      </ToastProvider>
    </StoreProvider>
  );
}
