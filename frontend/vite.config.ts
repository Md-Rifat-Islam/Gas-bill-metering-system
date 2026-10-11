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
        // The two heaviest libraries (charts, barcode scanner) are NOT
        // precached on the first visit — the service worker downloads
        // everything in its precache list in the background, and that
        // competed with the page's own first load. They're cached the first
        // time they're actually used instead (runtimeCaching below).
        globIgnores: ['**/vendor-charts-*.js', '**/vendor-scanner-*.js'],
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
            // Heavy, rarely-first-needed vendor chunks: cached on first use.
            // Filenames are content-hashed, so CacheFirst is safe.
            urlPattern: ({ url }: { url: URL }) =>
              /\/assets\/vendor-(charts|scanner)-.*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'heavy-vendor-chunks',
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
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
  build: {
    rollupOptions: {
      output: {
        // Stable, cache-friendly vendor chunks. Route-level code splitting
        // (React.lazy in App.tsx) decides WHEN a chunk loads; this decides
        // what is shared. Charts and the barcode scanner are big and only
        // used on a few screens, so they get their own files and are never
        // part of the first-load bundle.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('html5-qrcode')) return 'vendor-scanner'

          if (
            /node_modules\/(recharts|recharts-scale|react-smooth|victory-vendor|d3-[^/]+|internmap|decimal\.js-light|fast-equals|eventemitter3|lodash|react-transition-group)\//.test(id)
          ) {
            return 'vendor-charts'
          }

          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) {
            return 'vendor-react'
          }

          return undefined
        },
      },
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