import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Ban, CheckCircle2, CircleDollarSign, ClipboardCheck, Clock, Copy, Lock, MapPin, MessageCircle, Pause, Pencil, Play, Printer,
  Receipt, RotateCcw, Send, ShieldCheck, Timer,
} from 'lucide-react'
import { useSessao } from '../../app/sessao'
import { tema } from '../../config/tema'
import { db } from '../../db/banco'
import { nomeCliente, useLista, useOSCompleta, type OSCompleta } from '../../db/consultas'
import { calcularVencimento } from '../../domain/calculos'
import { emAtraso } from '../../domain/financeiro'
import { formatarDuracao, minutosPorFuncionario } from '../../domain/garantia'
import { podeEditarOS } from '../../domain/permissoes'
import type { MomentoFoto, OficinaConfig, OrdemServico, OSAprovacao, OSAssinatura, OSFoto, OSItem, StatusOS } from '../../domain/tipos'
import {
  brl, data, dataHora, FORMAS_PAGAMENTO, LOCAIS, MEIOS_APROVACAO, MOMENTOS_FOTO, numeroOS, STATUS_OS, TIPOS_ITEM, TIPOS_OS, TIPOS_VEICULO, whatsappLink,
} from '../../lib/format'
import { gravarVarios, type Operacao } from '../../sync/motor'
import { Assinatura } from '../../components/Assinatura'
import { FotoOS } from '../../components/FotoOS'
import { Aviso, Campo, Modal, StatusChip } from '../../components/ui'

const BASE = import.meta.env.BASE_URL

type Acao = 'cancelar' | 'reabrir' | 'aprovar' | 'finalizar' | null

const listaDe = <T extends { deleted_at?: string | null }>(l: T[]) => l.filter((x) => !x.deleted_at)

export function OSDetalhe() {
  const { id = '' } = useParams()
  const os = useOSCompleta(id)
  const oficina = useLiveQuery(() => db.t('oficina_config').get('oficina'), [])
  const fotos = useLiveQuery(async () => listaDe(await db.t('os_fotos').where('os_id').equals(id).toArray()), [id], [])
  const assinaturas = useLiveQuery(async () => listaDe(await db.t('os_assinaturas').where('os_id').equals(id).toArray()), [id], [])
  const historico = useLiveQuery(async () => listaDe(await db.t('os_status_hist').where('os_id').equals(id).toArray()).sort((a, b) => b.data.localeCompare(a.data)), [id], [])
  const apontamentos = useLiveQuery(async () => listaDe(await db.t('os_apontamentos').where('os_id').equals(id).toArray()).sort((a, b) => a.inicio.localeCompare(b.inicio)), [id], [])
  const aprovacoes = useLiveQuery(async () => listaDe(await db.t('os_aprovacoes').where('os_id').equals(id).toArray()), [id], [])
  const retornos = useLiveQuery(async () => listaDe(await db.t('os').filter((o) => o.os_origem_id === id).toArray()), [id], [])
  const origem = useLiveQuery(async () => (os?.os_origem_id ? db.t('os').get(os.os_origem_id) : undefined), [os?.os_origem_id])
  const pendente = useLiveQuery(async () => (await db.outbox.where('registro_id').equals(id).count()) > 0, [id], false)
  const funcionarios = useLista('funcionarios')
  const fornecedores = useLista('fornecedores')

  if (os === undefined) return <div className="text-cinza">Carregando…</div>
  if (os === null) return <Aviso tipo="erro">OS não encontrada ou sem permissão para ver.</Aviso>
  return (
    <Documento
      os={os} oficina={oficina} fotos={fotos} assinaturas={assinaturas} historico={historico} apontamentos={apontamentos}
      aprovacoes={aprovacoes} retornos={retornos} origem={origem} pendente={pendente}
      nomeFunc={(fid) => funcionarios.find((f) => f.id === fid)?.nome ?? '—'}
      nomeForn={(fid) => fornecedores.find((f) => f.id === fid)?.nome}
    />
  )
}

interface PropsDoc {
  os: OSCompleta
  oficina?: OficinaConfig
  fotos: OSFoto[]
  assinaturas: OSAssinatura[]
  historico: { id: string; de: StatusOS | null; para: StatusOS; motivo?: string; usuario_nome: string; data: string }[]
  apontamentos: { id: string; funcionario_id: string; inicio: string; fim?: string | null }[]
  aprovacoes: OSAprovacao[]
  retornos: OrdemServico[]
  origem?: OrdemServico
  pendente: boolean
  nomeFunc: (id: string) => string
  nomeForn: (id?: string) => string | undefined
}

function Documento(p: PropsDoc) {
  const { os, oficina, fotos, assinaturas, historico, apontamentos, aprovacoes, retornos, origem, pendente, nomeFunc, nomeForn } = p
  const { sessao, perm } = useSessao()
  const navigate = useNavigate()
  const [acao, setAcao] = useState<Acao>(null)
  const editavel = podeEditarOS(sessao.papel, os)
  const atrasada = emAtraso(os)
  const oficinaNome = oficina?.nome ?? tema.nomeSistema

  async function mudar(para: StatusOS, extras: Partial<OrdemServico> = {}, motivo?: string, antes: Operacao[] = []) {
    const agora = new Date().toISOString()
    const dados: Partial<OrdemServico> = { id: os.id, status: para, ...extras }
    if (para === 'finalizada') dados.finalizada_em = agora
    // Registros da OS (assinaturas, horas) vão antes da mudança de status: OS finalizada fica travada.
    await gravarVarios([
      ...antes,
      { tabela: 'os', dados },
      { tabela: 'os_status_hist', dados: { os_id: os.id, de: os.status, para, motivo, usuario_nome: sessao.nome, data: agora } },
    ])
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

  const botoes: [string, ReactNode][] = []
  const b = (k: string, el: ReactNode) => botoes.push([k, el])
  if (os.status === 'rascunho' && perm.precificar) b('orc', <button onClick={() => mudar('orcamento')} className="btn-primario"><Send size={16} /> Transformar em orçamento</button>)
  if (os.status === 'orcamento' && perm.aprovarOrcamento) b('apr', <button onClick={() => setAcao('aprovar')} className="btn-primario"><ClipboardCheck size={16} /> Registrar aprovação</button>)
  if (os.status === 'execucao') b('agu', <button onClick={() => mudar('aguardando')} className="btn-secundario"><Clock size={16} /> Aguardando peça</button>)
  if (os.status === 'aguardando') b('ret', <button onClick={() => mudar('execucao')} className="btn-secundario"><Play size={16} /> Retomar</button>)
  if (['aprovado', 'execucao', 'aguardando'].includes(os.status)) b('fin', <button onClick={() => setAcao('finalizar')} className="btn-primario"><CheckCircle2 size={16} /> Finalizar</button>)
  if (os.status === 'finalizada' && perm.faturar) b('fat', <button onClick={faturar} className="btn-primario"><Receipt size={16} /> Faturar</button>)
  if (os.status === 'faturada' && perm.faturar)
    b('pag', <button onClick={() => gravarVarios([{ tabela: 'os', dados: { id: os.id, pago_em: os.pago_em ? undefined : new Date().toISOString() } }])} className={os.pago_em ? 'btn-secundario' : 'btn-primario'}><CircleDollarSign size={16} /> {os.pago_em ? 'Desfazer recebimento' : 'Registrar recebimento'}</button>)
  if (editavel && os.status !== 'cancelada') b('edt', <Link to={`/os/${os.id}/editar`} className="btn-secundario"><Pencil size={16} /> Editar</Link>)
  if (os.travada && perm.reabrirOS) b('rea', <button onClick={() => setAcao('reabrir')} className="btn-secundario"><RotateCcw size={16} /> Reabrir</button>)
  if (perm.precificar) b('dup', <button onClick={() => navigate(`/os/nova?duplicar=${os.id}`)} className="btn-secundario"><Copy size={16} /> Duplicar</button>)
  if (perm.precificar && ['finalizada', 'faturada'].includes(os.status))
    b('gar', <button onClick={() => navigate(`/os/nova?garantia=${os.id}`)} className="btn-secundario"><ShieldCheck size={16} /> Retorno em garantia</button>)
  b('imp', <button onClick={() => window.print()} className="btn-secundario"><Printer size={16} /> {perm.verValores ? 'Imprimir / PDF' : 'Comprovante'}</button>)
  if (perm.verValores && os.cliente) b('wpp', <a href={whatsappLink(os.cliente.telefone, textoWhats)} target="_blank" rel="noreferrer" className="btn-secundario"><MessageCircle size={16} /> WhatsApp</a>)
  const podeCancelar = os.status !== 'cancelada' && perm.precificar && (os.status !== 'faturada' ? !os.travada || perm.reabrirOS : perm.cancelarFaturada)
  if (podeCancelar) b('can', <button onClick={() => setAcao('cancelar')} className="btn-perigo"><Ban size={16} /> Cancelar</button>)

  // Itens agrupados por veículo quando a OS tem mais de um
  const grupos = os.osVeiculos.length > 1
    ? [
        ...os.osVeiculos.map((ov) => ({ titulo: (() => { const v = os.veiculos.find((x) => x.id === ov.veiculo_id); return v ? `${v.placa} · ${TIPOS_VEICULO[v.tipo]}` : 'Veículo' })(), itens: os.itens.filter((i) => i.os_veiculo_id === ov.id) })),
        { titulo: 'Geral', itens: os.itens.filter((i) => !i.os_veiculo_id || !os.osVeiculos.some((ov) => ov.id === i.os_veiculo_id)) },
      ].filter((g) => g.itens.length)
    : [{ titulo: '', itens: os.itens }]

  return (
    <div className="print-area space-y-4">
      <div className="no-print flex flex-wrap gap-2">{botoes.map(([k, el]) => <span key={k}>{el}</span>)}</div>
      {os.travada && (
        <div className="no-print"><Aviso tipo="alerta"><Lock size={14} className="mr-1 inline" />OS travada ({STATUS_OS[os.status].label.toLowerCase()}). {perm.reabrirOS ? 'Você pode reabrir informando o motivo.' : 'Só o Dono pode reabrir.'}</Aviso></div>
      )}
      {!os.numero && <div className="no-print"><Aviso>Número provisório <strong>{os.numero_provisorio}</strong> — o número oficial é gerado ao sincronizar.</Aviso></div>}
      {origem && (
        <div className="no-print"><Aviso><ShieldCheck size={14} className="mr-1 inline" />Retorno em garantia da <Link to={`/os/${origem.id}`} className="font-semibold text-brand underline">{numeroOS(origem)}</Link> — sem cobrança por padrão.</Aviso></div>
      )}

      {['aprovado', 'execucao', 'aguardando'].includes(os.status) && sessao.papel !== 'secretaria' && sessao.funcionario_id && (
        <PainelHoras os={os} apontamentos={apontamentos} nomeFunc={nomeFunc} mudar={mudar} />
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
              const ov = os.osVeiculos.find((x) => x.veiculo_id === v.id)
              return (
                <div key={v.id} className="mb-1">
                  <div className="font-semibold text-forte">{v.placa}{v.frota ? ` · frota ${v.frota}` : ''}</div>
                  <div className="text-cinza">{TIPOS_VEICULO[v.tipo]} · {v.marca} {v.modelo} {v.ano ?? ''}</div>
                  {(ov?.km || ov?.horimetro) && <div className="text-cinza">{[ov.km && `${ov.km.toLocaleString('pt-BR')} km`, ov.horimetro && `${ov.horimetro} h`].filter(Boolean).join(' · ')}</div>}
                </div>
              )
            }) : '—'}
          </Bloco>
          <Bloco titulo="Atendimento">
            <div className="text-forte">{TIPOS_OS[os.tipo]} · {LOCAIS[os.local]}</div>
            {os.endereco && <div className="text-cinza">{os.endereco}</div>}
            {os.lat != null && <a className="no-print inline-flex items-center gap-1 text-brand underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${os.lat},${os.lng}`}><MapPin size={12} /> ver no mapa</a>}
            <div className="text-cinza">Mecânico: {os.mecanicos.map((m) => m.nome).join(', ') || '—'}</div>
          </Bloco>
          <Bloco titulo="Datas">
            <div className="text-cinza">Abertura: <span className="text-forte">{dataHora(os.aberta_em)}</span></div>
            {os.previsao_entrega && <div className="text-cinza">Previsão: <span className="text-forte">{data(os.previsao_entrega)}</span></div>}
            {os.finalizada_em && <div className="text-cinza">Finalizada: <span className="text-forte">{data(os.finalizada_em)}</span></div>}
            {os.faturada_em && <div className="text-cinza">Faturada: <span className="text-forte">{data(os.faturada_em)}</span></div>}
            {os.vencimento && perm.verValores && <div className="text-cinza">Vencimento: <span className={atrasada ? 'texto-alerta' : 'text-forte'}>{data(os.vencimento)}</span></div>}
          </Bloco>
        </div>

        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <Bloco titulo="Defeito relatado"><p className="whitespace-pre-wrap text-prata">{os.relato || '—'}</p></Bloco>
          <Bloco titulo="Diagnóstico / execução"><p className="whitespace-pre-wrap text-prata">{os.diagnostico || '—'}</p></Bloco>
        </div>

        {grupos.map((g) => <TabelaItens key={g.titulo || 'itens'} titulo={g.titulo} itens={g.itens} perm={perm} nomeForn={nomeForn} />)}

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
            {(['antes', 'durante', 'depois'] as MomentoFoto[]).map((m) => {
              const doMomento = fotos.filter((f) => (f.momento ?? 'durante') === m)
              if (!doMomento.length) return null
              return (
                <div key={m} className="mt-2">
                  <div className="mb-1 text-xs font-semibold uppercase text-cinza">{MOMENTOS_FOTO[m]}</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {doMomento.map((f) => (
                      <figure key={f.id}>
                        <FotoOS foto={f} className="aspect-square rounded-lg" />
                        {f.legenda && <figcaption className="mt-0.5 truncate text-[11px] text-cinza">{f.legenda}</figcaption>}
                      </figure>
                    ))}
                  </div>
                </div>
              )
            })}
          </Bloco>
        )}

        {oficina?.garantia_texto && perm.verValores && <p className="text-xs text-cinza">{oficina.garantia_texto}</p>}

        <div className="grid gap-6 pt-4 sm:grid-cols-2">
          {(['cliente', 'mecanico'] as const).map((papel) => {
            const a = assinaturas.filter((x) => x.papel === papel).sort((x, y) => y.data.localeCompare(x.data))[0]
            return (
              <div key={papel} className="text-center text-xs text-cinza">
                {a ? <img src={a.imagem} alt="Assinatura" className="mx-auto h-20 rounded bg-white" /> : <div className="h-20" />}
                <div className="mt-1 border-t border-borda pt-1">
                  {papel === 'cliente' ? 'Cliente / motorista' : 'Mecânico responsável'}
                  {a && <> — {a.nome}{a.documento ? ` (${a.documento})` : ''}, {dataHora(a.data)}{a.offline ? ' · assinada offline' : ''}</>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="no-print grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="titulo mb-3 text-lg text-brand">Histórico</h2>
          <ol className="space-y-2 text-sm">
            {historico.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 border-l-2 border-brand/50 pl-3">
                <span className="font-semibold text-forte">{h.de ? `${STATUS_OS[h.de].label} → ` : 'Aberta como '}{STATUS_OS[h.para].label}</span>
                <span className="text-xs text-cinza">{dataHora(h.data)} · {h.usuario_nome}</span>
                {h.motivo && <span className="w-full text-xs text-prata">{h.motivo}</span>}
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-4">
          {aprovacoes.length > 0 && (
            <div className="card">
              <h2 className="titulo mb-3 text-lg text-brand">Aprovação</h2>
              {aprovacoes.map((a) => (
                <p key={a.id} className="text-sm text-prata">
                  Aprovado por <strong className="text-forte">{a.aprovado_por}</strong> via {MEIOS_APROVACAO[a.meio]} em {dataHora(a.data)}
                  {a.pedido_numero ? <> · pedido <strong className="text-forte">{a.pedido_numero}</strong></> : ''} · registrado por {a.usuario_nome}
                </p>
              ))}
            </div>
          )}
          {apontamentos.length > 0 && !['aprovado', 'execucao', 'aguardando'].includes(os.status) && (
            <div className="card">
              <h2 className="titulo mb-2 text-lg text-brand">Horas trabalhadas</h2>
              <ResumoHoras apontamentos={apontamentos} nomeFunc={nomeFunc} />
            </div>
          )}
          {retornos.length > 0 && (
            <div className="card">
              <h2 className="titulo mb-2 text-lg text-brand">Retornos em garantia</h2>
              {retornos.map((r) => <Link key={r.id} to={`/os/${r.id}`} className="block py-1 text-sm text-brand underline">{numeroOS(r)} · {STATUS_OS[r.status].label}</Link>)}
            </div>
          )}
        </div>
      </div>

      {acao && <ModalAcao os={os} acao={acao} apontamentos={apontamentos} assinaturas={assinaturas} nomeFunc={nomeFunc} onFechar={() => setAcao(null)} mudar={mudar} />}
    </div>
  )
}

/** Iniciar / pausar o próprio apontamento de horas, com o tempo correndo na tela. */
function PainelHoras({ os, apontamentos, nomeFunc, mudar }: {
  os: OSCompleta; apontamentos: PropsDoc['apontamentos']; nomeFunc: (id: string) => string
  mudar: (s: StatusOS, extras?: Partial<OrdemServico>, motivo?: string, antes?: Operacao[]) => Promise<void>
}) {
  const { sessao } = useSessao()
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  const meu = apontamentos.find((a) => a.funcionario_id === sessao.funcionario_id && !a.fim)
  const iniciar = async () => {
    const op: Operacao = { tabela: 'os_apontamentos', dados: { os_id: os.id, funcionario_id: sessao.funcionario_id, inicio: new Date().toISOString(), fim: null } }
    if (os.status === 'execucao') await gravarVarios([op])
    else await mudar('execucao', {}, os.status === 'aguardando' ? 'Peça chegou' : undefined, [op])
  }
  const pausar = () => meu && gravarVarios([{ tabela: 'os_apontamentos', dados: { id: meu.id, fim: new Date().toISOString() } }])

  return (
    <div className="no-print card flex flex-wrap items-center justify-between gap-3 border-brand/40">
      <div>
        <div className="flex items-center gap-2 font-semibold text-forte"><Timer size={18} className="text-brand" /> Minhas horas nesta OS</div>
        <ResumoHoras apontamentos={apontamentos} nomeFunc={nomeFunc} />
      </div>
      {meu ? (
        <button onClick={pausar} className="btn-secundario py-3 text-base"><Pause size={20} /> Pausar ({formatarDuracao((Date.now() - new Date(meu.inicio).getTime()) / 60000)})</button>
      ) : (
        <button onClick={iniciar} className="btn-primario py-3 text-base"><Play size={20} /> Iniciar serviço</button>
      )}
    </div>
  )
}

function ResumoHoras({ apontamentos, nomeFunc }: { apontamentos: PropsDoc['apontamentos']; nomeFunc: (id: string) => string }) {
  const mins = minutosPorFuncionario(apontamentos)
  if (!mins.size) return <p className="text-xs text-cinza">Nenhuma hora apontada ainda.</p>
  return (
    <ul className="mt-1 text-sm text-prata">
      {[...mins.entries()].map(([fid, m]) => (
        <li key={fid}>
          {nomeFunc(fid)}: <strong className="text-forte">{formatarDuracao(m)}</strong>
          {apontamentos.some((a) => a.funcionario_id === fid && !a.fim) && <span className="ml-1 text-xs text-brand">● trabalhando agora</span>}
        </li>
      ))}
    </ul>
  )
}

function ModalAcao({ os, acao, apontamentos, assinaturas, nomeFunc, onFechar, mudar }: {
  os: OSCompleta; acao: Exclude<Acao, null>; apontamentos: PropsDoc['apontamentos']; assinaturas: OSAssinatura[]
  nomeFunc: (id: string) => string; onFechar: () => void
  mudar: (s: StatusOS, extras?: Partial<OrdemServico>, motivo?: string, antes?: Operacao[]) => Promise<void>
}) {
  const { sessao } = useSessao()
  const [texto, setTexto] = useState('')
  const [pedido, setPedido] = useState(os.pedido_numero ?? '')
  const [meio, setMeio] = useState<OSAprovacao['meio']>('whatsapp')
  const [iniciarJa, setIniciarJa] = useState(false)
  const [erro, setErro] = useState('')
  const jaTemCliente = assinaturas.some((a) => a.papel === 'cliente')
  const mecPadrao = sessao.papel === 'mecanico' ? sessao.nome : os.mecanicos[0]?.nome ?? sessao.nome
  const [assMec, setAssMec] = useState<{ nome: string; imagem?: string }>({ nome: mecPadrao })
  const [assCli, setAssCli] = useState<{ nome: string; documento: string; imagem?: string }>({ nome: os.solicitante ?? '', documento: '' })
  const titulo = { cancelar: 'Cancelar OS', reabrir: 'Reabrir OS', aprovar: 'Aprovação do orçamento', finalizar: 'Finalizar OS' }[acao]

  const confirmar = async () => {
    setErro('')
    const agora = new Date().toISOString()
    const offline = !navigator.onLine
    if (acao === 'aprovar') {
      if (!texto.trim()) return setErro('Informe quem aprovou.')
      if (os.cliente?.exige_pedido && !pedido.trim()) return setErro('Este cliente exige número de pedido/autorização.')
      const reg: Operacao = { tabela: 'os_aprovacoes', dados: { os_id: os.id, aprovado_por: texto, meio, pedido_numero: pedido || undefined, data: agora, usuario_nome: sessao.nome } }
      await mudar(iniciarJa ? 'execucao' : 'aprovado', { aprovado_por: texto, pedido_numero: pedido || undefined }, `Aprovado por ${texto} via ${MEIOS_APROVACAO[meio]}`, [reg])
    } else if (acao === 'finalizar') {
      if (!assMec.imagem) return setErro('Colha a assinatura do mecânico responsável.')
      const antes: Operacao[] = [
        { tabela: 'os_assinaturas', dados: { os_id: os.id, papel: 'mecanico', nome: assMec.nome, imagem: assMec.imagem, offline, data: agora } },
        // Mecânico só encerra as próprias horas (o servidor recusaria as dos colegas)
        ...apontamentos.filter((a) => !a.fim && (sessao.papel !== 'mecanico' || a.funcionario_id === sessao.funcionario_id)).map((a): Operacao => ({ tabela: 'os_apontamentos', dados: { id: a.id, fim: agora } })),
      ]
      if (assCli.imagem) antes.push({ tabela: 'os_assinaturas', dados: { os_id: os.id, papel: 'cliente', nome: assCli.nome, documento: assCli.documento || undefined, imagem: assCli.imagem, offline, data: agora } })
      await mudar('finalizada', {}, undefined, antes)
    } else if (texto.trim().length < 3) {
      return setErro('Informe o motivo.')
    } else if (acao === 'cancelar') {
      await mudar('cancelada', { motivo_cancelamento: texto }, texto)
    } else {
      await mudar('execucao', {}, `Reaberta: ${texto}`)
    }
    onFechar()
  }

  return (
    <Modal aberto titulo={titulo} onFechar={onFechar}>
      <div className="space-y-3">
        {acao === 'aprovar' && (
          <>
            <Campo rotulo="Quem aprovou no cliente"><input className="input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Marcos (frota)" /></Campo>
            <Campo rotulo="Como aprovou">
              <select className="input" value={meio} onChange={(e) => setMeio(e.target.value as OSAprovacao['meio'])}>
                {Object.entries(MEIOS_APROVACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo rotulo={os.cliente?.exige_pedido ? 'Nº do pedido / autorização (obrigatório)' : 'Nº do pedido / autorização'}>
              <input className="input" value={pedido} onChange={(e) => setPedido(e.target.value)} />
            </Campo>
            <label className="flex min-h-11 items-center gap-3 text-sm text-prata">
              <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={iniciarJa} onChange={(e) => setIniciarJa(e.target.checked)} />
              Já iniciar a execução (converter em OS agora)
            </label>
          </>
        )}
        {acao === 'finalizar' && (
          <>
            {apontamentos.some((a) => !a.fim) && <Aviso>As horas em andamento ({apontamentos.filter((a) => !a.fim).map((a) => nomeFunc(a.funcionario_id)).join(', ')}) serão encerradas agora.</Aviso>}
            <Campo rotulo="Mecânico responsável"><input className="input" value={assMec.nome} onChange={(e) => setAssMec({ ...assMec, nome: e.target.value })} /></Campo>
            <Assinatura valor={assMec.imagem} onChange={(imagem) => setAssMec({ ...assMec, imagem })} />
            {!jaTemCliente && (
              <>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Campo rotulo="Cliente / motorista"><input className="input" value={assCli.nome} onChange={(e) => setAssCli({ ...assCli, nome: e.target.value })} /></Campo>
                  <Campo rotulo="Documento"><input className="input" value={assCli.documento} onChange={(e) => setAssCli({ ...assCli, documento: e.target.value })} /></Campo>
                </div>
                <Assinatura valor={assCli.imagem} onChange={(imagem) => setAssCli({ ...assCli, imagem })} />
                <p className="text-xs text-cinza">Assinatura do cliente opcional se ele não estiver presente.</p>
              </>
            )}
            <Aviso tipo="alerta">Depois de finalizada, a OS fica travada. Só o Dono pode reabrir.</Aviso>
          </>
        )}
        {(acao === 'cancelar' || acao === 'reabrir') && (
          <Campo rotulo="Motivo (obrigatório)"><textarea className="input min-h-24" value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>
        )}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button onClick={confirmar} className={acao === 'cancelar' ? 'btn-perigo w-full' : 'btn-primario w-full'}>Confirmar</button>
      </div>
    </Modal>
  )
}

function TabelaItens({ titulo, itens, perm, nomeForn }: { titulo: string; itens: OSItem[]; perm: ReturnType<typeof useSessao>['perm']; nomeForn: (id?: string) => string | undefined }) {
  return (
    <div>
      <div className="label">{titulo ? `Itens — ${titulo}` : 'Itens'}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borda text-left text-xs text-cinza">
              <th className="py-1.5 font-semibold">Descrição</th>
              <th className="py-1.5 pl-3 font-semibold">Tipo</th>
              <th className="whitespace-nowrap py-1.5 pl-3 text-right font-semibold">Qtd</th>
              {perm.verCusto && <th className="whitespace-nowrap py-1.5 pl-3 text-right font-semibold">Custo</th>}
              {perm.verValores && <th className="whitespace-nowrap py-1.5 pl-3 text-right font-semibold">Unit.</th>}
              {perm.verValores && <th className="whitespace-nowrap py-1.5 pl-3 text-right font-semibold">Total</th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => {
              const detalhes = [it.codigo && `cód. ${it.codigo}`, it.origem === 'cliente' && 'peça do cliente', perm.verValores && nomeForn(it.fornecedor_id), it.garantia_dias && `garantia ${it.garantia_dias} dias`].filter(Boolean)
              return (
                <tr key={it.id} className="border-b border-borda/50 align-top">
                  <td className="py-2 text-forte">{it.descricao}{detalhes.length > 0 && <div className="text-xs text-cinza">{detalhes.join(' · ')}</div>}</td>
                  <td className="whitespace-nowrap py-2 pl-3 text-cinza">{TIPOS_ITEM[it.tipo]}</td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums">{it.qtd}</td>
                  {perm.verCusto && <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-cinza">{brl(it.custo)}</td>}
                  {perm.verValores && <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums">{brl(it.preco)}</td>}
                  {perm.verValores && <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-forte">{brl(it.qtd * it.preco)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <div><div className="label">{titulo}</div>{children}</div>
}

function Linha({ r, v }: { r: string; v: string }) {
  return <div className="flex justify-between"><span className="text-cinza">{r}</span><span className="tabular-nums text-forte">{v}</span></div>
}
