import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ban, CheckCircle2, CircleDollarSign, Clock, MessageCircle, Pencil, Play, Printer, Receipt } from 'lucide-react'
import { db, getConfig } from '../data/db'
import { osRepo } from '../data/repos/os'
import { emAtraso } from '../data/repos/financeiro'
import { EMPRESA_PADRAO } from '../data/seed'
import type { ItemOS, OrdemServico, StatusOS } from '../data/types'
import {
  brl, calcularVencimento, data, dataHora, FORMAS_PAGAMENTO, LOCAIS, numeroOS, somaItens, TIPOS_OS, whatsappLink,
} from '../lib/format'
import { StatusChip } from '../components/ui'

const BASE = import.meta.env.BASE_URL

export function OSDetalhe() {
  const id = Number(useParams().id)
  const os = useLiveQuery(() => db.os.get(id), [id])
  const cliente = useLiveQuery(() => (os ? db.clientes.get(os.clienteId) : undefined), [os?.clienteId])
  const veiculo = useLiveQuery(() => (os?.veiculoId ? db.veiculos.get(os.veiculoId) : undefined), [os?.veiculoId])
  const empresa = useLiveQuery(() => getConfig('empresa', EMPRESA_PADRAO), [], EMPRESA_PADRAO)

  if (!os) return <div className="text-cinza">Carregando…</div>

  const mudar = (status: StatusOS, extras: Partial<OrdemServico> = {}) => osRepo.mudarStatus(os, status, extras)
  const faturar = () =>
    mudar('faturada', {
      faturadaEm: new Date().toISOString(),
      vencimento: calcularVencimento(new Date(), cliente?.condicao ?? 'avista', cliente?.diaFechamento),
    })

  const textoWhats = [
    `*Bruno Mecânica Diesel* — ${numeroOS(os.numero)}`,
    veiculo ? `Veículo: ${veiculo.placa} ${veiculo.marca} ${veiculo.modelo}` : '',
    `Status: ${os.status === 'faturada' ? 'Faturada' : os.status === 'concluida' ? 'Concluída' : 'Em atendimento'}`,
    '',
    ...os.servicos.map((s) => `• ${s.descricao} — ${brl(s.qtd * s.valor)}`),
    ...os.pecas.map((p) => `• ${p.qtd}x ${p.descricao} — ${brl(p.qtd * p.valor)}`),
    os.deslocamento ? `• Deslocamento — ${brl(os.deslocamento)}` : '',
    os.desconto ? `Desconto: − ${brl(os.desconto)}` : '',
    `*Total: ${brl(os.total)}*`,
    os.vencimento ? `Vencimento: ${data(os.vencimento)}` : '',
    empresa.pix ? `Pix: ${empresa.pix}` : '',
  ].filter((l) => l !== '').join('\n')

  const atrasada = emAtraso(os)

  return (
    <div className="print-area">
      {/* Ações */}
      <div className="no-print mb-4 flex flex-wrap gap-2">
        {os.status === 'aberta' && <button onClick={() => mudar('andamento')} className="btn-primario"><Play size={16} /> Iniciar serviço</button>}
        {os.status === 'andamento' && <button onClick={() => mudar('aguardando')} className="btn-secundario"><Clock size={16} /> Aguardando peça</button>}
        {os.status === 'aguardando' && <button onClick={() => mudar('andamento')} className="btn-secundario"><Play size={16} /> Retomar</button>}
        {['aberta', 'andamento', 'aguardando'].includes(os.status) && <button onClick={() => mudar('concluida')} className="btn-primario"><CheckCircle2 size={16} /> Concluir</button>}
        {os.status === 'concluida' && <button onClick={faturar} className="btn-primario"><Receipt size={16} /> Faturar</button>}
        {os.status === 'faturada' && (
          <button onClick={() => osRepo.marcarPago(os, !os.pagoEm)} className={os.pagoEm ? 'btn-secundario' : 'btn-primario'}>
            <CircleDollarSign size={16} /> {os.pagoEm ? 'Desfazer pagamento' : 'Marcar como pago'}
          </button>
        )}
        {os.status !== 'faturada' && os.status !== 'cancelada' && (
          <Link to={`/os/${os.id}/editar`} className="btn-secundario"><Pencil size={16} /> Editar</Link>
        )}
        <button onClick={() => window.print()} className="btn-secundario"><Printer size={16} /> Imprimir / PDF</button>
        {cliente && (
          <a href={whatsappLink(cliente.telefone, textoWhats)} target="_blank" rel="noreferrer" className="btn-secundario"><MessageCircle size={16} /> WhatsApp</a>
        )}
        {!['faturada', 'cancelada'].includes(os.status) && (
          <button onClick={() => confirm('Cancelar esta OS?') && mudar('cancelada')} className="btn-perigo"><Ban size={16} /> Cancelar</button>
        )}
      </div>

      {/* Documento */}
      <div className="card space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-borda pb-4">
          <div className="flex items-center gap-3">
            <img src={BASE + 'icon-192.png'} alt="" className="h-16 w-16 rounded-full" />
            <div className="text-xs text-cinza">
              <div className="titulo text-lg">{empresa.nome}</div>
              <div>{empresa.documento} · {empresa.telefone}</div>
              <div>{empresa.endereco} · {empresa.cidade}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-titulo text-3xl font-extrabold text-brand">{numeroOS(os.numero)}</div>
            <div className="mt-1 flex justify-end gap-2"><StatusChip status={os.status} />{os.status === 'faturada' && (
              <span className={`chip ${os.pagoEm ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' : atrasada ? 'bg-red-500/15 text-red-300 ring-red-500/30' : 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30'}`}>
                {os.pagoEm ? `Pago ${data(os.pagoEm)}` : atrasada ? 'Em atraso' : 'A receber'}
              </span>
            )}</div>
          </div>
        </div>

        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Bloco titulo="Cliente">
            {cliente ? <Link to={`/clientes/${cliente.id}`} className="font-semibold text-white hover:text-brand">{cliente.fantasia || cliente.nome}</Link> : '—'}
            <div className="text-cinza">{cliente?.documento}</div>
            <div className="text-cinza">{cliente?.telefone}</div>
          </Bloco>
          <Bloco titulo="Veículo">
            {veiculo ? (
              <>
                <div className="font-semibold text-white">{veiculo.placa}</div>
                <div className="text-cinza">{veiculo.marca} {veiculo.modelo} {veiculo.ano ?? ''}</div>
                {os.km ? <div className="text-cinza">{os.km.toLocaleString('pt-BR')} km</div> : null}
              </>
            ) : '—'}
          </Bloco>
          <Bloco titulo="Atendimento">
            <div className="text-white">{TIPOS_OS[os.tipo]} · {LOCAIS[os.local]}</div>
            <div className="text-cinza">Mecânico: {os.mecanico}</div>
          </Bloco>
          <Bloco titulo="Datas">
            <div className="text-cinza">Abertura: <span className="text-white">{dataHora(os.abertaEm)}</span></div>
            {os.concluidaEm && <div className="text-cinza">Conclusão: <span className="text-white">{data(os.concluidaEm)}</span></div>}
            {os.faturadaEm && <div className="text-cinza">Faturada: <span className="text-white">{data(os.faturadaEm)}</span></div>}
            {os.vencimento && <div className="text-cinza">Vencimento: <span className={atrasada ? 'text-red-400' : 'text-white'}>{data(os.vencimento)}</span></div>}
          </Bloco>
        </div>

        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <Bloco titulo="Relato do cliente"><p className="whitespace-pre-wrap text-prata">{os.relato || '—'}</p></Bloco>
          <Bloco titulo="Diagnóstico / execução"><p className="whitespace-pre-wrap text-prata">{os.diagnostico || '—'}</p></Bloco>
        </div>

        <TabelaItens titulo="Serviços" itens={os.servicos} />
        {os.pecas.length > 0 && <TabelaItens titulo="Peças" itens={os.pecas} />}

        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <Linha r="Serviços" v={brl(somaItens(os.servicos))} />
          <Linha r="Peças" v={brl(somaItens(os.pecas))} />
          {os.deslocamento > 0 && <Linha r="Deslocamento" v={brl(os.deslocamento)} />}
          {os.desconto > 0 && <Linha r="Desconto" v={'− ' + brl(os.desconto)} />}
          <div className="flex justify-between border-t border-borda pt-2 font-titulo text-2xl font-bold text-brand"><span>Total</span><span>{brl(os.total)}</span></div>
          <div className="text-right text-xs text-cinza">Pagamento: {FORMAS_PAGAMENTO[os.formaPagamento]}</div>
        </div>

        {os.fotos.length > 0 && (
          <Bloco titulo={`Fotos (${os.fotos.length})`}>
            <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {os.fotos.map((f, i) => (
                <a key={i} href={f} target="_blank" rel="noreferrer"><img src={f} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" /></a>
              ))}
            </div>
          </Bloco>
        )}

        <div className="grid gap-6 pt-4 sm:grid-cols-2">
          <div className="text-center text-xs text-cinza">
            {os.assinatura ? <img src={os.assinatura} alt="Assinatura" className="mx-auto h-20 rounded bg-white" /> : <div className="h-20" />}
            <div className="mt-1 border-t border-borda pt-1">Assinatura do cliente</div>
          </div>
          <div className="text-center text-xs text-cinza">
            <div className="h-20" />
            <div className="mt-1 border-t border-borda pt-1">{empresa.nome}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{titulo}</div>
      {children}
    </div>
  )
}

function Linha({ r, v }: { r: string; v: string }) {
  return <div className="flex justify-between"><span className="text-cinza">{r}</span><span className="tabular-nums text-white">{v}</span></div>
}

function TabelaItens({ titulo, itens }: { titulo: string; itens: ItemOS[] }) {
  return (
    <div>
      <div className="label">{titulo}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borda text-left text-xs text-cinza">
              <th className="py-1.5 font-medium">Descrição</th>
              <th className="py-1.5 text-right font-medium">Qtd</th>
              <th className="py-1.5 text-right font-medium">Unit.</th>
              <th className="py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => (
              <tr key={i} className="border-b border-borda/50">
                <td className="py-1.5 text-white">{it.descricao}</td>
                <td className="py-1.5 text-right tabular-nums">{it.qtd}</td>
                <td className="py-1.5 text-right tabular-nums">{brl(it.valor)}</td>
                <td className="py-1.5 text-right tabular-nums text-white">{brl(it.qtd * it.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
