import { db, setConfig } from './db'
import { calcularVencimento, somaItens } from '../lib/format'
import type { Cliente, ItemOS, LocalOS, OrdemServico, ServicoCatalogo, StatusOS, TipoOS, Veiculo } from './types'

// Dados fictícios para demonstração.

let semente = 42
const rand = () => {
  semente = (semente * 16807) % 2147483647
  return (semente - 1) / 2147483646
}
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
const entre = (min: number, max: number) => Math.round(min + rand() * (max - min))

export const EMPRESA_PADRAO = {
  nome: 'Bruno Mecânica Diesel',
  documento: '00.000.000/0001-00',
  telefone: '(11) 99999-0000',
  email: 'contato@brunomecanicadiesel.com.br',
  endereco: 'Rod. Exemplo, km 100',
  cidade: 'São Paulo - SP',
  pix: '00.000.000/0001-00',
}

export const MECANICOS_PADRAO = ['Bruno', 'Carlos', 'Diego', 'Rafael']

const CATALOGO: Omit<ServicoCatalogo, 'id'>[] = [
  { descricao: 'Revisão preventiva completa', categoria: 'Preventiva', valor: 1200 },
  { descricao: 'Troca de óleo e filtros', categoria: 'Preventiva', valor: 380 },
  { descricao: 'Regulagem de freios', categoria: 'Freios', valor: 450 },
  { descricao: 'Troca de lonas de freio (eixo)', categoria: 'Freios', valor: 650 },
  { descricao: 'Retífica de motor', categoria: 'Motor', valor: 9500 },
  { descricao: 'Diagnóstico eletrônico (scanner)', categoria: 'Elétrica', valor: 250 },
  { descricao: 'Troca de embreagem', categoria: 'Transmissão', valor: 1800 },
  { descricao: 'Reparo de câmbio', categoria: 'Transmissão', valor: 3200 },
  { descricao: 'Regulagem de bicos injetores', categoria: 'Injeção', valor: 900 },
  { descricao: 'Troca de turbina', categoria: 'Motor', valor: 1500 },
  { descricao: 'Reparo de suspensão / molas', categoria: 'Suspensão', valor: 1100 },
  { descricao: 'Socorro mecânico na estrada', categoria: 'Socorro', valor: 600 },
  { descricao: 'Mão de obra (hora)', categoria: 'Geral', valor: 150 },
]

const PECAS: ItemOS[] = [
  { descricao: 'Filtro de óleo', qtd: 1, valor: 95 },
  { descricao: 'Filtro de combustível', qtd: 1, valor: 120 },
  { descricao: 'Óleo 15W40 (litro)', qtd: 30, valor: 28 },
  { descricao: 'Lona de freio (jogo)', qtd: 1, valor: 420 },
  { descricao: 'Kit embreagem', qtd: 1, valor: 2800 },
  { descricao: 'Bico injetor', qtd: 1, valor: 780 },
  { descricao: 'Correia do alternador', qtd: 1, valor: 160 },
  { descricao: 'Mangueira radiador', qtd: 1, valor: 210 },
  { descricao: 'Turbina remanufaturada', qtd: 1, valor: 3900 },
  { descricao: 'Feixe de mola', qtd: 1, valor: 1350 },
]

const CLIENTES: Omit<Cliente, 'id' | 'criadoEm' | 'ativo'>[] = [
  { tipo: 'PJ', nome: 'Transportes Rota Sul Ltda', fantasia: 'Rota Sul', documento: '11.222.333/0001-44', telefone: '(11) 98888-1001', contato: 'Marcos', email: 'frota@rotasul.com.br', cidade: 'Campinas', uf: 'SP', modalidade: 'frotista', formaPagamento: 'faturado', condicao: 'mensal', diaFechamento: 10, limiteCredito: 50000, descontoPadrao: 5 },
  { tipo: 'PJ', nome: 'Logística Horizonte S.A.', fantasia: 'Horizonte Log', documento: '22.333.444/0001-55', telefone: '(11) 98888-1002', contato: 'Fernanda', cidade: 'Jundiaí', uf: 'SP', modalidade: 'contrato', formaPagamento: 'boleto', condicao: '30d', limiteCredito: 40000, descontoPadrao: 8, valorContrato: 4500 },
  { tipo: 'PJ', nome: 'Agro Cargas do Vale Ltda', fantasia: 'Agro Vale', documento: '33.444.555/0001-66', telefone: '(19) 98888-1003', contato: 'Paulo', cidade: 'Limeira', uf: 'SP', modalidade: 'frotista', formaPagamento: 'boleto', condicao: '30d', limiteCredito: 30000, descontoPadrao: 3 },
  { tipo: 'PJ', nome: 'Expresso Serra Azul Ltda', fantasia: 'Serra Azul', documento: '44.555.666/0001-77', telefone: '(11) 98888-1004', contato: 'Ricardo', cidade: 'Atibaia', uf: 'SP', modalidade: 'contrato', formaPagamento: 'faturado', condicao: 'mensal', diaFechamento: 5, limiteCredito: 35000, descontoPadrao: 7, valorContrato: 3200 },
  { tipo: 'PJ', nome: 'Proteção Veicular Estrada Segura', fantasia: 'Estrada Segura', documento: '55.666.777/0001-88', telefone: '(11) 98888-1005', contato: 'Juliana', cidade: 'São Paulo', uf: 'SP', modalidade: 'seguradora', formaPagamento: 'boleto', condicao: '45d', limiteCredito: 60000 },
  { tipo: 'PJ', nome: 'Mineração Pedra Forte Ltda', fantasia: 'Pedra Forte', documento: '66.777.888/0001-99', telefone: '(11) 98888-1006', contato: 'Eduardo', cidade: 'Mairiporã', uf: 'SP', modalidade: 'frotista', formaPagamento: 'boleto', condicao: '15d', limiteCredito: 25000 },
  { tipo: 'PF', nome: 'José Aparecido da Silva', documento: '123.456.789-01', telefone: '(11) 97777-2001', cidade: 'Bragança Paulista', uf: 'SP', modalidade: 'avulso', formaPagamento: 'pix', condicao: 'avista' },
  { tipo: 'PF', nome: 'Antônio Carlos Pereira', documento: '234.567.890-12', telefone: '(11) 97777-2002', cidade: 'Itatiba', uf: 'SP', modalidade: 'avulso', formaPagamento: 'cartao', condicao: 'avista' },
  { tipo: 'PF', nome: 'Luiz Fernando Souza', documento: '345.678.901-23', telefone: '(19) 97777-2003', cidade: 'Valinhos', uf: 'SP', modalidade: 'avulso', formaPagamento: 'dinheiro', condicao: 'avista' },
  { tipo: 'PJ', nome: 'Distribuidora Bom Frete ME', fantasia: 'Bom Frete', documento: '77.888.999/0001-00', telefone: '(11) 98888-1010', contato: 'Sandra', cidade: 'Guarulhos', uf: 'SP', modalidade: 'avulso', formaPagamento: 'pix', condicao: 'avista' },
  { tipo: 'PF', nome: 'Reginaldo Martins (autônomo)', documento: '456.789.012-34', telefone: '(11) 97777-2005', cidade: 'Nazaré Paulista', uf: 'SP', modalidade: 'avulso', formaPagamento: 'pix', condicao: '15d' },
  { tipo: 'PJ', nome: 'Cooperativa Caminhoneiros Unidos', fantasia: 'Coop Unidos', documento: '88.999.000/0001-11', telefone: '(11) 98888-1012', contato: 'Valdir', cidade: 'Jarinu', uf: 'SP', modalidade: 'contrato', formaPagamento: 'boleto', condicao: '30d', limiteCredito: 20000, descontoPadrao: 10, valorContrato: 2800 },
]

const MODELOS = [
  ['Volvo', 'FH 540'], ['Volvo', 'FH 460'], ['Scania', 'R 450'], ['Scania', 'G 410'],
  ['Mercedes-Benz', 'Actros 2651'], ['Mercedes-Benz', 'Axor 2544'], ['DAF', 'XF 530'],
  ['Volkswagen', 'Constellation 24.280'], ['Iveco', 'S-Way 480'], ['Ford', 'Cargo 2429'],
]

const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ'
const placa = () =>
  pick([...LETRAS]) + pick([...LETRAS]) + pick([...LETRAS]) + '-' + entre(0, 9) + pick([...LETRAS]) + entre(10, 99)

const RELATOS = [
  'Caminhão perdendo força em subida',
  'Barulho na embreagem ao trocar marcha',
  'Freio puxando para o lado',
  'Luz de injeção acesa no painel',
  'Revisão programada de quilometragem',
  'Vazamento de óleo no motor',
  'Superaquecimento em viagem longa',
  'Pane elétrica, não dá partida',
  'Fumaça excessiva no escapamento',
  'Suspensão batendo em buraco',
]

export async function seedSeNecessario() {
  if ((await db.clientes.count()) > 0) return
  await carregarDemo()
}

export async function carregarDemo() {
  semente = 42
  await db.transaction('rw', [db.clientes, db.veiculos, db.os, db.catalogo, db.outbox, db.config], async () => {
    await Promise.all([db.clientes.clear(), db.veiculos.clear(), db.os.clear(), db.catalogo.clear(), db.outbox.clear(), db.config.clear()])

    await db.catalogo.bulkAdd(CATALOGO)
    await setConfig('empresa', EMPRESA_PADRAO)
    await setConfig('mecanicos', MECANICOS_PADRAO)

    const hoje = new Date()
    const clientesIds: number[] = []
    for (const c of CLIENTES) {
      const criado = new Date(hoje)
      criado.setMonth(criado.getMonth() - entre(12, 30))
      const id = await db.clientes.add({ ...c, ativo: true, criadoEm: criado.toISOString() })
      clientesIds.push(id as number)
    }

    const veiculosPorCliente = new Map<number, Veiculo[]>()
    for (const [i, clienteId] of clientesIds.entries()) {
      const cli = CLIENTES[i]
      const qtd = cli.tipo === 'PF' ? 1 : entre(2, 4)
      const lista: Veiculo[] = []
      for (let v = 0; v < qtd; v++) {
        const [marca, modelo] = pick(MODELOS)
        const veic: Veiculo = {
          clienteId, marca, modelo, placa: placa(), ano: entre(2012, 2024),
          km: entre(80, 900) * 1000, frota: cli.tipo === 'PJ' ? String(100 + v) : undefined,
        }
        veic.id = (await db.veiculos.add(veic)) as number
        lista.push(veic)
      }
      veiculosPorCliente.set(clienteId, lista)
    }

    // ~12 meses de histórico com leve crescimento
    let numero = 1
    const ordens: OrdemServico[] = []
    for (let m = 11; m >= 0; m--) {
      const qtdMes = entre(4, 6) + Math.round((11 - m) / 3)
      for (let k = 0; k < qtdMes; k++) {
        const aberta = new Date(hoje.getFullYear(), hoje.getMonth() - m, entre(1, 27), entre(7, 17), entre(0, 59))
        if (aberta > hoje) aberta.setDate(Math.max(1, hoje.getDate() - entre(0, 5)))
        // garante serviços em execução nos últimos dias
        if (m === 0 && k < 5) aberta.setTime(hoje.getTime() - k * 1.6 * 86400000 - entre(1, 6) * 3600000)
        const idx = Math.floor(rand() * clientesIds.length)
        const clienteId = clientesIds[idx]
        const cli = CLIENTES[idx]
        const veic = pick(veiculosPorCliente.get(clienteId)!)
        const tipo: TipoOS = pick(['preventiva', 'corretiva', 'corretiva', 'socorro'])
        const local: LocalOS = tipo === 'socorro' ? 'socorro' : pick(['oficina', 'oficina', 'externo'])

        const servicos: ItemOS[] = []
        const nServ = entre(1, 3)
        for (let s = 0; s < nServ; s++) {
          const sv = pick(CATALOGO.slice(0, 12))
          servicos.push({ descricao: sv.descricao, qtd: 1, valor: sv.valor })
        }
        if (tipo === 'socorro' && !servicos.some((s) => s.descricao.startsWith('Socorro')))
          servicos.unshift({ descricao: 'Socorro mecânico na estrada', qtd: 1, valor: 600 })
        const pecas: ItemOS[] = []
        const nPecas = entre(0, 3)
        for (let p = 0; p < nPecas; p++) pecas.push({ ...pick(PECAS) })

        const deslocamento = local === 'oficina' ? 0 : entre(1, 6) * 50
        const bruto = somaItens(servicos) + somaItens(pecas) + deslocamento
        const desconto = Math.round((bruto * (cli.descontoPadrao ?? 0)) / 100)
        const total = bruto - desconto

        let status: StatusOS = 'faturada'
        const diasAtras = (hoje.getTime() - aberta.getTime()) / 86400000
        if (diasAtras < 3) status = pick(['aberta', 'andamento'])
        else if (diasAtras < 8) status = pick(['andamento', 'aguardando', 'concluida'])
        else if (diasAtras < 15) status = pick(['concluida', 'faturada', 'faturada'])
        if (rand() < 0.03) status = 'cancelada'

        const os: OrdemServico = {
          numero: numero++, clienteId, veiculoId: veic.id, km: (veic.km ?? 0) - entre(1, 30) * 1000,
          local, tipo, mecanico: pick(MECANICOS_PADRAO), relato: pick(RELATOS),
          diagnostico: status === 'aberta' ? '' : 'Verificado e executado conforme itens abaixo.',
          servicos, pecas, deslocamento, desconto, total, formaPagamento: cli.formaPagamento,
          status, abertaEm: aberta.toISOString(), fotos: [], atualizadoEm: aberta.toISOString(),
        }
        if (['concluida', 'faturada'].includes(status)) {
          const concl = new Date(aberta)
          concl.setDate(concl.getDate() + entre(0, 3))
          os.concluidaEm = concl.toISOString()
        }
        if (status === 'faturada') {
          const fat = new Date(os.concluidaEm!)
          fat.setDate(fat.getDate() + entre(0, 2))
          if (fat > hoje) fat.setTime(hoje.getTime())
          os.faturadaEm = fat.toISOString()
          os.vencimento = calcularVencimento(fat, cli.condicao, cli.diaFechamento)
          const venc = new Date(os.vencimento)
          // antigas pagas; algumas recentes em aberto/atrasadas
          if (venc < hoje && (diasAtras > 75 || rand() < 0.7)) {
            const pago = new Date(venc)
            pago.setDate(pago.getDate() - entre(0, 5))
            os.pagoEm = (pago < fat ? fat : pago).toISOString()
          }
        }
        ordens.push(os)
      }
    }
    await db.os.bulkAdd(ordens)
    await setConfig('proximoNumero', numero)
  })
}
