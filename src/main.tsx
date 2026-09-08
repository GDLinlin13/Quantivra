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

createRoot(document.getElementById('root')!).render(<App />);
