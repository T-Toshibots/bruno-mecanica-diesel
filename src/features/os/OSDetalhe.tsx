import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Ban, CheckCircle2, CircleDollarSign, ClipboardCheck, Clock, Lock, MessageCircle, Pencil, Play, Printer, Receipt, RotateCcw, Send,
} from 'lucide-react'
import { useSessao } from '../../app/sessao'
import { tema } from '../../config/tema'
import { db } from '../../db/banco'
import { nomeCliente, useOSCompleta, type OSCompleta } from '../../db/consultas'
import { calcularVencimento } from '../../domain/calculos'
import { emAtraso } from '../../domain/financeiro'
import { podeEditarOS } from '../../domain/permissoes'
import type { OrdemServico, StatusOS } from '../../domain/tipos'
import { brl, data, dataHora, FORMAS_PAGAMENTO, LOCAIS, numeroOS, STATUS_OS, TIPOS_ITEM, TIPOS_OS, TIPOS_VEICULO, whatsappLink } from '../../lib/format'
import { gravarVarios, type Operacao } from '../../sync/motor'
import { Aviso, Campo, Modal, StatusChip } from '../../components/ui'

const BASE = import.meta.env.BASE_URL

type Acao = { tipo: 'cancelar' | 'reabrir' | 'aprovar' } | null

export function OSDetalhe() {
  const { id } = useParams()
  const os = useOSCompleta(id)
  const oficina = useLiveQuery(() => db.t('oficina_config').get('oficina'), [])
  const fotos = useLiveQuery(async () => (id ? (await db.t('os_fotos').where('os_id').equals(id).toArray()).filter((f) => !f.deleted_at) : []), [id], [])
  const assinaturas = useLiveQuery(async () => (id ? (await db.t('os_assinaturas').where('os_id').equals(id).toArray()).filter((f) => !f.deleted_at) : []), [id], [])
  const historico = useLiveQuery(async () => (id ? (await db.t('os_status_hist').where('os_id').equals(id).toArray()).sort((a, b) => b.data.localeCompare(a.data)) : []), [id], [])
  const pendente = useLiveQuery(async () => (id ? (await db.outbox.where('registro_id').equals(id).count()) > 0 : false), [id], false)
  const [acao, setAcao] = useState<Acao>(null)

  if (os === undefined) return <div className="text-cinza">Carregando…</div>
  if (os === null) return <Aviso tipo="erro">OS não encontrada ou sem permissão para ver.</Aviso>
  return <Documento os={os} oficinaNome={oficina?.nome ?? tema.nomeSistema} oficina={oficina} fotos={fotos} assinaturas={assinaturas} historico={historico} pendente={pendente} acao={acao} setAcao={setAcao} />
}

function Documento({ os, oficina, oficinaNome, fotos, assinaturas, historico, pendente, acao, setAcao }: {
  os: OSCompleta
  oficina?: { documento: string; telefone: string; endereco: string; cidade: string; pix: string; garantia_texto: string }
  oficinaNome: string
  fotos: { id: string; imagem: string; legenda?: string }[]
  assinaturas: { id: string; papel: string; nome: string; imagem: string; offline: boolean; data: string }[]
  historico: { id: string; de: StatusOS | null; para: StatusOS; motivo?: string; usuario_nome: string; data: string }[]
  pendente: boolean
  acao: Acao
  setAcao: (a: Acao) => void
}) {
  const { sessao, perm } = useSessao()
  const editavel = podeEditarOS(sessao.papel, os)
  const atrasada = emAtraso(os)

  async function mudar(para: StatusOS, extras: Partial<OrdemServico> = {}, motivo?: string) {
    const agora = new Date().toISOString()
    const dados: Partial<OrdemServico> = { id: os.id, status: para, ...extras }
    if (para === 'finalizada') dados.finalizada_em = agora
    const ops: Operacao[] = [
      { tabela: 'os', dados },
      { tabela: 'os_status_hist', dados: { os_id: os.id, de: os.status, para, motivo, usuario_nome: sessao.nome, data: agora } },
    ]
    await gravarVarios(ops)
  }

  const faturar = () => mudar('faturada', {
    faturada_em: new Date().toISOString(),
    vencimento: calcularVencimento(new Date(), os.cliente?.condicao ?? 'avista', os.cliente?.dia_fechamento),
  })

  const textoWhats = [
    `*${oficinaNome}* — ${numeroOS(os)}`,
    ...os.veiculos.map((v) => `Veículo: ${v.placa} ${v.marca} ${v.modelo}`),
    `Situação: ${STATUS_OS[os.status].label}`,
    '',
    ...os.itens.map((i) => `• ${i.qtd > 1 ? i.qtd + 'x ' : ''}${i.descricao} — ${brl(i.qtd * i.preco)}`),
    os.totais.desconto ? `Desconto: − ${brl(os.totais.desconto)}` : '',
    `*Total: ${brl(os.totais.total)}*`,
    os.vencimento ? `Vencimento: ${data(os.vencimento)}` : '',
    oficina?.pix ? `Pix: ${oficina.pix}` : '',
  ].filter(Boolean).join('\n')

  const botoes: ReactNode[] = []
  const b = (k: string, el: ReactNode) => botoes.push(<span key={k}>{el}</span>)
  if (os.status === 'rascunho' && perm.precificar) b('orc', <button onClick={() => mudar('orcamento')} className="btn-primario"><Send size={16} /> Transformar em orçamento</button>)
  if (os.status === 'orcamento' && perm.aprovarOrcamento) b('apr', <button onClick={() => setAcao({ tipo: 'aprovar' })} className="btn-primario"><ClipboardCheck size={16} /> Registrar aprovação</button>)
  if (os.status === 'aprovado') b('ini', <button onClick={() => mudar('execucao')} className="btn-primario"><Play size={16} /> Iniciar execução</button>)
  if (os.status === 'execucao') b('agu', <button onClick={() => mudar('aguardando')} className="btn-secundario"><Clock size={16} /> Aguardando peça</button>)
  if (os.status === 'aguardando') b('ret', <button onClick={() => mudar('execucao')} className="btn-secundario"><Play size={16} /> Retomar</button>)
  if (['execucao', 'aguardando'].includes(os.status)) b('fin', <button onClick={() => confirm('Finalizar a OS? Depois disso ela fica travada para alterações.') && mudar('finalizada')} className="btn-primario"><CheckCircle2 size={16} /> Finalizar</button>)
  if (os.status === 'finalizada' && perm.faturar) b('fat', <button onClick={faturar} className="btn-primario"><Receipt size={16} /> Faturar</button>)
  if (os.status === 'faturada' && perm.faturar)
    b('pag', <button onClick={() => gravarVarios([{ tabela: 'os', dados: { id: os.id, pago_em: os.pago_em ? undefined : new Date().toISOString() } }])} className={os.pago_em ? 'btn-secundario' : 'btn-primario'}><CircleDollarSign size={16} /> {os.pago_em ? 'Desfazer recebimento' : 'Registrar recebimento'}</button>)
  if (editavel && os.status !== 'cancelada') b('edt', <Link to={`/os/${os.id}/editar`} className="btn-secundario"><Pencil size={16} /> Editar</Link>)
  if (os.travada && perm.reabrirOS) b('rea', <button onClick={() => setAcao({ tipo: 'reabrir' })} className="btn-secundario"><RotateCcw size={16} /> Reabrir</button>)
  b('imp', <button onClick={() => window.print()} className="btn-secundario"><Printer size={16} /> {perm.verValores ? 'Imprimir / PDF' : 'Comprovante'}</button>)
  if (perm.verValores && os.cliente) b('wpp', <a href={whatsappLink(os.cliente.telefone, textoWhats)} target="_blank" rel="noreferrer" className="btn-secundario"><MessageCircle size={16} /> WhatsApp</a>)
  const podeCancelar = os.status !== 'cancelada' && perm.precificar && (os.status !== 'faturada' ? !os.travada || perm.reabrirOS : perm.cancelarFaturada)
  if (podeCancelar) b('can', <button onClick={() => setAcao({ tipo: 'cancelar' })} className="btn-perigo"><Ban size={16} /> Cancelar</button>)

  return (
    <div className="print-area space-y-4">
      <div className="no-print flex flex-wrap gap-2">{botoes}</div>
      {os.travada && (
        <div className="no-print"><Aviso tipo="alerta"><Lock size={14} className="mr-1 inline" />OS travada ({STATUS_OS[os.status].label.toLowerCase()}). {perm.reabrirOS ? 'Você pode reabrir informando o motivo.' : 'Só o Dono pode reabrir.'}</Aviso></div>
      )}
      {!os.numero && (
        <div className="no-print"><Aviso>Número provisório <strong>{os.numero_provisorio}</strong> — o número oficial é gerado ao sincronizar.</Aviso></div>
      )}

      <div className="card space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-borda pb-4">
          <div className="flex items-center gap-3">
            <img src={BASE + tema.icone} alt="" className="h-16 w-16 rounded-full" />
            <div className="text-xs text-cinza">
              <div className="titulo text-lg">{oficinaNome}</div>
              {oficina && <><div>{oficina.documento} · {oficina.telefone}</div><div>{oficina.endereco} · {oficina.cidade}</div></>}
            </div>
          </div>
          <div className="text-right">
            <div className="font-titulo text-3xl font-extrabold text-brand">{numeroOS(os)}</div>
            <div className="mt-1 flex flex-wrap justify-end gap-2">
              <StatusChip status={os.status} />
              {pendente && <span className="chip bg-brand/10 text-brand ring-brand/30">Não sincronizada</span>}
              {os.status === 'faturada' && perm.verValores && (
                <span className={`chip ${os.pago_em ? 'bg-emerald-500/15 texto-ok ring-emerald-500/30' : atrasada ? 'bg-red-500/15 texto-alerta ring-red-500/30' : 'bg-zinc-500/15 text-prata ring-zinc-500/30'}`}>
                  {os.pago_em ? `Recebido ${data(os.pago_em)}` : atrasada ? 'Em atraso' : 'A receber'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Bloco titulo="Cliente">
            {os.cliente && perm.verClientes ? <Link to={`/clientes/${os.cliente.id}`} className="font-semibold text-forte hover:text-brand">{nomeCliente(os.cliente)}</Link> : <span className="font-semibold text-forte">{nomeCliente(os.cliente)}</span>}
            <div className="text-cinza">{os.cliente?.documento}</div>
            {os.solicitante && <div className="text-cinza">Solicitante: {os.solicitante}</div>}
            {os.pedido_numero && <div className="text-cinza">Pedido: <span className="text-forte">{os.pedido_numero}</span></div>}
          </Bloco>
          <Bloco titulo={os.veiculos.length > 1 ? 'Veículos' : 'Veículo'}>
            {os.veiculos.length ? os.veiculos.map((v) => {
              const kmOS = os.osVeiculos.find((x) => x.veiculo_id === v.id)?.km
              return (
                <div key={v.id}>
                  <div className="font-semibold text-forte">{v.placa}{v.frota ? ` · frota ${v.frota}` : ''}</div>
                  <div className="text-cinza">{TIPOS_VEICULO[v.tipo]} · {v.marca} {v.modelo} {v.ano ?? ''}</div>
                  {kmOS ? <div className="text-cinza">{kmOS.toLocaleString('pt-BR')} km</div> : null}
                </div>
              )
            }) : '—'}
          </Bloco>
          <Bloco titulo="Atendimento">
            <div className="text-forte">{TIPOS_OS[os.tipo]} · {LOCAIS[os.local]}</div>
            <div className="text-cinza">Mecânico: {os.mecanicos.map((m) => m.nome).join(', ') || '—'}</div>
          </Bloco>
          <Bloco titulo="Datas">
            <div className="text-cinza">Abertura: <span className="text-forte">{dataHora(os.aberta_em)}</span></div>
            {os.finalizada_em && <div className="text-cinza">Finalizada: <span className="text-forte">{data(os.finalizada_em)}</span></div>}
            {os.faturada_em && <div className="text-cinza">Faturada: <span className="text-forte">{data(os.faturada_em)}</span></div>}
            {os.vencimento && perm.verValores && <div className="text-cinza">Vencimento: <span className={atrasada ? 'texto-alerta' : 'text-forte'}>{data(os.vencimento)}</span></div>}
          </Bloco>
        </div>

        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <Bloco titulo="Defeito relatado"><p className="whitespace-pre-wrap text-prata">{os.relato || '—'}</p></Bloco>
          <Bloco titulo="Diagnóstico / execução"><p className="whitespace-pre-wrap text-prata">{os.diagnostico || '—'}</p></Bloco>
        </div>

        <div>
          <div className="label">Itens</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda text-left text-xs text-cinza">
                  <th className="py-1.5 font-semibold">Descrição</th>
                  <th className="py-1.5 font-semibold">Tipo</th>
                  <th className="py-1.5 text-right font-semibold">Qtd</th>
                  {perm.verCusto && <th className="py-1.5 text-right font-semibold">Custo</th>}
                  {perm.verValores && <th className="py-1.5 text-right font-semibold">Unit.</th>}
                  {perm.verValores && <th className="py-1.5 text-right font-semibold">Total</th>}
                </tr>
              </thead>
              <tbody>
                {os.itens.map((it) => (
                  <tr key={it.id} className="border-b border-borda/50">
                    <td className="py-2 text-forte">{it.descricao}</td>
                    <td className="py-2 text-cinza">{TIPOS_ITEM[it.tipo]}</td>
                    <td className="py-2 text-right tabular-nums">{it.qtd}</td>
                    {perm.verCusto && <td className="py-2 text-right tabular-nums text-cinza">{brl(it.custo)}</td>}
                    {perm.verValores && <td className="py-2 text-right tabular-nums">{brl(it.preco)}</td>}
                    {perm.verValores && <td className="py-2 text-right tabular-nums text-forte">{brl(it.qtd * it.preco)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {perm.verValores && (
          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <Linha r="Subtotal" v={brl(os.totais.subtotal)} />
            {os.totais.desconto > 0 && <Linha r={`Desconto (${os.desconto_pct}%)`} v={'− ' + brl(os.totais.desconto)} />}
            <div className="flex justify-between border-t border-borda pt-2 font-titulo text-2xl font-bold text-brand"><span>Total</span><span>{brl(os.totais.total)}</span></div>
            <div className="text-right text-xs text-cinza">Pagamento: {FORMAS_PAGAMENTO[os.forma_pagamento]}</div>
            {perm.verMargem && <div className="no-print text-right text-xs text-cinza">Custo {brl(os.totais.custo)} · Margem <span className="texto-ok">{brl(os.totais.margem)}</span></div>}
          </div>
        )}

        {fotos.length > 0 && (
          <Bloco titulo={`Fotos (${fotos.length})`}>
            <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {fotos.map((f, i) => <a key={f.id} href={f.imagem} target="_blank" rel="noreferrer"><img src={f.imagem} alt={f.legenda ?? `Foto ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" /></a>)}
            </div>
          </Bloco>
        )}

        {oficina?.garantia_texto && perm.verValores && <p className="text-xs text-cinza">{oficina.garantia_texto}</p>}

        <div className="grid gap-6 pt-4 sm:grid-cols-2">
          {(['cliente', 'mecanico'] as const).map((papel) => {
            const a = assinaturas.find((x) => x.papel === papel)
            return (
              <div key={papel} className="text-center text-xs text-cinza">
                {a ? <img src={a.imagem} alt="Assinatura" className="mx-auto h-20 rounded bg-white" /> : <div className="h-20" />}
                <div className="mt-1 border-t border-borda pt-1">
                  {papel === 'cliente' ? 'Cliente / motorista' : 'Mecânico responsável'}{a ? ` — ${a.nome}, ${dataHora(a.data)}${a.offline ? ' (offline)' : ''}` : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card no-print">
        <h2 className="titulo mb-3 text-lg text-brand">Histórico</h2>
        <ol className="space-y-2 text-sm">
          {historico.map((h) => (
            <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 border-l-2 border-brand/50 pl-3">
              <span className="font-semibold text-forte">{h.de ? `${STATUS_OS[h.de].label} → ` : 'Aberta como '}{STATUS_OS[h.para].label}</span>
              <span className="text-xs text-cinza">{dataHora(h.data)} · {h.usuario_nome}</span>
              {h.motivo && <span className="w-full text-xs text-prata">Motivo: {h.motivo}</span>}
            </li>
          ))}
        </ol>
      </div>

      <ModalAcao os={os} acao={acao} onFechar={() => setAcao(null)} mudar={mudar} />
    </div>
  )
}

function ModalAcao({ os, acao, onFechar, mudar }: {
  os: OSCompleta; acao: Acao; onFechar: () => void; mudar: (s: StatusOS, extras?: Partial<OrdemServico>, motivo?: string) => Promise<void>
}) {
  const [texto, setTexto] = useState('')
  const [pedido, setPedido] = useState(os.pedido_numero ?? '')
  const [meio, setMeio] = useState('WhatsApp')
  const [erro, setErro] = useState('')
  if (!acao) return null
  const titulo = { cancelar: 'Cancelar OS', reabrir: 'Reabrir OS', aprovar: 'Aprovação do orçamento' }[acao.tipo]

  const confirmar = async () => {
    if (acao.tipo !== 'aprovar' && texto.trim().length < 3) return setErro('Informe o motivo.')
    if (acao.tipo === 'aprovar') {
      if (!texto.trim()) return setErro('Informe quem aprovou.')
      if (os.cliente?.exige_pedido && !pedido.trim()) return setErro('Este cliente exige número de pedido/autorização.')
      await mudar('aprovado', { aprovado_por: texto, pedido_numero: pedido || undefined }, `Aprovado por ${texto} via ${meio}`)
    } else if (acao.tipo === 'cancelar') {
      await mudar('cancelada', { motivo_cancelamento: texto }, texto)
    } else {
      await mudar('execucao', {}, texto)
    }
    onFechar()
  }

  return (
    <Modal aberto titulo={titulo} onFechar={onFechar}>
      <div className="space-y-3">
        {acao.tipo === 'aprovar' ? (
          <>
            <Campo rotulo="Quem aprovou no cliente"><input className="input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Marcos (frota)" /></Campo>
            <Campo rotulo="Como aprovou">
              <select className="input" value={meio} onChange={(e) => setMeio(e.target.value)}>
                {['WhatsApp', 'Telefone', 'E-mail', 'Assinatura'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Campo>
            <Campo rotulo={os.cliente?.exige_pedido ? 'Nº do pedido / autorização (obrigatório)' : 'Nº do pedido / autorização'}>
              <input className="input" value={pedido} onChange={(e) => setPedido(e.target.value)} />
            </Campo>
          </>
        ) : (
          <Campo rotulo="Motivo (obrigatório)"><textarea className="input min-h-24" value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>
        )}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button onClick={confirmar} className={acao.tipo === 'cancelar' ? 'btn-perigo w-full' : 'btn-primario w-full'}>Confirmar</button>
      </div>
    </Modal>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <div><div className="label">{titulo}</div>{children}</div>
}

function Linha({ r, v }: { r: string; v: string }) {
  return <div className="flex justify-between"><span className="text-cinza">{r}</span><span className="tabular-nums text-forte">{v}</span></div>
}
