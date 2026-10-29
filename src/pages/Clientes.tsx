import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Phone, Plus, Search, Truck } from 'lucide-react'
import { db } from '../data/db'
import { emAberto } from '../data/repos/financeiro'
import type { Cliente, Modalidade, OrdemServico, Veiculo } from '../data/types'
import { brl, CONDICOES, FORMAS_PAGAMENTO, MODALIDADES } from '../lib/format'
import { Cabecalho, Vazio } from '../components/ui'

export function Clientes() {
  const clientes = useLiveQuery(() => db.clientes.orderBy('nome').toArray(), [], [] as Cliente[])
  const veiculos = useLiveQuery(() => db.veiculos.toArray(), [], [] as Veiculo[])
  const ordens = useLiveQuery(() => db.os.toArray(), [], [] as OrdemServico[])
  const [busca, setBusca] = useState('')
  const [modalidade, setModalidade] = useState<Modalidade | ''>('')

  const termo = busca.trim().toLowerCase()
  const lista = clientes.filter((c) => {
    if (modalidade && c.modalidade !== modalidade) return false
    if (!termo) return true
    const placas = veiculos.filter((v) => v.clienteId === c.id).map((v) => v.placa.toLowerCase())
    return [c.nome, c.fantasia ?? '', c.documento, c.cidade ?? '', ...placas].some((t) => t.toLowerCase().includes(termo))
  })

  return (
    <>
      <Cabecalho
        titulo="Clientes"
        subtitulo={`${clientes.length} cadastrados`}
        acoes={<Link to="/clientes/novo" className="btn-primario"><Plus size={18} /> Novo cliente</Link>}
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
          <input className="input pl-9" placeholder="Buscar por nome, CPF/CNPJ, cidade ou placa" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="input sm:w-64" value={modalidade} onChange={(e) => setModalidade(e.target.value as Modalidade | '')}>
          <option value="">Todas as modalidades</option>
          {Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {lista.length === 0 ? (
        <Vazio texto="Nenhum cliente encontrado." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((c) => {
            const qtdVeic = veiculos.filter((v) => v.clienteId === c.id).length
            const saldo = ordens.filter((o) => o.clienteId === c.id && emAberto(o)).reduce((s, o) => s + o.total, 0)
            return (
              <Link key={c.id} to={`/clientes/${c.id}`} className="card block transition hover:border-brand/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">{c.fantasia || c.nome}</div>
                    {c.fantasia && <div className="truncate text-xs text-cinza">{c.nome}</div>}
                  </div>
                  <span className={`chip shrink-0 ${c.ativo ? 'bg-brand/10 text-brand ring-brand/30' : 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30'}`}>
                    {c.ativo ? c.tipo : 'Inativo'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-cinza">{MODALIDADES[c.modalidade]}</div>
                <div className="mt-1 text-xs text-cinza">{FORMAS_PAGAMENTO[c.formaPagamento]} · {CONDICOES[c.condicao]}</div>
                <div className="mt-3 flex items-center justify-between border-t border-borda pt-2 text-xs">
                  <span className="inline-flex items-center gap-3 text-cinza">
                    <span className="inline-flex items-center gap-1"><Truck size={13} /> {qtdVeic}</span>
                    <span className="inline-flex items-center gap-1"><Phone size={13} /> {c.telefone}</span>
                  </span>
                  {saldo > 0 && <span className="font-semibold text-brand">{brl(saldo)}</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
