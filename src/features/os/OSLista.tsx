import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useSessao } from '../../app/sessao'
import { nomeCliente, useOSCompletas } from '../../db/consultas'
import type { StatusOS } from '../../domain/tipos'
import { numeroOS, STATUS_OS } from '../../lib/format'
import { Cabecalho, Vazio } from '../../components/ui'
import { OSCard } from '../../components/OSCard'

const FILTROS: { id: string; label: string; status: StatusOS[]; soEscritorio?: boolean }[] = [
  { id: 'abertas', label: 'Abertas', status: ['rascunho', 'orcamento', 'aprovado'] },
  { id: 'execucao', label: 'Em execução', status: ['execucao', 'aguardando'] },
  { id: 'finalizada', label: 'Finalizadas', status: ['finalizada'] },
  { id: 'faturada', label: 'Faturadas', status: ['faturada'], soEscritorio: true },
  { id: 'todas', label: 'Todas', status: Object.keys(STATUS_OS) as StatusOS[] },
]

export function OSLista() {
  const { perm } = useSessao()
  const ordens = useOSCompletas() ?? []
  const [params, setParams] = useSearchParams()
  const filtro = params.get('f') ?? 'execucao'
  const [busca, setBusca] = useState(params.get('q') ?? '')
  const [periodo, setPeriodo] = useState('')

  const filtros = FILTROS.filter((f) => !f.soEscritorio || perm.verValores)
  const ativo = filtros.find((f) => f.id === filtro) ?? filtros[1]
  const termo = busca.trim().toLowerCase()
  const lista = ordens.filter((o) => {
    if (!termo && !ativo.status.includes(o.status)) return false
    if (periodo && !o.aberta_em.startsWith(periodo)) return false
    if (!termo) return true
    return [numeroOS(o), o.numero_provisorio, String(o.numero ?? ''), nomeCliente(o.cliente), o.cliente?.nome ?? '', o.relato,
      ...o.veiculos.flatMap((v) => [v.placa, v.placa.replace('-', ''), v.frota ?? '']), ...o.mecanicos.map((m) => m.nome)]
      .some((t) => t.toLowerCase().includes(termo))
  })

  return (
    <>
      <Cabecalho
        titulo={perm.verTodasOS ? 'Ordens de Serviço' : 'Minhas OS'}
        subtitulo={termo ? `${lista.length} encontrada(s) em todas as situações` : `${lista.length} de ${ordens.length}`}
        acoes={<Link to="/os/nova" className="btn-primario"><Plus size={18} /> {perm.verTodasOS ? 'Nova OS' : 'Abrir chamado'}</Link>}
      />

      <div className="relative mb-3">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
        <input className="input pl-10" placeholder="Buscar placa, nº de frota, cliente, número, mecânico…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <div className="-mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
        {filtros.map((f) => (
          <button
            key={f.id}
            onClick={() => setParams({ f: f.id }, { replace: true })}
            className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${ativo.id === f.id && !termo ? 'bg-brand text-black' : 'border border-borda bg-painel text-prata'}`}
          >
            {f.label} <span className="opacity-70">({ordens.filter((o) => f.status.includes(o.status)).length})</span>
          </button>
        ))}
        <input type="month" className="input ml-auto w-44 shrink-0" value={periodo} onChange={(e) => setPeriodo(e.target.value)} title="Filtrar por mês de abertura" />
      </div>

      {lista.length === 0 ? <Vazio texto="Nenhuma OS encontrada." /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{lista.map((o) => <OSCard key={o.id} os={o} />)}</div>
      )}
    </>
  )
}
