import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useSessao } from '../../app/sessao'
import { nomeCliente, useLista, useOSCompletas } from '../../db/consultas'
import { emAberto, emAtraso, porModalidade, resumo, serieFaturamento, servicosMaisRealizados, topClientes } from '../../domain/financeiro'
import type { Modalidade } from '../../domain/tipos'
import { brl, data, MODALIDADES, numeroOS } from '../../lib/format'
import { gravar } from '../../sync/motor'
import { Cabecalho, Kpi, Secao, Vazio } from '../../components/ui'
import { GraficoFaturamento } from '../../components/GraficoFaturamento'

type Aba = 'aberto' | 'atraso' | 'pagos'

export function Financeiro() {
  const { perm } = useSessao()
  const ordens = useOSCompletas() ?? []
  const clientes = useLista('clientes')
  const [aba, setAba] = useState<Aba>('aberto')

  const r = resumo(ordens, clientes)
  const { pontos, aFaturar } = serieFaturamento(ordens)
  const projecao3 = pontos.slice(12).reduce((s, p) => s + (p.projecao ?? 0), 0)
  const modalidades = porModalidade(ordens, clientes)
  const totalMod = modalidades.reduce((s, m) => s + m.total, 0) || 1

  const contas = ordens
    .filter((o) => (aba === 'pagos' ? o.status === 'faturada' && !!o.pago_em : aba === 'atraso' ? emAtraso(o) : emAberto(o)))
    .sort((a, b) => (aba === 'pagos' ? (b.pago_em ?? '').localeCompare(a.pago_em ?? '') : (a.vencimento ?? '').localeCompare(b.vencimento ?? '')))
    .slice(0, aba === 'pagos' ? 15 : undefined)

  return (
    <>
      <Cabecalho titulo="Financeiro" subtitulo="Faturamento, projeção e contas a receber (contas a pagar, caixas e fechamento: Fase 7)" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Faturado no mês" valor={brl(r.faturadoMes)} detalhe={`${r.osMes} OS`} destaque="brand" />
        {perm.verMargem
          ? <Kpi rotulo="Margem no mês" valor={brl(r.margemMes)} destaque="ok" />
          : <Kpi rotulo="Projeção 3 meses" valor={brl(projecao3)} />}
        <Kpi rotulo="A receber" valor={brl(r.aReceber)} detalhe={`Finalizadas a faturar ${brl(aFaturar)}`} />
        <Kpi rotulo="Em atraso" valor={brl(r.atrasado)} destaque={r.atrasado ? 'alerta' : 'ok'} />
      </div>

      <div className="mt-4">
        <Secao titulo="Faturamento mensal × projeção">
          <GraficoFaturamento pontos={pontos} altura={320} />
          <p className="mt-2 text-xs text-cinza">
            Projeção pela tendência dos últimos 6 meses; o mês atual inclui as OS finalizadas a faturar. Próximos 3 meses: {brl(projecao3)}. Contratos ativos: {brl(r.contratos)}/mês.
          </p>
        </Secao>
      </div>

      <div className="mt-4">
        <Secao titulo="Contas a receber">
          <div className="mb-3 flex flex-wrap gap-2">
            {([['aberto', 'Em aberto'], ['atraso', 'Em atraso'], ['pagos', 'Recebidos']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setAba(k)} className={`min-h-10 rounded-full px-4 text-sm font-semibold ${aba === k ? 'bg-brand text-black' : 'border border-borda text-prata'}`}>{l}</button>
            ))}
          </div>
          {contas.length === 0 ? <Vazio texto="Nada por aqui." /> : (
            <div className="divide-y divide-borda">
              {contas.map((o) => (
                <div key={o.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link to={`/os/${o.id}`} className="min-w-0 flex-1 py-1">
                    <div className="truncate font-semibold text-forte">{nomeCliente(o.cliente)}</div>
                    <div className="text-xs text-cinza">
                      {numeroOS(o)} · {aba === 'pagos' ? `recebido ${data(o.pago_em)}` : `vence ${data(o.vencimento)}`}
                      {emAtraso(o) && <span className="ml-1 texto-alerta">· atrasado</span>}
                    </div>
                  </Link>
                  <span className="font-semibold tabular-nums text-forte">{brl(o.totais.total)}</span>
                  {aba !== 'pagos' && (
                    <button onClick={() => gravar('os', { id: o.id, pago_em: new Date().toISOString() })} className="flex h-11 w-11 items-center justify-center rounded-lg text-cinza hover:text-emerald-600" title="Registrar recebimento" aria-label="Registrar recebimento"><CheckCircle2 size={22} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Secao>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Secao titulo="Top clientes"><Barras itens={topClientes(ordens, clientes).map((t) => ({ rotulo: t.nome, valor: t.total, texto: brl(t.total) }))} /></Secao>
        <Secao titulo="Serviços mais executados"><Barras itens={servicosMaisRealizados(ordens).map((s) => ({ rotulo: s.descricao, valor: s.qtd, texto: `${s.qtd}×` }))} /></Secao>
        <Secao titulo="Por modalidade">
          <Barras itens={modalidades.map((m) => ({ rotulo: MODALIDADES[m.modalidade as Modalidade], valor: m.total, texto: `${Math.round((m.total / totalMod) * 100)}%` }))} />
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
            <span className="shrink-0 font-semibold tabular-nums text-forte">{i.texto}</span>
          </div>
          <div className="h-2 rounded-full bg-painel"><div className="h-2 rounded-full bg-brand" style={{ width: `${(i.valor / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  )
}
