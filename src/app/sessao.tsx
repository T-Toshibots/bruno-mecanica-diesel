import { createContext, useContext, type ReactNode } from 'react'
import { permissoes, type Permissoes } from '../domain/permissoes'
import type { Sessao } from '../sync/contexto'

interface ValorSessao {
  sessao: Sessao
  perm: Permissoes
  sair: () => void
}

const Ctx = createContext<ValorSessao | null>(null)

export function ProvedorSessao({ sessao, sair, children }: { sessao: Sessao; sair: () => void; children: ReactNode }) {
  return <Ctx.Provider value={{ sessao, perm: permissoes(sessao.papel), sair }}>{children}</Ctx.Provider>
}

export function useSessao() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSessao fora do ProvedorSessao')
  return v
}
