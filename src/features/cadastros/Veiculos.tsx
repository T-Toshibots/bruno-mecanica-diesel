import { useState } from 'react'
import { Plus, Search, Truck } from 'lucide-react'
import { nomeCliente, useLista } from '../../db/consultas'
import type { TipoVeiculo } from '../../domain/tipos'
import { TIPOS_VEICULO } from '../../lib/format'
import { CadastrosAbas } from '../../components/CadastrosAbas'
import { Cabecalho, Vazio } from '../../components/ui'
import { VeiculoModal, type VeiculoForm } from '../../components/VeiculoModal'

export function Veiculos() {
  const veiculos = useLista('veiculos').sort((a, b) => a.placa.localeCompare(b.placa))
  const clientes = new Map(useLista('clientes').map((c) => [c.id, c]))
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<TipoVeiculo | ''>('')
  const [editando, setEditando] = useState<VeiculoForm | null>(null)

  const termo = busca.trim().toLowerCase().replace('-', '')
  const lista = veiculos.filter((v) => {
    if (tipo && v.tipo !== tipo) return false
    if (!termo) return true
    return [v.placa.replace('-', ''), v.frota ?? '', v.marca, v.modelo, nomeCliente(clientes.get(v.cliente_id)), v.chassi ?? '']
      .some((t) => t.toLowerCase().includes(termo))
  })

  return (
    <>
      <CadastrosAbas />
      <Cabecalho titulo="Veículos" subtitulo={`${veiculos.length} cadastrados`} acoes={<button className="btn-primario" onClick={() => setEditando({ cliente_id: '', tipo: 'cavalo' })}><Plus size={18} /> Novo veículo</button>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
          <input className="input pl-10" placeholder="Buscar placa, frota, cliente, modelo ou chassi" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="input sm:w-56" value={tipo} onChange={(e) => setTipo(e.target.value as TipoVeiculo | '')}>
          <option value="">Todos os tipos</option>
          {Object.entries(TIPOS_VEICULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {lista.length === 0 ? <Vazio texto="Nenhum veículo encontrado." /> : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((v) => (
            <button key={v.id} onClick={() => setEditando(v)} className="card flex items-center gap-3 text-left hover:border-brand/50">
              <Truck className="shrink-0 text-brand" size={24} />
              <div className="min-w-0 text-sm">
                <div className="font-titulo text-lg font-bold text-forte">{v.placa}{v.frota && <span className="ml-1 font-sans text-xs font-normal text-cinza">frota {v.frota}</span>}</div>
                <div className="truncate text-xs text-cinza">{TIPOS_VEICULO[v.tipo]} · {v.marca} {v.modelo} {v.ano ?? ''}</div>
                <div className="truncate text-xs text-prata">{nomeCliente(clientes.get(v.cliente_id))}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {editando && <VeiculoModal veiculo={editando} onFechar={() => setEditando(null)} />}
    </>
  )
}
