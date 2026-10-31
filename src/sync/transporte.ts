import type { TabelaSync } from '../db/banco'
import type { Base } from '../domain/tipos'
import type { Sessao } from './contexto'

export type Registro = Base & Record<string, unknown>

export interface ItemEnvio {
  tabela: TabelaSync
  registro: Registro
}

export type ResultadoEnvio =
  | { status: 'ok'; registro: Registro }
  /** Recusado por regra (permissão, OS travada). `registro` = versão atual do servidor, para desfazer a alteração local. */
  | { status: 'recusado'; mensagem: string; registro?: Registro }

export interface Recebidos {
  registros: { tabela: TabelaSync; registro: Registro }[]
  /** Hora do servidor; o próximo pull pede só o que mudou depois dela. */
  agora: string
}

/**
 * Ponto de troca entre o servidor de demonstração e o Supabase.
 * A implementação Supabase chamará as funções `sync_push` / `sync_pull`
 * definidas em supabase/migrations.
 */
export interface Transporte {
  nome: 'demo' | 'supabase'
  enviar(itens: ItemEnvio[], sessao: Sessao): Promise<ResultadoEnvio[]>
  receber(desde: string | null, sessao: Sessao): Promise<Recebidos>
  /** Fotos: envio para o Storage (Supabase Storage na versão com servidor). */
  enviarArquivo(id: string, blob: Blob, tipo: string, sessao: Sessao): Promise<void>
  /** Baixa a foto completa quando ela não está no aparelho (null = não existe). */
  baixarArquivo(id: string): Promise<Blob | null>
}

export class ErroRede extends Error {
  constructor() {
    super('Sem conexão com o servidor')
  }
}
