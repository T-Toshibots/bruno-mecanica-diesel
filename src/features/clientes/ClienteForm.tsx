import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, Plus, Save, Search, Trash2 } from 'lucide-react'
import { db } from '../../db/banco'
import { useLista } from '../../db/consultas'
import { clienteSchema, primeiroErro } from '../../domain/schemas'
import type { Cliente, PapelContato } from '../../domain/tipos'
import { brl, CONDICOES, FORMAS_PAGAMENTO, mascaraDocumento, mascaraTelefone, MODALIDADES, PAPEIS_CONTATO } from '../../lib/format'
import { buscarCEP, buscarCNPJ, ErroConsulta } from '../../services/consultas-externas'
import { gravarVarios, type Operacao } from '../../sync/motor'
import { Aviso, Cabecalho, Campo, Secao } from '../../components/ui'

type Form = Omit<Cliente, 'id' | 'created_at' | 'updated_at' | 'version'> & { id?: string }
interface ContatoForm { id?: string; nome: string; papel: PapelContato; telefone?: string; email?: string }
interface PrecoServForm { id?: string; servico_id: string; valor?: number }
interface PrecoGeralForm { id?: string; valor_hora?: number; deslocamento_fixo?: number; valor_km?: number }

const NOVO: Form = {
  tipo: 'PJ', nome: '', documento: '', telefone: '', modalidade: 'frotista', forma_pagamento: 'boleto',
  condicao: '30d', exige_pedido: false, ativo: true,
}

export function ClienteForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const catalogo = useLista('servicos_catalogo').sort((a, b) => a.descricao.localeCompare(b.descricao))
  const [c, setC] = useState<Form>(NOVO)
  const [contatos, setContatos] = useState<ContatoForm[]>([])
  const [geral, setGeral] = useState<PrecoGeralForm>({})
  const [precos, setPrecos] = useState<PrecoServForm[]>([])
  const [originais, setOriginais] = useState<{ contatos: string[]; precos: string[] }>({ contatos: [], precos: [] })
  const [erro, setErro] = useState('')
  const [consulta, setConsulta] = useState<{ tipo: '' | 'cnpj' | 'cep'; msg: string }>({ tipo: '', msg: '' })

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const cli = await db.t('clientes').get(id)
      if (cli) setC(cli)
      const cts = (await db.t('cliente_contatos').where('cliente_id').equals(id).toArray()).filter((x) => !x.deleted_at)
      const prs = (await db.t('cliente_precos').where('cliente_id').equals(id).toArray()).filter((x) => !x.deleted_at)
      setContatos(cts.map(({ id, nome, papel, telefone, email }) => ({ id, nome, papel, telefone, email })))
      const g = prs.find((p) => !p.servico_id)
      if (g) setGeral({ id: g.id, valor_hora: g.valor_hora, deslocamento_fixo: g.deslocamento_fixo, valor_km: g.valor_km })
      setPrecos(prs.filter((p) => p.servico_id).map((p) => ({ id: p.id, servico_id: p.servico_id!, valor: p.valor })))
      setOriginais({ contatos: cts.map((x) => x.id), precos: prs.filter((p) => p.servico_id).map((p) => p.id) })
    })()
  }, [id])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setC((p) => ({ ...p, [k]: v }))
  const num = (v: string) => (v === '' ? undefined : Number(v))

  const consultarCNPJ = async () => {
    setConsulta({ tipo: 'cnpj', msg: '' })
    try {
      const d = await buscarCNPJ(c.documento)
      setC((p) => ({
        ...p, nome: d.nome || p.nome, fantasia: d.fantasia ?? p.fantasia, cep: d.cep ?? p.cep, endereco: d.endereco ?? p.endereco,
        cidade: d.cidade ?? p.cidade, uf: d.uf ?? p.uf, telefone: p.telefone || d.telefone || '', email: p.email || d.email,
      }))
      setConsulta({ tipo: '', msg: 'Dados preenchidos pela Receita Federal. Confira antes de salvar.' })
    } catch (e) {
      setConsulta({ tipo: '', msg: e instanceof ErroConsulta ? e.message : 'Falha na consulta.' })
    }
  }

  const consultarCEP = async () => {
    setConsulta({ tipo: 'cep', msg: '' })
    try {
      const d = await buscarCEP(c.cep ?? '')
      setC((p) => ({ ...p, ...d }))
      setConsulta({ tipo: '', msg: '' })
    } catch (e) {
      setConsulta({ tipo: '', msg: e instanceof ErroConsulta ? e.message : 'Falha na consulta.' })
    }
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    const msg = primeiroErro(clienteSchema.safeParse(c))
    if (msg) return setErro(msg)
    const docNovo = c.documento.replace(/\D/g, '')
    const duplicado = (await db.t('clientes').toArray()).find((x) => !x.deleted_at && x.id !== c.id && x.documento.replace(/\D/g, '') === docNovo)
    if (duplicado) return setErro(`Já existe um cliente com este CPF/CNPJ: ${duplicado.fantasia || duplicado.nome}.`)

    const clienteId = c.id ?? crypto.randomUUID()
    const agora = new Date().toISOString()
    const ops: Operacao[] = [{ tabela: 'clientes', dados: { ...c, id: clienteId } }]

    const contatosValidos = contatos.filter((x) => x.nome.trim())
    for (const old of originais.contatos) if (!contatosValidos.some((x) => x.id === old)) ops.push({ tabela: 'cliente_contatos', dados: { id: old, deleted_at: agora } })
    for (const ct of contatosValidos) ops.push({ tabela: 'cliente_contatos', dados: { ...ct, cliente_id: clienteId } })

    const temGeral = geral.valor_hora != null || geral.deslocamento_fixo != null || geral.valor_km != null
    if (temGeral || geral.id) ops.push({ tabela: 'cliente_precos', dados: { ...geral, id: geral.id, cliente_id: clienteId, servico_id: null, ...(temGeral ? {} : { deleted_at: agora }) } })
    const precosValidos = precos.filter((p) => p.servico_id && p.valor != null)
    for (const old of originais.precos) if (!precosValidos.some((p) => p.id === old)) ops.push({ tabela: 'cliente_precos', dados: { id: old, deleted_at: agora } })
    for (const p of precosValidos) ops.push({ tabela: 'cliente_precos', dados: { ...p, cliente_id: clienteId } })

    await gravarVarios(ops)
    navigate(`/clientes/${clienteId}`, { replace: true })
  }

  return (
    <form onSubmit={salvar}>
      <Cabecalho titulo={id ? 'Editar cliente' : 'Novo cliente'} acoes={<button className="btn-primario"><Save size={18} /> Salvar</button>} />
      {consulta.msg && <div className="mb-4"><Aviso tipo={consulta.msg.startsWith('Dados') ? 'info' : 'alerta'}>{consulta.msg}</Aviso></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Identificação">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Tipo">
              <select className="input" value={c.tipo} onChange={(e) => set('tipo', e.target.value as Form['tipo'])}>
                <option value="PJ">Pessoa jurídica (empresa)</option>
                <option value="PF">Pessoa física (autônomo)</option>
              </select>
            </Campo>
            <Campo rotulo={c.tipo === 'PJ' ? 'CNPJ' : 'CPF'}>
              <div className="flex gap-2">
                <input className="input" inputMode="numeric" value={c.documento} onChange={(e) => set('documento', mascaraDocumento(e.target.value))} />
                {c.tipo === 'PJ' && (
                  <button type="button" onClick={consultarCNPJ} className="btn-secundario shrink-0 px-3" title="Buscar dados na Receita (precisa de internet)" aria-label="Buscar dados do CNPJ">
                    {consulta.tipo === 'cnpj' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  </button>
                )}
              </div>
            </Campo>
            <Campo rotulo={c.tipo === 'PJ' ? 'Razão social' : 'Nome completo'} className="sm:col-span-2"><input className="input" value={c.nome} onChange={(e) => set('nome', e.target.value)} /></Campo>
            {c.tipo === 'PJ' && (
              <>
                <Campo rotulo="Nome fantasia"><input className="input" value={c.fantasia ?? ''} onChange={(e) => set('fantasia', e.target.value)} /></Campo>
                <Campo rotulo="Inscrição estadual"><input className="input" value={c.ie ?? ''} onChange={(e) => set('ie', e.target.value)} /></Campo>
              </>
            )}
            <Campo rotulo="Situação">
              <select className="input" value={c.ativo ? '1' : '0'} onChange={(e) => set('ativo', e.target.value === '1')}>
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </select>
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Endereço e contato principal">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="CEP">
              <div className="flex gap-2">
                <input className="input" inputMode="numeric" value={c.cep ?? ''} onChange={(e) => set('cep', e.target.value)} onBlur={() => (c.cep ?? '').replace(/\D/g, '').length === 8 && !c.endereco && consultarCEP()} />
                <button type="button" onClick={consultarCEP} className="btn-secundario shrink-0 px-3" aria-label="Buscar endereço pelo CEP">
                  {consulta.tipo === 'cep' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </button>
              </div>
            </Campo>
            <Campo rotulo="Endereço"><input className="input" value={c.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} /></Campo>
            <Campo rotulo="Cidade"><input className="input" value={c.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} /></Campo>
            <Campo rotulo="UF"><input className="input" maxLength={2} value={c.uf ?? ''} onChange={(e) => set('uf', e.target.value.toUpperCase())} /></Campo>
            <Campo rotulo="Telefone / WhatsApp principal"><input className="input" inputMode="tel" value={c.telefone} onChange={(e) => set('telefone', mascaraTelefone(e.target.value))} /></Campo>
            <Campo rotulo="E-mail principal"><input className="input" type="email" value={c.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Campo>
          </div>
        </Secao>

        <Secao titulo="Contatos" acoes={<button type="button" className="btn-secundario" onClick={() => setContatos([...contatos, { nome: '', papel: contatos.some((x) => x.papel === 'frota') ? 'financeiro' : 'frota' }])}><Plus size={16} /> Contato</button>}>
          {contatos.length === 0 ? <p className="text-sm text-cinza">Adicione o responsável de frota, o financeiro e outros contatos.</p> : (
            <div className="space-y-3">
              {contatos.map((ct, i) => {
                const alt = (p: Partial<ContatoForm>) => setContatos(contatos.map((x, j) => (j === i ? { ...x, ...p } : x)))
                return (
                  <div key={ct.id ?? i} className="grid grid-cols-2 gap-2 rounded-lg border border-borda bg-painel p-2">
                    <input className="input" placeholder="Nome" value={ct.nome} onChange={(e) => alt({ nome: e.target.value })} />
                    <select className="input" value={ct.papel} onChange={(e) => alt({ papel: e.target.value as PapelContato })}>
                      {Object.entries(PAPEIS_CONTATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input className="input" placeholder="Telefone / WhatsApp" inputMode="tel" value={ct.telefone ?? ''} onChange={(e) => alt({ telefone: mascaraTelefone(e.target.value) })} />
                    <div className="flex gap-2">
                      <input className="input" placeholder="E-mail" type="email" value={ct.email ?? ''} onChange={(e) => alt({ email: e.target.value })} />
                      <button type="button" onClick={() => setContatos(contatos.filter((_, j) => j !== i))} className="flex h-11 w-11 shrink-0 items-center justify-center text-cinza hover:text-red-500" aria-label="Remover contato"><Trash2 size={16} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Secao>

        <Secao titulo="Comercial e faturamento">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Modalidade" className="sm:col-span-2">
              <select className="input" value={c.modalidade} onChange={(e) => set('modalidade', e.target.value as Form['modalidade'])}>
                {Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Forma de pagamento">
              <select className="input" value={c.forma_pagamento} onChange={(e) => set('forma_pagamento', e.target.value as Form['forma_pagamento'])}>
                {Object.entries(FORMAS_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Condição de pagamento">
              <select className="input" value={c.condicao} onChange={(e) => set('condicao', e.target.value as Form['condicao'])}>
                {Object.entries(CONDICOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            {c.condicao === 'mensal' && (
              <Campo rotulo="Dia de fechamento / vencimento"><input className="input" type="number" min={1} max={28} value={c.dia_fechamento ?? ''} onChange={(e) => set('dia_fechamento', num(e.target.value))} /></Campo>
            )}
            {c.modalidade === 'contrato' && (
              <Campo rotulo="Valor do contrato mensal (R$)"><input className="input" type="number" step="0.01" value={c.valor_contrato ?? ''} onChange={(e) => set('valor_contrato', num(e.target.value))} /></Campo>
            )}
            <Campo rotulo="Limite de crédito (R$)"><input className="input" type="number" step="0.01" value={c.limite_credito ?? ''} onChange={(e) => set('limite_credito', num(e.target.value))} /></Campo>
            <Campo rotulo="Desconto padrão (%)"><input className="input" type="number" step="0.5" value={c.desconto_padrao ?? ''} onChange={(e) => set('desconto_padrao', num(e.target.value))} /></Campo>
            <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
              <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={c.exige_pedido} onChange={(e) => set('exige_pedido', e.target.checked)} />
              <span className="text-sm text-prata">Exige número de pedido/autorização para faturar</span>
            </label>
          </div>
        </Secao>

        <div className="lg:col-span-2">
          <Secao titulo="Tabela de preços do cliente">
            <p className="mb-3 text-xs text-cinza">Deixe em branco para usar o preço padrão da oficina/catálogo. Estes valores são aplicados automaticamente nas OS deste cliente.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Hora técnica (R$)"><input className="input" type="number" step="0.01" value={geral.valor_hora ?? ''} onChange={(e) => setGeral({ ...geral, valor_hora: num(e.target.value) })} /></Campo>
              <Campo rotulo="Deslocamento fixo (R$)"><input className="input" type="number" step="0.01" value={geral.deslocamento_fixo ?? ''} onChange={(e) => setGeral({ ...geral, deslocamento_fixo: num(e.target.value) })} /></Campo>
              <Campo rotulo="Ou deslocamento por km (R$)"><input className="input" type="number" step="0.01" value={geral.valor_km ?? ''} onChange={(e) => setGeral({ ...geral, valor_km: num(e.target.value) })} /></Campo>
            </div>
            <div className="mt-4 space-y-2">
              <span className="label">Preço por serviço</span>
              {precos.map((p, i) => {
                const padrao = catalogo.find((s) => s.id === p.servico_id)?.valor
                return (
                  <div key={p.id ?? i} className="grid grid-cols-[1fr_8rem_auto] gap-2">
                    <select className="input" value={p.servico_id} onChange={(e) => setPrecos(precos.map((x, j) => (j === i ? { ...x, servico_id: e.target.value } : x)))}>
                      <option value="">Selecione o serviço…</option>
                      {catalogo.map((s) => <option key={s.id} value={s.id}>{s.descricao}</option>)}
                    </select>
                    <input className="input text-right" type="number" step="0.01" placeholder={padrao != null ? brl(padrao) : 'R$'} title={padrao != null ? `Padrão: ${brl(padrao)}` : undefined}
                      value={p.valor ?? ''} onChange={(e) => setPrecos(precos.map((x, j) => (j === i ? { ...x, valor: num(e.target.value) } : x)))} />
                    <button type="button" onClick={() => setPrecos(precos.filter((_, j) => j !== i))} className="flex h-11 w-11 items-center justify-center text-cinza hover:text-red-500" aria-label="Remover preço"><Trash2 size={16} /></button>
                  </div>
                )
              })}
              <button type="button" className="btn-secundario" onClick={() => setPrecos([...precos, { servico_id: '' }])}><Plus size={16} /> Preço de serviço</button>
            </div>
          </Secao>
        </div>

        <div className="lg:col-span-2">
          <Secao titulo="Observações">
            <textarea className="input min-h-24" value={c.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} placeholder="Horário de recebimento, regras de faturamento, particularidades da frota…" />
          </Secao>
        </div>
      </div>
      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}
      <div className="mt-4 flex justify-end"><button className="btn-primario w-full sm:w-auto"><Save size={18} /> Salvar cliente</button></div>
    </form>
  )
}
