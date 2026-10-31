import { useState, type FormEvent } from 'react'
import { Plus, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { useLista } from '../../db/consultas'
import type { ServicoCatalogo } from '../../domain/tipos'
import { brl, CATEGORIAS_SERVICO, minutosParaHoras } from '../../lib/format'
import { excluir, gravar } from '../../sync/motor'
import { CadastrosAbas } from '../../components/CadastrosAbas'
import { Aviso, Cabecalho, Campo, Modal, Vazio } from '../../components/ui'

type Form = Partial<ServicoCatalogo>

export function Servicos() {
  const servicos = useLista('servicos_catalogo').sort((a, b) => a.categoria.localeCompare(b.categoria) || a.descricao.localeCompare(b.descricao))
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [editando, setEditando] = useState<Form | null>(null)
  const termo = busca.trim().toLowerCase()
  const lista = servicos.filter((s) => (!categoria || s.categoria === categoria) && (!termo || s.descricao.toLowerCase().includes(termo)))
  const categorias = [...new Set(lista.map((s) => s.categoria))]

  return (
    <>
      <CadastrosAbas />
      <Cabecalho titulo="Catálogo de serviços" subtitulo={`${servicos.length} serviços · preço padrão (cada cliente pode ter tabela própria)`}
        acoes={<button className="btn-primario" onClick={() => setEditando({ categoria: 'Motor', valor: 0, garantia_dias: 90 })}><Plus size={18} /> Novo serviço</button>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-cinza" />
          <input className="input pl-10" placeholder="Buscar serviço" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="input sm:w-56" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {CATEGORIAS_SERVICO.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {lista.length === 0 ? <Vazio texto="Nenhum serviço." /> : (
        <div className="space-y-4">
          {categorias.map((cat) => (
            <section key={cat} className="card">
              <h2 className="titulo mb-2 text-lg text-brand">{cat}</h2>
              <div className="divide-y divide-borda">
                {lista.filter((s) => s.categoria === cat).map((s) => (
                  <button key={s.id} onClick={() => setEditando(s)} className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-forte">{s.descricao}</span>
                      <span className="inline-flex items-center gap-2 text-xs text-cinza">
                        tempo {minutosParaHoras(s.tempo_estimado_min)}
                        {!!s.garantia_dias && <span className="inline-flex items-center gap-0.5"><ShieldCheck size={12} /> {s.garantia_dias} dias</span>}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-forte">{brl(s.valor)}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {editando && <ServicoModal s={editando} onFechar={() => setEditando(null)} />}
    </>
  )
}

function ServicoModal({ s: inicial, onFechar }: { s: Form; onFechar: () => void }) {
  const [s, setS] = useState(inicial)
  const [erro, setErro] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setS((p) => ({ ...p, [k]: v }))
  const num = (v: string) => (v === '' ? undefined : Number(v))

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (!s.descricao?.trim()) return setErro('Informe a descrição.')
    await gravar('servicos_catalogo', { ...s, valor: Number(s.valor) || 0 })
    onFechar()
  }

  return (
    <Modal aberto titulo={s.id ? 'Editar serviço' : 'Novo serviço'} onFechar={onFechar}>
      <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
        <Campo rotulo="Descrição" className="col-span-2"><input className="input" value={s.descricao ?? ''} onChange={(e) => set('descricao', e.target.value)} /></Campo>
        <Campo rotulo="Categoria">
          <select className="input" value={s.categoria} onChange={(e) => set('categoria', e.target.value)}>
            {CATEGORIAS_SERVICO.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Valor padrão de mão de obra (R$)"><input className="input" type="number" step="0.01" value={s.valor ?? ''} onChange={(e) => set('valor', num(e.target.value))} /></Campo>
        <Campo rotulo="Tempo estimado (minutos)"><input className="input" type="number" value={s.tempo_estimado_min ?? ''} onChange={(e) => set('tempo_estimado_min', num(e.target.value))} /></Campo>
        <Campo rotulo="Garantia (dias)"><input className="input" type="number" value={s.garantia_dias ?? ''} onChange={(e) => set('garantia_dias', num(e.target.value))} /></Campo>
        {erro && <div className="col-span-2"><Aviso tipo="erro">{erro}</Aviso></div>}
        <div className="col-span-2 flex gap-2">
          {s.id && <button type="button" className="btn-perigo" aria-label="Excluir" onClick={async () => { if (confirm('Excluir este serviço do catálogo? As OS antigas não mudam.')) { await excluir('servicos_catalogo', s.id!); onFechar() } }}><Trash2 size={16} /></button>}
          <button className="btn-primario flex-1">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}
