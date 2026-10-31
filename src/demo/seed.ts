// Dados fictícios para demonstração. Gravados no servidor simulado; o aparelho recebe por sincronização.
import { db, nuvem, setLocal, TABELAS_SYNC } from '../db/banco'
import { calcularVencimento } from '../domain/calculos'
import { STATUS_TRAVADOS } from '../domain/permissoes'
import type {
  Cliente, CondicaoFaturamento, FormaPagamento, LocalOS, Modalidade, StatusOS, TipoItem, TipoOS, TipoVeiculo,
} from '../domain/tipos'
import { tema } from '../config/tema'
import { gravarNoServidor, horaServidor } from '../sync/servidor-demo'

let semente = 42
const rand = () => {
  semente = (semente * 16807) % 2147483647
  return (semente - 1) / 2147483646
}
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
const entre = (min: number, max: number) => Math.round(min + rand() * (max - min))
const uuid = () => crypto.randomUUID()

function digitoMod11(base: string, pesos: number[], cpf: boolean) {
  const soma = pesos.reduce((s, p, i) => s + p * Number(base[i]), 0)
  if (cpf) {
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  const r = soma % 11
  return r < 2 ? 0 : 11 - r
}
function gerarCPF() {
  let b = ''
  for (let i = 0; i < 9; i++) b += entre(0, 9)
  b += digitoMod11(b, [10, 9, 8, 7, 6, 5, 4, 3, 2], true)
  b += digitoMod11(b, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2], true)
  return b.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}
function gerarCNPJ() {
  let b = ''
  for (let i = 0; i < 8; i++) b += entre(0, 9)
  b += '0001'
  b += digitoMod11(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], false)
  b += digitoMod11(b, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], false)
  return b.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

const CATALOGO = [
  ['Revisão preventiva completa', 'Revisão', 1200, 480, 90],
  ['Troca de óleo e filtros', 'Revisão', 380, 90, 30],
  ['Regulagem de freios', 'Freio', 450, 120, 60],
  ['Troca de lonas de freio (eixo)', 'Freio', 650, 180, 90],
  ['Retífica de motor', 'Motor', 9500, 2400, 180],
  ['Diagnóstico eletrônico (scanner)', 'Elétrica', 250, 60, 0],
  ['Troca de embreagem', 'Embreagem', 1800, 360, 90],
  ['Reparo de câmbio', 'Câmbio', 3200, 600, 90],
  ['Regulagem de bicos injetores', 'Injeção', 900, 180, 60],
  ['Troca de turbina', 'Motor', 1500, 300, 90],
  ['Reparo de suspensão / molas', 'Suspensão', 1100, 300, 90],
  ['Reparo no diferencial', 'Diferencial', 2600, 480, 90],
  ['Limpeza do sistema de arrefecimento', 'Arrefecimento', 520, 150, 30],
] as const

const PECAS: [string, number][] = [
  ['Filtro de óleo', 95], ['Filtro de combustível', 120], ['Óleo 15W40 (litro)', 28], ['Lona de freio (jogo)', 420],
  ['Kit embreagem', 2800], ['Bico injetor', 780], ['Correia do alternador', 160], ['Mangueira radiador', 210],
  ['Turbina remanufaturada', 3900], ['Feixe de mola', 1350],
]

type ClienteSeed = Pick<Cliente, 'tipo' | 'nome' | 'telefone'> & Partial<Cliente> &
  { modalidade: Modalidade; forma_pagamento: FormaPagamento; condicao: CondicaoFaturamento }

const CLIENTES: ClienteSeed[] = [
  { tipo: 'PJ', nome: 'Transportes Rota Sul Ltda', fantasia: 'Rota Sul', telefone: '(11) 98888-1001', contato: 'Marcos', email: 'frota@rotasul.com.br', cidade: 'Campinas', uf: 'SP', modalidade: 'frotista', forma_pagamento: 'faturado', condicao: 'mensal', dia_fechamento: 10, limite_credito: 50000, desconto_padrao: 5, exige_pedido: true },
  { tipo: 'PJ', nome: 'Logística Horizonte S.A.', fantasia: 'Horizonte Log', telefone: '(11) 98888-1002', contato: 'Fernanda', cidade: 'Jundiaí', uf: 'SP', modalidade: 'contrato', forma_pagamento: 'boleto', condicao: '30d', limite_credito: 40000, desconto_padrao: 8, valor_contrato: 4500, exige_pedido: true },
  { tipo: 'PJ', nome: 'Agro Cargas do Vale Ltda', fantasia: 'Agro Vale', telefone: '(19) 98888-1003', contato: 'Paulo', cidade: 'Limeira', uf: 'SP', modalidade: 'frotista', forma_pagamento: 'boleto', condicao: '30d', limite_credito: 30000, desconto_padrao: 3 },
  { tipo: 'PJ', nome: 'Expresso Serra Azul Ltda', fantasia: 'Serra Azul', telefone: '(11) 98888-1004', contato: 'Ricardo', cidade: 'Atibaia', uf: 'SP', modalidade: 'contrato', forma_pagamento: 'faturado', condicao: 'mensal', dia_fechamento: 5, limite_credito: 35000, desconto_padrao: 7, valor_contrato: 3200 },
  { tipo: 'PJ', nome: 'Usina Santa Clara Açúcar e Álcool', fantasia: 'Usina Santa Clara', telefone: '(11) 98888-1005', contato: 'Juliana', cidade: 'Piracicaba', uf: 'SP', modalidade: 'frotista', forma_pagamento: 'boleto', condicao: '45d', limite_credito: 60000, exige_pedido: true },
  { tipo: 'PJ', nome: 'Construtora Pedra Forte Ltda', fantasia: 'Pedra Forte', telefone: '(11) 98888-1006', contato: 'Eduardo', cidade: 'Mairiporã', uf: 'SP', modalidade: 'frotista', forma_pagamento: 'boleto', condicao: '15d', limite_credito: 25000 },
  { tipo: 'PF', nome: 'José Aparecido da Silva', telefone: '(11) 97777-2001', cidade: 'Bragança Paulista', uf: 'SP', modalidade: 'avulso', forma_pagamento: 'pix', condicao: 'avista' },
  { tipo: 'PF', nome: 'Antônio Carlos Pereira', telefone: '(11) 97777-2002', cidade: 'Itatiba', uf: 'SP', modalidade: 'avulso', forma_pagamento: 'cartao', condicao: 'avista' },
  { tipo: 'PF', nome: 'Luiz Fernando Souza', telefone: '(19) 97777-2003', cidade: 'Valinhos', uf: 'SP', modalidade: 'avulso', forma_pagamento: 'dinheiro', condicao: 'avista' },
  { tipo: 'PJ', nome: 'Distribuidora Bom Frete ME', fantasia: 'Bom Frete', telefone: '(11) 98888-1010', contato: 'Sandra', cidade: 'Guarulhos', uf: 'SP', modalidade: 'avulso', forma_pagamento: 'pix', condicao: 'avista' },
  { tipo: 'PF', nome: 'Reginaldo Martins (autônomo)', telefone: '(11) 97777-2005', cidade: 'Nazaré Paulista', uf: 'SP', modalidade: 'avulso', forma_pagamento: 'pix', condicao: '15d' },
  { tipo: 'PJ', nome: 'Cooperativa Caminhoneiros Unidos', fantasia: 'Coop Unidos', telefone: '(11) 98888-1012', contato: 'Valdir', cidade: 'Jarinu', uf: 'SP', modalidade: 'contrato', forma_pagamento: 'boleto', condicao: '30d', limite_credito: 20000, desconto_padrao: 10, valor_contrato: 2800 },
]

const MODELOS: [string, string, TipoVeiculo][] = [
  ['Volvo', 'FH 540', 'cavalo'], ['Volvo', 'FH 460', 'cavalo'], ['Scania', 'R 450', 'cavalo'], ['Scania', 'G 410', 'cavalo'],
  ['Mercedes-Benz', 'Actros 2651', 'cavalo'], ['Mercedes-Benz', 'Atego 2430', 'truck'], ['DAF', 'XF 530', 'cavalo'],
  ['Volkswagen', 'Constellation 24.280', 'truck'], ['Volkswagen', 'Delivery 11.180', 'toco'], ['Randon', 'Graneleira 3 eixos', 'carreta'],
  ['Librelato', 'Bitrem 9 eixos', 'bitrem'],
]
const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ'
const placa = () => {
  const l = () => pick([...LETRAS])
  return rand() < 0.5 ? `${l()}${l()}${l()}-${entre(0, 9)}${l()}${entre(10, 99)}` : `${l()}${l()}${l()}-${entre(1000, 9999)}`
}

const FORNECEDORES: [string, string, string][] = [
  ['Diesel Peças Bragança', 'autopecas', 'Bragança Paulista'], ['Auto Peças Rodovia', 'autopecas', 'Atibaia'],
  ['Retífica Motores Paulista', 'retifica', 'Jundiaí'], ['Tornearia Precisão', 'torno', 'Itatiba'],
  ['Solda & Cia', 'solda', 'Atibaia'], ['Auto Elétrica Faísca', 'eletrica', 'Bragança Paulista'],
]

/** Aumente ao mudar os dados de demonstração: aparelhos com versão antiga recriam a demo. */
export const VERSAO_SEED = 2

const RELATOS = [
  'Caminhão perdendo força em subida', 'Barulho na embreagem ao trocar marcha', 'Freio puxando para o lado',
  'Luz de injeção acesa no painel', 'Revisão programada de quilometragem', 'Vazamento de óleo no motor',
  'Superaquecimento em viagem longa', 'Pane elétrica, não dá partida', 'Fumaça excessiva no escapamento',
  'Suspensão batendo em buraco', 'Ruído no diferencial em curva',
]

const USUARIOS = [
  { nome: 'Bruno', papel: 'dono', funcao: 'Proprietário / Mecânico', salario: 0 },
  { nome: 'Ana Paula', papel: 'secretaria', funcao: 'Secretária', salario: 2400 },
  { nome: 'Carlos', papel: 'mecanico', funcao: 'Mecânico', salario: 3800, esp: ['Motor', 'Injeção'] },
  { nome: 'Diego', papel: 'mecanico', funcao: 'Mecânico', salario: 3500, esp: ['Freio', 'Suspensão'] },
  { nome: 'Rafael', papel: 'mecanico', funcao: 'Auxiliar de mecânico', salario: 2600, esp: ['Elétrica'] },
] as const

export async function servidorVazio() {
  return (await nuvem.t('perfis').count()) === 0
}

/** Dados de demonstração de versão anterior (sem as tabelas novas)? */
export async function seedDesatualizado() {
  return (((await nuvem.contador.get('seed'))?.valor as number) ?? 1) < VERSAO_SEED
}

/** Apaga tudo (servidor simulado e aparelho) e recria os dados de demonstração. */
export async function recriarDemo() {
  await nuvem.transaction('rw', [...TABELAS_SYNC.map((t) => nuvem.table(t)), nuvem.contador], async () => {
    for (const t of TABELAS_SYNC) await nuvem.table(t).clear()
    await nuvem.contador.clear()
  })
  await db.transaction('rw', [...TABELAS_SYNC.map((t) => db.table(t)), db.outbox, db.sync_erros], async () => {
    for (const t of TABELAS_SYNC) await db.table(t).clear()
    await db.outbox.clear()
    await db.sync_erros.clear()
  })
  await setLocal('ultimo_pull_servidor', null)
  // Os usuários são recriados com novos IDs: a sessão salva deixa de valer.
  await setLocal('sessao', null)
  await setLocal('ultimo_usuario', null)
  await semearServidor()
}

export function semearServidor() {
  return nuvem.transaction('rw', [...TABELAS_SYNC.map((t) => nuvem.table(t)), nuvem.contador], semear)
}

async function semear() {
  semente = 42
  const hoje = new Date()
  const g = gravarNoServidor

  await g('oficina_config', { id: 'oficina', ...tema.oficinaPadrao })

  const mecanicos: { id: string; nome: string }[] = []
  for (const u of USUARIOS) {
    const funcId = uuid()
    const adm = new Date(hoje)
    adm.setFullYear(adm.getFullYear() - entre(1, 6))
    await g('funcionarios', {
      id: funcId, nome: u.nome, cpf: gerarCPF(), telefone: `(11) 9${entre(1000, 9999)}-${entre(1000, 9999)}`,
      funcao: u.funcao, especialidades: 'esp' in u ? [...u.esp] : [], admissao: adm.toISOString(), ativo: true,
    })
    if (u.salario) await g('funcionarios_salario', { id: uuid(), funcionario_id: funcId, salario: u.salario })
    await g('perfis', { id: uuid(), nome: u.nome, papel: u.papel, funcionario_id: funcId, ativo: true })
    if (u.papel !== 'secretaria') mecanicos.push({ id: funcId, nome: u.nome })
  }
  const dono = mecanicos[0]

  const servicoIds: string[] = []
  for (const [descricao, categoria, valor, tempo, garantia] of CATALOGO) {
    const id = uuid()
    servicoIds.push(id)
    await g('servicos_catalogo', { id, descricao, categoria, valor, tempo_estimado_min: tempo, garantia_dias: garantia })
  }

  for (const [nome, tipo, cidade] of FORNECEDORES)
    await g('fornecedores', { id: uuid(), nome, tipo, cidade, documento: gerarCNPJ(), telefone: `(11) 3${entre(100, 999)}-${entre(1000, 9999)}`, ativo: true })

  const clientes: { id: string; dados: ClienteSeed; veiculos: { id: string; km: number }[] }[] = []
  for (const c of CLIENTES) {
    const id = uuid()
    const criado = new Date(hoje)
    criado.setMonth(criado.getMonth() - entre(12, 30))
    await g('clientes', {
      id, ...c, documento: c.tipo === 'PJ' ? gerarCNPJ() : gerarCPF(), exige_pedido: !!c.exige_pedido,
      ativo: true, created_at: criado.toISOString(),
    })
    const veiculos: { id: string; km: number }[] = []
    const qtd = c.tipo === 'PF' ? 1 : entre(2, 4)
    for (let v = 0; v < qtd; v++) {
      const [marca, modelo, tipo] = pick(MODELOS)
      const vid = uuid()
      const km = entre(80, 900) * 1000
      await g('veiculos', {
        id: vid, cliente_id: id, marca, modelo, tipo, placa: placa(), ano: entre(2012, 2024), km,
        frota: c.tipo === 'PJ' ? String(100 + v) : undefined,
      })
      await g('veiculo_clientes_hist', { id: uuid(), veiculo_id: vid, cliente_id: id, de: criado.toISOString() })
      veiculos.push({ id: vid, km })
    }
    if (c.tipo === 'PJ') {
      if (c.contato) await g('cliente_contatos', { id: uuid(), cliente_id: id, nome: c.contato, papel: 'frota', telefone: c.telefone, email: c.email })
      await g('cliente_contatos', { id: uuid(), cliente_id: id, nome: pick(['Cláudia', 'Roberta', 'Sérgio', 'Patrícia']), papel: 'financeiro', email: `financeiro@${(c.fantasia ?? 'empresa').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.com.br` })
    }
    clientes.push({ id, dados: c, veiculos })
  }

  // Tabela de preços própria para as maiores transportadoras
  for (const [i, cli] of clientes.filter((c) => c.dados.modalidade !== 'avulso').slice(0, 3).entries()) {
    await g('cliente_precos', { id: uuid(), cliente_id: cli.id, servico_id: null, valor_hora: 135 - i * 5, deslocamento_fixo: 180 })
    for (const s of [0, 2, 6]) await g('cliente_precos', { id: uuid(), cliente_id: cli.id, servico_id: servicoIds[s], valor: Math.round(CATALOGO[s][2] * 0.9) })
  }

  let numero = 0
  for (let m = 11; m >= 0; m--) {
    const qtdMes = entre(4, 6) + Math.round((11 - m) / 3)
    for (let k = 0; k < qtdMes; k++) {
      const aberta = new Date(hoje.getFullYear(), hoje.getMonth() - m, entre(1, 27), entre(7, 17), entre(0, 59))
      if (aberta > hoje) aberta.setDate(Math.max(1, hoje.getDate() - entre(0, 5)))
      if (m === 0 && k < 6) aberta.setTime(hoje.getTime() - k * 1.4 * 86400000 - entre(1, 6) * 3600000)
      const cli = pick(clientes)
      const veic = pick(cli.veiculos)
      const tipo: TipoOS = pick(['preventiva', 'corretiva', 'corretiva', 'socorro'])
      const local: LocalOS = tipo === 'socorro' ? 'estrada' : pick(['oficina', 'oficina', 'patio'])
      const mec = pick(mecanicos)

      const itens: { tipo: TipoItem; descricao: string; qtd: number; preco: number; custo: number }[] = []
      for (let s = 0; s < entre(1, 3); s++) {
        const sv = pick([...CATALOGO])
        itens.push({ tipo: 'mao_obra', descricao: sv[0], qtd: 1, preco: sv[2], custo: 0 })
      }
      for (let p = 0; p < entre(0, 3); p++) {
        const [desc, preco] = pick(PECAS)
        const qtd = desc.includes('litro') ? 30 : 1
        itens.push({ tipo: 'peca', descricao: desc, qtd, preco, custo: Math.round(preco * 0.62) })
      }
      if (local !== 'oficina') itens.push({ tipo: tipo === 'socorro' ? 'socorro' : 'deslocamento', descricao: tipo === 'socorro' ? 'Socorro na estrada' : 'Deslocamento até o pátio', qtd: 1, preco: entre(2, 8) * 75, custo: 0 })

      const dias = (hoje.getTime() - aberta.getTime()) / 86400000
      let status: StatusOS = 'faturada'
      if (dias < 2) status = pick(['rascunho', 'orcamento', 'aprovado'])
      else if (dias < 8) status = pick(['execucao', 'aguardando', 'execucao', 'finalizada'])
      else if (dias < 15) status = pick(['finalizada', 'faturada', 'faturada'])
      if (rand() < 0.03) status = 'cancelada'

      numero++
      const osId = uuid()
      const os: Record<string, unknown> = {
        id: osId, numero, numero_provisorio: `P-DEMO-${String(numero).padStart(4, '0')}`, status, cliente_id: cli.id,
        local, tipo, relato: pick(RELATOS), diagnostico: ['rascunho', 'orcamento'].includes(status) ? '' : 'Verificado e executado conforme itens.',
        desconto_pct: cli.dados.desconto_padrao ?? 0, forma_pagamento: cli.dados.forma_pagamento, aberta_em: aberta.toISOString(),
        travada: STATUS_TRAVADOS.includes(status), created_by: undefined,
        motivo_cancelamento: status === 'cancelada' ? 'Cliente desistiu do serviço' : undefined,
        pedido_numero: cli.dados.exige_pedido && !['rascunho', 'orcamento'].includes(status) ? `PED-${entre(10000, 99999)}` : undefined,
      }
      if (['finalizada', 'faturada'].includes(status)) {
        const fim = new Date(aberta)
        fim.setDate(fim.getDate() + entre(0, 3))
        os.finalizada_em = fim.toISOString()
      }
      if (status === 'faturada') {
        const fat = new Date(os.finalizada_em as string)
        fat.setDate(fat.getDate() + entre(0, 2))
        if (fat > hoje) fat.setTime(hoje.getTime())
        os.faturada_em = fat.toISOString()
        os.vencimento = calcularVencimento(fat, cli.dados.condicao, cli.dados.dia_fechamento)
        const venc = new Date(os.vencimento as string)
        if (venc < hoje && (dias > 75 || rand() < 0.7)) {
          const pago = new Date(venc)
          pago.setDate(pago.getDate() - entre(0, 5))
          os.pago_em = (pago < fat ? fat : pago).toISOString()
        }
      }
      await g('os', os)
      await g('os_veiculos', { id: uuid(), os_id: osId, veiculo_id: veic.id, km: veic.km - entre(1, 30) * 1000 })
      await g('os_mecanicos', { id: uuid(), os_id: osId, funcionario_id: mec.id })
      for (const [ordem, it] of itens.entries()) await g('os_itens', { id: uuid(), os_id: osId, ordem, ...it })
      await g('os_status_hist', { id: uuid(), os_id: osId, de: null, para: status, usuario_nome: dono.nome, data: aberta.toISOString() })
    }
  }
  await nuvem.contador.put({ chave: 'os', valor: numero })
  await nuvem.contador.put({ chave: 'seed', valor: VERSAO_SEED })
  horaServidor()
}
