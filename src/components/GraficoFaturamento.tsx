import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { tema } from '../config/tema'
import type { PontoMensal } from '../domain/financeiro'
import { brl, brlCurto } from '../lib/format'

export function GraficoFaturamento({ pontos, altura = 280 }: { pontos: PontoMensal[]; altura?: number }) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={pontos} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#8A8A8A33" vertical={false} />
        <XAxis dataKey="mes" tick={{ fill: '#8A8A8A', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={brlCurto} tick={{ fill: '#8A8A8A', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
        <Tooltip
          cursor={{ fill: 'rgba(247,147,30,.08)' }}
          contentStyle={{ background: 'var(--color-painel)', border: '1px solid var(--color-borda)', borderRadius: 8, color: 'var(--color-forte)' }}
          formatter={(v: number, nome: string) => [brl(v), nome]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#8A8A8A' }} />
        <Bar dataKey="faturado" name="Faturado" fill={tema.cores.brand} radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Line dataKey="projecao" name="Projeção" stroke="#8A8A8A" strokeDasharray="6 4" strokeWidth={2} dot={{ r: 3, fill: '#8A8A8A' }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
