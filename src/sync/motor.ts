import { db, getLocal, setLocal, type RegistrosPorTabela, type TabelaSync } from '../db/banco'
import { getDeviceId, getSessao } from './contexto'

type Dados<K extends TabelaSync> = Partial<RegistrosPorTabela[K]> & { id?: string }

export interface Operacao<K extends TabelaSync = TabelaSync> {
  tabela: K
  dados: Dados<K>
}

let aoGravar: (() => void) | null = null
/** O agendador registra aqui para sincronizar logo após cada gravação. */
export const registrarAoGravar = (f: () => void) => { aoGravar = f }

/**
 * Grava primeiro no aparelho (IndexedDB) e coloca na fila de envio.
 * A interface nunca espera a internet. `version` não muda aqui: ele representa
 * a última versão conhecida do servidor e é usado para detectar conflitos.
 */
export async function gravarVarios(ops: Operacao[]) {
  const sessao = getSessao()
  const device = await getDeviceId()
  const agora = new Date().toISOString()
  const tabelas = [...new Set(ops.map((o) => o.tabela))].map((t) => db.table(t))

  const salvos = await db.transaction('rw', [...tabelas, db.outbox], async () => {
    const res: Record<string, unknown>[] = []
    for (const { tabela, dados } of ops) {
      const id = dados.id ?? crypto.randomUUID()
      const atual = await db.table(tabela).get(id)
      const registro = {
        ...atual,
        ...dados,
        id,
        version: atual?.version ?? 0,
        created_at: atual?.created_at ?? agora,
        created_by: atual?.created_by ?? sessao?.usuario_id,
        updated_at: agora,
        updated_by: sessao?.usuario_id,
        device_id: device,
      }
      await db.table(tabela).put(registro)
      await db.outbox.add({ tabela, registro_id: id, criado_em: agora, tentativas: 0, proxima_tentativa: 0 })
      res.push(registro)
    }
    return res
  })
  aoGravar?.()
  return salvos
}

export async function gravar<K extends TabelaSync>(tabela: K, dados: Dados<K>): Promise<RegistrosPorTabela[K]> {
  const [r] = await gravarVarios([{ tabela, dados } as Operacao])
  return r as unknown as RegistrosPorTabela[K]
}

/** Exclusão sempre lógica. */
export function excluir(tabela: TabelaSync, id: string) {
  return gravar(tabela, { id, deleted_at: new Date().toISOString() } as Dados<typeof tabela>)
}

/** Número provisório da OS criada no aparelho: P-<aparelho>-0007. */
export async function proximoNumeroProvisorio() {
  const device = await getDeviceId()
  const seq = (await getLocal<number>('seq_os', 0)) + 1
  await setLocal('seq_os', seq)
  return `P-${device.slice(0, 4).toUpperCase()}-${String(seq).padStart(4, '0')}`
}
