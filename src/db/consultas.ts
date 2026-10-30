import { useLiveQuery } from 'dexie-react-hooks'
import { db, type RegistrosPorTabela, type TabelaSync } from './banco'
import { totaisOS, type TotaisOS } from '../domain/calculos'
import { podeVerOS } from '../domain/permissoes'
import type { Cliente, Funcionario, OrdemServico, OSItem, OSVeiculo, Veiculo } from '../domain/tipos'
import { getSessao } from '../sync/contexto'

const ativos = <T extends { deleted_at?: string | null }>(l: T[]) => l.filter((r) => !r.deleted_at)

/** Registros não excluídos de uma tabela, atualizados ao vivo. */
export function useLista<K extends TabelaSync>(tabela: K): RegistrosPorTabela[K][] {
  return useLiveQuery(async () => ativos(await db.t(tabela).toArray()) as RegistrosPorTabela[K][], [tabela], [])
}

export interface OSCompleta extends OrdemServico {
  itens: OSItem[]
  osVeiculos: OSVeiculo[]
  veiculos: Veiculo[]
  mecanicos: Funcionario[]
  cliente?: Cliente
  totais: TotaisOS
}

async function carregarOS(filtroIds?: string[]): Promise<OSCompleta[]> {
  const [ordens, itens, osVeic, osMec, veiculos, funcionarios, clientes] = await Promise.all([
    filtroIds ? db.t('os').bulkGet(filtroIds) : db.t('os').toArray(),
    filtroIds ? db.t('os_itens').where('os_id').anyOf(filtroIds).toArray() : db.t('os_itens').toArray(),
    filtroIds ? db.t('os_veiculos').where('os_id').anyOf(filtroIds).toArray() : db.t('os_veiculos').toArray(),
    filtroIds ? db.t('os_mecanicos').where('os_id').anyOf(filtroIds).toArray() : db.t('os_mecanicos').toArray(),
    db.t('veiculos').toArray(),
    db.t('funcionarios').toArray(),
    db.t('clientes').toArray(),
  ])
  const agrupar = <T extends { os_id: string; deleted_at?: string | null }>(l: T[]) => {
    const m = new Map<string, T[]>()
    for (const r of ativos(l)) (m.get(r.os_id) ?? m.set(r.os_id, []).get(r.os_id)!).push(r)
    return m
  }
  const itensPor = agrupar(itens)
  const veicPor = agrupar(osVeic)
  const mecPor = agrupar(osMec)
  const veicMap = new Map(veiculos.map((v) => [v.id, v]))
  const funcMap = new Map(funcionarios.map((f) => [f.id, f]))
  const cliMap = new Map(clientes.map((c) => [c.id, c]))
  const s = getSessao()

  return ativos(ordens.filter((o): o is OrdemServico => !!o))
    .map((o) => {
      const its = (itensPor.get(o.id) ?? []).sort((a, b) => a.ordem - b.ordem)
      const ov = veicPor.get(o.id) ?? []
      const mecs = mecPor.get(o.id) ?? []
      return {
        ...o,
        itens: its,
        osVeiculos: ov,
        veiculos: ov.map((x) => veicMap.get(x.veiculo_id)).filter((v): v is Veiculo => !!v),
        mecanicos: mecs.map((x) => funcMap.get(x.funcionario_id)).filter((f): f is Funcionario => !!f),
        cliente: cliMap.get(o.cliente_id),
        totais: totaisOS(its, o.desconto_pct),
      }
    })
    .filter((o) => !s || podeVerOS(s.papel, s.funcionario_id, o.mecanicos.map((m) => m.id), o.created_by, s.usuario_id))
    .sort((a, b) => b.aberta_em.localeCompare(a.aberta_em))
}

export function useOSCompletas() {
  return useLiveQuery(() => carregarOS(), [], undefined)
}

export function useOSCompleta(id: string | undefined) {
  return useLiveQuery(async () => (id ? (await carregarOS([id]))[0] ?? null : null), [id], undefined)
}

export const nomeCliente = (c?: Pick<Cliente, 'nome' | 'fantasia'>) => c?.fantasia || c?.nome || '—'
