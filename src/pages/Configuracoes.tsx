import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Plus, RotateCcw, Save, Trash2, Upload, X } from 'lucide-react'
import { db, getConfig, setConfig } from '../data/db'
import { carregarDemo, EMPRESA_PADRAO, MECANICOS_PADRAO } from '../data/seed'
import type { Empresa, ServicoCatalogo } from '../data/types'
import { brl } from '../lib/format'
import { Cabecalho, Campo, Secao } from '../components/ui'

const TABELAS = ['clientes', 'veiculos', 'os', 'catalogo', 'config'] as const

export function Configuracoes() {
  const [empresa, setEmpresa] = useState<Empresa>(EMPRESA_PADRAO)
  const [salvo, setSalvo] = useState(false)
  const mecanicos = useLiveQuery(() => getConfig('mecanicos', MECANICOS_PADRAO), [], MECANICOS_PADRAO)
  const catalogo = useLiveQuery(() => db.catalogo.orderBy('descricao').toArray(), [], [] as ServicoCatalogo[])
  const [novoMec, setNovoMec] = useState('')
  const [novoServ, setNovoServ] = useState<ServicoCatalogo>({ descricao: '', categoria: 'Geral', valor: 0 })

  useEffect(() => {
    getConfig('empresa', EMPRESA_PADRAO).then(setEmpresa)
  }, [])

  const salvarEmpresa = async () => {
    await setConfig('empresa', empresa)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  const exportar = async () => {
    const dados: Record<string, unknown> = { versao: 1, exportadoEm: new Date().toISOString() }
    for (const t of TABELAS) dados[t] = await db.table(t).toArray()
    const blob = new Blob([JSON.stringify(dados)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `backup-bruno-mecanica-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importar = async (arquivo?: File) => {
    if (!arquivo || !confirm('Importar este backup vai substituir todos os dados deste aparelho. Continuar?')) return
    const dados = JSON.parse(await arquivo.text())
    await db.transaction('rw', TABELAS.map((t) => db.table(t)), async () => {
      for (const t of TABELAS) {
        await db.table(t).clear()
        if (Array.isArray(dados[t])) await db.table(t).bulkAdd(dados[t])
      }
    })
    location.reload()
  }

  const restaurarDemo = async () => {
    if (!confirm('Apagar os dados deste aparelho e recarregar os dados de demonstração?')) return
    await carregarDemo()
    location.reload()
  }

  return (
    <>
      <Cabecalho titulo="Configurações" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Dados da empresa" acoes={<button onClick={salvarEmpresa} className="btn-primario px-3 py-1.5 text-xs"><Save size={14} /> {salvo ? 'Salvo!' : 'Salvar'}</button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ['nome', 'Nome'], ['documento', 'CNPJ'], ['telefone', 'Telefone'], ['email', 'E-mail'],
              ['endereco', 'Endereço'], ['cidade', 'Cidade/UF'], ['pix', 'Chave Pix'],
            ] as [keyof Empresa, string][]).map(([k, r]) => (
              <Campo key={k} rotulo={r}>
                <input className="input" value={empresa[k]} onChange={(e) => setEmpresa({ ...empresa, [k]: e.target.value })} />
              </Campo>
            ))}
          </div>
          <p className="mt-2 text-xs text-cinza">Esses dados aparecem no cabeçalho da OS impressa e na mensagem de WhatsApp.</p>
        </Secao>

        <Secao titulo="Mecânicos">
          <div className="mb-3 flex flex-wrap gap-2">
            {mecanicos.map((m) => (
              <span key={m} className="chip gap-1 bg-painel py-1 text-prata ring-borda">
                {m}
                <button onClick={() => setConfig('mecanicos', mecanicos.filter((x) => x !== m))} className="text-cinza hover:text-red-400" aria-label={`Remover ${m}`}><X size={12} /></button>
              </span>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (novoMec.trim()) setConfig('mecanicos', [...mecanicos, novoMec.trim()])
              setNovoMec('')
            }}
          >
            <input className="input" placeholder="Nome do mecânico" value={novoMec} onChange={(e) => setNovoMec(e.target.value)} />
            <button className="btn-secundario"><Plus size={16} /></button>
          </form>
        </Secao>

        <div className="lg:col-span-2">
          <Secao titulo="Catálogo de serviços e preços">
            <div className="divide-y divide-borda">
              {catalogo.map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-white">{s.descricao}</div>
                    <div className="text-xs text-cinza">{s.categoria}</div>
                  </div>
                  <input
                    className="input w-28 text-right"
                    type="number"
                    step="0.01"
                    defaultValue={s.valor}
                    onBlur={(e) => db.catalogo.update(s.id!, { valor: Number(e.target.value) })}
                    aria-label={`Preço de ${s.descricao}`}
                  />
                  <button onClick={() => db.catalogo.delete(s.id!)} className="p-2 text-cinza hover:text-red-400" aria-label="Excluir"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <form
              className="mt-3 grid grid-cols-[1fr_7rem_auto] gap-2 sm:grid-cols-[1fr_10rem_7rem_auto]"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!novoServ.descricao.trim()) return
                await db.catalogo.add(novoServ)
                setNovoServ({ descricao: '', categoria: 'Geral', valor: 0 })
              }}
            >
              <input className="input" placeholder="Novo serviço" value={novoServ.descricao} onChange={(e) => setNovoServ({ ...novoServ, descricao: e.target.value })} />
              <input className="input hidden sm:block" placeholder="Categoria" value={novoServ.categoria} onChange={(e) => setNovoServ({ ...novoServ, categoria: e.target.value })} />
              <input className="input text-right" type="number" step="0.01" placeholder="R$" value={novoServ.valor || ''} onChange={(e) => setNovoServ({ ...novoServ, valor: Number(e.target.value) })} />
              <button className="btn-secundario"><Plus size={16} /></button>
            </form>
            <p className="mt-2 text-xs text-cinza">Total de {catalogo.length} itens · média {brl(catalogo.reduce((s, c) => s + c.valor, 0) / (catalogo.length || 1))}</p>
          </Secao>
        </div>

        <div className="lg:col-span-2">
          <Secao titulo="Dados e backup">
            <p className="mb-3 text-sm text-cinza">
              Nesta versão de demonstração os dados ficam salvos <strong className="text-prata">somente neste aparelho</strong> e funcionam sem internet.
              Na próxima fase, serão sincronizados com o servidor e compartilhados entre celular e computador.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={exportar} className="btn-secundario"><Download size={16} /> Exportar backup</button>
              <label className="btn-secundario cursor-pointer">
                <Upload size={16} /> Importar backup
                <input type="file" accept="application/json" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
              </label>
              <button onClick={restaurarDemo} className="btn-perigo"><RotateCcw size={16} /> Restaurar dados de demonstração</button>
            </div>
          </Secao>
        </div>
      </div>
    </>
  )
}
