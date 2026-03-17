import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Reload the page when a new service worker takes control.
// This listener must be registered before registerSW() to avoid a timing
// race where the controllerchange event fires before workbox-window's own
// listener is set up, causing the reload to be silently missed.
if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    const tryUpdate = () => {
      if (!registration.installing && navigator.onLine) {
        registration.update();
      }
    };

    // Poll every 60 seconds for users who keep the app open continuously.
    setInterval(tryUpdate, 60 * 1000);

    // Check immediately when the app becomes visible again (e.g. user
    // switches back from another app or tab). This is the most common
    // case where a PWA misses an update.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tryUpdate();
    });

    // Check when coming back online after being offline.
    window.addEventListener('online', tryUpdate);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
