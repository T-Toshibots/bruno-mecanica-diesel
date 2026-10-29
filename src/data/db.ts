import Dexie, { type EntityTable } from 'dexie'
import type { Cliente, ConfigItem, OrdemServico, OutboxItem, ServicoCatalogo, Veiculo } from './types'

export const db = new Dexie('bruno-mecanica') as Dexie & {
  clientes: EntityTable<Cliente, 'id'>
  veiculos: EntityTable<Veiculo, 'id'>
  os: EntityTable<OrdemServico, 'id'>
  catalogo: EntityTable<ServicoCatalogo, 'id'>
  outbox: EntityTable<OutboxItem, 'id'>
  config: EntityTable<ConfigItem, 'chave'>
}

db.version(1).stores({
  clientes: '++id, nome, modalidade, ativo',
  veiculos: '++id, clienteId, placa',
  os: '++id, &numero, clienteId, veiculoId, status, abertaEm, faturadaEm',
  catalogo: '++id, descricao',
  outbox: '++id, sincronizado',
  config: 'chave',
})

export async function getConfig<T>(chave: string, padrao: T): Promise<T> {
  const item = await db.config.get(chave)
  return item ? (item.valor as T) : padrao
}

export async function setConfig(chave: string, valor: unknown) {
  await db.config.put({ chave, valor })
}

/** Registra a alteração na fila de sincronização (base da sync real com servidor). */
export async function registrarOutbox(tabela: string, acao: OutboxItem['acao'], registroId: number) {
  await db.outbox.add({ tabela, acao, registroId, em: new Date().toISOString(), sincronizado: 0 })
}
