import type { Cliente, OrdemServico } from '../types'

export interface PontoMensal {
  chave: string
  mes: string
  faturado?: number
  projecao?: number
}

const chaveMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const nomeMes = (d: Date) =>
  d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '').replace(' de ', '/')

export const emAberto = (o: OrdemServico) => o.status === 'faturada' && !o.pagoEm
export const emAtraso = (o: OrdemServico, hoje = new Date()) =>
  emAberto(o) && !!o.vencimento && new Date(o.vencimento) < hoje

/** Faturamento dos últimos 12 meses + projeção dos próximos 3 (tendência linear dos últimos 6). */
export function serieFaturamento(ordens: OrdemServico[], hoje = new Date()) {
  const pontos: PontoMensal[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    pontos.push({ chave: chaveMes(d), mes: nomeMes(d), faturado: 0 })
  }
  const idx = new Map(pontos.map((p, i) => [p.chave, i]))
  for (const o of ordens) {
    if (o.status !== 'faturada' || !o.faturadaEm) continue
    const i = idx.get(chaveMes(new Date(o.faturadaEm)))
    if (i !== undefined) pontos[i].faturado! += o.total
  }

  // regressão linear nos 6 meses fechados anteriores ao mês atual
  const base = pontos.slice(5, 11).map((p) => p.faturado!)
  const n = base.length
  const mx = (n - 1) / 2
  const my = base.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  base.forEach((y, x) => { num += (x - mx) * (y - my); den += (x - mx) ** 2 })
  const incl = den ? num / den : 0
  const prever = (k: number) => Math.max(0, my + incl * (n - 1 - mx + k))

  const aFaturar = ordens.filter((o) => o.status === 'concluida').reduce((s, o) => s + o.total, 0)
  const atual = pontos[11]
  atual.projecao = Math.round(Math.max(atual.faturado! + aFaturar, prever(1)))
  for (let k = 1; k <= 3; k++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + k, 1)
    pontos.push({ chave: chaveMes(d), mes: nomeMes(d), projecao: Math.round(prever(k + 1)) })
  }
  // liga a linha de projeção ao último mês fechado
  pontos[10].projecao = pontos[10].faturado
  return { pontos, aFaturar, tendenciaMensal: incl }
}

export function resumo(ordens: OrdemServico[], clientes: Cliente[], hoje = new Date()) {
  const mesAtual = chaveMes(hoje)
  const faturadas = ordens.filter((o) => o.status === 'faturada')
  const doMes = faturadas.filter((o) => o.faturadaEm && chaveMes(new Date(o.faturadaEm)) === mesAtual)
  const faturadoMes = doMes.reduce((s, o) => s + o.total, 0)
  const aReceber = faturadas.filter(emAberto).reduce((s, o) => s + o.total, 0)
  const atrasado = faturadas.filter((o) => emAtraso(o, hoje)).reduce((s, o) => s + o.total, 0)
  const abertas = ordens.filter((o) => ['aberta', 'andamento', 'aguardando'].includes(o.status)).length
  const ticketMedio = faturadas.length ? faturadas.reduce((s, o) => s + o.total, 0) / faturadas.length : 0
  const contratos = clientes
    .filter((c) => c.ativo && c.modalidade === 'contrato')
    .reduce((s, c) => s + (c.valorContrato ?? 0), 0)
  return { faturadoMes, osMes: doMes.length, aReceber, atrasado, abertas, ticketMedio, contratos }
}

export function topClientes(ordens: OrdemServico[], clientes: Cliente[], limite = 5) {
  const mapa = new Map<number, number>()
  for (const o of ordens) if (o.status === 'faturada') mapa.set(o.clienteId, (mapa.get(o.clienteId) ?? 0) + o.total)
  const nomes = new Map(clientes.map((c) => [c.id!, c.fantasia || c.nome]))
  return [...mapa.entries()]
    .map(([id, total]) => ({ id, nome: nomes.get(id) ?? '—', total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limite)
}

export function servicosMaisRealizados(ordens: OrdemServico[], limite = 6) {
  const mapa = new Map<string, { qtd: number; total: number }>()
  for (const o of ordens) {
    if (o.status === 'cancelada') continue
    for (const s of o.servicos) {
      const atual = mapa.get(s.descricao) ?? { qtd: 0, total: 0 }
      atual.qtd += s.qtd
      atual.total += s.qtd * s.valor
      mapa.set(s.descricao, atual)
    }
  }
  return [...mapa.entries()]
    .map(([descricao, v]) => ({ descricao, ...v }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, limite)
}

export function porModalidade(ordens: OrdemServico[], clientes: Cliente[]) {
  const mod = new Map(clientes.map((c) => [c.id!, c.modalidade]))
  const mapa = new Map<string, number>()
  for (const o of ordens) {
    if (o.status !== 'faturada') continue
    const m = mod.get(o.clienteId) ?? 'avulso'
    mapa.set(m, (mapa.get(m) ?? 0) + o.total)
  }
  return [...mapa.entries()].map(([modalidade, total]) => ({ modalidade, total })).sort((a, b) => b.total - a.total)
}
