import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { tema } from './src/config/tema'

export default defineConfig({
  base: '/bruno-mecanica-diesel/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // O registro é feito em src/app/atualizacao.ts: o service worker novo assume na hora
      // (aparelhos com versão antiga se atualizam sozinhos) e a tela só recarrega depois de sincronizar.
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.png', 'apple-touch-icon.png', tema.logo],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: tema.nomeSistema,
        short_name: tema.nomeCurto,
        description: `Ordens de serviço, clientes e financeiro — ${tema.nomeSistema}`,
        lang: 'pt-BR',
        theme_color: tema.cores.fundoEscuro,
        background_color: tema.cores.fundoEscuro,
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
