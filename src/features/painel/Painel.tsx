import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, ClipboardCheck, Package, Plus, TrendingUp, Wallet, Wrench } from 'lucide-react'
import { useSessao } from '../../app/sessao'
import { nomeCliente, useLista, useOSCompletas, type OSCompleta } from '../../db/consultas'
import { emAberto, resumo, serieFaturamento } from '../../domain/financeiro'
import { brl, data, numeroOS } from '../../lib/format'
import { Cabecalho, Kpi, Secao, Vazio } from '../../components/ui'
import { GraficoFaturamento } from '../../components/GraficoFaturamento'
import { OSCard } from '../../components/OSCard'

const DIA = 86400000

function saudacao(nome: string) {
  const h = new Date().getHours()
  return `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}, ${nome}`
}
const hojeTexto = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

function ListaOS({ titulo, ordens, vazio, link }: { titulo: string; ordens: OSCompleta[]; vazio: string; link?: string }) {
  return (
    <Secao titulo={titulo} acoes={link && <Link to={link} className="text-xs text-cinza hover:text-brand">Ver todas →</Link>}>
      {ordens.length === 0 ? <Vazio texto={vazio} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{ordens.map((o) => <OSCard key={o.id} os={o} />)}</div>
      )}
    </Secao>
  )
}

export function Painel() {
  const { sessao } = useSessao()
  const ordens = useOSCompletas()
  if (!ordens) return <div className="text-cinza">Carregando…</div>
  if (sessao.papel === 'mecanico') return <PainelMecanico ordens={ordens} />
  if (sessao.papel === 'secretaria') return <PainelSecretaria ordens={ordens} />
  return <PainelDono ordens={ordens} />
}

function PainelMecanico({ ordens }: { ordens: OSCompleta[] }) {
  const { sessao } = useSessao()
  const ativas = ordens.filter((o) => ['aprovado', 'execucao', 'aguardando'].includes(o.status))
  const chamados = ordens.filter((o) => o.status === 'rascunho')
  return (
    <>
      <Cabecalho titulo={saudacao(sessao.nome)} subtitulo={hojeTexto()} />
      <Link to="/os/nova" className="btn-primario mb-4 w-full py-4 text-base"><Plus size={22} /> Abrir chamado em campo</Link>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Kpi rotulo="Para fazer" valor={String(ordens.filter((o) => o.status === 'aprovado').length)} />
        <Kpi rotulo="Em execução" valor={String(ordens.filter((o) => o.status === 'execucao').length)} destaque="brand" />
        <Kpi rotulo="Aguard. peça" valor={String(ordens.filter((o) => o.status === 'aguardando').length)} />
      </div>
      <div className="space-y-4">
        <ListaOS titulo="Minhas OS" ordens={ativas} vazio="Nenhuma OS atribuída a você no momento." link="/os" />
        {chamados.length > 0 && <ListaOS titulo="Chamados abertos por mim" ordens={chamados} vazio="" />}
      </div>
    </>
  )
}

function PainelSecretaria({ ordens }: { ordens: OSCompleta[] }) {
  const { sessao } = useSessao()
  const clientes = useLista('clientes')
  const r = resumo(ordens, clientes)
  const hoje = new Date().toDateString()
  const doDia = ordens.filter((o) => new Date(o.aberta_em).toDateString() === hoje)
  const semana = Date.now() + 7 * DIA
  const vencendo = ordens
    .filter((o) => emAberto(o) && o.vencimento && new Date(o.vencimento).getTime() <= semana)
    .sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? ''))
  return (
    <>
      <Cabecalho titulo={saudacao(sessao.nome)} subtitulo={hojeTexto()} acoes={<Link to="/os/nova" className="btn-primario hidden sm:inline-flex"><Plus size={18} /> Nova OS</Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="OS abertas hoje" valor={String(doDia.length)} icone={<CalendarClock size={16} />} />
        <Kpi rotulo="Aguardando aprovação" valor={String(r.aguardandoAprovacao)} destaque="brand" icone={<ClipboardCheck size={16} />} />
        <Kpi rotulo="Aguardando peça" valor={String(r.aguardandoPeca)} icone={<Package size={16} />} />
        <Kpi rotulo="A receber em 7 dias" valor={brl(vencendo.reduce((s, o) => s + o.totais.total, 0))} detalhe={`${vencendo.length} cobrança(s)`} icone={<Wallet size={16} />} />
      </div>
      <div className="mt-4 space-y-4">
        <ListaOS titulo="Pendentes de aprovação" ordens={ordens.filter((o) => o.status === 'orcamento')} vazio="Nenhum orçamento aguardando aprovação." />
        <ListaOS titulo="Chamados para completar" ordens={ordens.filter((o) => o.status === 'rascunho')} vazio="Nenhum chamado aberto pelos mecânicos." />
        <Secao titulo="Contas a receber vencendo">
          {vencendo.length === 0 ? <Vazio texto="Nada vencendo nos próximos 7 dias." /> : (
            <div className="divide-y divide-borda">
              {vencendo.map((o) => (
                <Link key={o.id} to={`/os/${o.id}`} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-forte">{nomeCliente(o.cliente)}</span>
                    <span className="text-xs text-cinza">{numeroOS(o)} · vence {data(o.vencimento)}</span>
                  </span>
                  <span className={`font-semibold tabular-nums ${new Date(o.vencimento!) < new Date() ? 'texto-alerta' : 'text-forte'}`}>{brl(o.totais.total)}</span>
                </Link>
              ))}
            </div>
          )}
        </Secao>
      </div>
    </>
  )
}

function PainelDono({ ordens }: { ordens: OSCompleta[] }) {
  const { sessao } = useSessao()
  const clientes = useLista('clientes')
  const r = resumo(ordens, clientes)
  const { pontos } = serieFaturamento(ordens)
  const variacao = r.faturadoMesAnterior ? ((r.faturadoMes - r.faturadoMesAnterior) / r.faturadoMesAnterior) * 100 : 0
  const paradas = ordens.filter((o) => ['execucao', 'aguardando'].includes(o.status) && Date.now() - new Date(o.updated_at).getTime() > 5 * DIA)
  const emExecucao = ordens.filter((o) => ['execucao', 'aguardando'].includes(o.status)).slice(0, 6)

  return (
    <>
      <Cabecalho titulo={saudacao(sessao.nome)} subtitulo={hojeTexto()} acoes={<Link to="/os/nova" className="btn-primario hidden sm:inline-flex"><Plus size={18} /> Nova OS</Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Faturado no mês" valor={brl(r.faturadoMes)} destaque="brand" icone={<TrendingUp size={16} />}
          detalhe={`${variacao >= 0 ? '▲' : '▼'} ${Math.abs(variacao).toFixed(0)}% vs. mês anterior (${brl(r.faturadoMesAnterior)})`} />
        <Kpi rotulo="Margem no mês" valor={brl(r.margemMes)} detalhe="Total − custo de peças/terceiros" destaque="ok" />
        <Kpi rotulo="A receber" valor={brl(r.aReceber)} icone={<Wallet size={16} />} />
        <Kpi rotulo="Em atraso" valor={brl(r.atrasado)} destaque={r.atrasado ? 'alerta' : 'ok'} icone={<AlertTriangle size={16} />} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Secao titulo="Faturamento e projeção" acoes={<Link to="/financeiro" className="text-xs text-cinza hover:text-brand">Ver financeiro →</Link>}>
            <GraficoFaturamento pontos={pontos} />
            <p className="mt-2 text-xs text-cinza">Projeção para {pontos[12].mes}: <strong className="text-prata">{brl(pontos[12].projecao ?? 0)}</strong> — tendência dos últimos 6 meses.</p>
          </Secao>
        </div>
        <Secao titulo="OS por status">
          <dl className="space-y-2.5 text-sm">
            {([['Chamados', 'rascunho'], ['Orçamentos', 'orcamento'], ['Aprovadas', 'aprovado'], ['Em execução', 'execucao'], ['Aguardando peça', 'aguardando'], ['Finalizadas a faturar', 'finalizada']] as const).map(([l, s]) => (
              <div key={s} className="flex justify-between border-b border-borda pb-2 last:border-0">
                <dt className="text-cinza">{l}</dt>
                <dd className="font-semibold tabular-nums text-forte">{ordens.filter((o) => o.status === s).length}</dd>
              </div>
            ))}
            <div className="flex justify-between pt-1">
              <dt className="inline-flex items-center gap-1 texto-alerta"><Wrench size={14} /> Paradas há +5 dias</dt>
              <dd className="font-semibold texto-alerta">{paradas.length}</dd>
            </div>
          </dl>
        </Secao>
      </div>

      <div className="mt-4">
        <ListaOS titulo="Em execução agora" ordens={emExecucao} vazio="Nenhuma OS em execução." link="/os" />
      </div>
    </>
  )
}
