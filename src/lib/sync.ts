import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/**
 * Sincronização simulada: quando há rede, as alterações pendentes da fila (outbox)
 * são "enviadas". Na fase 2 este ponto envia para o servidor (Supabase).
 */
export function useSync() {
  const online = useOnline()
  const pendentes = useLiveQuery(() => db.outbox.where('sincronizado').equals(0).count(), [], 0)
  const [sincronizando, setSincronizando] = useState(false)

  useEffect(() => {
    if (!online || !pendentes) return
    setSincronizando(true)
    const t = setTimeout(async () => {
      await db.outbox.where('sincronizado').equals(0).modify({ sincronizado: 1 })
      setSincronizando(false)
    }, 1500)
    return () => clearTimeout(t)
  }, [online, pendentes])

  return { online, pendentes, sincronizando }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

export function useInstalarApp() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault()
      setEvento(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  return evento
    ? async () => {
        await evento.prompt()
        setEvento(null)
      }
    : null
}
