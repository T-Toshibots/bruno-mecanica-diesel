import Dexie, { type Table } from 'dexie'
import type {
  Auditoria, Cliente, ClienteContato, ClientePreco, Fornecedor, Funcionario, FuncionarioSalario, OficinaConfig, OrdemServico, OSAssinatura, OSFoto, OSItem,
  OSApontamento, OSAprovacao, OSMecanico, OSStatusHist, OSVeiculo, Perfil, ServicoCatalogo, SyncConflito, Veiculo, VeiculoClienteHist,
} from '../domain/tipos'

/** Tabelas que existem no aparelho e no servidor e são sincronizadas. */
export const ESQUEMA_SYNC = {
  oficina_config: 'id, updated_at',
  perfis: 'id, updated_at',
  funcionarios: 'id, updated_at',
  funcionarios_salario: 'id, updated_at, funcionario_id',
  clientes: 'id, updated_at, nome',
  cliente_contatos: 'id, updated_at, cliente_id',
  cliente_precos: 'id, updated_at, cliente_id',
  fornecedores: 'id, updated_at, nome',
  veiculos: 'id, updated_at, cliente_id, placa',
  veiculo_clientes_hist: 'id, updated_at, veiculo_id',
  servicos_catalogo: 'id, updated_at',
  os: 'id, updated_at, cliente_id, status, numero',
  os_veiculos: 'id, updated_at, os_id, veiculo_id',
  os_mecanicos: 'id, updated_at, os_id, funcionario_id',
  os_itens: 'id, updated_at, os_id',
  os_fotos: 'id, updated_at, os_id',
  os_assinaturas: 'id, updated_at, os_id',
  os_status_hist: 'id, updated_at, os_id',
  os_apontamentos: 'id, updated_at, os_id, funcionario_id',
  os_aprovacoes: 'id, updated_at, os_id',
  sync_conflitos: 'id, updated_at',
  auditoria: 'id, updated_at, registro_id',
} as const

export type TabelaSync = keyof typeof ESQUEMA_SYNC
export const TABELAS_SYNC = Object.keys(ESQUEMA_SYNC) as TabelaSync[]

export interface RegistrosPorTabela {
  oficina_config: OficinaConfig
  perfis: Perfil
  funcionarios: Funcionario
  funcionarios_salario: FuncionarioSalario
  clientes: Cliente
  cliente_contatos: ClienteContato
  cliente_precos: ClientePreco
  fornecedores: Fornecedor
  veiculos: Veiculo
  veiculo_clientes_hist: VeiculoClienteHist
  servicos_catalogo: ServicoCatalogo
  os: OrdemServico
  os_veiculos: OSVeiculo
  os_mecanicos: OSMecanico
  os_itens: OSItem
  os_fotos: OSFoto
  os_assinaturas: OSAssinatura
  os_status_hist: OSStatusHist
  os_apontamentos: OSApontamento
  os_aprovacoes: OSAprovacao
  sync_conflitos: SyncConflito
  auditoria: Auditoria
}

/** Item da fila de envio (outbox). Guarda só a referência; o envio usa o estado atual do registro. */
export interface OutboxItem {
  seq?: number
  tabela: TabelaSync
  registro_id: string
  criado_em: string
  tentativas: number
  /** epoch ms — espera progressiva após falha */
  proxima_tentativa: number
  erro?: string
}

/** Alteração recusada pelo servidor (ex.: OS travada). Mostrada ao usuário na tela de sincronização. */
export interface SyncErro {
  id?: number
  tabela: string
  registro_id: string
  mensagem: string
  data: string
}

/**
 * Foto completa guardada no aparelho até ser enviada ao Storage (fila própria, separada da outbox).
 * Depois do envio pode ser liberada para economizar espaço; a miniatura continua no registro.
 */
export interface ArquivoLocal {
  id: string
  os_id: string
  blob: Blob
  tipo: string
  /** 0 = pendente, 1 = enviado (Dexie não indexa booleanos) */
  enviado: 0 | 1
  criado_em: string
  tentativas?: number
}

export interface LocalItem {
  chave: string
  valor: unknown
}

type TabelasTipadas = { [K in TabelaSync]: Table<RegistrosPorTabela[K], string> }

export class BancoLocal extends Dexie {
  declare outbox: Table<OutboxItem, number>
  declare sync_erros: Table<SyncErro, number>
  declare local: Table<LocalItem, string>
  declare arquivos: Table<ArquivoLocal, string>

  constructor(nome: string) {
    super(nome)
    // v3 (Fase 4): apontamentos, aprovações e fila de arquivos (fotos)
    this.version(3).stores({ ...ESQUEMA_SYNC, outbox: '++seq, registro_id', sync_erros: '++id', local: 'chave', arquivos: 'id, enviado, os_id' })
  }

  t<K extends TabelaSync>(nome: K) {
    return this.table(nome) as TabelasTipadas[K]
  }
}

/** Servidor simulado (modo demonstração). Mesmo esquema da nuvem, guardado em um banco separado. */
export class BancoNuvem extends Dexie {
  declare contador: Table<LocalItem, string>
  declare storage: Table<{ id: string; blob: Blob; tipo: string }, string>

  constructor(nome: string) {
    super(nome)
    // v3 (Fase 4): storage simulado para as fotos
    this.version(3).stores({ ...ESQUEMA_SYNC, contador: 'chave', storage: 'id' })
  }

  t<K extends TabelaSync>(nome: K) {
    return this.table(nome) as TabelasTipadas[K]
  }
}

export const db = new BancoLocal('bmd-v2')
export const nuvem = new BancoNuvem('bmd-nuvem-demo')

export async function getLocal<T>(chave: string, padrao: T): Promise<T> {
  const item = await db.local.get(chave)
  return item ? (item.valor as T) : padrao
}

export async function setLocal(chave: string, valor: unknown) {
  await db.local.put({ chave, valor })
}

/** Remove o banco da versão 1 (somente dados de demonstração). */
export function removerBancoAntigo() {
  return Dexie.delete('bruno-mecanica').catch(() => undefined)
}
