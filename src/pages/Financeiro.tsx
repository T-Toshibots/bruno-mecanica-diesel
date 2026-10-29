import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2 } from 'lucide-react'
import { db } from '../data/db'
import { osRepo } from '../data/repos/os'
import { emAberto, emAtraso, porModalidade, resumo, serieFaturamento, servicosMaisRealizados, topClientes } from '../data/repos/financeiro'
import type { Modalidade, OrdemServico } from '../data/types'
import { brl, data, MODALIDADES, numeroOS } from '../lib/format'
import { Cabecalho, Kpi, Secao, Vazio } from '../components/ui'
import { GraficoFaturamento } from '../components/GraficoFaturamento'
import { useMapas } from '../components/OSCard'

type Aba = 'aberto' | 'atraso' | 'pagos'

export function Financeiro() {
  const ordens = useLiveQuery(() => db.os.toArray(), [], [] as OrdemServico[])
  const { clientes, clientePorId } = useMapas()
  const [aba, setAba] = useState<Aba>('aberto')

  const r = resumo(ordens, clientes)
  const { pontos, aFaturar } = serieFaturamento(ordens)
  const projecao3 = pontos.slice(12).reduce((s, p) => s + (p.projecao ?? 0), 0)
  const top = topClientes(ordens, clientes)
  const servicos = servicosMaisRealizados(ordens)
  const modalidades = porModalidade(ordens, clientes)
  const totalMod = modalidades.reduce((s, m) => s + m.total, 0) || 1

  const contas = ordens
    .filter((o) => (aba === 'pagos' ? o.status === 'faturada' && !!o.pagoEm : aba === 'atraso' ? emAtraso(o) : emAberto(o)))
    .sort((a, b) => (aba === 'pagos' ? (b.pagoEm ?? '').localeCompare(a.pagoEm ?? '') : (a.vencimento ?? '').localeCompare(b.vencimento ?? '')))
    .slice(0, aba === 'pagos' ? 15 : undefined)

  return (
    <>
      <Cabecalho titulo="Financeiro" subtitulo="Faturamento, projeção e contas a receber" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Faturado no mês" valor={brl(r.faturadoMes)} detalhe={`${r.osMes} OS`} destaque="brand" />
        <Kpi rotulo="Projeção 3 meses" valor={brl(projecao3)} detalhe={`Próximo mês ${brl(pontos[12].projecao ?? 0)}`} />
        <Kpi rotulo="A receber" valor={brl(r.aReceber)} detalhe={`Concluídas a faturar ${brl(aFaturar)}`} />
        <Kpi rotulo="Em atraso" valor={brl(r.atrasado)} destaque={r.atrasado ? 'alerta' : 'ok'} />
      </div>

      <div className="mt-4">
        <Secao titulo="Faturamento mensal × projeção">
          <GraficoFaturamento pontos={pontos} altura={320} />
          <p className="mt-2 text-xs text-cinza">
            Barras: valores faturados por mês. Linha tracejada: projeção calculada pela tendência dos últimos 6 meses;
            o mês atual soma também as OS concluídas ainda não faturadas. Contratos mensais ativos: {brl(r.contratos)}/mês.
          </p>
        </Secao>
      </div>

      <div className="mt-4">
        <Secao titulo="Contas a receber">
          <div className="mb-3 flex gap-2">
            {([['aberto', 'Em aberto'], ['atraso', 'Em atraso'], ['pagos', 'Pagos recentes']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setAba(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${aba === k ? 'bg-brand text-black' : 'border border-borda text-prata'}`}>{l}</button>
            ))}
          </div>
          {contas.length === 0 ? (
            <Vazio texto="Nada por aqui." />
          ) : (
            <div className="divide-y divide-borda">
              {contas.map((o) => {
                const c = clientePorId.get(o.clienteId)
                const atrasada = emAtraso(o)
                return (
                  <div key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Link to={`/os/${o.id}`} className="min-w-0 flex-1">
                      <div className="truncate font-medium text-white">{c?.fantasia || c?.nome}</div>
                      <div className="text-xs text-cinza">
                        {numeroOS(o.numero)} · {aba === 'pagos' ? `pago ${data(o.pagoEm)}` : `vence ${data(o.vencimento)}`}
                        {atrasada && <span className="ml-1 text-red-400">· atrasado</span>}
                      </div>
                    </Link>
                    <span className="font-semibold tabular-nums text-white">{brl(o.total)}</span>
                    {aba !== 'pagos' && (
                      <button onClick={() => osRepo.marcarPago(o, true)} className="rounded-lg p-2 text-cinza hover:text-emerald-400" title="Marcar como pago"><CheckCircle2 size={20} /></button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Secao>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Secao titulo="Top clientes">
          <Barras itens={top.map((t) => ({ rotulo: t.nome, valor: t.total, texto: brl(t.total) }))} />
        </Secao>
        <Secao titulo="Serviços mais realizados">
          <Barras itens={servicos.map((s) => ({ rotulo: s.descricao, valor: s.qtd, texto: `${s.qtd}×` }))} />
        </Secao>
        <Secao titulo="Por modalidade">
          <Barras itens={modalidades.map((m) => ({
            rotulo: MODALIDADES[m.modalidade as Modalidade], valor: m.total,
            texto: `${Math.round((m.total / totalMod) * 100)}%`,
          }))} />
        </Secao>
      </div>
    </>
  )
}

function Barras({ itens }: { itens: { rotulo: string; valor: number; texto: string }[] }) {
  const max = Math.max(...itens.map((i) => i.valor), 1)
  if (!itens.length) return <Vazio texto="Sem dados." />
  return (
    <div className="space-y-3">
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className="truncate text-prata">{i.rotulo}</span>
            <span className="shrink-0 font-semibold tabular-nums text-white">{i.texto}</span>
          </div>
          <div className="h-2 rounded-full bg-painel">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${(i.valor / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
