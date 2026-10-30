import type { Cliente, OrdemServico } from './tipos'
import type { TotaisOS } from './calculos'

/** OS com totais já calculados (vem de db/consultas). */
type OSComTotais = OrdemServico & { totais: TotaisOS; itens: { tipo: string; descricao: string; qtd: number; preco: number; deleted_at?: string | null }[] }

export interface PontoMensal {
  chave: string
  mes: string
  faturado?: number
  projecao?: number
}

const chaveMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const nomeMes = (d: Date) =>
  d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '').replace(' de ', '/')

export const emAberto = (o: OrdemServico) => o.status === 'faturada' && !o.pago_em
export const emAtraso = (o: OrdemServico, hoje = new Date()) => emAberto(o) && !!o.vencimento && new Date(o.vencimento) < hoje

/** Faturamento dos últimos 12 meses + projeção dos próximos 3 (tendência linear dos 6 meses fechados). */
export function serieFaturamento(ordens: OSComTotais[], hoje = new Date()) {
  const pontos: PontoMensal[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    pontos.push({ chave: chaveMes(d), mes: nomeMes(d), faturado: 0 })
  }
  const idx = new Map(pontos.map((p, i) => [p.chave, i]))
  for (const o of ordens) {
    if (o.status !== 'faturada' || !o.faturada_em) continue
    const i = idx.get(chaveMes(new Date(o.faturada_em)))
    if (i !== undefined) pontos[i].faturado! += o.totais.total
  }

  const base = pontos.slice(5, 11).map((p) => p.faturado!)
  const n = base.length
  const mx = (n - 1) / 2
  const my = base.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  base.forEach((y, x) => { num += (x - mx) * (y - my); den += (x - mx) ** 2 })
  const incl = den ? num / den : 0
  const prever = (k: number) => Math.max(0, my + incl * (n - 1 - mx + k))

  const aFaturar = ordens.filter((o) => o.status === 'finalizada').reduce((s, o) => s + o.totais.total, 0)
  const atual = pontos[11]
  atual.projecao = Math.round(Math.max(atual.faturado! + aFaturar, prever(1)))
  for (let k = 1; k <= 3; k++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + k, 1)
    pontos.push({ chave: chaveMes(d), mes: nomeMes(d), projecao: Math.round(prever(k + 1)) })
  }
  pontos[10].projecao = pontos[10].faturado
  return { pontos, aFaturar }
}

export function resumo(ordens: OSComTotais[], clientes: Cliente[], hoje = new Date()) {
  const mesAtual = chaveMes(hoje)
  const anterior = chaveMes(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1))
  const faturadas = ordens.filter((o) => o.status === 'faturada')
  const doMes = (chave: string) => faturadas.filter((o) => o.faturada_em && chaveMes(new Date(o.faturada_em)) === chave)
  const soma = (l: OSComTotais[], f: (o: OSComTotais) => number = (o) => o.totais.total) => l.reduce((s, o) => s + f(o), 0)
  const mes = doMes(mesAtual)
  return {
    faturadoMes: soma(mes),
    faturadoMesAnterior: soma(doMes(anterior)),
    margemMes: soma(mes, (o) => o.totais.margem),
    osMes: mes.length,
    aReceber: soma(faturadas.filter(emAberto)),
    atrasado: soma(faturadas.filter((o) => emAtraso(o, hoje))),
    abertas: ordens.filter((o) => ['execucao', 'aguardando'].includes(o.status)).length,
    aguardandoAprovacao: ordens.filter((o) => o.status === 'orcamento').length,
    aguardandoPeca: ordens.filter((o) => o.status === 'aguardando').length,
    ticketMedio: faturadas.length ? soma(faturadas) / faturadas.length : 0,
    contratos: clientes.filter((c) => c.ativo && c.modalidade === 'contrato').reduce((s, c) => s + (c.valor_contrato ?? 0), 0),
  }
}

export function topClientes(ordens: OSComTotais[], clientes: Cliente[], limite = 5) {
  const mapa = new Map<string, number>()
  for (const o of ordens) if (o.status === 'faturada') mapa.set(o.cliente_id, (mapa.get(o.cliente_id) ?? 0) + o.totais.total)
  const nomes = new Map(clientes.map((c) => [c.id, c.fantasia || c.nome]))
  return [...mapa.entries()]
    .map(([id, total]) => ({ id, nome: nomes.get(id) ?? '—', total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limite)
}

export function servicosMaisRealizados(ordens: OSComTotais[], limite = 6) {
  const mapa = new Map<string, number>()
  for (const o of ordens) {
    if (o.status === 'cancelada') continue
    for (const s of o.itens) if (s.tipo === 'mao_obra' && !s.deleted_at) mapa.set(s.descricao, (mapa.get(s.descricao) ?? 0) + s.qtd)
  }
  return [...mapa.entries()].map(([descricao, qtd]) => ({ descricao, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, limite)
}

export function porModalidade(ordens: OSComTotais[], clientes: Cliente[]) {
  const mod = new Map(clientes.map((c) => [c.id, c.modalidade]))
  const mapa = new Map<string, number>()
  for (const o of ordens) {
    if (o.status !== 'faturada') continue
    const m = mod.get(o.cliente_id) ?? 'avulso'
    mapa.set(m, (mapa.get(m) ?? 0) + o.totais.total)
  }
  return [...mapa.entries()].map(([modalidade, total]) => ({ modalidade, total })).sort((a, b) => b.total - a.total)
}
