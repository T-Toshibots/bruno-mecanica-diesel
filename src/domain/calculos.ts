import type { CondicaoFaturamento, OSItem } from './tipos'

export interface TotaisOS {
  maoObra: number
  pecas: number
  terceiros: number
  deslocamento: number
  subtotal: number
  desconto: number
  total: number
  /** Custo das peças e terceiros (só Dono). */
  custo: number
  /** Total − custo (só Dono). */
  margem: number
}

const arred = (v: number) => Math.round(v * 100) / 100

/** Totais da OS a partir dos itens. Itens excluídos (deleted_at) são ignorados. */
export function totaisOS(itens: Pick<OSItem, 'tipo' | 'qtd' | 'preco' | 'custo' | 'deleted_at'>[], descontoPct = 0): TotaisOS {
  const t = { maoObra: 0, pecas: 0, terceiros: 0, deslocamento: 0, custo: 0 }
  for (const i of itens) {
    if (i.deleted_at) continue
    const qtd = Number(i.qtd) || 0
    const valor = qtd * (Number(i.preco) || 0)
    t.custo += qtd * (Number(i.custo) || 0)
    if (i.tipo === 'mao_obra') t.maoObra += valor
    else if (i.tipo === 'peca') t.pecas += valor
    else if (i.tipo === 'terceiro') t.terceiros += valor
    else t.deslocamento += valor
  }
  const subtotal = arred(t.maoObra + t.pecas + t.terceiros + t.deslocamento)
  const pct = Math.min(100, Math.max(0, Number(descontoPct) || 0))
  const desconto = arred((subtotal * pct) / 100)
  const total = arred(subtotal - desconto)
  return {
    maoObra: arred(t.maoObra), pecas: arred(t.pecas), terceiros: arred(t.terceiros), deslocamento: arred(t.deslocamento),
    subtotal, desconto, total, custo: arred(t.custo), margem: arred(total - t.custo),
  }
}

/** Vencimento conforme a condição de faturamento do cliente. */
export function calcularVencimento(base: Date, condicao: CondicaoFaturamento, diaFechamento = 10): string {
  const d = new Date(base)
  switch (condicao) {
    case '15d': d.setDate(d.getDate() + 15); break
    case '30d': d.setDate(d.getDate() + 30); break
    case '45d': d.setDate(d.getDate() + 45); break
    case 'mensal': d.setMonth(d.getMonth() + 1, diaFechamento); break
  }
  return d.toISOString()
}
