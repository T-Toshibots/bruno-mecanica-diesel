import { describe, expect, it } from 'vitest'
import { calcularVencimento, totaisOS } from '../../src/domain/calculos'
import { permissoes, podeEditarOS, podeVerOS } from '../../src/domain/permissoes'
import { validarCNPJ, validarCPF, validarPlaca } from '../../src/domain/validacao'

describe('totais da OS', () => {
  const itens = [
    { tipo: 'mao_obra' as const, qtd: 2, preco: 150, custo: 0 },
    { tipo: 'peca' as const, qtd: 1, preco: 1000, custo: 620 },
    { tipo: 'terceiro' as const, qtd: 1, preco: 500, custo: 300 },
    { tipo: 'deslocamento' as const, qtd: 1, preco: 200, custo: 0 },
    { tipo: 'peca' as const, qtd: 5, preco: 999, custo: 1, deleted_at: '2026-01-01' },
  ]

  it('soma por tipo e ignora itens excluídos', () => {
    const t = totaisOS(itens)
    expect(t).toMatchObject({ maoObra: 300, pecas: 1000, terceiros: 500, deslocamento: 200, subtotal: 2000, total: 2000 })
  })

  it('aplica desconto percentual e calcula margem', () => {
    const t = totaisOS(itens, 10)
    expect(t.desconto).toBe(200)
    expect(t.total).toBe(1800)
    expect(t.custo).toBe(920)
    expect(t.margem).toBe(880)
  })

  it('limita o desconto entre 0 e 100%', () => {
    expect(totaisOS(itens, 150).total).toBe(0)
    expect(totaisOS(itens, -5).total).toBe(2000)
  })

  it('arredonda centavos', () => {
    expect(totaisOS([{ tipo: 'mao_obra', qtd: 3, preco: 33.333, custo: 0 }], 0).total).toBe(100)
  })
})

describe('vencimento', () => {
  const base = new Date(2026, 0, 20)
  it('à vista vence no dia', () => expect(new Date(calcularVencimento(base, 'avista')).getDate()).toBe(20))
  it('30 dias', () => expect(new Date(calcularVencimento(base, '30d')).toDateString()).toBe(new Date(2026, 1, 19).toDateString()))
  it('fechamento mensal no dia configurado do mês seguinte', () => {
    const v = new Date(calcularVencimento(base, 'mensal', 5))
    expect([v.getMonth(), v.getDate()]).toEqual([1, 5])
  })
})

describe('validações', () => {
  it('CPF', () => {
    expect(validarCPF('529.982.247-25')).toBe(true)
    expect(validarCPF('529.982.247-24')).toBe(false)
    expect(validarCPF('111.111.111-11')).toBe(false)
  })
  it('CNPJ', () => {
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true)
    expect(validarCNPJ('11.222.333/0001-80')).toBe(false)
  })
  it('placa antiga e Mercosul', () => {
    expect(validarPlaca('ABC-1234')).toBe(true)
    expect(validarPlaca('BRA2E19')).toBe(true)
    expect(validarPlaca('AB-12345')).toBe(false)
  })
})

describe('permissões', () => {
  it('mecânico não vê valores, financeiro nem salários', () => {
    const p = permissoes('mecanico')
    expect([p.verValores, p.verFinanceiro, p.verSalarios, p.verTodasOS]).toEqual([false, false, false, false])
  })
  it('secretária vê valores mas não custo, margem, salários ou configurações', () => {
    const p = permissoes('secretaria')
    expect([p.verValores, p.verCusto, p.verMargem, p.verSalarios, p.verConfiguracoes]).toEqual([true, false, false, false, false])
  })
  it('mecânico só vê OS atribuídas ou abertas por ele', () => {
    expect(podeVerOS('mecanico', 'f1', ['f1'])).toBe(true)
    expect(podeVerOS('mecanico', 'f1', ['f2'])).toBe(false)
    expect(podeVerOS('mecanico', 'f1', [], 'u1', 'u1')).toBe(true)
    expect(podeVerOS('secretaria', undefined, [])).toBe(true)
  })
  it('OS travada só o Dono edita', () => {
    expect(podeEditarOS('secretaria', { travada: true })).toBe(false)
    expect(podeEditarOS('dono', { travada: true })).toBe(true)
  })
})
