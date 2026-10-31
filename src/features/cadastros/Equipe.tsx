import { useState, type FormEvent } from 'react'
import { HardHat, Plus, UserCheck } from 'lucide-react'
import { useSessao } from '../../app/sessao'
import { useLista } from '../../db/consultas'
import { validarCPF } from '../../domain/validacao'
import type { Funcionario } from '../../domain/tipos'
import { brl, CATEGORIAS_SERVICO, data, mascaraDocumento, mascaraTelefone, PAPEIS } from '../../lib/format'
import { gravarVarios, type Operacao } from '../../sync/motor'
import { CadastrosAbas } from '../../components/CadastrosAbas'
import { Aviso, Cabecalho, Campo, Modal, Vazio } from '../../components/ui'

type Form = Partial<Funcionario> & { salario?: number; salario_id?: string }

export function Equipe() {
  const { perm } = useSessao()
  const funcionarios = useLista('funcionarios').sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome))
  const salarios = useLista('funcionarios_salario')
  const perfis = useLista('perfis')
  const [editando, setEditando] = useState<Form | null>(null)

  return (
    <>
      <CadastrosAbas />
      <Cabecalho titulo="Equipe" subtitulo={perm.verSalarios ? `Folha mensal: ${brl(salarios.reduce((s, x) => s + x.salario, 0))}` : 'Mecânicos e funcionários'}
        acoes={<button className="btn-primario" onClick={() => setEditando({ ativo: true, funcao: 'Mecânico', especialidades: [] })}><Plus size={18} /> Novo</button>} />
      {funcionarios.length === 0 ? <Vazio texto="Nenhum funcionário." /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {funcionarios.map((f) => {
            const sal = salarios.find((s) => s.funcionario_id === f.id)
            const perfil = perfis.find((p) => p.funcionario_id === f.id)
            return (
              <button key={f.id} onClick={() => setEditando({ ...f, salario: sal?.salario, salario_id: sal?.id })} className={`card text-left hover:border-brand/50 ${f.ativo ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <HardHat className="text-brand" size={20} />
                    <span className="font-semibold text-forte">{f.nome}</span>
                  </div>
                  {!f.ativo && <span className="chip bg-zinc-500/10 text-cinza ring-zinc-500/30">Inativo</span>}
                </div>
                <div className="mt-1 text-xs text-cinza">{f.funcao}{f.admissao ? ` · desde ${data(f.admissao)}` : ''}</div>
                {!!f.especialidades?.length && <div className="mt-2 flex flex-wrap gap-1">{f.especialidades.map((e) => <span key={e} className="chip bg-brand/10 text-brand ring-brand/30">{e}</span>)}</div>}
                <div className="mt-2 flex items-center justify-between border-t border-borda pt-2 text-xs text-cinza">
                  <span className="inline-flex items-center gap-1">{perfil ? <><UserCheck size={13} /> acesso: {PAPEIS[perfil.papel]}</> : 'sem acesso ao sistema'}</span>
                  {perm.verSalarios && sal && <span className="font-semibold text-forte">{brl(sal.salario)}</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
      {editando && <FuncionarioModal f={editando} verSalario={perm.verSalarios} onFechar={() => setEditando(null)} />}
    </>
  )
}

function FuncionarioModal({ f: inicial, verSalario, onFechar }: { f: Form; verSalario: boolean; onFechar: () => void }) {
  const [f, setF] = useState(inicial)
  const [erro, setErro] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.nome?.trim()) return setErro('Informe o nome.')
    if (f.cpf && !validarCPF(f.cpf)) return setErro('CPF inválido.')
    const { salario, salario_id, ...dados } = f
    const id = dados.id ?? crypto.randomUUID()
    const ops: Operacao[] = [{ tabela: 'funcionarios', dados: { ...dados, id } }]
    if (verSalario && salario !== inicial.salario) ops.push({ tabela: 'funcionarios_salario', dados: { id: salario_id, funcionario_id: id, salario: salario ?? 0 } })
    await gravarVarios(ops)
    onFechar()
  }

  const esp = f.especialidades ?? []
  return (
    <Modal aberto titulo={f.id ? f.nome ?? 'Funcionário' : 'Novo funcionário'} onFechar={onFechar}>
      <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
        <Campo rotulo="Nome" className="col-span-2"><input className="input" value={f.nome ?? ''} onChange={(e) => set('nome', e.target.value)} /></Campo>
        <Campo rotulo="CPF"><input className="input" inputMode="numeric" value={f.cpf ?? ''} onChange={(e) => set('cpf', mascaraDocumento(e.target.value).slice(0, 14))} /></Campo>
        <Campo rotulo="Telefone"><input className="input" inputMode="tel" value={f.telefone ?? ''} onChange={(e) => set('telefone', mascaraTelefone(e.target.value))} /></Campo>
        <Campo rotulo="Função"><input className="input" value={f.funcao ?? ''} onChange={(e) => set('funcao', e.target.value)} /></Campo>
        <Campo rotulo="Admissão"><input className="input" type="date" value={f.admissao?.slice(0, 10) ?? ''} onChange={(e) => set('admissao', e.target.value || undefined)} /></Campo>
        <div className="col-span-2">
          <span className="label">Especialidades</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIAS_SERVICO.filter((c) => c !== 'Outros').map((c) => (
              <button type="button" key={c} onClick={() => set('especialidades', esp.includes(c) ? esp.filter((x) => x !== c) : [...esp, c])}
                className={`min-h-9 rounded-full px-3 text-xs font-semibold ${esp.includes(c) ? 'bg-brand text-black' : 'border border-borda text-prata'}`}>{c}</button>
            ))}
          </div>
        </div>
        {verSalario && (
          <Campo rotulo="Salário fixo mensal (só o Dono vê)"><input className="input" type="number" step="0.01" value={f.salario ?? ''} onChange={(e) => set('salario', e.target.value ? Number(e.target.value) : undefined)} /></Campo>
        )}
        <Campo rotulo="Situação">
          <select className="input" value={f.ativo ? '1' : '0'} onChange={(e) => set('ativo', e.target.value === '1')}>
            <option value="1">Ativo</option>
            <option value="0">Inativo</option>
          </select>
        </Campo>
        <p className="col-span-2 text-xs text-cinza">O acesso ao sistema (usuário e perfil) é liberado pelo Dono em Configurações.</p>
        {erro && <div className="col-span-2"><Aviso tipo="erro">{erro}</Aviso></div>}
        <button className="btn-primario col-span-2 mt-1">Salvar</button>
      </form>
    </Modal>
  )
}
