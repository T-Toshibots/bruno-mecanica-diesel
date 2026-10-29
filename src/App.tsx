import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { seedSeNecessario } from './data/seed'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Clientes } from './pages/Clientes'
import { ClienteForm } from './pages/ClienteForm'
import { ClienteDetalhe } from './pages/ClienteDetalhe'
import { OSLista } from './pages/OSLista'
import { OSForm } from './pages/OSForm'
import { OSDetalhe } from './pages/OSDetalhe'
import { Financeiro } from './pages/Financeiro'
import { Configuracoes } from './pages/Configuracoes'

const CHAVE_SESSAO = 'bmd-logado'

function lerSessao() {
  try {
    return localStorage.getItem(CHAVE_SESSAO) === '1'
  } catch {
    return false
  }
}

export function App() {
  const [pronto, setPronto] = useState(false)
  const [logado, setLogado] = useState(lerSessao)

  useEffect(() => {
    seedSeNecessario().finally(() => setPronto(true))
  }, [])

  const entrar = () => {
    try { localStorage.setItem(CHAVE_SESSAO, '1') } catch { /* sem armazenamento */ }
    setLogado(true)
  }
  const sair = () => {
    try { localStorage.removeItem(CHAVE_SESSAO) } catch { /* sem armazenamento */ }
    setLogado(false)
  }

  if (!pronto) {
    return <div className="flex min-h-screen items-center justify-center text-cinza">Carregando…</div>
  }
  if (!logado) return <Login onEntrar={entrar} />

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout onSair={sair} />}>
          <Route index element={<Dashboard />} />
          <Route path="os" element={<OSLista />} />
          <Route path="os/nova" element={<OSForm />} />
          <Route path="os/:id" element={<OSDetalhe />} />
          <Route path="os/:id/editar" element={<OSForm />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/novo" element={<ClienteForm />} />
          <Route path="clientes/:id" element={<ClienteDetalhe />} />
          <Route path="clientes/:id/editar" element={<ClienteForm />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="config" element={<Configuracoes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
