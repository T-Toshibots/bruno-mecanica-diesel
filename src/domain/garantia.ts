import type { OrdemServico, OSApontamento, OSItem, OSVeiculo } from './tipos'

const DIA = 86400000

type OSHist = Pick<OrdemServico, 'id' | 'numero' | 'numero_provisorio' | 'status' | 'finalizada_em' | 'deleted_at'> & {
  itens: Pick<OSItem, 'id' | 'tipo' | 'descricao' | 'servico_id' | 'garantia_dias' | 'os_veiculo_id' | 'deleted_at'>[]
  osVeiculos: Pick<OSVeiculo, 'id' | 'veiculo_id'>[]
}

export interface PossivelRetorno {
  osId: string
  numero: string
  servico: string
  finalizadaEm: string
  garantiaAte: string
}

/**
 * Serviços já feitos nos mesmos veículos e ainda dentro do prazo de garantia.
 * Usado para alertar "possível retorno em garantia" ao lançar o mesmo serviço de novo.
 */
export function possiveisRetornos(
  ordens: OSHist[],
  veiculoIds: string[],
  servicos: { servico_id?: string; descricao: string }[],
  agora = new Date(),
  ignorarOsId?: string,
): PossivelRetorno[] {
  const res: PossivelRetorno[] = []
  const chaves = servicos.filter((s) => s.descricao.trim()).map((s) => ({ id: s.servico_id, desc: s.descricao.trim().toLowerCase() }))
  for (const os of ordens) {
    if (os.id === ignorarOsId || os.deleted_at || !os.finalizada_em || !['finalizada', 'faturada'].includes(os.status)) continue
    const veicDaOS = new Map(os.osVeiculos.map((v) => [v.id, v.veiculo_id]))
    for (const it of os.itens) {
      if (it.deleted_at || it.tipo !== 'mao_obra' || !it.garantia_dias) continue
      // Item ligado a um veículo específico; sem vínculo, vale para todos os veículos da OS.
      const veiculosItem = it.os_veiculo_id ? [veicDaOS.get(it.os_veiculo_id)] : [...veicDaOS.values()]
      if (!veiculosItem.some((v) => v && veiculoIds.includes(v))) continue
      const mesmo = chaves.some((c) => (c.id && c.id === it.servico_id) || c.desc === it.descricao.trim().toLowerCase())
      if (!mesmo) continue
      const ate = new Date(new Date(os.finalizada_em).getTime() + it.garantia_dias * DIA)
      if (ate >= agora) {
        res.push({
          osId: os.id,
          numero: os.numero ? `OS ${String(os.numero).padStart(5, '0')}` : os.numero_provisorio,
          servico: it.descricao,
          finalizadaEm: os.finalizada_em,
          garantiaAte: ate.toISOString(),
        })
      }
    }
  }
  return res
}

/** Minutos trabalhados por funcionário (apontamento sem fim conta até agora). */
export function minutosPorFuncionario(apontamentos: Pick<OSApontamento, 'funcionario_id' | 'inicio' | 'fim' | 'deleted_at'>[], agora = new Date()) {
  const mapa = new Map<string, number>()
  for (const a of apontamentos) {
    if (a.deleted_at) continue
    const fim = a.fim ? new Date(a.fim) : agora
    const min = Math.max(0, (fim.getTime() - new Date(a.inicio).getTime()) / 60000)
    mapa.set(a.funcionario_id, (mapa.get(a.funcionario_id) ?? 0) + min)
  }
  return mapa
}

export const formatarDuracao = (min: number) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}
