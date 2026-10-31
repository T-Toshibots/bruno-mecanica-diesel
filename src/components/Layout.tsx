import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ChevronDown, ClipboardList, CloudOff, Database, Gauge, LogOut, Monitor, Moon, Plus, RefreshCw, Settings, Sun, Users, Wallet, Wifi,
} from 'lucide-react'
import { useSessao } from '../app/sessao'
import { aplicarAtualizacao, useNovaVersao } from '../app/atualizacao'
import { tema } from '../config/tema'
import { PAPEIS } from '../lib/format'
import { useTemaVisual } from '../lib/tema-visual'
import { useStatusSync } from '../sync/agendador'
import { podeSairSemPerda } from '../sync/sessao'
import { nuvem } from '../db/banco'
import type { Papel, Perfil } from '../domain/tipos'
import { sincronizar } from '../sync/sincronizar'
import { Modal } from './ui'
import { BarraProgresso } from '../features/sincronizacao/Sincronizacao'

const BASE = import.meta.env.BASE_URL

/** Indicador sempre visível: Online / Offline / Sincronizando (X pendências). */
function IndicadorSync() {
  const s = useStatusSync()
  let cor = 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/40 dark:text-emerald-300'
  let icone = <Wifi size={13} />
  let texto = 'Online'
  if (!s.online) {
    cor = 'bg-red-500/10 text-red-700 ring-red-500/40 dark:text-red-300'
    icone = <CloudOff size={13} />
    texto = 'Offline'
  } else if (s.sincronizando) {
    cor = 'bg-brand/10 text-brand ring-brand/40'
    icone = <RefreshCw size={13} className="animate-spin" />
    texto = 'Sincronizando'
  }
  return (
    <Link to="/sincronizacao" className={`chip min-h-9 gap-1.5 px-3 ${cor}`} title="Ver detalhes da sincronização">
      {icone} {texto}
      {s.pendentes > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] text-black">{s.pendentes}</span>}
      {s.erros > 0 && <AlertTriangle size={13} className="texto-alerta" />}
    </Link>
  )
}

function Avisos() {
  const s = useStatusSync()
  const novaVersao = useNovaVersao()
  const [msg, setMsg] = useState('')
  return (
    <div className="no-print space-y-2 empty:hidden">
      {s.pendenciaAntiga && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle size={16} className="shrink-0" />
          Há alterações guardadas só neste aparelho há mais de 24h. Conecte-se à internet para enviar.
        </div>
      )}
      {s.erros > 0 && (
        <Link to="/sincronizacao" className="flex items-center gap-2 rounded-lg border border-red-600/40 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          <AlertTriangle size={16} className="shrink-0" /> {s.erros} alteração(ões) recusada(s) pelo servidor — toque para ver.
        </Link>
      )}
      {novaVersao && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-sm">
          <span>{msg || 'Nova versão do app disponível.'}</span>
          <button
            className="btn-primario min-h-9 py-1.5"
            onClick={async () => { if (!(await aplicarAtualizacao())) setMsg('Ainda há pendências. Conecte-se para sincronizar antes de atualizar.') }}
          >
            Sincronizar e atualizar
          </button>
        </div>
      )}
    </div>
  )
}

function BotaoTema() {
  const { modo, alternar } = useTemaVisual()
  const Icone = modo === 'escuro' ? Moon : modo === 'claro' ? Sun : Monitor
  const rotulo = { escuro: 'Tema escuro', claro: 'Tema claro (sol)', sistema: 'Tema do sistema' }[modo]
  return (
    <button onClick={alternar} className="flex h-11 w-11 items-center justify-center rounded-lg text-cinza hover:text-forte" title={rotulo} aria-label={rotulo}>
      <Icone size={19} />
    </button>
  )
}

export function Layout() {
  const { sessao, perm, sair } = useSessao()
  const status = useStatusSync()
  const navigate = useNavigate()
  const [confirmarSaida, setConfirmarSaida] = useState(false)
  const [trocando, setTrocando] = useState(false)

  const nav = [
    { to: '/', label: 'Painel', icone: Gauge, end: true },
    { to: '/os', label: perm.verTodasOS ? 'Ordens de Serviço' : 'Minhas OS', curto: perm.verTodasOS ? 'OS' : 'Minhas OS', icone: ClipboardList },
    ...(perm.verClientes ? [{ to: '/clientes', label: 'Clientes', icone: Users }] : []),
    ...(perm.editarCadastros ? [{ to: '/cadastros/veiculos', label: 'Cadastros', icone: Database }] : []),
    ...(perm.verFinanceiro ? [{ to: '/financeiro', label: 'Financeiro', icone: Wallet }] : []),
    { to: '/sincronizacao', label: 'Sincronização', curto: 'Sincronizar', icone: RefreshCw },
    ...(perm.verConfiguracoes ? [{ to: '/config', label: 'Configurações', icone: Settings }] : []),
  ]
  // Celular: Cadastros fica nas abas da tela de Clientes
  const inferior = nav.filter((n) => n.to !== '/config' && n.to !== '/cadastros/veiculos' && !(perm.verClientes && n.to === '/sincronizacao')).slice(0, 4)
  const novaOS = perm.verTodasOS ? 'Nova OS' : 'Abrir chamado'

  const pedirSaida = () => (status.pendentes > 0 ? setConfirmarSaida(true) : sair())

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-borda bg-painel lg:flex">
        <div className="border-b border-borda p-4">
          <img src={BASE + tema.logo} alt={tema.nomeSistema} className="w-full rounded-lg" />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map(({ to, label, icone: Icone, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  isActive ? 'bg-brand text-black' : 'text-prata hover:bg-card hover:text-forte'
                }`
              }
            >
              <Icone size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-borda p-3">
          <button onClick={() => navigate('/os/nova')} className="btn-primario w-full"><Plus size={18} /> {novaOS}</button>
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="min-w-0 text-xs">
              <div className="truncate font-semibold text-forte">{sessao.nome}</div>
              <div className="text-cinza">{PAPEIS[sessao.papel]}</div>
            </div>
            <button onClick={pedirSaida} className="flex min-h-11 items-center gap-1 px-2 text-xs text-cinza hover:text-forte"><LogOut size={14} /> Sair</button>
          </div>
        </div>
      </aside>

      <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-borda bg-fundo/90 px-3 pb-2 pt-[max(.5rem,env(safe-area-inset-top))] backdrop-blur sm:px-4">
        {/* Celular: o nome do perfil é o botão de trocar perfil */}
        <button onClick={() => setTrocando(true)} className="flex min-w-0 items-center gap-2 text-left lg:hidden" aria-label="Trocar perfil">
          <img src={BASE + tema.icone} alt="" className="h-9 w-9 shrink-0 rounded-full" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold text-forte">{sessao.nome} · {PAPEIS[sessao.papel]}</span>
            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-brand"><Users size={12} /> Trocar perfil <ChevronDown size={12} /></span>
          </span>
        </button>
        <button onClick={() => setTrocando(true)} className="btn-secundario hidden lg:inline-flex">
          <Users size={16} /> {sessao.nome} · {PAPEIS[sessao.papel]} — <span className="text-brand">Trocar perfil</span> <ChevronDown size={14} />
        </button>
        <div className="flex items-center">
          <IndicadorSync />
          <BotaoTema />
          {perm.verConfiguracoes && (
            <NavLink to="/config" className="flex h-11 w-11 items-center justify-center rounded-lg text-cinza hover:text-forte lg:hidden" aria-label="Configurações"><Settings size={19} /></NavLink>
          )}
          <button onClick={pedirSaida} className="flex h-11 w-11 items-center justify-center rounded-lg text-cinza hover:text-forte lg:hidden" aria-label="Sair"><LogOut size={19} /></button>
        </div>
      </header>

      {status.arquivos && (
        <div className="no-print sticky top-[57px] z-20" title={`Enviando fotos ${status.arquivos.enviados}/${status.arquivos.total}`}>
          <BarraProgresso valor={status.arquivos.enviados} total={status.arquivos.total} fina />
        </div>
      )}
      <main className="mx-auto max-w-6xl space-y-4 px-4 pb-28 pt-4 lg:px-8 lg:pb-10">
        <Avisos />
        <div><Outlet /></div>
      </main>

      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-borda bg-painel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        style={{ gridTemplateColumns: `repeat(${inferior.length + 1}, minmax(0, 1fr))` }}
      >
        {inferior.slice(0, 2).map((n) => <ItemInferior key={n.to} to={n.to} end={n.end} label={n.curto ?? n.label} Icone={n.icone} />)}
        <div className="flex items-center justify-center">
          <button onClick={() => navigate('/os/nova')} className="-mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-black shadow-lg shadow-brand/30 ring-4 ring-fundo" aria-label={novaOS}>
            <Plus size={30} />
          </button>
        </div>
        {inferior.slice(2).map((n) => <ItemInferior key={n.to} to={n.to} label={n.curto ?? n.label} Icone={n.icone} />)}
      </nav>

      {trocando && <TrocarPerfil onFechar={() => setTrocando(false)} />}

      <Modal aberto={confirmarSaida} titulo="Alterações não enviadas" onFechar={() => setConfirmarSaida(false)}>
        <p className="text-sm text-prata">
          Há <strong className="text-forte">{status.pendentes}</strong> alteração(ões) ainda não enviadas ao servidor.
          Sincronize antes de sair. Se sair mesmo assim, nada é apagado: os dados continuam guardados neste aparelho.
        </p>
        <div className="mt-4 grid gap-2">
          <button className="btn-primario" disabled={!status.online} onClick={async () => { await sincronizar({ forcar: true }); setConfirmarSaida(false) }}>
            <RefreshCw size={16} /> {status.online ? 'Sincronizar agora' : 'Sem internet para sincronizar'}
          </button>
          <button className="btn-perigo" onClick={() => { setConfirmarSaida(false); sair() }}>Sair mesmo assim (dados ficam no aparelho)</button>
          <button className="btn-secundario" onClick={() => setConfirmarSaida(false)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}

const DESCRICAO_PAPEL: Record<Papel, string> = {
  dono: 'Acesso total: financeiro, margem, salários, configurações e auditoria.',
  secretaria: 'Cadastros, orçamentos, OS e cobranças. Sem lucro, salários ou configurações.',
  mecanico: 'Só as OS atribuídas a ele, sem valores. Abre chamado em campo.',
}

/** Modo demonstração: alterna entre Dono, Secretária e Mecânicos com um toque. */
function TrocarPerfil({ onFechar }: { onFechar: () => void }) {
  const { sessao, trocar } = useSessao()
  const status = useStatusSync()
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState<string | null>(null)
  const perfis = useLiveQuery(async () => {
    const ordem: Papel[] = ['dono', 'secretaria', 'mecanico']
    return (await nuvem.t('perfis').toArray()).filter((p) => !p.deleted_at).sort((a, b) => ordem.indexOf(a.papel) - ordem.indexOf(b.papel))
  }, [], [] as Perfil[])

  const escolher = async (p: Perfil) => {
    if (p.id === sessao.usuario_id) return onFechar()
    setErro('')
    setEntrando(p.id)
    // Nada pendente pode ficar para trás: envia antes de trocar.
    if (status.pendentes > 0) await sincronizar({ forcar: true })
    if (!(await podeSairSemPerda())) {
      setEntrando(null)
      return setErro('Há alterações deste perfil ainda não enviadas. Conecte-se à internet e sincronize antes de trocar.')
    }
    await trocar(p)
    onFechar()
  }

  return (
    <Modal aberto titulo="Trocar perfil" onFechar={onFechar}>
      <p className="mb-3 text-sm text-cinza">Escolha o perfil para ver o sistema como cada pessoa vê. Só o Dono tem acesso a tudo.</p>
      <div className="space-y-2">
        {perfis.map((p) => (
          <button key={p.id} disabled={!p.ativo || !!entrando} onClick={() => escolher(p)}
            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50 ${p.id === sessao.usuario_id ? 'border-brand bg-brand/10' : 'border-borda bg-card hover:border-brand'}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 font-titulo text-lg font-bold text-brand">{p.nome[0]}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-forte">
                {p.nome} <span className="text-xs font-normal text-brand">· {PAPEIS[p.papel]}</span>
                {p.id === sessao.usuario_id && <span className="ml-1 text-xs font-normal text-cinza">(atual)</span>}
              </span>
              <span className="block text-xs text-cinza">{p.ativo ? DESCRICAO_PAPEL[p.papel] : 'Acesso desativado'}</span>
            </span>
            {entrando === p.id && <RefreshCw size={18} className="animate-spin text-brand" />}
          </button>
        ))}
      </div>
      {erro && <p className="mt-3 text-sm texto-alerta">{erro}</p>}
    </Modal>
  )
}

function ItemInferior({ to, label, Icone, end }: { to: string; label: string; Icone: typeof Gauge; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-brand' : 'text-cinza'}`}
    >
      <Icone size={22} /> <span className="truncate">{label}</span>
    </NavLink>
  )
}
