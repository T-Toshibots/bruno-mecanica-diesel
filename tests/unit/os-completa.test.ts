import { beforeEach, describe, expect, it } from 'vitest'
import { db, nuvem } from '../../src/db/banco'
import { formatarDuracao, minutosPorFuncionario, possiveisRetornos } from '../../src/domain/garantia'
import { salvarSessao, type Sessao } from '../../src/sync/contexto'
import { gravar, gravarVarios, guardarArquivo } from '../../src/sync/motor'
import { setSimularOffline } from '../../src/sync/rede'
import { gravarNoServidor, transporteDemo } from '../../src/sync/servidor-demo'
import { definirTransporte, liberarArquivosEnviados, obterArquivo, sincronizar } from '../../src/sync/sincronizar'

const DIA = 86400000

describe('garantia', () => {
  const finalizada = new Date('2026-10-01T12:00:00Z').toISOString()
  const ordens = [{
    id: 'os-a', numero: 7, numero_provisorio: 'P', status: 'faturada' as const, finalizada_em: finalizada,
    osVeiculos: [{ id: 'ov-cavalo', veiculo_id: 'cavalo' }, { id: 'ov-carreta', veiculo_id: 'carreta' }],
    itens: [
      { id: 'i1', tipo: 'mao_obra' as const, descricao: 'Troca de embreagem', servico_id: 's-emb', garantia_dias: 90, os_veiculo_id: 'ov-cavalo' },
      { id: 'i2', tipo: 'mao_obra' as const, descricao: 'Regulagem de freios', servico_id: 's-freio', garantia_dias: 30, os_veiculo_id: 'ov-carreta' },
      { id: 'i3', tipo: 'mao_obra' as const, descricao: 'Diagnóstico', garantia_dias: 0 },
    ],
  }]
  const em = (dias: number) => new Date(new Date(finalizada).getTime() + dias * DIA)

  it('alerta o mesmo serviço no mesmo veículo dentro do prazo', () => {
    const r = possiveisRetornos(ordens, ['cavalo'], [{ servico_id: 's-emb', descricao: 'Troca de embreagem' }], em(40))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ osId: 'os-a', numero: 'OS 00007', servico: 'Troca de embreagem' })
  })
  it('reconhece pela descrição quando não há serviço do catálogo', () => {
    expect(possiveisRetornos(ordens, ['cavalo'], [{ descricao: ' troca de EMBREAGEM ' }], em(10))).toHaveLength(1)
  })
  it('respeita o veículo do item (freio foi na carreta, não no cavalo)', () => {
    expect(possiveisRetornos(ordens, ['cavalo'], [{ servico_id: 's-freio', descricao: 'Regulagem de freios' }], em(5))).toHaveLength(0)
    expect(possiveisRetornos(ordens, ['carreta'], [{ servico_id: 's-freio', descricao: 'Regulagem de freios' }], em(5))).toHaveLength(1)
  })
  it('fora do prazo, serviço sem garantia ou a própria OS não alertam', () => {
    expect(possiveisRetornos(ordens, ['carreta'], [{ servico_id: 's-freio', descricao: 'x' }], em(31))).toHaveLength(0)
    expect(possiveisRetornos(ordens, ['cavalo', 'carreta'], [{ descricao: 'Diagnóstico' }], em(1))).toHaveLength(0)
    expect(possiveisRetornos(ordens, ['cavalo'], [{ servico_id: 's-emb', descricao: '' }], em(1), 'os-a')).toHaveLength(0)
  })
})

describe('horas trabalhadas', () => {
  it('soma por mecânico e conta o apontamento em andamento até agora', () => {
    const agora = new Date('2026-10-30T12:00:00Z')
    const m = minutosPorFuncionario([
      { funcionario_id: 'f1', inicio: '2026-10-30T08:00:00Z', fim: '2026-10-30T09:30:00Z' },
      { funcionario_id: 'f1', inicio: '2026-10-30T11:00:00Z', fim: null },
      { funcionario_id: 'f2', inicio: '2026-10-30T10:00:00Z', fim: '2026-10-30T10:45:00Z' },
      { funcionario_id: 'f2', inicio: '2026-10-30T07:00:00Z', fim: '2026-10-30T08:00:00Z', deleted_at: 'x' },
    ], agora)
    expect(m.get('f1')).toBe(150)
    expect(m.get('f2')).toBe(45)
    expect(formatarDuracao(150)).toBe('2h30')
    expect(formatarDuracao(45)).toBe('45 min')
  })
})

describe('OS completa no servidor', () => {
  const mec: Sessao = { usuario_id: 'u-mec', nome: 'Carlos', papel: 'mecanico', funcionario_id: 'f-mec' }
  const sec: Sessao = { usuario_id: 'u-sec', nome: 'Ana', papel: 'secretaria' }

  beforeEach(async () => {
    setSimularOffline(false)
    definirTransporte(transporteDemo)
    for (const banco of [db, nuvem]) await Promise.all(banco.tables.map((t) => t.clear()))
    await gravarNoServidor('os', {
      id: 'os-1', numero: 1, numero_provisorio: 'P', status: 'execucao', cliente_id: 'c1', local: 'oficina', tipo: 'corretiva',
      relato: 'x', diagnostico: '', desconto_pct: 0, forma_pagamento: 'pix', aberta_em: new Date().toISOString(), travada: false,
    })
    await gravarNoServidor('os_mecanicos', { id: 'm1', os_id: 'os-1', funcionario_id: 'f-mec' })
  })

  it('foto completa vai pela fila própria; offline fica pendente; depois pode liberar espaço', async () => {
    await salvarSessao(mec)
    setSimularOffline(true)
    const blob = new Blob(['foto-falsa'], { type: 'image/jpeg' })
    await guardarArquivo('arq-1', 'os-1', blob)
    await gravar('os_fotos', { os_id: 'os-1', arquivo_id: 'arq-1', miniatura: 'data:image/jpeg;base64,AA==', momento: 'antes', legenda: 'Embreagem' })
    await sincronizar({ forcar: true })
    expect(await db.arquivos.where('enviado').equals(0).count()).toBe(1)

    setSimularOffline(false)
    await sincronizar({ forcar: true })
    expect(await db.arquivos.where('enviado').equals(0).count()).toBe(0)
    expect(await nuvem.storage.get('arq-1')).toBeDefined()
    expect((await nuvem.t('os_fotos').toArray())[0]).toMatchObject({ momento: 'antes', legenda: 'Embreagem', arquivo_id: 'arq-1' })

    expect(await liberarArquivosEnviados()).toBe(1)
    expect(await db.arquivos.count()).toBe(0)
    expect(await obterArquivo('arq-1')).not.toBeNull() // baixa do servidor
    setSimularOffline(true)
    expect(await obterArquivo('arq-1')).toBeNull() // offline: só a miniatura
  })

  it('mecânico aponta as próprias horas, mas não as de colegas, e não registra aprovação', async () => {
    await salvarSessao(mec)
    await gravar('os_apontamentos', { os_id: 'os-1', funcionario_id: 'f-mec', inicio: new Date().toISOString(), fim: null })
    await gravar('os_apontamentos', { os_id: 'os-1', funcionario_id: 'f-outro', inicio: new Date().toISOString(), fim: null })
    await gravar('os_aprovacoes', { os_id: 'os-1', aprovado_por: 'eu', meio: 'whatsapp', data: new Date().toISOString(), usuario_nome: 'Carlos' })
    await sincronizar({ forcar: true })
    expect((await nuvem.t('os_apontamentos').toArray()).map((a) => a.funcionario_id)).toEqual(['f-mec'])
    expect(await nuvem.t('os_aprovacoes').count()).toBe(0)
    expect(await db.sync_erros.count()).toBe(2)
  })

  it('finalização: assinatura enviada junto e antes do status é aceita; depois de travada é recusada', async () => {
    await salvarSessao(mec)
    await sincronizar({ forcar: true }) // baixa a OS para o aparelho, como no app
    const agora = new Date().toISOString()
    await gravarVarios([
      { tabela: 'os_assinaturas', dados: { os_id: 'os-1', papel: 'mecanico', nome: 'Carlos', imagem: 'data:,', offline: true, data: agora } },
      { tabela: 'os', dados: { id: 'os-1', status: 'finalizada', finalizada_em: agora } },
      { tabela: 'os_status_hist', dados: { os_id: 'os-1', de: 'execucao', para: 'finalizada', usuario_nome: 'Carlos', data: agora } },
    ])
    await sincronizar({ forcar: true })
    expect((await nuvem.t('os').get('os-1'))?.travada).toBe(true)
    expect(await nuvem.t('os_assinaturas').count()).toBe(1)
    expect(await db.sync_erros.count()).toBe(0)

    await salvarSessao(sec)
    await gravar('os_assinaturas', { os_id: 'os-1', papel: 'cliente', nome: 'Atrasado', imagem: 'data:,', offline: false, data: agora })
    await sincronizar({ forcar: true })
    expect(await nuvem.t('os_assinaturas').count()).toBe(1)
    expect(await db.sync_erros.count()).toBe(1)
  })

  it('itens ligados a veículos diferentes da mesma OS', async () => {
    await salvarSessao(sec)
    await gravarVarios([
      { tabela: 'os_veiculos', dados: { id: 'ov-a', os_id: 'os-1', veiculo_id: 'cavalo' } },
      { tabela: 'os_veiculos', dados: { id: 'ov-b', os_id: 'os-1', veiculo_id: 'carreta' } },
      { tabela: 'os_itens', dados: { os_id: 'os-1', tipo: 'peca', descricao: 'Lona', qtd: 1, preco: 400, custo: 250, ordem: 0, os_veiculo_id: 'ov-b', codigo: 'LN-1', origem: 'oficina' } },
    ])
    await sincronizar({ forcar: true })
    const item = (await nuvem.t('os_itens').toArray())[0]
    expect(item).toMatchObject({ os_veiculo_id: 'ov-b', codigo: 'LN-1', preco: 400, custo: 0 }) // secretária não define custo
  })
})
