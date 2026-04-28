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
          name: 'GarminSights',
          short_name: 'GarminSights',
          description: 'Personal fitness analytics dashboard powered by your Garmin data',
          start_url: '/',
          display: 'standalone',
          background_color: '#0d1528',
          theme_color: '#0d1528',
          orientation: 'portrait-primary',
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
          navigateFallback: '/index.html',
          // Use a pathname check so the denylist works for both relative (/api/...)
          // and absolute (https://host/api/...) URLs that reach the SW.
          navigateFallbackDenylist: [/\/api\//],
          // Never intercept /api/* requests. Under fly.io's auto-stop the
          // backend can take 15-30s to cold-start; a short SW timeout here
          // aborts the fetch before the machine is ready and the user sees
          // a spurious "backend not running" error. Let the browser's own
          // fetch timeout (much longer) handle this instead.
          //
          // The pattern uses a function so it matches on the URL pathname,
          // not the full href — the SW sees absolute URLs even when the page
          // used a relative path like /api/auth/status.
          runtimeCaching: [
            {
              urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
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
