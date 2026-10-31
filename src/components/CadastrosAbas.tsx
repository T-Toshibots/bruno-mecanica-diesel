import { NavLink } from 'react-router-dom'
import { FileUp, HardHat, Package, Truck, Users, Wrench } from 'lucide-react'

const ABAS = [
  { to: '/clientes', label: 'Clientes', icone: Users },
  { to: '/cadastros/veiculos', label: 'Veículos', icone: Truck },
  { to: '/cadastros/equipe', label: 'Equipe', icone: HardHat },
  { to: '/cadastros/fornecedores', label: 'Fornecedores', icone: Package },
  { to: '/cadastros/servicos', label: 'Serviços', icone: Wrench },
  { to: '/cadastros/importar', label: 'Importar', icone: FileUp },
]

export function CadastrosAbas() {
  return (
    <nav className="no-print -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-borda px-4">
      {ABAS.map(({ to, label, icone: Icone }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/clientes'}
          className={({ isActive }) =>
            `flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold ${isActive ? 'border-brand text-brand' : 'border-transparent text-cinza hover:text-forte'}`
          }
        >
          <Icone size={16} /> {label}
        </NavLink>
      ))}
    </nav>
  )
}
