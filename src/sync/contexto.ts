import { getLocal, setLocal } from '../db/banco'
import type { Papel } from '../domain/tipos'

export interface Sessao {
  usuario_id: string
  nome: string
  papel: Papel
  funcionario_id?: string
}

let sessaoAtual: Sessao | null = null
let deviceIdCache: string | null = null

export const getSessao = () => sessaoAtual

export async function carregarSessao() {
  sessaoAtual = await getLocal<Sessao | null>('sessao', null)
  return sessaoAtual
}

/** A sessão fica guardada no aparelho para o app abrir offline (login offline). */
export async function salvarSessao(s: Sessao | null) {
  sessaoAtual = s
  await setLocal('sessao', s)
}

export async function getDeviceId() {
  if (deviceIdCache) return deviceIdCache
  let id = await getLocal<string | null>('device_id', null)
  if (!id) {
    id = crypto.randomUUID()
    await setLocal('device_id', id)
  }
  deviceIdCache = id
  return id
}

export function limparCacheContexto() {
  sessaoAtual = null
  deviceIdCache = null
}
