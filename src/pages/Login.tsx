import { useState, type FormEvent } from 'react'
import { LogIn } from 'lucide-react'

const BASE = import.meta.env.BASE_URL

/** Acesso de apresentação: qualquer senha entra. Login real virá com o servidor (fase 2). */
export function Login({ onEntrar }: { onEntrar: () => void }) {
  const [usuario, setUsuario] = useState('bruno')
  const [senha, setSenha] = useState('demo')

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    onEntrar()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_#2a1a08_0%,_#0F0F0F_60%)] p-4">
      <form onSubmit={enviar} className="w-full max-w-sm">
        <img src={BASE + 'logo.png'} alt="Bruno Mecânica Diesel" className="mx-auto mb-6 w-full max-w-xs rounded-xl" />
        <div className="card space-y-4 bg-painel/90">
          <h1 className="titulo text-center text-2xl">Acessar sistema</h1>
          <label className="block">
            <span className="label">Usuário</span>
            <input className="input" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" />
          </label>
          <label className="block">
            <span className="label">Senha</span>
            <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="btn-primario w-full py-3 text-base"><LogIn size={18} /> Entrar</button>
          <p className="text-center text-xs text-cinza">Versão de demonstração — dados fictícios salvos neste aparelho.</p>
        </div>
      </form>
    </div>
  )
}
