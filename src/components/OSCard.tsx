import { Link } from 'react-router-dom'
import { MapPin, Truck, Wrench } from 'lucide-react'
import { useSessao } from '../app/sessao'
import { nomeCliente, type OSCompleta } from '../db/consultas'
import { brl, data, LOCAIS, numeroOS } from '../lib/format'
import { StatusChip } from './ui'

export function OSCard({ os }: { os: OSCompleta }) {
  const { perm } = useSessao()
  const veic = os.veiculos[0]
  return (
    <Link to={`/os/${os.id}`} className="card block transition hover:border-brand/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-titulo text-lg font-bold ${os.numero ? 'text-brand' : 'text-cinza'}`}>
            {numeroOS(os)}
            {!os.numero && <span className="ml-1 text-xs font-normal normal-case not-italic">(provisório)</span>}
          </div>
          <div className="truncate font-semibold text-forte">{nomeCliente(os.cliente)}</div>
        </div>
        <StatusChip status={os.status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cinza">
        {veic && (
          <span className="inline-flex items-center gap-1">
            <Truck size={13} /> {veic.placa} · {veic.marca} {veic.modelo}{os.veiculos.length > 1 ? ` +${os.veiculos.length - 1}` : ''}
          </span>
        )}
        <span className="inline-flex items-center gap-1"><MapPin size={13} /> {LOCAIS[os.local]}</span>
      </div>
      <p className="mt-2 line-clamp-1 text-sm text-prata">{os.relato}</p>
      <div className="mt-3 flex items-center justify-between border-t border-borda pt-2 text-sm">
        <span className="inline-flex items-center gap-1 text-cinza">
          {data(os.aberta_em)} · <Wrench size={12} /> {os.mecanicos.map((m) => m.nome).join(', ') || '—'}
        </span>
        {perm.verValores && <span className="font-semibold tabular-nums text-forte">{brl(os.totais.total)}</span>}
      </div>
    </Link>
  )
}
