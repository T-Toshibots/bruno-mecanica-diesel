import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { MapPin, Truck } from 'lucide-react'
import { db } from '../data/db'
import type { Cliente, OrdemServico, Veiculo } from '../data/types'
import { brl, data, LOCAIS, numeroOS } from '../lib/format'
import { StatusChip } from './ui'

/** Mapas id → cliente / veículo para exibir listas sem consultas repetidas. */
export function useMapas() {
  const clientes = useLiveQuery(() => db.clientes.toArray(), [], [] as Cliente[])
  const veiculos = useLiveQuery(() => db.veiculos.toArray(), [], [] as Veiculo[])
  return {
    clientes,
    veiculos,
    clientePorId: new Map(clientes.map((c) => [c.id!, c])),
    veiculoPorId: new Map(veiculos.map((v) => [v.id!, v])),
  }
}

export function OSCard({ os, cliente, veiculo }: { os: OrdemServico; cliente?: Cliente; veiculo?: Veiculo }) {
  return (
    <Link to={`/os/${os.id}`} className="card block transition hover:border-brand/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-titulo text-lg font-bold text-brand">{numeroOS(os.numero)}</div>
          <div className="truncate font-medium text-white">{cliente?.fantasia || cliente?.nome || '—'}</div>
        </div>
        <StatusChip status={os.status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cinza">
        {veiculo && (
          <span className="inline-flex items-center gap-1"><Truck size={13} /> {veiculo.placa} · {veiculo.marca} {veiculo.modelo}</span>
        )}
        <span className="inline-flex items-center gap-1"><MapPin size={13} /> {LOCAIS[os.local]}</span>
      </div>
      <p className="mt-2 line-clamp-1 text-sm text-prata">{os.relato}</p>
      <div className="mt-3 flex items-center justify-between border-t border-borda pt-2 text-sm">
        <span className="text-cinza">{data(os.abertaEm)} · {os.mecanico}</span>
        <span className="font-semibold tabular-nums text-white">{brl(os.total)}</span>
      </div>
    </Link>
  )
}
