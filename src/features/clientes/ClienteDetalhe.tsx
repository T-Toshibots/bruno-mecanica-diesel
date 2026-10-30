import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { MessageCircle, Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { db } from '../../db/banco'
import { nomeCliente, useOSCompletas } from '../../db/consultas'
import { emAberto, emAtraso } from '../../domain/financeiro'
import { primeiroErro, veiculoSchema } from '../../domain/schemas'
import type { TipoVeiculo, Veiculo } from '../../domain/tipos'
import { brl, CONDICOES, data, FORMAS_PAGAMENTO, mascaraPlaca, MODALIDADES, TIPOS_VEICULO, whatsappLink } from '../../lib/format'
import { excluir, gravar } from '../../sync/motor'
import { Aviso, Cabecalho, Campo, Kpi, Modal, Secao, Vazio } from '../../components/ui'
import { OSCard } from '../../components/OSCard'

type VeiculoForm = Partial<Veiculo> & { cliente_id: string }

export function ClienteDetalhe() {
  const { id = '' } = useParams()
  const cliente = useLiveQuery(() => db.t('clientes').get(id), [id])
  const veiculos = useLiveQuery(async () => (await db.t('veiculos').where('cliente_id').equals(id).toArray()).filter((v) => !v.deleted_at), [id], [])
  const ordens = (useOSCompletas() ?? []).filter((o) => o.cliente_id === id)
  const [editando, setEditando] = useState<VeiculoForm | null>(null)

  if (!cliente) return <div className="text-cinza">Carregando…</div>

  const faturadas = ordens.filter((o) => o.status === 'faturada')
  const totalHist = faturadas.reduce((s, o) => s + o.totais.total, 0)
  const saldo = ordens.filter(emAberto).reduce((s, o) => s + o.totais.total, 0)
  const atrasado = ordens.filter((o) => emAtraso(o)).reduce((s, o) => s + o.totais.total, 0)

  return (
    <>
      <Cabecalho
        titulo={nomeCliente(cliente)}
        subtitulo={`${cliente.nome} · ${cliente.documento}`}
        acoes={
          <>
            <a href={whatsappLink(cliente.telefone, `Olá ${cliente.contato ?? ''}, tudo bem?`)} target="_blank" rel="noreferrer" className="btn-secundario"><MessageCircle size={16} /> WhatsApp</a>
            <Link to={`/clientes/${id}/editar`} className="btn-secundario"><Pencil size={16} /> Editar</Link>
            <Link to={`/os/nova?cliente=${id}`} className="btn-primario"><Plus size={16} /> Nova OS</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Total faturado" valor={brl(totalHist)} detalhe={`${faturadas.length} OS`} destaque="brand" />
        <Kpi rotulo="Saldo a receber" valor={brl(saldo)} />
        <Kpi rotulo="Em atraso" valor={brl(atrasado)} destaque={atrasado ? 'alerta' : 'ok'} />
        <Kpi rotulo="Limite de crédito" valor={cliente.limite_credito ? brl(cliente.limite_credito) : '—'} detalhe={cliente.limite_credito ? `Disponível ${brl(cliente.limite_credito - saldo)}` : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Secao titulo="Cadastro">
          <dl className="space-y-2 text-sm">
            <Info r="Modalidade" v={MODALIDADES[cliente.modalidade]} />
            <Info r="Pagamento" v={FORMAS_PAGAMENTO[cliente.forma_pagamento]} />
            <Info r="Condição" v={CONDICOES[cliente.condicao] + (cliente.condicao === 'mensal' ? ` (dia ${cliente.dia_fechamento ?? 10})` : '')} />
            <Info r="Exige pedido" v={cliente.exige_pedido ? 'Sim' : 'Não'} />
            {cliente.valor_contrato ? <Info r="Contrato mensal" v={brl(cliente.valor_contrato)} /> : null}
            {cliente.desconto_padrao ? <Info r="Desconto padrão" v={`${cliente.desconto_padrao}%`} /> : null}
            <Info r="Contato" v={cliente.contato} />
            <Info r="Telefone" v={cliente.telefone} />
            <Info r="E-mail" v={cliente.email} />
            <Info r="Cidade" v={[cliente.cidade, cliente.uf].filter(Boolean).join(' - ')} />
            <Info r="Cliente desde" v={data(cliente.created_at)} />
          </dl>
          {cliente.observacoes && <p className="mt-3 rounded-lg bg-painel p-3 text-sm text-prata">{cliente.observacoes}</p>}
        </Secao>

        <div className="lg:col-span-2">
          <Secao titulo={`Frota (${veiculos.length})`} acoes={<button onClick={() => setEditando({ cliente_id: id, tipo: 'cavalo' })} className="btn-secundario"><Plus size={16} /> Veículo</button>}>
            {veiculos.length === 0 ? <Vazio texto="Nenhum veículo cadastrado." /> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {veiculos.map((v) => (
                  <button key={v.id} onClick={() => setEditando(v)} className="flex min-h-14 items-center gap-3 rounded-lg border border-borda bg-painel p-3 text-left hover:border-brand/50">
                    <Truck className="shrink-0 text-brand" size={22} />
                    <div className="min-w-0 text-sm">
                      <div className="font-semibold text-forte">{v.placa} {v.frota && <span className="text-xs font-normal text-cinza">· frota {v.frota}</span>}</div>
                      <div className="truncate text-xs text-cinza">{TIPOS_VEICULO[v.tipo]} · {v.marca} {v.modelo} {v.ano ?? ''} {v.km ? `· ${v.km.toLocaleString('pt-BR')} km` : ''}</div>
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
          {ordens.length === 0 ? <Vazio texto="Nenhuma OS para este cliente." /> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{ordens.map((o) => <OSCard key={o.id} os={o} />)}</div>
          )}
        </Secao>
      </div>

      {editando && <VeiculoModal veiculo={editando} onFechar={() => setEditando(null)} />}
    </>
  )
}

function Info({ r, v }: { r: string; v?: string }) {
  if (!v) return null
  return <div className="flex justify-between gap-3"><dt className="text-cinza">{r}</dt><dd className="text-right text-forte">{v}</dd></div>
}

function VeiculoModal({ veiculo, onFechar }: { veiculo: VeiculoForm; onFechar: () => void }) {
  const [v, setV] = useState(veiculo)
  const [erro, setErro] = useState('')
  const set = <K extends keyof VeiculoForm>(k: K, val: VeiculoForm[K]) => setV((p) => ({ ...p, [k]: val }))
  const num = (s: string) => (s === '' ? undefined : Number(s))

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    const msg = primeiroErro(veiculoSchema.safeParse(v))
    if (msg) return setErro(msg)
    await gravar('veiculos', v)
    onFechar()
  }

  return (
    <Modal aberto titulo={v.id ? 'Editar veículo' : 'Novo veículo'} onFechar={onFechar}>
      <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
        <Campo rotulo="Placa"><input className="input uppercase" value={v.placa ?? ''} onChange={(e) => set('placa', mascaraPlaca(e.target.value))} /></Campo>
        <Campo rotulo="Tipo">
          <select className="input" value={v.tipo} onChange={(e) => set('tipo', e.target.value as TipoVeiculo)}>
            {Object.entries(TIPOS_VEICULO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Marca"><input className="input" value={v.marca ?? ''} onChange={(e) => set('marca', e.target.value)} /></Campo>
        <Campo rotulo="Modelo"><input className="input" value={v.modelo ?? ''} onChange={(e) => set('modelo', e.target.value)} /></Campo>
        <Campo rotulo="Ano"><input className="input" type="number" value={v.ano ?? ''} onChange={(e) => set('ano', num(e.target.value))} /></Campo>
        <Campo rotulo="Nº frota"><input className="input" value={v.frota ?? ''} onChange={(e) => set('frota', e.target.value)} /></Campo>
        <Campo rotulo="KM atual"><input className="input" type="number" value={v.km ?? ''} onChange={(e) => set('km', num(e.target.value))} /></Campo>
        <Campo rotulo="Horímetro"><input className="input" type="number" value={v.horimetro ?? ''} onChange={(e) => set('horimetro', num(e.target.value))} /></Campo>
        <Campo rotulo="Chassi" className="col-span-2"><input className="input uppercase" value={v.chassi ?? ''} onChange={(e) => set('chassi', e.target.value.toUpperCase())} /></Campo>
        {erro && <div className="col-span-2"><Aviso tipo="erro">{erro}</Aviso></div>}
        <div className="col-span-2 mt-2 flex gap-2">
          {v.id && <button type="button" onClick={async () => { if (confirm('Excluir este veículo?')) { await excluir('veiculos', v.id!); onFechar() } }} className="btn-perigo" aria-label="Excluir"><Trash2 size={16} /></button>}
          <button className="btn-primario flex-1">Salvar veículo</button>
        </div>
      </form>
    </Modal>
  )
}
