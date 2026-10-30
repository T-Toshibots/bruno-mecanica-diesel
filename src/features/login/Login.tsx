import { useEffect, useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { tema } from '../../config/tema'
import { nuvem } from '../../db/banco'
import type { Papel, Perfil } from '../../domain/tipos'
import { PAPEIS } from '../../lib/format'
import { Aviso } from '../../components/ui'

const BASE = import.meta.env.BASE_URL

const DESCRICAO: Record<Papel, string> = {
  dono: 'Acesso total: financeiro, margem, salários, configurações e auditoria.',
  secretaria: 'Cadastros, orçamentos, OS, cobranças. Sem lucro, salários ou configurações.',
  mecanico: 'Só as OS atribuídas a ele, sem valores. Pode abrir chamado em campo.',
}

/**
 * Modo demonstração: escolha do perfil para mostrar as permissões.
 * Com o Supabase configurado, esta tela passa a pedir e-mail e senha.
 */
export function Login({ onEntrar, aviso }: { onEntrar: (p: Perfil) => Promise<void>; aviso?: string }) {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [entrando, setEntrando] = useState<string | null>(null)

  useEffect(() => {
    nuvem.t('perfis').toArray().then((l) => {
      const ordem: Papel[] = ['dono', 'secretaria', 'mecanico']
      setPerfis(l.filter((p) => !p.deleted_at).sort((a, b) => ordem.indexOf(a.papel) - ordem.indexOf(b.papel)))
    })
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_#2a1a08_0%,_var(--color-fundo)_60%)] p-4">
      <div className="w-full max-w-md">
        <img src={BASE + tema.logo} alt={tema.nomeSistema} className="mx-auto mb-5 w-full max-w-xs rounded-xl" />
        <div className="card space-y-3 bg-painel/95">
          <h1 className="titulo text-center text-2xl">Entrar como</h1>
          {aviso && <Aviso tipo="erro">{aviso}</Aviso>}
          {perfis.map((p) => (
            <button
              key={p.id}
              disabled={!p.ativo || !!entrando}
              onClick={async () => { setEntrando(p.id); await onEntrar(p) }}
              className="flex w-full items-center gap-3 rounded-xl border border-borda bg-card p-3 text-left transition hover:border-brand disabled:opacity-50"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/15 font-titulo text-xl font-bold text-brand">
                {p.nome[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-forte">{p.nome} <span className="text-xs font-normal text-brand">· {PAPEIS[p.papel]}</span></div>
                <div className="text-xs text-cinza">{p.ativo ? DESCRICAO[p.papel] : 'Acesso desativado'}</div>
              </div>
              {entrando === p.id ? <Loader2 className="animate-spin text-brand" size={20} /> : <ChevronRight className="text-cinza" size={20} />}
            </button>
          ))}
          <p className="pt-1 text-center text-xs text-cinza">Versão de demonstração — dados fictícios guardados neste aparelho.</p>
        </div>
      </div>
    </div>
  )
}
