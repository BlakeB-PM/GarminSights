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
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^\/api\//,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 10,
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
