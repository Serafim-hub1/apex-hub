import { HashRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EMBED } from './config';
import { StoreProvider, useStore } from './lib/store';
import { ToastProvider } from './components/ui';
import { SummitMark } from './components/Brand';
import Layout from './components/Layout';
import Login from './pages/Login';
import Today from './pages/Today';
import Tasks from './pages/Tasks';
import Calendar from './pages/Calendar';
import Club from './pages/Club';
import Notes from './pages/Notes';
import Settings from './pages/Settings';

function Gate() {
  const { auth } = useStore();
  if (auth.status === 'loading') return <div className="splash"><SummitMark size={64} /></div>;
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
      </ToastProvider>
    </StoreProvider>
  );
}
