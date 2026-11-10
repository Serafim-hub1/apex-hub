// После выкладки GitHub Pages удаляет старые файлы сборки. Если страница старой версии (например, приложение,
// развёрнутое из фона) пытается догрузить свой модуль, получает ошибку загрузки. Тогда один раз перезагружаемся —
// встаёт новая версия. Защита от цикла: не чаще раза в 30 секунд.
const KEY = 'apex-reload-at';

export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30e3) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { return false; }
  window.location.reload();
  return true;
}
