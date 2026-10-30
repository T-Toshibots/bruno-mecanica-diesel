import type { OrdemServico, Papel } from './tipos'

/**
 * Regras de acesso por perfil. As mesmas regras são aplicadas no servidor
 * (RLS no Supabase / servidor de demonstração) — a interface apenas esconde o que não é permitido.
 */
export function permissoes(papel: Papel) {
  const dono = papel === 'dono'
  const mecanico = papel === 'mecanico'
  return {
    verValores: !mecanico,
    verCusto: dono,
    verMargem: dono,
    verFinanceiro: !mecanico,
    verSalarios: dono,
    verConfiguracoes: dono,
    verConflitos: dono,
    verAuditoria: dono,
    verClientes: !mecanico,
    editarCadastros: !mecanico,
    precificar: !mecanico,
    aprovarOrcamento: !mecanico,
    faturar: !mecanico,
    reabrirOS: dono,
    cancelarFaturada: dono,
    /** Mecânico vê só as OS atribuídas a ele. */
    verTodasOS: !mecanico,
  }
}

export type Permissoes = ReturnType<typeof permissoes>

export const STATUS_TRAVADOS: OrdemServico['status'][] = ['finalizada', 'faturada', 'cancelada']

/** Campos que a secretária ainda pode mudar numa OS travada (faturamento e recebimento). */
export const CAMPOS_LIVRES_OS_TRAVADA = ['status', 'faturada_em', 'vencimento', 'pago_em', 'forma_pagamento', 'pedido_numero'] as const

export function podeVerOS(papel: Papel, funcionarioId: string | undefined, mecanicosDaOS: string[], criadoPor?: string, usuarioId?: string) {
  if (papel !== 'mecanico') return true
  return (!!funcionarioId && mecanicosDaOS.includes(funcionarioId)) || (!!usuarioId && criadoPor === usuarioId)
}

export function podeEditarOS(papel: Papel, os: Pick<OrdemServico, 'travada'>) {
  return !os.travada || papel === 'dono'
}
