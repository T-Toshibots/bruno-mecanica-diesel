import { useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/banco'
import { registrarAoGravar } from './motor'
import { assinarRede, estaOnline } from './rede'
import { assinarEstadoSync, getEstadoSync, sincronizar } from './sincronizar'

const INTERVALO_MS = 60_000
/** Pendência mais velha que isso gera alerta (importante no iPhone, que pode apagar dados de PWAs). */
export const ALERTA_PENDENCIA_MS = 24 * 3600_000

/**
 * Gatilhos de sincronização: abertura do app, gravação local, volta da internet,
 * volta do app ao primeiro plano e checagem periódica.
 */
export function iniciarAgendador() {
  let timer: ReturnType<typeof setTimeout> | undefined
  registrarAoGravar(() => {
    clearTimeout(timer)
    timer = setTimeout(() => sincronizar(), 1200)
  })
  const aoVoltarRede = () => sincronizar({ forcar: true })
  const aoVisivel = () => document.visibilityState === 'visible' && sincronizar()
  window.addEventListener('online', aoVoltarRede)
  document.addEventListener('visibilitychange', aoVisivel)
  window.addEventListener('focus', aoVisivel)
  const intervalo = setInterval(() => sincronizar(), INTERVALO_MS)
  sincronizar()
  return () => {
    window.removeEventListener('online', aoVoltarRede)
    document.removeEventListener('visibilitychange', aoVisivel)
    window.removeEventListener('focus', aoVisivel)
    clearInterval(intervalo)
  }
}

export function useOnline() {
  return useSyncExternalStore(assinarRede, estaOnline)
}

export function useStatusSync() {
  const online = useOnline()
  const estado = useSyncExternalStore(assinarEstadoSync, getEstadoSync)
  const pendentes = useLiveQuery(() => db.outbox.count(), [], 0)
  const maisAntiga = useLiveQuery(async () => (await db.outbox.orderBy('seq').first())?.criado_em, [], undefined)
  const erros = useLiveQuery(() => db.sync_erros.count(), [], 0)
  const pendenciaAntiga = !!maisAntiga && Date.now() - new Date(maisAntiga).getTime() > ALERTA_PENDENCIA_MS
  return { online, ...estado, pendentes, erros, maisAntiga, pendenciaAntiga }
}
