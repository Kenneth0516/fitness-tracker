import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const pagesPath = (process.env.PAGES_BASE_PATH ?? 'fitness-tracker').replace(/^\/+|\/+$/g, '')

export default defineConfig({
  base: pagesPath ? `/${pagesPath}/` : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: './',
        start_url: './',
        scope: './',
        name: 'Fitness Tracker',
        short_name: 'Fitness Tracker',
        description: '個人訓練、體重和 PR 記錄',
        lang: 'zh-Hant-HK',
        display: 'standalone',
        background_color: '#0c0e16',
        theme_color: '#0c0e16',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,png,webp,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
  build: {
    target: ['chrome111', 'safari16.4'],
    rollupOptions: {
      output: { manualChunks: { charts: ['recharts'] } },
    },
  },
})
