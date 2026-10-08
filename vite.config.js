import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  // Relative base so the build works from any folder (GitHub Pages, Netlify, a USB stick...).
  base: './',
  build: { chunkSizeWarningLimit: 1000 }, // three.js alone is ~600 kB
  plugins: [
    // `npm run dev -- --host` serves https so phones on the same Wi-Fi can use the
    // microphone (the tuner); plain localhost stays http.
    ...(process.argv.includes('--host') ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'models/*.glb'],
      manifest: {
        name: 'Fingering Chart 3D',
        short_name: 'Fingerings',
        description: '3D fingering chart for brass and woodwind instruments',
        theme_color: '#14161c',
        background_color: '#14161c',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,glb}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        // Cache instrument samples after their first download so the app works offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('github.io') || url.hostname === 'goldst.dev',
            handler: 'CacheFirst',
            options: {
              cacheName: 'instrument-samples',
              expiration: { maxEntries: 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
