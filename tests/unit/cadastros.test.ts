import { beforeEach, describe, expect, it } from 'vitest'
import { db, nuvem } from '../../src/db/banco'
import { interpretarPlanilha, lerCSV, mapearColunas, MODELO_CSV } from '../../src/domain/importacao'
import { precoServico, valorDeslocamento, valorHora } from '../../src/domain/precos'
import type { ClientePreco } from '../../src/domain/tipos'
import { salvarSessao, type Sessao } from '../../src/sync/contexto'
import { gravar } from '../../src/sync/motor'
import { setSimularOffline } from '../../src/sync/rede'
import { gravarNoServidor, transporteDemo } from '../../src/sync/servidor-demo'
import { definirTransporte, sincronizar } from '../../src/sync/sincronizar'

const base = { created_at: '', updated_at: '', version: 1 }
const PRECOS: ClientePreco[] = [
  { ...base, id: 'g', cliente_id: 'c1', servico_id: null, valor_hora: 130, deslocamento_fixo: 180 },
  { ...base, id: 's', cliente_id: 'c1', servico_id: 'srv1', valor: 900 },
  { ...base, id: 'x', cliente_id: 'c1', servico_id: 'srv2', valor: 50, deleted_at: '2026-01-01' },
  { ...base, id: 'k', cliente_id: 'c2', servico_id: null, valor_km: 4 },
]
const PADRAO = { valor_hora: 150, deslocamento_fixo: 200, valor_km: 3.5 }

describe('tabela de preços por cliente', () => {
  it('usa o preço do cliente para o serviço; senão o do catálogo', () => {
    expect(precoServico({ id: 'srv1', valor: 1000 }, 'c1', PRECOS)).toEqual({ valor: 900, daTabelaDoCliente: true })
    expect(precoServico({ id: 'srv3', valor: 1000 }, 'c1', PRECOS).valor).toBe(1000)
    expect(precoServico({ id: 'srv1', valor: 1000 }, 'c2', PRECOS).valor).toBe(1000)
  })
  it('ignora preço excluído', () => {
    expect(precoServico({ id: 'srv2', valor: 70 }, 'c1', PRECOS).valor).toBe(70)
  })
  it('hora técnica do cliente ou padrão da oficina', () => {
    expect(valorHora('c1', PRECOS, PADRAO).valor).toBe(130)
    expect(valorHora('c3', PRECOS, PADRAO).valor).toBe(150)
  })
  it('deslocamento: fixo do cliente, por km do cliente, ou padrão', () => {
    expect(valorDeslocamento('c1', PRECOS, PADRAO, 100).valor).toBe(180)
    expect(valorDeslocamento('c2', PRECOS, PADRAO, 50).valor).toBe(200)
    expect(valorDeslocamento('c3', PRECOS, PADRAO).valor).toBe(200)
    expect(valorDeslocamento('c3', PRECOS, PADRAO, 10).valor).toBe(35)
  })
})

describe('importação de planilha', () => {
  it('lê CSV com ponto e vírgula, aspas e BOM', () => {
    expect(lerCSV('﻿nome;obs\n"Silva; Cia";"diz ""oi"""\n')).toEqual([['nome', 'obs'], ['Silva; Cia', 'diz "oi"']])
  })
  it('lê CSV com vírgula', () => {
    expect(lerCSV('a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('reconhece nomes de coluna variados', () => {
    const m = mapearColunas(['Razão Social', 'CNPJ', 'Nº Frota', 'Município'])
    expect(m).toEqual({ nome: 0, documento: 1, frota: 2, cidade: 3 })
  })
  it('agrupa veículos do mesmo cliente e valida documento e placa', () => {
    const { clientes, faltando } = interpretarPlanilha(lerCSV(MODELO_CSV + '\nSem Doc;;123;;;;;;;;;;;;;;\nOutra;;11.222.333/0001-81;;;;;;;;XX;;;;;;'))
    expect(faltando).toEqual([])
    const exemplo = clientes.find((c) => c.nome === 'Transportes Exemplo Ltda')!
    expect(exemplo.veiculos.map((v) => v.placa)).toEqual(['ABC-1D23', 'DEF-4567'])
    expect(exemplo.veiculos[0]).toMatchObject({ tipo: 'cavalo', marca: 'Volvo', ano: 2020, km: 350000 })
    expect(exemplo.erros).toContain('Placa inválida: XX') // mesma empresa na última linha
    expect(clientes.find((c) => c.nome === 'José da Silva')?.tipo).toBe('PF')
    expect(clientes.find((c) => c.nome === 'Sem Doc')?.erros).toContain('CPF/CNPJ inválido')
  })
  it('aponta colunas obrigatórias ausentes', () => {
    expect(interpretarPlanilha([['placa', 'modelo']]).faltando).toEqual(['nome', 'documento'])
  })
})

describe('permissões dos novos cadastros', () => {
  const mec: Sessao = { usuario_id: 'u-mec', nome: 'Carlos', papel: 'mecanico', funcionario_id: 'f-mec' }
  const sec: Sessao = { usuario_id: 'u-sec', nome: 'Ana', papel: 'secretaria' }

  beforeEach(async () => {
    setSimularOffline(false)
    definirTransporte(transporteDemo)
    for (const banco of [db, nuvem]) await Promise.all(banco.tables.map((t) => t.clear()))
    await gravarNoServidor('clientes', { id: 'c1', tipo: 'PJ', nome: 'Rota Sul', documento: '11.222.333/0001-81', telefone: '1199', modalidade: 'frotista', forma_pagamento: 'boleto', condicao: '30d', exige_pedido: false, ativo: true })
    await gravarNoServidor('cliente_precos', { id: 'p1', cliente_id: 'c1', servico_id: null, valor_hora: 130 })
    await gravarNoServidor('cliente_contatos', { id: 'ct1', cliente_id: 'c1', nome: 'Marcos', papel: 'frota' })
    await gravarNoServidor('fornecedores', { id: 'f1', nome: 'Diesel Peças', tipo: 'autopecas', ativo: true })
  })

  it('mecânico recebe contatos, mas não preços nem fornecedores', async () => {
    await salvarSessao(mec)
    await sincronizar({ forcar: true })
    expect(await db.t('cliente_contatos').count()).toBe(1)
    expect(await db.t('cliente_precos').count()).toBe(0)
    expect(await db.t('fornecedores').count()).toBe(0)
  })

  it('mecânico não cadastra fornecedor; secretária cadastra', async () => {
    await salvarSessao(mec)
    await gravar('fornecedores', { nome: 'Tentativa', tipo: 'outro', ativo: true })
    await sincronizar({ forcar: true })
    expect(await nuvem.t('fornecedores').count()).toBe(1)
    expect(await db.sync_erros.count()).toBe(1)

    await salvarSessao(sec)
    await gravar('fornecedores', { nome: 'Retífica Nova', tipo: 'retifica', ativo: true })
    await sincronizar({ forcar: true })
    expect(await nuvem.t('fornecedores').count()).toBe(2)
  })
})
