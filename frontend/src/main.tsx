import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './lib/pwa';
import App from './App';
import './index.css';

// Returning from a Cloudflare Access re-auth: `/reauth` is a sentinel path
// used only to force a network navigation through Cloudflare's login when the
// session expires (see lib/api.ts). Now that the cookie is fresh, bounce back
// to wherever the user was. Runs before render so BrowserRouter never sees it.
if (window.location.pathname === '/reauth') {
  const next = new URLSearchParams(window.location.search).get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  window.history.replaceState(null, '', target);
}

// Reload the page when a NEW service worker takes control. We only want
// this to fire on updates, not on the user's very first visit — on first
// install there's no prior controller, and clientsClaim() would otherwise
// cause an unwanted reload right after the initial page load.
// Listener must be registered before registerSW() to avoid a timing race
// where controllerchange fires before workbox-window's own listener is
// set up, causing the reload to be silently missed.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
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
