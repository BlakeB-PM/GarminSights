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
  // Poll for a new service worker every 60 seconds. Without this, a
  // standalone PWA only checks on navigation — so users who keep the app
  // open never see updates until they manually relaunch.
  onRegisteredSW(_swUrl, registration) {
    registration &&
      setInterval(() => {
        if (!registration.installing && navigator.onLine) {
          registration.update();
        }
      }, 60 * 1000);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
