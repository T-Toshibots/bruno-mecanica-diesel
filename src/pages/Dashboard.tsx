import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ClipboardList, Plus, TrendingUp, Wallet, Wrench } from 'lucide-react'
import { db } from '../data/db'
import { resumo, serieFaturamento } from '../data/repos/financeiro'
import type { OrdemServico } from '../data/types'
import { brl } from '../lib/format'
import { Cabecalho, Kpi, Secao, Vazio } from '../components/ui'
import { GraficoFaturamento } from '../components/GraficoFaturamento'
import { OSCard, useMapas } from '../components/OSCard'

export function Dashboard() {
  const ordens = useLiveQuery(() => db.os.toArray(), [], [] as OrdemServico[])
  const { clientes, clientePorId, veiculoPorId } = useMapas()
  const r = resumo(ordens, clientes)
  const { pontos } = serieFaturamento(ordens)
  const proxMes = pontos[12]
  const emExecucao = ordens
    .filter((o) => ['aberta', 'andamento', 'aguardando'].includes(o.status))
    .sort((a, b) => b.abertaEm.localeCompare(a.abertaEm))
    .slice(0, 6)

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <>
      <Cabecalho
        titulo={`${saudacao}, Bruno`}
        subtitulo={new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        acoes={<Link to="/os/nova" className="btn-primario hidden sm:inline-flex"><Plus size={18} /> Nova OS</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Faturado no mês" valor={brl(r.faturadoMes)} detalhe={`${r.osMes} OS faturadas`} destaque="brand" icone={<TrendingUp size={16} />} />
        <Kpi rotulo="A receber" valor={brl(r.aReceber)} detalhe="Faturas em aberto" icone={<Wallet size={16} />} />
        <Kpi rotulo="Em atraso" valor={brl(r.atrasado)} detalhe="Vencidas e não pagas" destaque={r.atrasado > 0 ? 'alerta' : 'ok'} icone={<AlertTriangle size={16} />} />
        <Kpi rotulo="OS em execução" valor={String(r.abertas)} detalhe="Abertas / andamento / peça" icone={<Wrench size={16} />} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Secao
            titulo="Faturamento e projeção"
            acoes={<Link to="/financeiro" className="text-xs text-cinza hover:text-brand">Ver financeiro →</Link>}
          >
            <GraficoFaturamento pontos={pontos} />
            <p className="mt-2 text-xs text-cinza">
              Projeção para {proxMes.mes}: <span className="font-semibold text-prata">{brl(proxMes.projecao ?? 0)}</span> — tendência dos últimos 6 meses.
            </p>
          </Secao>
        </div>
        <Secao titulo="Indicadores">
          <dl className="space-y-3 text-sm">
            <Linha rotulo="Ticket médio por OS" valor={brl(r.ticketMedio)} />
            <Linha rotulo="Contratos mensais ativos" valor={brl(r.contratos) + '/mês'} />
            <Linha rotulo="Clientes ativos" valor={String(clientes.filter((c) => c.ativo).length)} />
            <Linha rotulo="OS concluídas a faturar" valor={String(ordens.filter((o) => o.status === 'concluida').length)} />
            <Linha rotulo="Total de OS no sistema" valor={String(ordens.length)} />
          </dl>
        </Secao>
      </div>

      <div className="mt-4">
        <Secao titulo="Em execução agora" acoes={<Link to="/os" className="text-xs text-cinza hover:text-brand"><ClipboardList size={14} className="mr-1 inline" />Todas as OS →</Link>}>
          {emExecucao.length === 0 ? (
            <Vazio texto="Nenhuma OS em execução." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {emExecucao.map((o) => (
                <OSCard key={o.id} os={o} cliente={clientePorId.get(o.clienteId)} veiculo={o.veiculoId ? veiculoPorId.get(o.veiculoId) : undefined} />
              ))}
            </div>
          )}
        </Secao>
      </div>
    </>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between border-b border-borda pb-2 last:border-0">
      <dt className="text-cinza">{rotulo}</dt>
      <dd className="font-semibold tabular-nums text-white">{valor}</dd>
    </div>
  )
}
