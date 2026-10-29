import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { STATUS_OS } from '../lib/format'
import type { StatusOS } from '../data/types'

export function Cabecalho({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="titulo text-3xl leading-none">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-cinza">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

export function Kpi({ rotulo, valor, detalhe, destaque, icone }: {
  rotulo: string; valor: string; detalhe?: string; destaque?: 'brand' | 'alerta' | 'ok'; icone?: ReactNode
}) {
  const cor = destaque === 'brand' ? 'text-brand' : destaque === 'alerta' ? 'text-red-400' : destaque === 'ok' ? 'text-emerald-400' : 'text-white'
  return (
    <div className="card relative overflow-hidden">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-cinza">
        {rotulo}
        {icone && <span className="text-brand/80">{icone}</span>}
      </div>
      <div className={`mt-2 font-titulo text-2xl font-bold tabular-nums sm:text-3xl ${cor}`}>{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-cinza">{detalhe}</div>}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-brand/0 via-brand/40 to-brand/0" />
    </div>
  )
}

export function StatusChip({ status }: { status: StatusOS }) {
  const s = STATUS_OS[status]
  return <span className={`chip ${s.cor}`}>{s.label}</span>
}

export function Campo({ rotulo, children, className = '' }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{rotulo}</span>
      {children}
    </label>
  )
}

export function Secao({ titulo, children, acoes }: { titulo: string; children: ReactNode; acoes?: ReactNode }) {
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="titulo text-lg text-brand">{titulo}</h2>
        {acoes}
      </div>
      {children}
    </section>
  )
}

export function Vazio({ texto }: { texto: string }) {
  return <div className="rounded-lg border border-dashed border-borda p-6 text-center text-sm text-cinza">{texto}</div>
}

export function Modal({ aberto, titulo, onFechar, children }: { aberto: boolean; titulo: string; onFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!aberto) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onFechar}>
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-borda bg-painel p-5 sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="titulo text-xl">{titulo}</h3>
          <button onClick={onFechar} className="rounded-lg p-1 text-cinza hover:text-white" aria-label="Fechar"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
