import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a new version waits until the user taps "Reload" (see
      // src/components/pwa/PwaPrompt.tsx) instead of swapping code under
      // someone who is halfway through entering a reading or payment.
      registerType: 'prompt',
      // Registration is done from PwaPrompt via the virtual module, so the
      // plugin must not also inject its own register script.
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png', 'branding/deco-logo.png'],
      manifest: {
        id: '/',
        name: 'DECO Utility Billing',
        short_name: 'DECO Billing',
        description: 'DECO Utility Billing System — staff and customer portal',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        lang: 'en',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only (built JS/CSS/HTML/images/fonts).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // The charts bundle can exceed workbox's 2 MB default, which would
        // silently leave it out of the cache.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // Any page navigation falls back to the cached shell, EXCEPT the
        // API and uploaded media, which must always hit the network.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
        runtimeCaching: [
          {
            // Live data is NEVER cached: bills, payments, readings, photos,
            // logins. (Matches the API on any origin, e.g. billing-api.*)
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-styles' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})