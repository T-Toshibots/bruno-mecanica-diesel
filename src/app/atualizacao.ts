import { useSyncExternalStore } from 'react'
import { db } from '../db/banco'
import { sincronizar } from '../sync/sincronizar'

let disponivel = false
const ouvintes = new Set<() => void>()
const avisar = () => { disponivel = true; ouvintes.forEach((f) => f()) }

/**
 * O service worker novo assume assim que é instalado (assim nenhum aparelho fica preso
 * numa versão antiga). A tela aberta continua rodando a versão atual até o usuário tocar em
 * "Sincronizar e atualizar" — os dados ficam no IndexedDB e nunca se perdem na troca.
 */
export function registrarPWA() {
  if (!('serviceWorker' in navigator)) return
  const jaTinhaVersao = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (jaTinhaVersao) avisar() })
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).then((reg) => {
    // procura versão nova a cada 30 minutos e quando o app volta ao primeiro plano
    setInterval(() => reg.update().catch(() => undefined), 30 * 60_000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => undefined))
  }).catch(() => undefined)
}

/** Atualiza o app só depois de sincronizar, para não perder nada. Retorna false se ainda há pendências. */
export async function aplicarAtualizacao() {
  await sincronizar({ forcar: true })
  if ((await db.outbox.count()) > 0) return false
  location.reload()
  return true
}

export function useNovaVersao() {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => disponivel,
  )
}
