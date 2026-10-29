import type { CondicaoFaturamento, FormaPagamento, LocalOS, Modalidade, StatusOS, TipoOS } from '../data/types'

const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const moedaCurtaFmt = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

export const brl = (v: number) => moedaFmt.format(v || 0)
export const brlCurto = (v: number) => 'R$ ' + moedaCurtaFmt.format(v || 0)

export const data = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
export const dataHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export const numeroOS = (n: number) => 'OS ' + String(n).padStart(5, '0')

const soDigitos = (v: string) => v.replace(/\D/g, '')

export function mascaraDocumento(v: string) {
  const d = soDigitos(v).slice(0, 14)
  if (d.length <= 11)
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function mascaraTelefone(v: string) {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export function mascaraPlaca(v: string) {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
  return s.length > 3 ? s.slice(0, 3) + '-' + s.slice(3) : s
}

export const whatsappLink = (telefone: string, texto: string) =>
  `https://wa.me/55${soDigitos(telefone)}?text=${encodeURIComponent(texto)}`

export const MODALIDADES: Record<Modalidade, string> = {
  avulso: 'Avulso',
  contrato: 'Contrato mensal',
  frotista: 'Frotista / Transportadora',
  seguradora: 'Seguradora / Parceiro',
}

export const FORMAS_PAGAMENTO: Record<FormaPagamento, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  boleto: 'Boleto',
  faturado: 'Faturado',
}

export const CONDICOES: Record<CondicaoFaturamento, string> = {
  avista: 'À vista',
  '15d': '15 dias',
  '30d': '30 dias',
  '45d': '45 dias',
  mensal: 'Fechamento mensal',
}

export const STATUS_OS: Record<StatusOS, { label: string; cor: string }> = {
  aberta: { label: 'Aberta', cor: 'bg-sky-500/15 text-sky-300 ring-sky-500/30' },
  andamento: { label: 'Em andamento', cor: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
  aguardando: { label: 'Aguardando peça', cor: 'bg-purple-500/15 text-purple-300 ring-purple-500/30' },
  concluida: { label: 'Concluída', cor: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  faturada: { label: 'Faturada', cor: 'bg-brand/15 text-brand ring-brand/30' },
  cancelada: { label: 'Cancelada', cor: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30' },
}

export const LOCAIS: Record<LocalOS, string> = {
  oficina: 'Oficina',
  externo: 'Atendimento externo',
  socorro: 'Socorro na estrada',
}

export const TIPOS_OS: Record<TipoOS, string> = {
  preventiva: 'Preventiva',
  corretiva: 'Corretiva',
  socorro: 'Socorro',
}

export function calcularVencimento(base: Date, condicao: CondicaoFaturamento, diaFechamento = 10): string {
  const d = new Date(base)
  switch (condicao) {
    case '15d': d.setDate(d.getDate() + 15); break
    case '30d': d.setDate(d.getDate() + 30); break
    case '45d': d.setDate(d.getDate() + 45); break
    case 'mensal': d.setMonth(d.getMonth() + 1, diaFechamento); break
  }
  return d.toISOString()
}

export const somaItens = (itens: { qtd: number; valor: number }[]) =>
  itens.reduce((s, i) => s + (Number(i.qtd) || 0) * (Number(i.valor) || 0), 0)
