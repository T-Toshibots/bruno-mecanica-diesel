import { z } from 'zod'
import { validarDocumento, validarPlaca } from './validacao'

// Schemas de formulário com mensagens em português. Os mesmos usados antes de gravar.

export const clienteSchema = z
  .object({
    tipo: z.enum(['PF', 'PJ']),
    nome: z.string().trim().min(3, 'Informe o nome ou a razão social'),
    documento: z.string(),
    telefone: z.string().refine((v) => v.replace(/\D/g, '').length >= 10, 'Telefone incompleto'),
    email: z.string().email('E-mail inválido').optional().or(z.literal('')),
    uf: z.string().max(2).optional(),
    dia_fechamento: z.number().int().min(1, 'Dia entre 1 e 28').max(28, 'Dia entre 1 e 28').optional(),
    desconto_padrao: z.number().min(0).max(100, 'Desconto até 100%').optional(),
  })
  .refine((c) => validarDocumento(c.tipo, c.documento), {
    path: ['documento'],
    message: 'CPF/CNPJ inválido — confira os números',
  })

export const veiculoSchema = z.object({
  placa: z.string().refine(validarPlaca, 'Placa inválida (use ABC1234 ou ABC1D23)'),
  marca: z.string().trim().min(2, 'Informe a marca'),
  modelo: z.string().trim().min(1, 'Informe o modelo'),
  ano: z.number().int().min(1970, 'Ano inválido').max(new Date().getFullYear() + 1, 'Ano inválido').optional(),
})

export const osSchema = z.object({
  cliente_id: z.string().min(1, 'Selecione o cliente'),
  relato: z.string().trim().min(3, 'Descreva o problema relatado'),
})

/** Primeira mensagem de erro, para mostrar ao usuário. */
export function primeiroErro(r: z.SafeParseReturnType<unknown, unknown>): string | null {
  return r.success ? null : r.error.issues[0]?.message ?? 'Dados inválidos'
}
