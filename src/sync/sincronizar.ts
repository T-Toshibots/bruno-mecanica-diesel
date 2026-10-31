import { db, getLocal, setLocal, type OutboxItem, type TabelaSync } from '../db/banco'
import { getSessao, type Sessao } from './contexto'
import { estaOnline } from './rede'
import { transporteDemo } from './servidor-demo'
import { ErroRede, type Transporte } from './transporte'

/** Espera progressiva entre tentativas, em segundos. */
export const ESPERAS = [5, 15, 60, 300, 900]
const LOTE = 50

// Trocar por um transporte Supabase quando o projeto tiver as chaves configuradas.
let transporte: Transporte = transporteDemo
export const definirTransporte = (t: Transporte) => { transporte = t }

export interface EstadoSync {
  sincronizando: boolean
  ultimoSync?: string
  ultimoErro?: string
  /** Progresso do envio de fotos na sincronização atual. */
  arquivos?: { total: number; enviados: number }
}

let estado: EstadoSync = { sincronizando: false }
const ouvintes = new Set<() => void>()
const definir = (p: Partial<EstadoSync>) => {
  estado = { ...estado, ...p }
  ouvintes.forEach((f) => f())
}
export const getEstadoSync = () => estado
export const assinarEstadoSync = (f: () => void) => {
  ouvintes.add(f)
  return () => { ouvintes.delete(f) }
}

let emAndamento: { promessa: Promise<void>; usuario?: string } | null = null

/**
 * Envia pendências e baixa alterações. Chamadas simultâneas do mesmo usuário reutilizam a mesma execução;
 * se o usuário mudou (troca de login), espera a anterior terminar e roda de novo para o novo usuário.
 */
export function sincronizar(opcoes: { forcar?: boolean } = {}): Promise<void> {
  const usuario = getSessao()?.usuario_id
  if (emAndamento) {
    if (emAndamento.usuario === usuario) return emAndamento.promessa
    return emAndamento.promessa.then(() => sincronizar(opcoes))
  }
  const atual = { usuario, promessa: executar(!!opcoes.forcar).finally(() => { if (emAndamento === atual) emAndamento = null }) }
  emAndamento = atual
  return atual.promessa
}

async function executar(forcar: boolean) {
  const sessao = getSessao()
  if (!sessao || !estaOnline()) return
  definir({ sincronizando: true })
  try {
    await enviar(sessao, forcar)
    await enviarArquivos(sessao)
    await receber(sessao)
    const agora = new Date().toISOString()
    await setLocal('ultimo_sync', agora)
    definir({ ultimoSync: agora, ultimoErro: undefined })
  } catch (e) {
    definir({ ultimoErro: e instanceof ErroRede ? 'Sem conexão com o servidor' : 'Falha ao sincronizar — nova tentativa automática' })
    if (!(e instanceof ErroRede)) console.error(e)
  } finally {
    definir({ sincronizando: false })
  }
}

/**
 * Fila própria das fotos: envia os arquivos pendentes, um por vez, com progresso.
 * Roda depois dos registros, para a foto nunca chegar antes da OS.
 */
async function enviarArquivos(sessao: Sessao) {
  const pendentes = await db.arquivos.where('enviado').equals(0).toArray()
  if (!pendentes.length) return
  definir({ arquivos: { total: pendentes.length, enviados: 0 } })
  try {
    for (const [i, a] of pendentes.entries()) {
      await transporte.enviarArquivo(a.id, a.blob, a.tipo, sessao)
      await db.arquivos.update(a.id, { enviado: 1 })
      definir({ arquivos: { total: pendentes.length, enviados: i + 1 } })
    }
  } finally {
    definir({ arquivos: undefined })
  }
}

/** Foto completa: do aparelho, ou baixada do servidor se houver internet. */
export async function obterArquivo(id: string): Promise<Blob | null> {
  const local = await db.arquivos.get(id)
  if (local) return local.blob
  if (!estaOnline()) return null
  try {
    return await transporte.baixarArquivo(id)
  } catch {
    return null
  }
}

/** Libera o espaço das fotos já enviadas (as miniaturas continuam). Retorna quantas foram liberadas. */
export async function liberarArquivosEnviados() {
  return db.arquivos.where('enviado').equals(1).delete()
}

async function adiar(itens: OutboxItem[], motivo: string) {
  const agora = Date.now()
  await db.outbox.bulkPut(itens.map((i) => ({
    ...i,
    tentativas: i.tentativas + 1,
    proxima_tentativa: agora + ESPERAS[Math.min(i.tentativas, ESPERAS.length - 1)] * 1000,
    erro: motivo,
  })))
}

/** Processa a fila em ordem; para no primeiro item que ainda está em espera. */
async function enviar(sessao: Sessao, forcar: boolean) {
  for (;;) {
    const fila = await db.outbox.orderBy('seq').toArray()
    const agora = Date.now()
    const prontos: OutboxItem[] = []
    for (const item of fila) {
      if (!forcar && item.proxima_tentativa > agora) break
      prontos.push(item)
    }
    if (!prontos.length) return

    // Agrupa por registro (várias edições do mesmo registro = um envio com o estado atual).
    const grupos = new Map<string, { tabela: TabelaSync; id: string; itens: OutboxItem[] }>()
    for (const it of prontos) {
      const chave = it.tabela + ':' + it.registro_id
      if (!grupos.has(chave)) {
        if (grupos.size >= LOTE) break
        grupos.set(chave, { tabela: it.tabela, id: it.registro_id, itens: [] })
      }
      grupos.get(chave)!.itens.push(it)
    }

    const pares = []
    for (const g of grupos.values()) {
      const registro = await db.table(g.tabela).get(g.id)
      if (registro) pares.push({ g, registro })
      else await db.outbox.bulkDelete(g.itens.map((i) => i.seq!))
    }
    if (!pares.length) continue

    let resultados
    try {
      resultados = await transporte.enviar(pares.map((p) => ({ tabela: p.g.tabela, registro: p.registro })), sessao)
    } catch (e) {
      await adiar(pares.flatMap((p) => p.g.itens), e instanceof Error ? e.message : 'Falha no envio')
      throw e
    }

    for (const [i, { g }] of pares.entries()) {
      const r = resultados[i]
      const tab = db.table(g.tabela)
      const seqs = g.itens.map((x) => x.seq!)
      await db.transaction('rw', [tab, db.outbox, db.sync_erros], async () => {
        if (r.status === 'ok') {
          const maior = Math.max(...seqs)
          const editadoDepois = await db.outbox.where('registro_id').equals(g.id).filter((o) => o.seq! > maior).count()
          if (editadoDepois) {
            // Editado de novo durante o envio: mantém a edição local e só atualiza o que o servidor define.
            const { version, numero, travada } = r.registro
            await tab.update(g.id, { version, ...(numero !== undefined ? { numero, travada } : {}) })
          } else {
            await tab.put(r.registro)
          }
          await db.outbox.bulkDelete(seqs)
        } else {
          // Recusado: desfaz a alteração local e avisa o usuário.
          if (r.registro) await tab.put(r.registro)
          else await tab.delete(g.id)
          await db.outbox.where('registro_id').equals(g.id).delete()
          await db.sync_erros.add({ tabela: g.tabela, registro_id: g.id, mensagem: r.mensagem, data: new Date().toISOString() })
        }
      })
    }
  }
}

/** Baixa o que mudou no servidor desde o último pull. Nunca sobrescreve registro com pendência local. */
async function receber(sessao: Sessao) {
  const desde = await getLocal<string | null>('ultimo_pull_servidor', null)
  const { registros, agora } = await transporte.receber(desde, sessao)
  // Usuário trocou durante o download: descarta (o novo usuário baixa o que é dele).
  if (getSessao()?.usuario_id !== sessao.usuario_id) return
  const pendentes = new Set((await db.outbox.toArray()).map((o) => o.registro_id))
  const porTabela = new Map<TabelaSync, unknown[]>()
  for (const { tabela, registro } of registros) {
    if (pendentes.has(registro.id)) continue
    if (!porTabela.has(tabela)) porTabela.set(tabela, [])
    porTabela.get(tabela)!.push(registro)
  }
  for (const [tabela, linhas] of porTabela) await db.table(tabela).bulkPut(linhas)
  await setLocal('ultimo_pull_servidor', agora)

  const perfil = await db.t('perfis').get(sessao.usuario_id)
  if (perfil && !perfil.ativo && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('usuario-desativado'))
}
