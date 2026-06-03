import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['goyo-icon.svg'],
      manifest: {
        name: 'GOYO',
        short_name: 'GOYO',
        description: 'GOYO mobile PWA',
        theme_color: '#111111',
        background_color: '#F7F4EF',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/goyo-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
