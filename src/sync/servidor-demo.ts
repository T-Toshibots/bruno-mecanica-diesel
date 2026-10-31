/**
 * Servidor simulado para o modo demonstração.
 * Reproduz as regras que o Supabase aplicará (RLS, travas, numeração oficial, auditoria e
 * registro de conflitos), para que o motor de sincronização seja exercitado de verdade.
 * Limitação: fica no mesmo navegador — não sincroniza entre aparelhos diferentes.
 */
import { nuvem, TABELAS_SYNC, type TabelaSync } from '../db/banco'
import { CAMPOS_LIVRES_OS_TRAVADA, STATUS_TRAVADOS } from '../domain/permissoes'
import type { OrdemServico, StatusOS } from '../domain/tipos'
import type { Sessao } from './contexto'
import { estaOnline } from './rede'
import { ErroRede, type ItemEnvio, type Recebidos, type Registro, type ResultadoEnvio, type Transporte } from './transporte'

const META = ['updated_at', 'updated_by', 'device_id', 'version', 'created_at', 'created_by']
const TABELAS_FILHAS_OS: TabelaSync[] = ['os_veiculos', 'os_mecanicos', 'os_itens', 'os_fotos', 'os_assinaturas', 'os_status_hist']
const SO_DONO_LE: TabelaSync[] = ['funcionarios_salario', 'sync_conflitos', 'auditoria']
const SO_DONO_GRAVA: TabelaSync[] = ['funcionarios_salario', 'oficina_config', 'perfis']
const CADASTROS: TabelaSync[] = ['clientes', 'cliente_contatos', 'cliente_precos', 'fornecedores', 'veiculos', 'veiculo_clientes_hist', 'servicos_catalogo', 'funcionarios']
/** Mecânico não recebe preços nem fornecedores (não vê valores). */
const MECANICO_NAO_LE: TabelaSync[] = ['cliente_precos', 'fornecedores']
const STATUS_MECANICO: StatusOS[] = ['rascunho', 'execucao', 'aguardando', 'finalizada']
const CAMPOS_FINANCEIROS_OS = ['desconto_pct', 'forma_pagamento', 'vencimento', 'pago_em', 'faturada_em', 'pedido_numero']

let ultimoTs = 0
/** Relógio do servidor, estritamente crescente (ordem de sincronização não depende do relógio do celular). */
export function horaServidor() {
  const t = Math.max(Date.now(), ultimoTs + 1)
  ultimoTs = t
  return new Date(t).toISOString()
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

function camposAlterados(antes: Registro | undefined, depois: Registro) {
  const chaves = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois)])
  return [...chaves].filter((k) => !META.includes(k) && JSON.stringify(antes?.[k] ?? null) !== JSON.stringify(depois[k] ?? null))
}

async function osDoMecanico(sessao: Sessao): Promise<Set<string>> {
  const ids = new Set<string>()
  if (sessao.funcionario_id) {
    const atrib = await nuvem.t('os_mecanicos').where('funcionario_id').equals(sessao.funcionario_id).toArray()
    atrib.filter((a) => !a.deleted_at).forEach((a) => ids.add(a.os_id))
  }
  const criadas = await nuvem.t('os').filter((o) => o.created_by === sessao.usuario_id).toArray()
  criadas.forEach((o) => ids.add(o.id))
  return ids
}

/** Regras de escrita por perfil (equivalente às políticas RLS). Retorna mensagem de recusa ou null. */
async function verificarPermissao(sessao: Sessao, tabela: TabelaSync, novo: Registro, atual?: Registro): Promise<string | null> {
  const { papel } = sessao
  if (tabela === 'sync_conflitos' || tabela === 'auditoria') return 'Registro de sistema não pode ser alterado.'
  if (papel === 'dono') return null
  if (SO_DONO_GRAVA.includes(tabela)) return 'Somente o Dono pode alterar esta informação.'
  if (papel === 'secretaria') return null

  // Mecânico
  if (CADASTROS.includes(tabela)) return 'Mecânico não altera cadastros. Peça à secretária.'
  const meus = await osDoMecanico(sessao)
  if (tabela === 'os') {
    const osNova = novo as unknown as OrdemServico
    if (!atual) return osNova.status === 'rascunho' ? null : 'Mecânico só pode abrir chamado (rascunho).'
    if (!meus.has(novo.id)) return 'Esta OS não está atribuída a você.'
    if (osNova.status !== atual.status && !STATUS_MECANICO.includes(osNova.status)) return 'Mudança de status não permitida para mecânico.'
    if (camposAlterados(atual, novo).some((c) => CAMPOS_FINANCEIROS_OS.includes(c))) return 'Mecânico não altera valores ou pagamento.'
    return null
  }
  if (TABELAS_FILHAS_OS.includes(tabela)) {
    const osId = String(novo.os_id)
    if (!meus.has(osId)) return 'Esta OS não está atribuída a você.'
  }
  return null
}

async function proximoNumeroOficial() {
  const atual = await nuvem.contador.get('os')
  const n = ((atual?.valor as number) ?? 0) + 1
  await nuvem.contador.put({ chave: 'os', valor: n })
  return n
}

async function aplicar(sessao: Sessao, { tabela, registro }: ItemEnvio): Promise<ResultadoEnvio> {
  const tab = nuvem.table(tabela)
  const atual = (await tab.get(registro.id)) as Registro | undefined
  const recusa = (mensagem: string): ResultadoEnvio => ({ status: 'recusado', mensagem, registro: atual })

  const erro = await verificarPermissao(sessao, tabela, registro, atual)
  if (erro) return recusa(erro)

  const novo: Registro = { ...registro }

  // Valores: mecânico nunca altera preço/custo; secretária não vê nem altera custo.
  if (tabela === 'os_itens') {
    if (sessao.papel === 'mecanico') {
      novo.preco = atual?.preco ?? 0
      novo.custo = atual?.custo ?? 0
    } else if (sessao.papel === 'secretaria') {
      novo.custo = atual?.custo ?? 0
    }
  }

  // Travas: OS finalizada/faturada/cancelada só o Dono altera (exceto faturar e receber).
  if (sessao.papel !== 'dono') {
    if (tabela === 'os' && atual?.travada) {
      const alterados = camposAlterados(atual, novo).filter((c) => !(CAMPOS_LIVRES_OS_TRAVADA as readonly string[]).includes(c))
      const statusOk = novo.status === atual.status || (atual.status === 'finalizada' && novo.status === 'faturada')
      if (alterados.length || !statusOk) return recusa('Esta OS está finalizada e travada. Só o Dono pode reabrir.')
    }
    if (TABELAS_FILHAS_OS.includes(tabela) && tabela !== 'os_status_hist') {
      const os = await nuvem.t('os').get(String(novo.os_id))
      if (os?.travada) return recusa('Esta OS está finalizada e travada. Só o Dono pode reabrir.')
    }
  }

  // Conflito: alguém gravou depois da versão que o aparelho conhecia → vale a última gravação, a anterior fica no log.
  if (atual && registro.version !== atual.version && camposAlterados(atual, novo).length) {
    await nuvem.t('sync_conflitos').put({
      id: crypto.randomUUID(), tabela, registro_id: registro.id, perdedor: atual, vencedor: novo,
      usuario_nome: sessao.nome, version: 1, created_at: horaServidor(), updated_at: horaServidor(),
    })
  }

  novo.version = ((atual?.version as number) ?? 0) + 1
  novo.updated_at = horaServidor()
  novo.created_at = (atual?.created_at as string) ?? novo.created_at
  if (tabela === 'os') {
    novo.numero = (atual?.numero as number) || (await proximoNumeroOficial())
    novo.travada = STATUS_TRAVADOS.includes(novo.status as StatusOS)
  }
  await tab.put(novo)

  if (tabela === 'os') await auditar(sessao, tabela, atual, novo)
  return { status: 'ok', registro: novo }
}

async function auditar(sessao: Sessao, tabela: TabelaSync, antes: Registro | undefined, depois: Registro) {
  let acao = 'alterou'
  if (!antes) acao = 'criou'
  else if (depois.deleted_at && !antes.deleted_at) acao = 'excluiu'
  else if (antes.status !== depois.status) acao = `status: ${antes.status} → ${depois.status}`
  const agora = horaServidor()
  await nuvem.t('auditoria').put({
    id: crypto.randomUUID(), tabela, registro_id: depois.id, acao, usuario_nome: sessao.nome,
    antes: antes ? Object.fromEntries(camposAlterados(antes, depois).map((c) => [c, antes[c]])) : undefined,
    depois: antes ? Object.fromEntries(camposAlterados(antes, depois).map((c) => [c, depois[c]])) : undefined,
    version: 1, created_at: agora, updated_at: agora,
  })
}

/** O que cada perfil recebe (equivalente às políticas de leitura). */
async function receber(desde: string | null, sessao: Sessao): Promise<Recebidos> {
  const agora = horaServidor()
  const registros: Recebidos['registros'] = []
  const mecanico = sessao.papel === 'mecanico'
  const meus = mecanico ? await osDoMecanico(sessao) : null
  // OS atribuídas desde o último pull: o mecânico recebe a OS inteira, mesmo os registros antigos.
  const novasAtrib = new Set<string>()
  if (mecanico && sessao.funcionario_id && desde) {
    const atrib = await nuvem.t('os_mecanicos').where('updated_at').above(desde).toArray()
    atrib.filter((a) => a.funcionario_id === sessao.funcionario_id).forEach((a) => novasAtrib.add(a.os_id))
  }

  for (const tabela of TABELAS_SYNC) {
    if (sessao.papel !== 'dono' && SO_DONO_LE.includes(tabela)) continue
    if (mecanico && MECANICO_NAO_LE.includes(tabela)) continue
    const tab = nuvem.table(tabela)
    let linhas = (desde ? await tab.where('updated_at').above(desde).toArray() : await tab.toArray()) as Registro[]

    if (meus) {
      if (tabela === 'os') {
        linhas = linhas.filter((l) => meus.has(l.id))
        for (const id of novasAtrib) if (!linhas.some((l) => l.id === id)) {
          const os = (await tab.get(id)) as Registro | undefined
          if (os) linhas.push(os)
        }
      } else if (TABELAS_FILHAS_OS.includes(tabela)) {
        linhas = linhas.filter((l) => meus.has(String(l.os_id)))
        if (novasAtrib.size) {
          const extras = (await tab.where('os_id').anyOf([...novasAtrib]).toArray()) as Registro[]
          for (const e of extras) if (!linhas.some((l) => l.id === e.id)) linhas.push(e)
        }
      }
    }
    for (const l of linhas) {
      let r = l
      if (tabela === 'os_itens' && sessao.papel !== 'dono') r = { ...l, custo: 0, ...(mecanico ? { preco: 0 } : {}) }
      registros.push({ tabela, registro: r })
    }
  }
  return { registros, agora }
}

export const transporteDemo: Transporte = {
  nome: 'demo',
  async enviar(itens, sessao) {
    if (!estaOnline()) throw new ErroRede()
    await espera(250)
    const resultados: ResultadoEnvio[] = []
    for (const item of itens) resultados.push(await aplicar(sessao, item))
    return resultados
  },
  async receber(desde, sessao) {
    if (!estaOnline()) throw new ErroRede()
    await espera(150)
    return receber(desde, sessao)
  },
}

/** Grava direto no servidor (usado pelos dados de demonstração). */
export async function gravarNoServidor(tabela: TabelaSync, dados: Record<string, unknown>) {
  const agora = horaServidor()
  const registro = { version: 1, created_at: agora, ...dados, updated_at: agora }
  await nuvem.table(tabela).put(registro)
  return registro
}
