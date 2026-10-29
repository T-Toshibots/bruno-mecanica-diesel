import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { MessageCircle, Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { db } from '../data/db'
import { veiculosRepo } from '../data/repos/clientes'
import { emAberto, emAtraso } from '../data/repos/financeiro'
import type { Veiculo } from '../data/types'
import { brl, CONDICOES, data, FORMAS_PAGAMENTO, mascaraPlaca, MODALIDADES, whatsappLink } from '../lib/format'
import { Cabecalho, Campo, Kpi, Modal, Secao, Vazio } from '../components/ui'
import { OSCard } from '../components/OSCard'

export function ClienteDetalhe() {
  const id = Number(useParams().id)
  const cliente = useLiveQuery(() => db.clientes.get(id), [id])
  const veiculos = useLiveQuery(() => veiculosRepo.doCliente(id), [id], [] as Veiculo[])
  const ordens = useLiveQuery(() => db.os.where('clienteId').equals(id).reverse().sortBy('abertaEm'), [id], [])
  const [editando, setEditando] = useState<Veiculo | null>(null)

  if (!cliente) return <div className="text-cinza">Carregando…</div>

  const faturadas = ordens.filter((o) => o.status === 'faturada')
  const totalHist = faturadas.reduce((s, o) => s + o.total, 0)
  const saldo = ordens.filter(emAberto).reduce((s, o) => s + o.total, 0)
  const atrasado = ordens.filter((o) => emAtraso(o)).reduce((s, o) => s + o.total, 0)

  return (
    <>
      <Cabecalho
        titulo={cliente.fantasia || cliente.nome}
        subtitulo={`${cliente.nome} · ${cliente.documento}`}
        acoes={
          <>
            <a href={whatsappLink(cliente.telefone, `Olá ${cliente.contato ?? ''}, aqui é da Bruno Mecânica Diesel.`)} target="_blank" rel="noreferrer" className="btn-secundario"><MessageCircle size={16} /> WhatsApp</a>
            <Link to={`/clientes/${id}/editar`} className="btn-secundario"><Pencil size={16} /> Editar</Link>
            <Link to={`/os/nova?cliente=${id}`} className="btn-primario"><Plus size={16} /> Nova OS</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Total faturado" valor={brl(totalHist)} detalhe={`${faturadas.length} OS`} destaque="brand" />
        <Kpi rotulo="Saldo a receber" valor={brl(saldo)} />
        <Kpi rotulo="Em atraso" valor={brl(atrasado)} destaque={atrasado ? 'alerta' : 'ok'} />
        <Kpi rotulo="Limite de crédito" valor={cliente.limiteCredito ? brl(cliente.limiteCredito) : '—'} detalhe={cliente.limiteCredito ? `Disponível ${brl(cliente.limiteCredito - saldo)}` : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Secao titulo="Cadastro">
          <dl className="space-y-2 text-sm">
            <Info r="Modalidade" v={MODALIDADES[cliente.modalidade]} />
            <Info r="Pagamento" v={FORMAS_PAGAMENTO[cliente.formaPagamento]} />
            <Info r="Faturamento" v={CONDICOES[cliente.condicao] + (cliente.condicao === 'mensal' ? ` (dia ${cliente.diaFechamento ?? 10})` : '')} />
            {cliente.valorContrato ? <Info r="Contrato mensal" v={brl(cliente.valorContrato)} /> : null}
            {cliente.descontoPadrao ? <Info r="Desconto padrão" v={`${cliente.descontoPadrao}%`} /> : null}
            <Info r="Contato" v={cliente.contato} />
            <Info r="Telefone" v={cliente.telefone} />
            <Info r="E-mail" v={cliente.email} />
            <Info r="Cidade" v={[cliente.cidade, cliente.uf].filter(Boolean).join(' - ')} />
            <Info r="Cliente desde" v={data(cliente.criadoEm)} />
          </dl>
          {cliente.observacoes && <p className="mt-3 rounded-lg bg-painel p-3 text-sm text-prata">{cliente.observacoes}</p>}
        </Secao>

        <div className="lg:col-span-2">
          <Secao
            titulo={`Frota (${veiculos.length})`}
            acoes={<button onClick={() => setEditando({ clienteId: id, placa: '', marca: '', modelo: '' })} className="btn-secundario px-3 py-1.5 text-xs"><Plus size={14} /> Veículo</button>}
          >
            {veiculos.length === 0 ? (
              <Vazio texto="Nenhum veículo cadastrado." />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {veiculos.map((v) => (
                  <button key={v.id} onClick={() => setEditando(v)} className="flex items-center gap-3 rounded-lg border border-borda bg-painel p-3 text-left hover:border-brand/50">
                    <Truck className="shrink-0 text-brand" size={22} />
                    <div className="min-w-0 text-sm">
                      <div className="font-semibold text-white">{v.placa} {v.frota && <span className="text-xs font-normal text-cinza">· Frota {v.frota}</span>}</div>
                      <div className="truncate text-xs text-cinza">{v.marca} {v.modelo} {v.ano ?? ''} {v.km ? `· ${v.km.toLocaleString('pt-BR')} km` : ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Secao>
        </div>
      </div>

      <div className="mt-4">
        <Secao titulo={`Histórico de OS (${ordens.length})`}>
          {ordens.length === 0 ? (
            <Vazio texto="Nenhuma OS para este cliente." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ordens.map((o) => <OSCard key={o.id} os={o} cliente={cliente} veiculo={veiculos.find((v) => v.id === o.veiculoId)} />)}
            </div>
          )}
        </Secao>
      </div>

      {editando && <VeiculoModal veiculo={editando} onFechar={() => setEditando(null)} />}
    </>
  )
}

function Info({ r, v }: { r: string; v?: string }) {
  if (!v) return null
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-cinza">{r}</dt>
      <dd className="text-right text-white">{v}</dd>
    </div>
  )
}

function VeiculoModal({ veiculo, onFechar }: { veiculo: Veiculo; onFechar: () => void }) {
  const [v, setV] = useState(veiculo)
  const set = <K extends keyof Veiculo>(k: K, val: Veiculo[K]) => setV((p) => ({ ...p, [k]: val }))
  const num = (s: string) => (s === '' ? undefined : Number(s))

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    await veiculosRepo.salvar(v)
    onFechar()
  }
  const excluir = async () => {
    if (v.id && confirm('Excluir este veículo?')) {
      await veiculosRepo.excluir(v.id)
      onFechar()
    }
  }

  return (
    <Modal aberto titulo={v.id ? 'Editar veículo' : 'Novo veículo'} onFechar={onFechar}>
      <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
        <Campo rotulo="Placa"><input className="input uppercase" value={v.placa} onChange={(e) => set('placa', mascaraPlaca(e.target.value))} required /></Campo>
        <Campo rotulo="Nº frota"><input className="input" value={v.frota ?? ''} onChange={(e) => set('frota', e.target.value)} /></Campo>
        <Campo rotulo="Marca"><input className="input" value={v.marca} onChange={(e) => set('marca', e.target.value)} required /></Campo>
        <Campo rotulo="Modelo"><input className="input" value={v.modelo} onChange={(e) => set('modelo', e.target.value)} required /></Campo>
        <Campo rotulo="Ano"><input className="input" type="number" value={v.ano ?? ''} onChange={(e) => set('ano', num(e.target.value))} /></Campo>
        <Campo rotulo="KM atual"><input className="input" type="number" value={v.km ?? ''} onChange={(e) => set('km', num(e.target.value))} /></Campo>
        <Campo rotulo="Chassi" className="col-span-2"><input className="input uppercase" value={v.chassi ?? ''} onChange={(e) => set('chassi', e.target.value.toUpperCase())} /></Campo>
        <div className="col-span-2 mt-2 flex gap-2">
          {v.id && <button type="button" onClick={excluir} className="btn-perigo"><Trash2 size={16} /></button>}
          <button className="btn-primario flex-1">Salvar veículo</button>
        </div>
      </form>
    </Modal>
  )
}
