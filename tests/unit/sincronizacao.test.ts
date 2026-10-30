import { beforeEach, describe, expect, it } from 'vitest'
import { db, nuvem, TABELAS_SYNC } from '../../src/db/banco'
import type { Papel } from '../../src/domain/tipos'
import { salvarSessao, type Sessao } from '../../src/sync/contexto'
import { gravar, gravarVarios, proximoNumeroProvisorio } from '../../src/sync/motor'
import { setSimularOffline } from '../../src/sync/rede'
import { gravarNoServidor, transporteDemo } from '../../src/sync/servidor-demo'
import { definirTransporte, sincronizar } from '../../src/sync/sincronizar'
import { ErroRede } from '../../src/sync/transporte'

const SESSOES: Record<string, Sessao> = {
  dono: { usuario_id: 'u-dono', nome: 'Bruno', papel: 'dono', funcionario_id: 'f-dono' },
  secretaria: { usuario_id: 'u-sec', nome: 'Ana', papel: 'secretaria' },
  mec1: { usuario_id: 'u-mec1', nome: 'Carlos', papel: 'mecanico', funcionario_id: 'f-mec1' },
  mec2: { usuario_id: 'u-mec2', nome: 'Diego', papel: 'mecanico', funcionario_id: 'f-mec2' },
}

async function zerar() {
  for (const banco of [db, nuvem]) {
    await Promise.all(banco.tables.map((t) => t.clear()))
  }
}

async function semear() {
  for (const [k, s] of Object.entries(SESSOES)) {
    await gravarNoServidor('perfis', { id: s.usuario_id, nome: s.nome, papel: s.papel as Papel, funcionario_id: s.funcionario_id, ativo: true })
    if (s.funcionario_id) await gravarNoServidor('funcionarios', { id: s.funcionario_id, nome: s.nome, funcao: k, ativo: true })
  }
  await gravarNoServidor('funcionarios_salario', { id: 'sal-1', funcionario_id: 'f-mec1', salario: 3800 })
  await gravarNoServidor('clientes', { id: 'cli-1', tipo: 'PJ', nome: 'Rota Sul', documento: '11.222.333/0001-81', telefone: '11988881001', modalidade: 'frotista', forma_pagamento: 'boleto', condicao: '30d', exige_pedido: false, ativo: true })
  for (const [id, mec, status] of [['os-1', 'f-mec1', 'execucao'], ['os-2', 'f-mec2', 'execucao'], ['os-fin', 'f-mec1', 'finalizada']] as const) {
    await gravarNoServidor('os', {
      id, numero: id === 'os-1' ? 1 : id === 'os-2' ? 2 : 3, numero_provisorio: 'P-X', status, cliente_id: 'cli-1', local: 'oficina',
      tipo: 'corretiva', relato: 'original', diagnostico: '', desconto_pct: 0, forma_pagamento: 'boleto',
      aberta_em: new Date().toISOString(), travada: status === 'finalizada',
    })
    await gravarNoServidor('os_mecanicos', { id: `m-${id}`, os_id: id, funcionario_id: mec })
    await gravarNoServidor('os_itens', { id: `i-${id}`, os_id: id, tipo: 'peca', descricao: 'Filtro', qtd: 1, preco: 100, custo: 60, ordem: 0 })
  }
  await nuvem.contador.put({ chave: 'os', valor: 3 })
}

async function entrarComo(nome: keyof typeof SESSOES) {
  await db.transaction('rw', TABELAS_SYNC.map((t) => db.table(t)), async () => { for (const t of TABELAS_SYNC) await db.table(t).clear() })
  await db.local.clear()
  await salvarSessao(SESSOES[nome])
  await sincronizar({ forcar: true })
}

beforeEach(async () => {
  setSimularOffline(false)
  definirTransporte(transporteDemo)
  await zerar()
  await semear()
})

describe('numeração de OS offline', () => {
  it('cria com número provisório offline e recebe o oficial em ordem ao sincronizar', async () => {
    await entrarComo('secretaria')
    setSimularOffline(true)
    const ids: string[] = []
    for (let i = 0; i < 2; i++) {
      const os = await gravar('os', {
        numero: null, numero_provisorio: await proximoNumeroProvisorio(), status: 'orcamento', cliente_id: 'cli-1', local: 'oficina',
        tipo: 'corretiva', relato: `offline ${i}`, diagnostico: '', desconto_pct: 0, forma_pagamento: 'pix', aberta_em: new Date().toISOString(), travada: false,
      })
      ids.push(os.id)
    }
    await sincronizar({ forcar: true })
    expect(await db.outbox.count()).toBe(2)
    const local = await db.t('os').get(ids[0])
    expect(local?.numero).toBeNull()
    expect(local?.numero_provisorio).toMatch(/^P-[0-9A-F]{4}-0001$/)

    setSimularOffline(false)
    await sincronizar()
    expect(await db.outbox.count()).toBe(0)
    expect((await db.t('os').get(ids[0]))?.numero).toBe(4)
    expect((await db.t('os').get(ids[1]))?.numero).toBe(5)
  })
})

describe('fila de envio', () => {
  it('em falha de rede espera progressivamente e não perde a pendência', async () => {
    await entrarComo('secretaria')
    definirTransporte({ ...transporteDemo, enviar: async () => { throw new ErroRede() } })
    await gravar('clientes', { id: 'cli-1', observacoes: 'teste' })
    await sincronizar({ forcar: true })
    const [item] = await db.outbox.toArray()
    expect(item.tentativas).toBe(1)
    expect(item.proxima_tentativa).toBeGreaterThan(Date.now())

    definirTransporte(transporteDemo)
    await sincronizar() // ainda em espera: não envia
    expect(await db.outbox.count()).toBe(1)
    await sincronizar({ forcar: true }) // "Sincronizar agora"
    expect(await db.outbox.count()).toBe(0)
    expect((await nuvem.t('clientes').get('cli-1'))?.observacoes).toBe('teste')
  })

  it('o pull não sobrescreve um registro com alteração local pendente', async () => {
    await entrarComo('secretaria')
    await gravar('os', { id: 'os-1', diagnostico: 'local' })
    await db.outbox.toCollection().modify({ proxima_tentativa: Date.now() + 60_000 })
    await transporteDemo.enviar([{ tabela: 'os', registro: { ...(await nuvem.t('os').get('os-1'))!, diagnostico: 'servidor' } }], SESSOES.dono)
    await sincronizar()
    expect((await db.t('os').get('os-1'))?.diagnostico).toBe('local')
  })
})

describe('conflitos e travas', () => {
  it('duas pessoas editando a mesma OS: vale a última gravação e o conflito fica registrado', async () => {
    await entrarComo('secretaria')
    // Outro usuário altera no servidor depois que a secretária baixou a OS
    await transporteDemo.enviar([{ tabela: 'os', registro: { ...(await nuvem.t('os').get('os-1'))!, relato: 'alterado pelo dono' } }], SESSOES.dono)
    await gravar('os', { id: 'os-1', diagnostico: 'pela secretária' })
    await sincronizar({ forcar: true })

    expect((await nuvem.t('os').get('os-1'))?.diagnostico).toBe('pela secretária')
    const conflitos = await nuvem.t('sync_conflitos').toArray()
    expect(conflitos).toHaveLength(1)
    expect((conflitos[0].perdedor as { relato: string }).relato).toBe('alterado pelo dono')
  })

  it('itens são registros separados: editar itens diferentes da mesma OS não gera conflito', async () => {
    await entrarComo('secretaria')
    await gravarNoServidor('os_itens', { id: 'i-novo', os_id: 'os-1', tipo: 'mao_obra', descricao: 'Mão de obra', qtd: 1, preco: 200, custo: 0, ordem: 1 })
    await gravar('os_itens', { id: 'i-os-1', qtd: 2 })
    await sincronizar({ forcar: true })
    expect(await nuvem.t('sync_conflitos').count()).toBe(0)
    expect(await db.t('os_itens').get('i-novo')).toBeDefined()
  })

  it('OS finalizada é travada: alteração da secretária é recusada e desfeita no aparelho', async () => {
    await entrarComo('secretaria')
    await gravar('os', { id: 'os-fin', relato: 'tentando alterar' })
    await sincronizar({ forcar: true })
    expect((await db.t('os').get('os-fin'))?.relato).toBe('original')
    expect((await nuvem.t('os').get('os-fin'))?.relato).toBe('original')
    expect(await db.sync_erros.count()).toBe(1)
    expect(await db.outbox.count()).toBe(0)
  })

  it('secretária pode faturar uma OS finalizada', async () => {
    await entrarComo('secretaria')
    await gravar('os', { id: 'os-fin', status: 'faturada', faturada_em: new Date().toISOString() })
    await sincronizar({ forcar: true })
    expect((await nuvem.t('os').get('os-fin'))?.status).toBe('faturada')
    expect(await db.sync_erros.count()).toBe(0)
  })

  it('só o Dono reabre OS travada', async () => {
    await entrarComo('dono')
    await gravar('os', { id: 'os-fin', status: 'execucao' })
    await sincronizar({ forcar: true })
    const os = await nuvem.t('os').get('os-fin')
    expect([os?.status, os?.travada]).toEqual(['execucao', false])
    expect(await nuvem.t('auditoria').where('registro_id').equals('os-fin').count()).toBe(1)
  })
})

describe('permissões no servidor', () => {
  it('mecânico recebe só as próprias OS, sem valores e sem salários', async () => {
    await entrarComo('mec1')
    const ordens = await db.t('os').toArray()
    expect(ordens.map((o) => o.id).sort()).toEqual(['os-1', 'os-fin'])
    expect((await db.t('os_itens').get('i-os-1'))?.preco).toBe(0)
    expect(await db.t('os_itens').get('i-os-2')).toBeUndefined()
    expect(await db.t('funcionarios_salario').count()).toBe(0)
  })

  it('mecânico não altera preço nem cadastros', async () => {
    await entrarComo('mec1')
    await gravar('os_itens', { id: 'i-os-1', preco: 9999, qtd: 3 })
    await gravar('clientes', { id: 'cli-1', nome: 'Hackeado' })
    await sincronizar({ forcar: true })
    const item = await nuvem.t('os_itens').get('i-os-1')
    expect([item?.preco, item?.qtd]).toEqual([100, 3])
    expect((await nuvem.t('clientes').get('cli-1'))?.nome).toBe('Rota Sul')
    expect(await db.sync_erros.count()).toBe(1)
  })

  it('mecânico pode abrir chamado (rascunho) e ele aparece para a secretária', async () => {
    await entrarComo('mec1')
    const os = await gravar('os', {
      numero: null, numero_provisorio: await proximoNumeroProvisorio(), status: 'rascunho', cliente_id: 'cli-1', local: 'estrada',
      tipo: 'socorro', relato: 'Pane na BR', diagnostico: '', desconto_pct: 0, forma_pagamento: 'pix', aberta_em: new Date().toISOString(), travada: false,
    })
    await gravar('os_mecanicos', { os_id: os.id, funcionario_id: 'f-mec1' })
    await sincronizar({ forcar: true })
    expect(await db.sync_erros.count()).toBe(0)

    await entrarComo('secretaria')
    expect((await db.t('os').get(os.id))?.relato).toBe('Pane na BR')
  })

  it('secretária não vê o custo das peças', async () => {
    await entrarComo('secretaria')
    const item = await db.t('os_itens').get('i-os-1')
    expect([item?.preco, item?.custo]).toEqual([100, 0])
  })
})
