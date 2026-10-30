import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { tema } from '../../config/tema'
import { db, TABELAS_SYNC } from '../../db/banco'
import { useLista } from '../../db/consultas'
import { recriarDemo } from '../../demo/seed'
import type { OficinaConfig } from '../../domain/tipos'
import { brl, dataHora, PAPEIS } from '../../lib/format'
import { excluir, gravar } from '../../sync/motor'
import { Cabecalho, Campo, Secao, Vazio } from '../../components/ui'

type DadosOficina = Omit<OficinaConfig, 'created_at' | 'updated_at' | 'version'>

export function Configuracoes() {
  const oficinaSalva = useLiveQuery(() => db.t('oficina_config').get('oficina'), [])
  const [oficina, setOficina] = useState<DadosOficina>({ id: 'oficina', ...tema.oficinaPadrao })
  const [salvo, setSalvo] = useState(false)
  const funcionarios = useLista('funcionarios')
  const salarios = useLista('funcionarios_salario')
  const perfis = useLista('perfis')
  const catalogo = useLista('servicos_catalogo').sort((a, b) => a.descricao.localeCompare(b.descricao))
  const auditoria = useLiveQuery(async () => (await db.t('auditoria').orderBy('updated_at').reverse().limit(30).toArray()), [], [])
  const [novoServ, setNovoServ] = useState({ descricao: '', categoria: 'Motor', valor: 0, garantia_dias: 90 })

  useEffect(() => { if (oficinaSalva) setOficina(oficinaSalva) }, [oficinaSalva])

  const salvarOficina = async () => {
    await gravar('oficina_config', oficina)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  const exportar = async () => {
    const dados: Record<string, unknown> = { versao: 2, exportadoEm: new Date().toISOString() }
    for (const t of TABELAS_SYNC) dados[t] = await db.table(t).toArray()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(dados)], { type: 'application/json' }))
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const restaurarDemo = async () => {
    if ((await db.outbox.count()) > 0 && !confirm('Há alterações não sincronizadas que serão perdidas. Continuar?')) return
    if (!confirm('Apagar todos os dados e recarregar os dados de demonstração?')) return
    await recriarDemo()
    location.reload()
  }

  return (
    <>
      <Cabecalho titulo="Configurações" subtitulo="Visível somente para o Dono" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Dados da oficina" acoes={<button onClick={salvarOficina} className="btn-primario"><Save size={16} /> {salvo ? 'Salvo!' : 'Salvar'}</button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {([['nome', 'Nome'], ['documento', 'CNPJ'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['endereco', 'Endereço'], ['cidade', 'Cidade/UF'], ['pix', 'Chave Pix']] as const).map(([k, r]) => (
              <Campo key={k} rotulo={r}><input className="input" value={oficina[k]} onChange={(e) => setOficina({ ...oficina, [k]: e.target.value })} /></Campo>
            ))}
            <Campo rotulo="Valor hora padrão (R$)"><input className="input" type="number" value={oficina.valor_hora} onChange={(e) => setOficina({ ...oficina, valor_hora: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Texto de garantia (sai na OS)" className="sm:col-span-2">
              <textarea className="input min-h-20" value={oficina.garantia_texto} onChange={(e) => setOficina({ ...oficina, garantia_texto: e.target.value })} />
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Usuários e acesso">
          <div className="divide-y divide-borda">
            {perfis.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-semibold text-forte">{p.nome}</div>
                  <div className="text-xs text-cinza">{PAPEIS[p.papel]}</div>
                </div>
                {p.papel !== 'dono' && (
                  <button onClick={() => gravar('perfis', { id: p.id, ativo: !p.ativo })} className={p.ativo ? 'btn-secundario' : 'btn-perigo'}>
                    {p.ativo ? 'Ativo' : 'Desativado'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-cinza">Usuário desativado perde o acesso na próxima sincronização.</p>
        </Secao>

        <Secao titulo="Equipe e salários">
          <div className="divide-y divide-borda">
            {funcionarios.map((f) => {
              const sal = salarios.find((s) => s.funcionario_id === f.id)
              return (
                <div key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-forte">{f.nome}</div>
                    <div className="truncate text-xs text-cinza">{f.funcao}{f.especialidades?.length ? ` · ${f.especialidades.join(', ')}` : ''}</div>
                  </div>
                  <input
                    className="input w-32 text-right"
                    type="number"
                    defaultValue={sal?.salario ?? ''}
                    placeholder="Salário"
                    aria-label={`Salário de ${f.nome}`}
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      if (v !== (sal?.salario ?? 0)) gravar('funcionarios_salario', { id: sal?.id, funcionario_id: f.id, salario: v })
                    }}
                  />
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-cinza">Folha mensal: {brl(salarios.reduce((s, x) => s + x.salario, 0))}. Salários ficam numa tabela que só o Dono acessa.</p>
        </Secao>

        <Secao titulo="Catálogo de serviços">
          <div className="max-h-80 divide-y divide-borda overflow-y-auto">
            {catalogo.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-forte">{s.descricao}</div>
                  <div className="text-xs text-cinza">{s.categoria}{s.garantia_dias ? ` · garantia ${s.garantia_dias} dias` : ''}</div>
                </div>
                <input className="input w-28 text-right" type="number" step="0.01" defaultValue={s.valor} aria-label={`Preço de ${s.descricao}`}
                  onBlur={(e) => Number(e.target.value) !== s.valor && gravar('servicos_catalogo', { id: s.id, valor: Number(e.target.value) })} />
                <button onClick={() => excluir('servicos_catalogo', s.id)} className="flex h-11 w-11 items-center justify-center text-cinza hover:text-red-500" aria-label="Excluir"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <form className="mt-3 grid grid-cols-[1fr_7rem_auto] gap-2" onSubmit={async (e) => {
            e.preventDefault()
            if (!novoServ.descricao.trim()) return
            await gravar('servicos_catalogo', novoServ)
            setNovoServ({ ...novoServ, descricao: '', valor: 0 })
          }}>
            <input className="input" placeholder="Novo serviço" value={novoServ.descricao} onChange={(e) => setNovoServ({ ...novoServ, descricao: e.target.value })} />
            <input className="input text-right" type="number" placeholder="R$" value={novoServ.valor || ''} onChange={(e) => setNovoServ({ ...novoServ, valor: Number(e.target.value) })} />
            <button className="btn-secundario" aria-label="Adicionar"><Plus size={16} /></button>
          </form>
        </Secao>

        <div className="lg:col-span-2">
          <Secao titulo="Auditoria (últimas alterações em OS)">
            {auditoria.length === 0 ? <Vazio texto="Nenhum registro ainda. Crie ou altere uma OS e sincronize." /> : (
              <ul className="divide-y divide-borda text-sm">
                {auditoria.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span><span className="font-semibold text-forte">{a.usuario_nome}</span> <span className="text-prata">{a.acao}</span></span>
                    <span className="text-xs text-cinza">{dataHora(a.updated_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </div>

        <div className="lg:col-span-2">
          <Secao titulo="Dados e backup">
            <div className="flex flex-wrap gap-2">
              <button onClick={exportar} className="btn-secundario"><Download size={16} /> Exportar backup (JSON)</button>
              <button onClick={restaurarDemo} className="btn-perigo"><RotateCcw size={16} /> Restaurar dados de demonstração</button>
            </div>
          </Secao>
        </div>
      </div>
    </>
  )
}
