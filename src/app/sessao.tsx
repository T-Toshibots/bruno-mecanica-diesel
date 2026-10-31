import { createContext, useContext, type ReactNode } from 'react'
import { permissoes, type Permissoes } from '../domain/permissoes'
import type { Perfil } from '../domain/tipos'
import type { Sessao } from '../sync/contexto'

interface ValorSessao {
  sessao: Sessao
  perm: Permissoes
  sair: () => void
  /** Modo demonstração: troca direto para outro perfil. */
  trocar: (perfil: Perfil) => Promise<void>
}

const Ctx = createContext<ValorSessao | null>(null)

export function ProvedorSessao({ sessao, sair, trocar, children }: { sessao: Sessao; sair: () => void; trocar: (p: Perfil) => Promise<void>; children: ReactNode }) {
  return <Ctx.Provider value={{ sessao, perm: permissoes(sessao.papel), sair, trocar }}>{children}</Ctx.Provider>
}

export function useSessao() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSessao fora do ProvedorSessao')
  return v
}
