import type { ClientePreco, OficinaConfig, ServicoCatalogo } from './tipos'

type Padrao = Pick<OficinaConfig, 'valor_hora' | 'deslocamento_fixo' | 'valor_km'>

const ativos = (precos: ClientePreco[], clienteId: string) =>
  precos.filter((p) => p.cliente_id === clienteId && !p.deleted_at)

/** Valores gerais do cliente (linha sem serviço), se houver. */
export function precosGerais(precos: ClientePreco[], clienteId: string) {
  return ativos(precos, clienteId).find((p) => !p.servico_id)
}

/** Preço do serviço para o cliente: tabela do cliente → valor padrão do catálogo. */
export function precoServico(servico: Pick<ServicoCatalogo, 'id' | 'valor'>, clienteId: string, precos: ClientePreco[]) {
  const proprio = ativos(precos, clienteId).find((p) => p.servico_id === servico.id && p.valor != null)
  return { valor: proprio?.valor ?? servico.valor, daTabelaDoCliente: !!proprio }
}

/** Valor da hora técnica: tabela do cliente → padrão da oficina. */
export function valorHora(clienteId: string, precos: ClientePreco[], padrao: Padrao) {
  const g = precosGerais(precos, clienteId)
  return { valor: g?.valor_hora ?? padrao.valor_hora, daTabelaDoCliente: g?.valor_hora != null }
}

/**
 * Deslocamento: valor fixo do cliente, ou km × valor por km do cliente,
 * ou o padrão da oficina (fixo, ou por km se informado).
 */
export function valorDeslocamento(clienteId: string, precos: ClientePreco[], padrao: Padrao, km?: number) {
  const g = precosGerais(precos, clienteId)
  if (g?.deslocamento_fixo != null) return { valor: g.deslocamento_fixo, daTabelaDoCliente: true }
  if (g?.valor_km != null && km) return { valor: Math.round(g.valor_km * km * 100) / 100, daTabelaDoCliente: true }
  if (km && padrao.valor_km) return { valor: Math.round(padrao.valor_km * km * 100) / 100, daTabelaDoCliente: false }
  return { valor: padrao.deslocamento_fixo, daTabelaDoCliente: false }
}
