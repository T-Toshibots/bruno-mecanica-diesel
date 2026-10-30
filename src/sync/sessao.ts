import { db, getLocal, setLocal, TABELAS_SYNC } from '../db/banco'
import type { Perfil } from '../domain/tipos'
import { salvarSessao, type Sessao } from './contexto'
import { sincronizar } from './sincronizar'

/**
 * Entrar. Se outro usuário usava este aparelho, os dados dele são trocados pelos do novo usuário
 * (cada perfil só recebe o que pode ver). Só acontece sem pendências — a saída é bloqueada antes.
 */
export async function entrar(perfil: Perfil) {
  const sessao: Sessao = { usuario_id: perfil.id, nome: perfil.nome, papel: perfil.papel, funcionario_id: perfil.funcionario_id }
  const anterior = await getLocal<string | null>('ultimo_usuario', null)
  if (anterior && anterior !== perfil.id && (await db.outbox.count()) === 0) {
    await db.transaction('rw', TABELAS_SYNC.map((t) => db.table(t)), async () => {
      for (const t of TABELAS_SYNC) await db.table(t).clear()
    })
    await setLocal('ultimo_pull_servidor', null)
  }
  await setLocal('ultimo_usuario', perfil.id)
  await salvarSessao(sessao)
  await sincronizar({ forcar: true })
  return sessao
}

/** Nunca apaga dados não sincronizados: com pendências, só sai com confirmação explícita (os dados ficam no aparelho). */
export async function podeSairSemPerda() {
  return (await db.outbox.count()) === 0
}

export async function sair() {
  await salvarSessao(null)
}
