import { defineConfig } from '@playwright/test'

// Usa o Chrome instalado na máquina (não precisa baixar navegadores).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173/bruno-mecanica-diesel/',
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/bruno-mecanica-diesel/',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
