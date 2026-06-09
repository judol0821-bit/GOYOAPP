import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'goyo-icon.svg',
        'manifest.webmanifest',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-icon-512.png',
        'icons/apple-touch-icon.png',
        'branding/app-icon/icon-192.png',
        'branding/app-icon/icon-512.png',
        'branding/app-icon/maskable-icon-512.png',
        'branding/logo/goyo-header-logo.svg',
        'branding/logo/goyo-wordmark.svg',
        'branding/splash/splash-logo.svg',
        'sw-push-listener.js',
      ],
      manifest: false,
      devOptions: {
        enabled: false,
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        importScripts: ['/sw-push-listener.js'],
      },
    }),
  ],
});
