// Estado da conexão. Na demonstração dá para "simular sem internet" para apresentar o modo offline no computador.

const CHAVE = 'bmd-simular-offline'
const ouvintes = new Set<() => void>()

let simular = (() => {
  try {
    return localStorage.getItem(CHAVE) === '1'
  } catch {
    return false
  }
})()

export const simulandoOffline = () => simular

export function setSimularOffline(v: boolean) {
  simular = v
  try { localStorage.setItem(CHAVE, v ? '1' : '0') } catch { /* sem armazenamento */ }
  avisar()
  if (!v && typeof window !== 'undefined') window.dispatchEvent(new Event('online'))
}

export const estaOnline = () => (typeof navigator === 'undefined' || navigator.onLine !== false) && !simular

function avisar() {
  ouvintes.forEach((f) => f())
}

export function assinarRede(f: () => void) {
  ouvintes.add(f)
  window.addEventListener('online', f)
  window.addEventListener('offline', f)
  return () => {
    ouvintes.delete(f)
    window.removeEventListener('online', f)
    window.removeEventListener('offline', f)
  }
}
