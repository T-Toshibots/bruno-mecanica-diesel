import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Search } from 'lucide-react'
import { db } from '../data/db'
import type { OrdemServico, StatusOS } from '../data/types'
import { numeroOS, STATUS_OS } from '../lib/format'
import { Cabecalho, Vazio } from '../components/ui'
import { OSCard, useMapas } from '../components/OSCard'

const FILTROS: { id: string; label: string; status: StatusOS[] }[] = [
  { id: 'execucao', label: 'Em execução', status: ['aberta', 'andamento', 'aguardando'] },
  { id: 'concluida', label: 'A faturar', status: ['concluida'] },
  { id: 'faturada', label: 'Faturadas', status: ['faturada'] },
  { id: 'todas', label: 'Todas', status: Object.keys(STATUS_OS) as StatusOS[] },
]

export function OSLista() {
  const ordens = useLiveQuery(() => db.os.orderBy('abertaEm').reverse().toArray(), [], [] as OrdemServico[])
  const { clientePorId, veiculoPorId } = useMapas()
  const [filtro, setFiltro] = useState('execucao')
  const [busca, setBusca] = useState('')
  const [periodo, setPeriodo] = useState('')

  const ativo = FILTROS.find((f) => f.id === filtro)!
  const termo = busca.trim().toLowerCase()
  const lista = ordens.filter((o) => {
    if (!ativo.status.includes(o.status)) return false
    if (periodo && !o.abertaEm.startsWith(periodo)) return false
    if (!termo) return true
    const c = clientePorId.get(o.clienteId)
    const v = o.veiculoId ? veiculoPorId.get(o.veiculoId) : undefined
    return [numeroOS(o.numero), String(o.numero), c?.nome ?? '', c?.fantasia ?? '', v?.placa ?? '', o.relato, o.mecanico]
      .some((t) => t.toLowerCase().includes(termo))
  })

  return (
    <>
      <Cabecalho
        titulo="Ordens de Serviço"
        subtitulo={`${lista.length} de ${ordens.length}`}
        acoes={<Link to="/os/nova" className="btn-primario"><Plus size={18} /> Nova OS</Link>}
      />

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTROS.map((f) => {
          const qtd = ordens.filter((o) => f.status.includes(o.status)).length
          return (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                filtro === f.id ? 'bg-brand text-black' : 'border border-borda bg-painel text-prata'
              }`}
            >
              {f.label} <span className="opacity-70">({qtd})</span>
            </button>
          )
        })}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
          <input className="input pl-9" placeholder="Buscar nº, placa, cliente, mecânico…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <input type="month" className="input sm:w-48" value={periodo} onChange={(e) => setPeriodo(e.target.value)} title="Filtrar por mês de abertura" />
      </div>

      {lista.length === 0 ? (
        <Vazio texto="Nenhuma OS encontrada com esses filtros." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((o) => (
            <OSCard key={o.id} os={o} cliente={clientePorId.get(o.clienteId)} veiculo={o.veiculoId ? veiculoPorId.get(o.veiculoId) : undefined} />
          ))}
        </div>
      )}
    </>
  )
}
