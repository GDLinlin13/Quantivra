import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// A previous build shipped a PWA service worker (vite-plugin-pwa). This build has
// none, so without this a stale SW keeps serving the old cached app forever.
// Unregister any service worker and drop its caches, once.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    if (!regs.length) return;
    Promise.all(regs.map(r => r.unregister()))
      .then(() => (window.caches ? caches.keys() : Promise.resolve([])))
      .then(keys => Promise.all((keys as string[]).map(k => caches.delete(k))))
      .then(() => {
        if (!sessionStorage.getItem('sw-cleared')) {
          sessionStorage.setItem('sw-cleared', '1');
          location.reload();
        }
      });
  }).catch(() => {});
}

// After a new version is deployed, a tab that was already open still points at the old
// code files, which no longer exist; loading one of them fails. Reload once to pick up the
// new version (guarded so a real outage can't cause a reload loop).
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('qv-reloaded-at') || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('qv-reloaded-at', String(Date.now()));
  } catch { /* storage blocked: still reload */ }
  event.preventDefault();
  location.reload();
});

createRoot(document.getElementById('root')!).render(<App />);
