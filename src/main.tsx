import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/saira-condensed/700.css'
import '@fontsource/saira-condensed/800.css'
import './index.css'
import { aplicarCoresDoTema } from './config/tema'
import { aplicarTemaSalvo } from './lib/tema-visual'
import { registrarPWA } from './app/atualizacao'
import { App } from './App'

aplicarCoresDoTema()
aplicarTemaSalvo()
registrarPWA()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
