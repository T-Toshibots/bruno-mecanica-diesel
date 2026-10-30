import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { db } from '../db/banco'
import { sincronizar } from '../sync/sincronizar'

let atualizarSW: ((recarregar?: boolean) => Promise<void>) | null = null
let disponivel = false
const ouvintes = new Set<() => void>()

export function registrarPWA() {
  atualizarSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      disponivel = true
      ouvintes.forEach((f) => f())
    },
  })
}

/** Atualiza o app só depois de sincronizar, para não perder nada. Retorna false se ainda há pendências. */
export async function aplicarAtualizacao() {
  await sincronizar({ forcar: true })
  if ((await db.outbox.count()) > 0) return false
  await atualizarSW?.(true)
  return true
}

export function useNovaVersao() {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => disponivel,
  )
}
