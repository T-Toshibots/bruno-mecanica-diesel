import { useEffect, useState } from 'react'

export type ModoTema = 'escuro' | 'claro' | 'sistema'
const CHAVE = 'bmd-tema'

function ler(): ModoTema {
  try {
    return (localStorage.getItem(CHAVE) as ModoTema) || 'escuro'
  } catch {
    return 'escuro'
  }
}

function aplicar(modo: ModoTema) {
  const escuro = modo === 'escuro' || (modo === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = escuro ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#0F0F0F' : '#F2F2EF')
}

export const aplicarTemaSalvo = () => aplicar(ler())

export function useTemaVisual() {
  const [modo, setModo] = useState<ModoTema>(ler)
  useEffect(() => {
    aplicar(modo)
    try { localStorage.setItem(CHAVE, modo) } catch { /* sem armazenamento */ }
    if (modo !== 'sistema') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const h = () => aplicar('sistema')
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [modo])
  const alternar = () => setModo((m) => (m === 'escuro' ? 'claro' : m === 'claro' ? 'sistema' : 'escuro'))
  return { modo, alternar }
}
