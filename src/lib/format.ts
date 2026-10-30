import type {
  CondicaoFaturamento, FormaPagamento, LocalOS, Modalidade, OrdemServico, Papel, StatusOS, TipoItem, TipoOS, TipoVeiculo,
} from '../domain/tipos'

const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const moedaCurtaFmt = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const FUSO = 'America/Sao_Paulo'

export const brl = (v: number) => moedaFmt.format(v || 0)
export const brlCurto = (v: number) => 'R$ ' + moedaCurtaFmt.format(v || 0)

export const data = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO }) : '—')
export const dataHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: FUSO }) : '—'

export function tempoRelativo(iso?: string) {
  if (!iso) return 'nunca'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} dia(s)`
}

/** Número oficial (OS 00012) ou provisório enquanto não sincronizou (P-AB12-0003). */
export const numeroOS = (os: Pick<OrdemServico, 'numero' | 'numero_provisorio'>) =>
  os.numero ? 'OS ' + String(os.numero).padStart(5, '0') : os.numero_provisorio

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

export const PAPEIS: Record<Papel, string> = { dono: 'Dono', secretaria: 'Secretária', mecanico: 'Mecânico' }

export const MODALIDADES: Record<Modalidade, string> = {
  avulso: 'Avulso',
  contrato: 'Contrato mensal',
  frotista: 'Frotista / Transportadora',
  seguradora: 'Seguradora / Parceiro',
}

export const FORMAS_PAGAMENTO: Record<FormaPagamento, string> = {
  pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', boleto: 'Boleto', transferencia: 'Transferência', faturado: 'Faturado',
}

export const CONDICOES: Record<CondicaoFaturamento, string> = {
  avista: 'À vista', '15d': '15 dias', '30d': '30 dias', '45d': '45 dias', mensal: 'Fechamento mensal',
}

export const STATUS_OS: Record<StatusOS, { label: string; cor: string }> = {
  rascunho: { label: 'Chamado', cor: 'bg-zinc-500/15 text-zinc-700 ring-zinc-500/30 dark:text-zinc-300' },
  orcamento: { label: 'Orçamento', cor: 'bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300' },
  aprovado: { label: 'Aprovado', cor: 'bg-indigo-500/15 text-indigo-700 ring-indigo-500/30 dark:text-indigo-300' },
  execucao: { label: 'Em execução', cor: 'bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300' },
  aguardando: { label: 'Aguardando peça', cor: 'bg-purple-500/15 text-purple-700 ring-purple-500/30 dark:text-purple-300' },
  finalizada: { label: 'Finalizada', cor: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300' },
  faturada: { label: 'Faturada', cor: 'bg-brand/15 text-brand ring-brand/30' },
  cancelada: { label: 'Cancelada', cor: 'bg-zinc-500/15 text-zinc-500 ring-zinc-500/30' },
}

export const LOCAIS: Record<LocalOS, string> = { oficina: 'Oficina', patio: 'Pátio do cliente', estrada: 'Estrada / socorro' }

export const TIPOS_OS: Record<TipoOS, string> = {
  preventiva: 'Preventiva', corretiva: 'Corretiva', socorro: 'Socorro', garantia: 'Retorno em garantia',
}

export const TIPOS_VEICULO: Record<TipoVeiculo, string> = {
  cavalo: 'Cavalo mecânico', truck: 'Truck', toco: 'Toco', carreta: 'Carreta', bitrem: 'Bitrem',
  rodotrem: 'Rodotrem', utilitario: 'Utilitário', outro: 'Outro',
}

export const TIPOS_ITEM: Record<TipoItem, string> = {
  mao_obra: 'Mão de obra', peca: 'Peça', terceiro: 'Terceiro', deslocamento: 'Deslocamento', socorro: 'Socorro / fora de horário',
}
