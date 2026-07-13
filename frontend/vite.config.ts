import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'icon-*.png'],
        manifest: {
          id: '/',
          name: 'GarminSights',
          short_name: 'GarminSights',
          description: 'Personal fitness analytics dashboard powered by your Garmin data',
          start_url: '/',
          display: 'standalone',
          // display_override lets Chrome fall back gracefully when a display
          // mode isn't supported (e.g. desktop ignores fullscreen).
          display_override: ['standalone', 'minimal-ui'],
          background_color: '#0d1528',
          theme_color: '#0d1528',
          // Intentionally no `orientation` — locking to portrait-primary is
          // hostile to tablets/desktop and Chrome may surface it as a manifest
          // warning that suppresses installability on rotated devices.
          icons: [
            {
              src: '/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icon-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // This origin is gated by Cloudflare Access. Navigations must never
          // be served cache-first: if the Access session has expired, only a
          // real network round-trip to the origin gets the browser redirected
          // to the Access login gate, and only a real network round-trip picks
          // up a fresh deploy on a plain reload. `navigateFallback: null`
          // disables Workbox's precached "always answer navigations from the
          // app shell" behavior entirely — see the NetworkFirst navigation
          // route below for the actual (network-first, cache-as-fallback)
          // handling.
          navigateFallback: null,
          // `navigateFallback: null` alone is NOT sufficient: workbox-precaching's
          // `precacheAndRoute()` always registers its own fetch route (ahead of
          // the runtimeCaching routes below) that matches a request for `/` by
          // appending `directoryIndex` (default "index.html") and checking the
          // precache manifest — since index.html is precached (globPatterns
          // includes html), that implicit route would still serve `/` straight
          // from the precache, cache-first, completely bypassing the NetworkFirst
          // navigation route below. Setting `directoryIndex: null` disables that
          // matching so root navigations actually fall through to our own
          // network-first route instead of being silently shadowed.
          directoryIndex: null,
          // Without skipWaiting/clientsClaim a freshly installed SW sits
          // in "waiting" forever while the old SW keeps controlling every
          // tab on this origin (incognito is the only escape). With them
          // the new SW activates immediately, fires `controllerchange`,
          // and main.tsx reloads the page so the user sees the new build.
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          // Never intercept /api/* requests. Under fly.io's auto-stop the
          // backend can take 15-30s to cold-start; a short SW timeout here
          // aborts the fetch before the machine is ready and the user sees
          // a spurious "backend not running" error. Let the browser's own
          // fetch timeout (much longer) handle this instead.
          //
          // Note: the previous `urlPattern: /^\/api\//` regex here was dead
          // code — Workbox tests runtimeCaching regexes against the full URL
          // href (e.g. "https://host/api/foo"), which never starts with
          // "/api/", so it never matched anything. Use a function matcher
          // against url.pathname instead.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
            // Navigations (top-level document requests) go network-first:
            // try the network so an expired Cloudflare Access session hits
            // the Access login gate and fresh deploys show up immediately;
            // only fall back to the cache when actually offline. Exclude
            // /api/* (handled above) and /cdn-cgi/* (Cloudflare's own
            // endpoints, including the Access login flow) so this route
            // never shadows them.
            {
              urlPattern: ({ request, url }) =>
                request.mode === 'navigate' &&
                !url.pathname.startsWith('/api/') &&
                !url.pathname.startsWith('/cdn-cgi/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'app-shell',
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    server: {
      proxy: env.VITE_API_URL
        ? undefined
        : {
            // In local development (no VITE_API_URL set) proxy /api calls to the backend
            '/api': {
              target: 'http://localhost:8000',
              changeOrigin: true,
            },
          },
    },
  }
})
