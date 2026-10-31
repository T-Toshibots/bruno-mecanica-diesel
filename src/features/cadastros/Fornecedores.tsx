import { useState, type FormEvent } from 'react'
import { MessageCircle, Package, Plus, Search, Trash2 } from 'lucide-react'
import { useLista } from '../../db/consultas'
import { validarCNPJ, validarCPF } from '../../domain/validacao'
import type { Fornecedor, TipoFornecedor } from '../../domain/tipos'
import { mascaraDocumento, mascaraTelefone, TIPOS_FORNECEDOR, whatsappLink } from '../../lib/format'
import { excluir, gravar } from '../../sync/motor'
import { CadastrosAbas } from '../../components/CadastrosAbas'
import { Aviso, Cabecalho, Campo, Modal, Vazio } from '../../components/ui'

type Form = Partial<Fornecedor>

export function Fornecedores() {
  const fornecedores = useLista('fornecedores').sort((a, b) => a.nome.localeCompare(b.nome))
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Form | null>(null)
  const termo = busca.trim().toLowerCase()
  const lista = fornecedores.filter((f) => !termo || [f.nome, f.cidade ?? '', TIPOS_FORNECEDOR[f.tipo], f.documento ?? ''].some((t) => t.toLowerCase().includes(termo)))

  return (
    <>
      <CadastrosAbas />
      <Cabecalho titulo="Fornecedores" subtitulo="Autopeças, retíficas, tornearias e outros" acoes={<button className="btn-primario" onClick={() => setEditando({ tipo: 'autopecas', ativo: true })}><Plus size={18} /> Novo</button>} />
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
        <input className="input pl-10" placeholder="Buscar nome, tipo, cidade ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {lista.length === 0 ? <Vazio texto="Nenhum fornecedor." /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((f) => (
            <div key={f.id} className="card flex items-start gap-3">
              <Package className="mt-0.5 shrink-0 text-brand" size={20} />
              <button onClick={() => setEditando(f)} className="min-w-0 flex-1 text-left">
                <div className="truncate font-semibold text-forte">{f.nome}</div>
                <div className="text-xs text-cinza">{TIPOS_FORNECEDOR[f.tipo]}{f.cidade ? ` · ${f.cidade}` : ''}</div>
                {f.contato && <div className="text-xs text-prata">{f.contato}</div>}
              </button>
              {f.telefone && (
                <a href={whatsappLink(f.telefone, 'Olá, aqui é da oficina.')} target="_blank" rel="noreferrer" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-cinza hover:text-brand" aria-label="WhatsApp"><MessageCircle size={18} /></a>
              )}
            </div>
          ))}
        </div>
      )}
      {editando && <FornecedorModal f={editando} onFechar={() => setEditando(null)} />}
    </>
  )
}

function FornecedorModal({ f: inicial, onFechar }: { f: Form; onFechar: () => void }) {
  const [f, setF] = useState(inicial)
  const [erro, setErro] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.nome?.trim()) return setErro('Informe o nome.')
    const d = (f.documento ?? '').replace(/\D/g, '')
    if (d && !(d.length === 11 ? validarCPF(d) : validarCNPJ(d))) return setErro('CPF/CNPJ inválido.')
    await gravar('fornecedores', f)
    onFechar()
  }

  return (
    <Modal aberto titulo={f.id ? f.nome ?? 'Fornecedor' : 'Novo fornecedor'} onFechar={onFechar}>
      <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
        <Campo rotulo="Nome" className="col-span-2"><input className="input" value={f.nome ?? ''} onChange={(e) => set('nome', e.target.value)} /></Campo>
        <Campo rotulo="Tipo">
          <select className="input" value={f.tipo} onChange={(e) => set('tipo', e.target.value as TipoFornecedor)}>
            {Object.entries(TIPOS_FORNECEDOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo rotulo="CNPJ / CPF"><input className="input" inputMode="numeric" value={f.documento ?? ''} onChange={(e) => set('documento', mascaraDocumento(e.target.value))} /></Campo>
        <Campo rotulo="Contato"><input className="input" value={f.contato ?? ''} onChange={(e) => set('contato', e.target.value)} /></Campo>
        <Campo rotulo="Telefone / WhatsApp"><input className="input" inputMode="tel" value={f.telefone ?? ''} onChange={(e) => set('telefone', mascaraTelefone(e.target.value))} /></Campo>
        <Campo rotulo="E-mail"><input className="input" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Campo>
        <Campo rotulo="Cidade"><input className="input" value={f.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} /></Campo>
        <Campo rotulo="Observações" className="col-span-2"><textarea className="input min-h-16" value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} /></Campo>
        {erro && <div className="col-span-2"><Aviso tipo="erro">{erro}</Aviso></div>}
        <div className="col-span-2 flex gap-2">
          {f.id && <button type="button" className="btn-perigo" aria-label="Excluir" onClick={async () => { if (confirm('Excluir este fornecedor?')) { await excluir('fornecedores', f.id!); onFechar() } }}><Trash2 size={16} /></button>}
          <button className="btn-primario flex-1">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}
