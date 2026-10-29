export type TipoPessoa = 'PF' | 'PJ'
export type Modalidade = 'avulso' | 'contrato' | 'frotista' | 'seguradora'
export type FormaPagamento = 'pix' | 'dinheiro' | 'cartao' | 'boleto' | 'faturado'
export type CondicaoFaturamento = 'avista' | '15d' | '30d' | '45d' | 'mensal'
export type StatusOS = 'aberta' | 'andamento' | 'aguardando' | 'concluida' | 'faturada' | 'cancelada'
export type LocalOS = 'oficina' | 'externo' | 'socorro'
export type TipoOS = 'preventiva' | 'corretiva' | 'socorro'

export interface Cliente {
  id?: number
  tipo: TipoPessoa
  nome: string
  fantasia?: string
  documento: string
  ie?: string
  contato?: string
  telefone: string
  email?: string
  cep?: string
  endereco?: string
  cidade?: string
  uf?: string
  modalidade: Modalidade
  formaPagamento: FormaPagamento
  condicao: CondicaoFaturamento
  diaFechamento?: number
  limiteCredito?: number
  descontoPadrao?: number
  valorContrato?: number
  ativo: boolean
  observacoes?: string
  criadoEm: string
}

export interface Veiculo {
  id?: number
  clienteId: number
  placa: string
  marca: string
  modelo: string
  ano?: number
  chassi?: string
  frota?: string
  km?: number
}

export interface ItemOS {
  descricao: string
  qtd: number
  valor: number
}

export interface OrdemServico {
  id?: number
  numero: number
  clienteId: number
  veiculoId?: number
  km?: number
  local: LocalOS
  tipo: TipoOS
  mecanico: string
  relato: string
  diagnostico: string
  servicos: ItemOS[]
  pecas: ItemOS[]
  deslocamento: number
  desconto: number
  total: number
  formaPagamento: FormaPagamento
  vencimento?: string
  status: StatusOS
  abertaEm: string
  concluidaEm?: string
  faturadaEm?: string
  pagoEm?: string
  fotos: string[]
  assinatura?: string
  atualizadoEm: string
}

export interface ServicoCatalogo {
  id?: number
  descricao: string
  categoria: string
  valor: number
}

export interface OutboxItem {
  id?: number
  tabela: string
  acao: 'criar' | 'editar' | 'excluir'
  registroId: number
  em: string
  sincronizado: 0 | 1
}

export interface Empresa {
  nome: string
  documento: string
  telefone: string
  email: string
  endereco: string
  cidade: string
  pix: string
}

export interface ConfigItem {
  chave: string
  valor: unknown
}
