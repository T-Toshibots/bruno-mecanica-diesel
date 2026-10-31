// Nomes de campos em snake_case para espelhar as tabelas do PostgreSQL (Supabase).

export type Papel = 'dono' | 'secretaria' | 'mecanico'
export type TipoPessoa = 'PF' | 'PJ'
export type Modalidade = 'avulso' | 'contrato' | 'frotista' | 'seguradora'
export type FormaPagamento = 'pix' | 'dinheiro' | 'cartao' | 'boleto' | 'transferencia' | 'faturado'
export type CondicaoFaturamento = 'avista' | '15d' | '30d' | '45d' | 'mensal'
export type StatusOS = 'rascunho' | 'orcamento' | 'aprovado' | 'execucao' | 'aguardando' | 'finalizada' | 'faturada' | 'cancelada'
export type LocalOS = 'oficina' | 'patio' | 'estrada'
export type TipoOS = 'preventiva' | 'corretiva' | 'socorro' | 'garantia'
export type TipoVeiculo = 'cavalo' | 'truck' | 'toco' | 'carreta' | 'bitrem' | 'rodotrem' | 'utilitario' | 'outro'
export type TipoItem = 'mao_obra' | 'peca' | 'terceiro' | 'deslocamento' | 'socorro'

/** Colunas comuns a todo registro sincronizado. */
export interface Base {
  id: string
  created_at: string
  /** No servidor: hora da última gravação aceita. No aparelho: hora da última edição local. */
  updated_at: string
  deleted_at?: string | null
  created_by?: string
  updated_by?: string
  device_id?: string
  /** Versão conhecida do servidor (0 = nunca sincronizado). Usada para detectar conflitos. */
  version: number
}

export interface OficinaConfig extends Base {
  nome: string
  documento: string
  telefone: string
  email: string
  endereco: string
  cidade: string
  pix: string
  valor_hora: number
  /** Deslocamento padrão quando o cliente não tem tabela própria. */
  deslocamento_fixo: number
  valor_km: number
  garantia_texto: string
}

export interface Perfil extends Base {
  nome: string
  papel: Papel
  funcionario_id?: string
  ativo: boolean
}

export interface Funcionario extends Base {
  nome: string
  cpf?: string
  telefone?: string
  funcao: string
  especialidades?: string[]
  admissao?: string
  ativo: boolean
}

/** Tabela separada para que a regra de acesso (só Dono) seja aplicada também no banco. */
export interface FuncionarioSalario extends Base {
  funcionario_id: string
  salario: number
}

export interface Cliente extends Base {
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
  forma_pagamento: FormaPagamento
  condicao: CondicaoFaturamento
  dia_fechamento?: number
  limite_credito?: number
  desconto_padrao?: number
  valor_contrato?: number
  exige_pedido: boolean
  ativo: boolean
  observacoes?: string
}

export interface Veiculo extends Base {
  cliente_id: string
  placa: string
  tipo: TipoVeiculo
  marca: string
  modelo: string
  ano?: number
  chassi?: string
  frota?: string
  km?: number
  horimetro?: number
}

export interface ServicoCatalogo extends Base {
  descricao: string
  categoria: string
  valor: number
  tempo_estimado_min?: number
  garantia_dias?: number
}

export interface OrdemServico extends Base {
  /** Número oficial, atribuído pelo servidor. */
  numero: number | null
  /** Número gerado no aparelho enquanto offline (ex.: P-AB12-0007). */
  numero_provisorio: string
  status: StatusOS
  cliente_id: string
  local: LocalOS
  tipo: TipoOS
  solicitante?: string
  relato: string
  diagnostico: string
  desconto_pct: number
  forma_pagamento: FormaPagamento
  pedido_numero?: string
  aprovado_por?: string
  vencimento?: string
  aberta_em: string
  finalizada_em?: string
  faturada_em?: string
  pago_em?: string
  motivo_cancelamento?: string
  /** Definido pelo servidor: finalizada/faturada/cancelada só o Dono altera. */
  travada: boolean
}

export interface OSVeiculo extends Base {
  os_id: string
  veiculo_id: string
  km?: number
}

export interface OSMecanico extends Base {
  os_id: string
  funcionario_id: string
}

export interface OSItem extends Base {
  os_id: string
  tipo: TipoItem
  descricao: string
  qtd: number
  /** Custo para a oficina — visível só ao Dono. */
  custo: number
  /** Preço de venda ao cliente. */
  preco: number
  ordem: number
}

export interface OSFoto extends Base {
  os_id: string
  imagem: string
  legenda?: string
}

export interface OSAssinatura extends Base {
  os_id: string
  papel: 'cliente' | 'mecanico'
  nome: string
  imagem: string
  offline: boolean
  data: string
}

export interface OSStatusHist extends Base {
  os_id: string
  de: StatusOS | null
  para: StatusOS
  motivo?: string
  usuario_nome: string
  data: string
}

export interface SyncConflito extends Base {
  tabela: string
  registro_id: string
  /** Versão que foi substituída (ficou registrada para o Dono recuperar). */
  perdedor: unknown
  vencedor: unknown
  usuario_nome: string
}

export interface Auditoria extends Base {
  tabela: string
  registro_id: string
  acao: string
  usuario_nome: string
  antes?: unknown
  depois?: unknown
}

export type PapelContato = 'frota' | 'financeiro' | 'outro'

export interface ClienteContato extends Base {
  cliente_id: string
  nome: string
  papel: PapelContato
  telefone?: string
  email?: string
}

/**
 * Tabela de preços por cliente. Linha sem `servico_id` = valores gerais do cliente
 * (hora técnica e deslocamento); com `servico_id` = preço daquele serviço para o cliente.
 */
export interface ClientePreco extends Base {
  cliente_id: string
  servico_id?: string | null
  valor?: number
  valor_hora?: number
  deslocamento_fixo?: number
  valor_km?: number
}

export interface VeiculoClienteHist extends Base {
  veiculo_id: string
  cliente_id: string
  de: string
  ate?: string | null
}

export type TipoFornecedor = 'autopecas' | 'retifica' | 'torno' | 'solda' | 'eletrica' | 'pneus' | 'outro'

export interface Fornecedor extends Base {
  nome: string
  tipo: TipoFornecedor
  documento?: string
  contato?: string
  telefone?: string
  email?: string
  cidade?: string
  observacoes?: string
  ativo: boolean
}
