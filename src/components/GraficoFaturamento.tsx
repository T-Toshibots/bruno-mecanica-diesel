import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PontoMensal } from '../data/repos/financeiro'
import { brl, brlCurto } from '../lib/format'

export function GraficoFaturamento({ pontos, altura = 280 }: { pontos: PontoMensal[]; altura?: number }) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={pontos} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#2E2E2E" vertical={false} />
        <XAxis dataKey="mes" tick={{ fill: '#8A8A8A', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={brlCurto} tick={{ fill: '#8A8A8A', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
        <Tooltip
          cursor={{ fill: 'rgba(247,147,30,.08)' }}
          contentStyle={{ background: '#1A1A1A', border: '1px solid #2E2E2E', borderRadius: 8, color: '#fff' }}
          formatter={(v: number, nome: string) => [brl(v), nome]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#8A8A8A' }} />
        <Bar dataKey="faturado" name="Faturado" fill="#F7931E" radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Line dataKey="projecao" name="Projeção" stroke="#D9D9D9" strokeDasharray="6 4" strokeWidth={2} dot={{ r: 3, fill: '#D9D9D9' }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
