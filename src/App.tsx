import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProvedorSessao } from './app/sessao'
import { Layout } from './components/Layout'
import { db, removerBancoAntigo, setLocal } from './db/banco'
import { recriarDemo, seedDesatualizado, semearServidor, servidorVazio } from './demo/seed'
import type { Perfil } from './domain/tipos'
import { carregarSessao, getDeviceId, type Sessao } from './sync/contexto'
import { iniciarAgendador } from './sync/agendador'
import { entrar, sair } from './sync/sessao'
import { Login } from './features/login/Login'
import { Painel } from './features/painel/Painel'
import { OSLista } from './features/os/OSLista'
import { OSForm } from './features/os/OSForm'
import { OSDetalhe } from './features/os/OSDetalhe'
import { Clientes } from './features/clientes/Clientes'
import { ClienteForm } from './features/clientes/ClienteForm'
import { ClienteDetalhe } from './features/clientes/ClienteDetalhe'
import { Financeiro } from './features/financeiro/Financeiro'
import { Veiculos } from './features/cadastros/Veiculos'
import { Equipe } from './features/cadastros/Equipe'
import { Fornecedores } from './features/cadastros/Fornecedores'
import { Servicos } from './features/cadastros/Servicos'
import { Importar } from './features/cadastros/Importar'
import { Configuracoes } from './features/configuracoes/Configuracoes'
import { Sincronizacao } from './features/sincronizacao/Sincronizacao'

async function iniciar() {
  await removerBancoAntigo()
  if (await servidorVazio()) await semearServidor()
  // Dados de demonstração de versão anterior: recria (só se não houver nada pendente no aparelho).
  else if ((await seedDesatualizado()) && (await db.outbox.count()) === 0) await recriarDemo()
  // Pede ao navegador para não apagar os dados do app (importante no iPhone).
  const persistente = (await navigator.storage?.persist?.().catch(() => false)) ?? false
  await setLocal('armazenamento_persistente', persistente)
  await getDeviceId()
  return carregarSessao()
}

export function App() {
  const [pronto, setPronto] = useState(false)
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    iniciar().then((s) => { setSessao(s); setPronto(true) })
  }, [])

  useEffect(() => {
    if (!sessao) return
    const parar = iniciarAgendador()
    const desativado = async () => {
      await sair()
      setSessao(null)
      setAviso('Seu acesso foi desativado. Fale com o responsável pela oficina.')
    }
    window.addEventListener('usuario-desativado', desativado)
    return () => { parar(); window.removeEventListener('usuario-desativado', desativado) }
  }, [sessao])

  if (!pronto) return <div className="flex min-h-screen items-center justify-center text-cinza">Carregando…</div>

  if (!sessao)
    return <Login aviso={aviso} onEntrar={async (p: Perfil) => { setAviso(''); setSessao(await entrar(p)) }} />

  const permitido = (ok: boolean, el: JSX.Element) => (ok ? el : <Navigate to="/" replace />)
  const naoMecanico = sessao.papel !== 'mecanico'

  return (
    <ProvedorSessao sessao={sessao} sair={async () => { await sair(); setSessao(null) }}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Painel />} />
            <Route path="os" element={<OSLista />} />
            <Route path="os/nova" element={<OSForm />} />
            <Route path="os/:id" element={<OSDetalhe />} />
            <Route path="os/:id/editar" element={<OSForm />} />
            <Route path="clientes" element={permitido(naoMecanico, <Clientes />)} />
            <Route path="clientes/novo" element={permitido(naoMecanico, <ClienteForm />)} />
            <Route path="clientes/:id" element={permitido(naoMecanico, <ClienteDetalhe />)} />
            <Route path="clientes/:id/editar" element={permitido(naoMecanico, <ClienteForm />)} />
            <Route path="cadastros/veiculos" element={permitido(naoMecanico, <Veiculos />)} />
            <Route path="cadastros/equipe" element={permitido(naoMecanico, <Equipe />)} />
            <Route path="cadastros/fornecedores" element={permitido(naoMecanico, <Fornecedores />)} />
            <Route path="cadastros/servicos" element={permitido(naoMecanico, <Servicos />)} />
            <Route path="cadastros/importar" element={permitido(naoMecanico, <Importar />)} />
            <Route path="financeiro" element={permitido(naoMecanico, <Financeiro />)} />
            <Route path="config" element={permitido(sessao.papel === 'dono', <Configuracoes />)} />
            <Route path="sincronizacao" element={<Sincronizacao />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ProvedorSessao>
  )
}
