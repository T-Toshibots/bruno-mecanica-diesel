import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { Download, RotateCcw, Save } from 'lucide-react'
import { tema } from '../../config/tema'
import { db, TABELAS_SYNC } from '../../db/banco'
import { useLista } from '../../db/consultas'
import { recriarDemo } from '../../demo/seed'
import type { OficinaConfig } from '../../domain/tipos'
import { dataHora, PAPEIS } from '../../lib/format'
import { gravar } from '../../sync/motor'
import { Cabecalho, Campo, Secao, Vazio } from '../../components/ui'

type DadosOficina = Omit<OficinaConfig, 'created_at' | 'updated_at' | 'version'>

export function Configuracoes() {
  const oficinaSalva = useLiveQuery(() => db.t('oficina_config').get('oficina'), [])
  const [oficina, setOficina] = useState<DadosOficina>({ id: 'oficina', ...tema.oficinaPadrao })
  const [salvo, setSalvo] = useState(false)
  const perfis = useLista('perfis')
  const auditoria = useLiveQuery(async () => (await db.t('auditoria').orderBy('updated_at').reverse().limit(30).toArray()), [], [])

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
            <Campo rotulo="Deslocamento padrão (R$)"><input className="input" type="number" value={oficina.deslocamento_fixo ?? ''} onChange={(e) => setOficina({ ...oficina, deslocamento_fixo: Number(e.target.value) })} /></Campo>
            <Campo rotulo="Deslocamento por km (R$)"><input className="input" type="number" step="0.1" value={oficina.valor_km ?? ''} onChange={(e) => setOficina({ ...oficina, valor_km: Number(e.target.value) })} /></Campo>
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

        <Secao titulo="Equipe e catálogo">
          <p className="text-sm text-prata">Mecânicos, salários e o catálogo de serviços agora ficam em <Link to="/cadastros/equipe" className="text-brand underline">Cadastros → Equipe</Link> e <Link to="/cadastros/servicos" className="text-brand underline">Cadastros → Serviços</Link>.</p>
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
