import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { MessageCircle, Pencil, Plus, Truck } from 'lucide-react'
import { db } from '../../db/banco'
import { nomeCliente, useOSCompletas } from '../../db/consultas'
import { emAberto, emAtraso } from '../../domain/financeiro'
import { brl, CONDICOES, data, FORMAS_PAGAMENTO, MODALIDADES, PAPEIS_CONTATO, TIPOS_VEICULO, whatsappLink } from '../../lib/format'
import { Cabecalho, Kpi, Secao, Vazio } from '../../components/ui'
import { VeiculoModal, type VeiculoForm } from '../../components/VeiculoModal'
import { OSCard } from '../../components/OSCard'

export function ClienteDetalhe() {
  const { id = '' } = useParams()
  const cliente = useLiveQuery(() => db.t('clientes').get(id), [id])
  const veiculos = useLiveQuery(async () => (await db.t('veiculos').where('cliente_id').equals(id).toArray()).filter((v) => !v.deleted_at), [id], [])
  const ordens = (useOSCompletas() ?? []).filter((o) => o.cliente_id === id)
  const [editando, setEditando] = useState<VeiculoForm | null>(null)
  const contatos = useLiveQuery(async () => (await db.t('cliente_contatos').where('cliente_id').equals(id).toArray()).filter((x) => !x.deleted_at), [id], [])
  const precos = useLiveQuery(async () => (await db.t('cliente_precos').where('cliente_id').equals(id).toArray()).filter((x) => !x.deleted_at), [id], [])
  const catalogo = useLiveQuery(() => db.t('servicos_catalogo').toArray(), [], [])

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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Secao titulo={`Contatos (${contatos.length})`}>
          {contatos.length === 0 ? <Vazio texto="Nenhum contato além do principal." /> : (
            <ul className="divide-y divide-borda text-sm">
              {contatos.map((ct) => (
                <li key={ct.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-forte">{ct.nome} <span className="text-xs font-normal text-brand">· {PAPEIS_CONTATO[ct.papel]}</span></span>
                    <span className="block truncate text-xs text-cinza">{[ct.telefone, ct.email].filter(Boolean).join(' · ')}</span>
                  </span>
                  {ct.telefone && <a href={whatsappLink(ct.telefone, `Olá ${ct.nome}, tudo bem?`)} target="_blank" rel="noreferrer" className="flex h-11 w-11 shrink-0 items-center justify-center text-cinza hover:text-brand" aria-label={`WhatsApp de ${ct.nome}`}><MessageCircle size={18} /></a>}
                </li>
              ))}
            </ul>
          )}
        </Secao>
        <Secao titulo="Tabela de preços">
          {precos.length === 0 ? <Vazio texto="Usa os preços padrão da oficina." /> : (
            <dl className="space-y-2 text-sm">
              {precos.filter((p) => !p.servico_id).map((g) => (
                <div key={g.id} className="space-y-2">
                  {g.valor_hora != null && <Info r="Hora técnica" v={brl(g.valor_hora)} />}
                  {g.deslocamento_fixo != null && <Info r="Deslocamento fixo" v={brl(g.deslocamento_fixo)} />}
                  {g.valor_km != null && <Info r="Deslocamento por km" v={brl(g.valor_km)} />}
                </div>
              ))}
              {precos.filter((p) => p.servico_id).map((p) => (
                <Info key={p.id} r={catalogo.find((s) => s.id === p.servico_id)?.descricao ?? 'Serviço'} v={brl(p.valor ?? 0)} />
              ))}
            </dl>
          )}
        </Secao>
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
