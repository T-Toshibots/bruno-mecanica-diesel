import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ClipboardList, Download, Gauge, LogOut, Plus, RefreshCw, Settings, Users, Wallet, Wifi, WifiOff } from 'lucide-react'
import { useInstalarApp, useSync } from '../lib/sync'

const BASE = import.meta.env.BASE_URL

const NAV = [
  { to: '/', label: 'Painel', icone: Gauge, end: true },
  { to: '/os', label: 'Ordens de Serviço', curto: 'OS', icone: ClipboardList },
  { to: '/clientes', label: 'Clientes', icone: Users },
  { to: '/financeiro', label: 'Financeiro', icone: Wallet },
  { to: '/config', label: 'Configurações', icone: Settings },
]

function StatusConexao() {
  const { online, pendentes, sincronizando } = useSync()
  return (
    <div className="flex items-center gap-2 text-xs">
      {online ? (
        <span className="chip gap-1 bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"><Wifi size={12} /> Online</span>
      ) : (
        <span className="chip gap-1 bg-red-500/10 text-red-300 ring-red-500/30"><WifiOff size={12} /> Offline</span>
      )}
      {pendentes > 0 && (
        <span className="chip gap-1 bg-brand/10 text-brand ring-brand/30" title="Alterações aguardando sincronização">
          <RefreshCw size={12} className={sincronizando ? 'animate-spin' : ''} /> {pendentes}
          <span className="hidden sm:inline"> pendente{pendentes > 1 ? 's' : ''}</span>
        </span>
      )}
    </div>
  )
}

export function Layout({ onSair }: { onSair: () => void }) {
  const instalar = useInstalarApp()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Menu lateral (computador) */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-borda bg-painel lg:flex">
        <div className="border-b border-borda p-4">
          <img src={BASE + 'logo.png'} alt="Bruno Mecânica Diesel" className="w-full rounded-lg" />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ to, label, icone: Icone, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-brand text-black' : 'text-prata hover:bg-card hover:text-white'
                }`
              }
            >
              <Icone size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-borda p-3">
          <button onClick={() => navigate('/os/nova')} className="btn-primario w-full"><Plus size={18} /> Nova OS</button>
          {instalar && <button onClick={instalar} className="btn-secundario w-full"><Download size={16} /> Instalar app</button>}
          <button onClick={onSair} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-cinza hover:text-white"><LogOut size={14} /> Sair</button>
        </div>
      </aside>

      {/* Topo */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-borda bg-fundo/90 px-4 pb-2.5 pt-[max(.625rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-2 lg:hidden">
          <img src={BASE + 'icon-192.png'} alt="" className="h-9 w-9 rounded-full" />
          <div className="leading-none">
            <div className="titulo text-base">Bruno</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-brand">Mecânica Diesel</div>
          </div>
        </div>
        <div className="hidden text-sm text-cinza lg:block">Sistema de Ordens de Serviço</div>
        <div className="flex items-center gap-1">
          <StatusConexao />
          {instalar && (
            <button onClick={instalar} className="rounded-lg p-2 text-brand lg:hidden" aria-label="Instalar app"><Download size={18} /></button>
          )}
          <NavLink to="/config" className="rounded-lg p-2 text-cinza hover:text-white lg:hidden" aria-label="Configurações"><Settings size={18} /></NavLink>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
        <Outlet />
      </main>

      {/* Navegação inferior (celular) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-borda bg-painel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {[NAV[0], NAV[1]].map(({ to, label, curto, icone, end }) => (
          <ItemInferior key={to} to={to} end={end} label={curto ?? label} Icone={icone} />
        ))}
        <div className="flex items-center justify-center">
          <button onClick={() => navigate('/os/nova')} className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-black shadow-lg shadow-brand/30 ring-4 ring-fundo" aria-label="Nova OS">
            <Plus size={28} />
          </button>
        </div>
        {[NAV[2], NAV[3]].map(({ to, label, icone }) => (
          <ItemInferior key={to} to={to} label={label} Icone={icone} />
        ))}
      </nav>
    </div>
  )
}

function ItemInferior({ to, label, Icone, end }: { to: string; label: string; Icone: typeof Gauge; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand' : 'text-cinza'}`}
    >
      <Icone size={22} /> {label}
    </NavLink>
  )
}
