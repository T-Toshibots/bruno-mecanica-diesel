import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Plus, Save, Trash2, X } from 'lucide-react'
import { useSessao } from '../../app/sessao'
import { db } from '../../db/banco'
import { nomeCliente, useLista, useOSCompleta } from '../../db/consultas'
import { totaisOS } from '../../domain/calculos'
import { precoServico, valorDeslocamento, valorHora } from '../../domain/precos'
import { osSchema, primeiroErro, veiculoSchema } from '../../domain/schemas'
import type { OrdemServico, TipoItem, TipoVeiculo, Veiculo } from '../../domain/tipos'
import { brl, FORMAS_PAGAMENTO, LOCAIS, mascaraPlaca, numeroOS, TIPOS_ITEM, TIPOS_OS, TIPOS_VEICULO } from '../../lib/format'
import { comprimirImagem } from '../../lib/imagem'
import { gravarVarios, proximoNumeroProvisorio, type Operacao } from '../../sync/motor'
import { Assinatura } from '../../components/Assinatura'
import { Aviso, Cabecalho, Campo, Secao } from '../../components/ui'

interface ItemForm { id?: string; tipo: TipoItem; descricao: string; qtd: number; preco: number; custo: number }
interface FotoForm { id?: string; imagem: string; legenda?: string }
type Cab = Pick<OrdemServico, 'cliente_id' | 'local' | 'tipo' | 'relato' | 'diagnostico' | 'desconto_pct' | 'forma_pagamento'> &
  Partial<Pick<OrdemServico, 'solicitante' | 'pedido_numero'>>

const CAB_INICIAL: Cab = { cliente_id: '', local: 'oficina', tipo: 'corretiva', relato: '', diagnostico: '', desconto_pct: 0, forma_pagamento: 'pix' }

export function OSForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { sessao, perm } = useSessao()
  const existente = useOSCompleta(id)
  const clientes = useLista('clientes').filter((c) => c.ativo).sort((a, b) => nomeCliente(a).localeCompare(nomeCliente(b)))
  const funcionarios = useLista('funcionarios').filter((f) => f.ativo)
  const catalogo = useLista('servicos_catalogo')
  const precos = useLista('cliente_precos')
  const oficina = useLiveQuery(() => db.t('oficina_config').get('oficina'), [])

  const [cab, setCab] = useState<Cab>(CAB_INICIAL)
  const [veiculoId, setVeiculoId] = useState('')
  const [km, setKm] = useState<number | undefined>()
  const [novoVeiculo, setNovoVeiculo] = useState<Partial<Veiculo> | null>(null)
  const [mecanicos, setMecanicos] = useState<string[]>(sessao.funcionario_id ? [sessao.funcionario_id] : [])
  const [itens, setItens] = useState<ItemForm[]>([{ tipo: 'mao_obra', descricao: '', qtd: 1, preco: 0, custo: 0 }])
  const [fotos, setFotos] = useState<FotoForm[]>([])
  const [assinatura, setAssinatura] = useState<{ id?: string; nome: string; imagem?: string }>({ nome: '' })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const carregado = useRef(false)

  const fotosExist = useLiveQuery(() => (id ? db.t('os_fotos').where('os_id').equals(id).toArray() : []), [id], [])
  const assinaturasExist = useLiveQuery(() => (id ? db.t('os_assinaturas').where('os_id').equals(id).toArray() : []), [id], [])
  const veiculos = useLiveQuery(
    async () => (cab.cliente_id ? (await db.t('veiculos').where('cliente_id').equals(cab.cliente_id).toArray()).filter((v) => !v.deleted_at) : []),
    [cab.cliente_id], [],
  )

  // Carrega a OS existente uma única vez (edições posteriores não sobrescrevem o formulário).
  useEffect(() => {
    if (!id || !existente || carregado.current) return
    carregado.current = true
    setCab({
      cliente_id: existente.cliente_id, local: existente.local, tipo: existente.tipo, relato: existente.relato,
      diagnostico: existente.diagnostico, desconto_pct: existente.desconto_pct, forma_pagamento: existente.forma_pagamento,
      solicitante: existente.solicitante, pedido_numero: existente.pedido_numero,
    })
    setVeiculoId(existente.osVeiculos[0]?.veiculo_id ?? '')
    setKm(existente.osVeiculos[0]?.km)
    setMecanicos(existente.mecanicos.map((m) => m.id))
    setItens(existente.itens.map(({ id, tipo, descricao, qtd, preco, custo }) => ({ id, tipo, descricao, qtd, preco, custo })))
  }, [id, existente])

  useEffect(() => {
    if (!id) return
    setFotos(fotosExist.filter((f) => !f.deleted_at).map(({ id, imagem, legenda }) => ({ id, imagem, legenda })))
    const a = assinaturasExist.find((x) => x.papel === 'cliente' && !x.deleted_at)
    if (a) setAssinatura({ id: a.id, nome: a.nome, imagem: a.imagem })
  }, [id, fotosExist, assinaturasExist])

  useEffect(() => {
    const cli = params.get('cliente')
    if (!id && cli) escolherCliente(cli)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (id && existente === null) return <Aviso tipo="erro">OS não encontrada ou sem permissão.</Aviso>
  if (existente?.travada && sessao.papel !== 'dono') return <Aviso tipo="alerta">Esta OS está finalizada e travada. Só o Dono pode reabrir.</Aviso>

  const set = <K extends keyof Cab>(k: K, v: Cab[K]) => setCab((p) => ({ ...p, [k]: v }))
  const clienteSel = clientes.find((c) => c.id === cab.cliente_id)

  function escolherCliente(cid: string) {
    db.t('clientes').get(cid).then((c) => {
      setCab((p) => ({ ...p, cliente_id: cid, forma_pagamento: c?.forma_pagamento ?? p.forma_pagamento, desconto_pct: c?.desconto_padrao ?? 0 }))
    })
    setVeiculoId('')
    setNovoVeiculo(null)
  }

  const totais = totaisOS(itens, cab.desconto_pct)
  const padrao = { valor_hora: oficina?.valor_hora ?? 0, deslocamento_fixo: oficina?.deslocamento_fixo ?? 0, valor_km: oficina?.valor_km ?? 0 }
  const tabelaPropria = !!cab.cliente_id && precos.some((p) => p.cliente_id === cab.cliente_id)
  const precoDoServico = (s: { id: string; valor: number }) => precoServico(s, cab.cliente_id, precos).valor
  const adicionarItem = (item: ItemForm) => setItens((l) => [...l.filter((i) => i.descricao.trim() || i.preco), item])

  const adicionarFotos = async (arquivos: FileList | null) => {
    if (!arquivos) return
    const novas = await Promise.all([...arquivos].map((a) => comprimirImagem(a, 1600, 0.7)))
    setFotos((p) => [...p, ...novas.map((imagem) => ({ imagem }))])
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setErro('')
    const v = primeiroErro(osSchema.safeParse(cab))
    if (v) return setErro(v)
    if (novoVeiculo) {
      const ev = primeiroErro(veiculoSchema.safeParse(novoVeiculo))
      if (ev) return setErro(ev)
    }
    if (clienteSel?.exige_pedido && perm.precificar && existente && ['aprovado', 'execucao'].includes(existente.status) && !cab.pedido_numero)
      return setErro('Este cliente exige número de pedido/autorização.')

    setSalvando(true)
    const osId = existente?.id ?? crypto.randomUUID()
    const agora = new Date().toISOString()
    const ops: Operacao[] = []

    if (existente) {
      ops.push({ tabela: 'os', dados: { id: osId, ...cab } })
    } else {
      const status = perm.precificar ? 'orcamento' : 'rascunho'
      ops.push({
        tabela: 'os',
        dados: { id: osId, ...cab, numero: null, numero_provisorio: await proximoNumeroProvisorio(), status, aberta_em: agora, travada: false },
      })
      ops.push({ tabela: 'os_status_hist', dados: { os_id: osId, de: null, para: status, usuario_nome: sessao.nome, data: agora } })
    }

    // Veículo (o modelo aceita vários por OS; a tela da Fase 2 edita um)
    let vid = veiculoId
    if (novoVeiculo) {
      vid = crypto.randomUUID()
      ops.push({ tabela: 'veiculos', dados: { id: vid, cliente_id: cab.cliente_id, tipo: 'cavalo', ...novoVeiculo, km } })
    }
    const ovAtual = existente?.osVeiculos[0]
    if (ovAtual && ovAtual.veiculo_id !== vid) ops.push({ tabela: 'os_veiculos', dados: { id: ovAtual.id, deleted_at: agora } })
    if (vid) ops.push({ tabela: 'os_veiculos', dados: { id: ovAtual?.veiculo_id === vid ? ovAtual.id : undefined, os_id: osId, veiculo_id: vid, km } })

    // Mecânicos
    const mecAtuais = existente ? await db.t('os_mecanicos').where('os_id').equals(osId).filter((m) => !m.deleted_at).toArray() : []
    for (const m of mecAtuais) if (!mecanicos.includes(m.funcionario_id)) ops.push({ tabela: 'os_mecanicos', dados: { id: m.id, deleted_at: agora } })
    for (const fid of mecanicos) if (!mecAtuais.some((m) => m.funcionario_id === fid)) ops.push({ tabela: 'os_mecanicos', dados: { os_id: osId, funcionario_id: fid } })

    // Itens: cada um é um registro separado (mecânico e secretária editam partes diferentes sem conflito)
    const validos = itens.filter((i) => i.descricao.trim())
    for (const antigo of existente?.itens ?? []) if (!validos.some((i) => i.id === antigo.id)) ops.push({ tabela: 'os_itens', dados: { id: antigo.id, deleted_at: agora } })
    validos.forEach((i, ordem) => ops.push({ tabela: 'os_itens', dados: { ...i, os_id: osId, ordem, qtd: Number(i.qtd) || 0, preco: Number(i.preco) || 0, custo: Number(i.custo) || 0 } }))

    // Fotos e assinatura
    for (const f of fotosExist) if (!f.deleted_at && !fotos.some((x) => x.id === f.id)) ops.push({ tabela: 'os_fotos', dados: { id: f.id, deleted_at: agora } })
    for (const f of fotos) if (!f.id) ops.push({ tabela: 'os_fotos', dados: { os_id: osId, imagem: f.imagem, legenda: f.legenda } })
    const assAtual = assinaturasExist.find((x) => x.id === assinatura.id)
    if (assinatura.imagem && (assAtual?.imagem !== assinatura.imagem || assAtual?.nome !== assinatura.nome))
      ops.push({ tabela: 'os_assinaturas', dados: { id: assinatura.id, os_id: osId, papel: 'cliente', nome: assinatura.nome, imagem: assinatura.imagem, offline: !navigator.onLine, data: agora } })

    await gravarVarios(ops)
    navigate(`/os/${osId}`, { replace: true })
  }

  return (
    <form onSubmit={salvar}>
      <Cabecalho
        titulo={existente ? `Editar ${numeroOS(existente)}` : perm.precificar ? 'Nova OS / orçamento' : 'Abrir chamado'}
        subtitulo={existente ? undefined : 'Salva no aparelho na hora — funciona sem internet'}
        acoes={<button className="btn-primario hidden sm:inline-flex" disabled={salvando}><Save size={18} /> Salvar</button>}
      />
      {!perm.precificar && !existente && (
        <div className="mb-4"><Aviso>O chamado será completado e precificado pela secretária. Descreva o problema e registre fotos.</Aviso></div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Cliente e veículo">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Cliente" className="sm:col-span-2">
              <select className="input" value={cab.cliente_id} onChange={(e) => escolherCliente(e.target.value)} required>
                <option value="">Selecione…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{nomeCliente(c)}</option>)}
              </select>
              {perm.editarCadastros && <Link to="/clientes/novo" className="mt-1 inline-block py-1 text-xs text-brand">+ cadastrar novo cliente</Link>}
            </Campo>
            {cab.cliente_id && (
              <Campo rotulo="Veículo" className="sm:col-span-2">
                <select
                  className="input"
                  value={novoVeiculo ? 'novo' : veiculoId}
                  onChange={(e) => {
                    if (e.target.value === 'novo') { setNovoVeiculo({ placa: '', marca: '', modelo: '', tipo: 'cavalo' }); setVeiculoId('') }
                    else { setNovoVeiculo(null); setVeiculoId(e.target.value); setKm(veiculos.find((v) => v.id === e.target.value)?.km) }
                  }}
                >
                  <option value="">Sem veículo</option>
                  {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {TIPOS_VEICULO[v.tipo]} {v.marca} {v.modelo}{v.frota ? ` (frota ${v.frota})` : ''}</option>)}
                  {perm.editarCadastros && <option value="novo">+ Novo veículo…</option>}
                </select>
              </Campo>
            )}
            {novoVeiculo && (
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-brand/30 bg-brand/5 p-3 sm:col-span-2">
                <input className="input uppercase" placeholder="Placa" value={novoVeiculo.placa} onChange={(e) => setNovoVeiculo({ ...novoVeiculo, placa: mascaraPlaca(e.target.value) })} />
                <select className="input" value={novoVeiculo.tipo} onChange={(e) => setNovoVeiculo({ ...novoVeiculo, tipo: e.target.value as TipoVeiculo })}>
                  {Object.entries(TIPOS_VEICULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input className="input" placeholder="Marca" value={novoVeiculo.marca} onChange={(e) => setNovoVeiculo({ ...novoVeiculo, marca: e.target.value })} />
                <input className="input" placeholder="Modelo" value={novoVeiculo.modelo} onChange={(e) => setNovoVeiculo({ ...novoVeiculo, modelo: e.target.value })} />
              </div>
            )}
            <Campo rotulo="KM / horímetro na entrada">
              <input className="input" type="number" inputMode="numeric" value={km ?? ''} onChange={(e) => setKm(e.target.value ? Number(e.target.value) : undefined)} />
            </Campo>
            <Campo rotulo="Motorista / solicitante">
              <input className="input" value={cab.solicitante ?? ''} onChange={(e) => set('solicitante', e.target.value)} />
            </Campo>
            <Campo rotulo="Local do atendimento">
              <select className="input" value={cab.local} onChange={(e) => set('local', e.target.value as Cab['local'])}>
                {Object.entries(LOCAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Tipo">
              <select className="input" value={cab.tipo} onChange={(e) => set('tipo', e.target.value as Cab['tipo'])}>
                {Object.entries(TIPOS_OS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            {perm.verTodasOS && (
              <div className="sm:col-span-2">
                <span className="label">Mecânico(s) responsável(is)</span>
                <div className="flex flex-wrap gap-2">
                  {funcionarios.map((f) => {
                    const sel = mecanicos.includes(f.id)
                    return (
                      <button type="button" key={f.id} onClick={() => setMecanicos(sel ? mecanicos.filter((x) => x !== f.id) : [...mecanicos, f.id])}
                        className={`min-h-10 rounded-full px-4 text-sm font-semibold ${sel ? 'bg-brand text-black' : 'border border-borda bg-painel text-prata'}`}>
                        {f.nome}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Secao>

        <Secao titulo="Problema e diagnóstico">
          <div className="space-y-3">
            <Campo rotulo="Defeito relatado">
              <textarea className="input min-h-24" value={cab.relato} onChange={(e) => set('relato', e.target.value)} placeholder="O que o motorista/cliente informou…" />
            </Campo>
            <Campo rotulo="Diagnóstico / serviço executado">
              <textarea className="input min-h-24" value={cab.diagnostico} onChange={(e) => set('diagnostico', e.target.value)} placeholder="O que foi constatado e feito…" />
            </Campo>
          </div>
        </Secao>

        <div className="lg:col-span-2">
          <Secao titulo="Serviços, peças e outros itens">
            {perm.precificar && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-secundario" onClick={() => adicionarItem({ tipo: 'mao_obra', descricao: 'Hora técnica', qtd: 1, preco: valorHora(cab.cliente_id, precos, padrao).valor, custo: 0 })}><Plus size={16} /> Hora técnica</button>
                <button type="button" className="btn-secundario" onClick={() => adicionarItem({ tipo: 'deslocamento', descricao: 'Deslocamento', qtd: 1, preco: valorDeslocamento(cab.cliente_id, precos, padrao).valor, custo: 0 })}><Plus size={16} /> Deslocamento</button>
                {tabelaPropria && <span className="chip bg-brand/10 text-brand ring-brand/30">Tabela de preços do cliente aplicada</span>}
              </div>
            )}
            <ItensEditor itens={itens} onChange={setItens} catalogo={catalogo} verPreco={perm.precificar} verCusto={perm.verCusto} precoDoServico={precoDoServico} />
          </Secao>
        </div>

        <Secao titulo="Fotos">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {fotos.map((f, i) => (
              <div key={f.id ?? i} className="relative aspect-square overflow-hidden rounded-lg">
                <img src={f.imagem} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" onClick={() => setFotos(fotos.filter((_, j) => j !== i))} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white" aria-label="Remover foto"><X size={16} /></button>
              </div>
            ))}
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-borda text-xs font-semibold text-cinza hover:border-brand hover:text-brand">
              <Camera size={28} /> Foto
              <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => adicionarFotos(e.target.files)} />
            </label>
          </div>
        </Secao>

        <Secao titulo="Assinatura do cliente / motorista">
          <Campo rotulo="Nome de quem assina" className="mb-3">
            <input className="input" value={assinatura.nome} onChange={(e) => setAssinatura({ ...assinatura, nome: e.target.value })} />
          </Campo>
          <Assinatura valor={assinatura.imagem} onChange={(imagem) => setAssinatura({ ...assinatura, imagem })} />
        </Secao>

        {perm.precificar && (
          <div className="lg:col-span-2">
            <Secao titulo="Valores e pagamento">
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo rotulo="Desconto (%)">
                  <input className="input" type="number" step="0.5" inputMode="decimal" value={cab.desconto_pct || ''} onChange={(e) => set('desconto_pct', Number(e.target.value))} />
                </Campo>
                <Campo rotulo="Forma de pagamento">
                  <select className="input" value={cab.forma_pagamento} onChange={(e) => set('forma_pagamento', e.target.value as Cab['forma_pagamento'])}>
                    {Object.entries(FORMAS_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Campo>
                <Campo rotulo={clienteSel?.exige_pedido ? 'Nº do pedido (obrigatório p/ este cliente)' : 'Nº do pedido / autorização'}>
                  <input className="input" value={cab.pedido_numero ?? ''} onChange={(e) => set('pedido_numero', e.target.value)} />
                </Campo>
              </div>
              <div className="mt-4 space-y-1 rounded-lg bg-painel p-4 text-sm">
                {([['Mão de obra', totais.maoObra], ['Peças', totais.pecas], ['Terceiros', totais.terceiros], ['Deslocamento / socorro', totais.deslocamento]] as const)
                  .filter(([, v]) => v > 0).map(([l, v]) => <div key={l} className="flex justify-between"><span className="text-cinza">{l}</span><span>{brl(v)}</span></div>)}
                {totais.desconto > 0 && <div className="flex justify-between texto-ok"><span>Desconto</span><span>− {brl(totais.desconto)}</span></div>}
                <div className="flex justify-between border-t border-borda pt-2 font-titulo text-2xl font-bold text-brand"><span>Total</span><span>{brl(totais.total)}</span></div>
                {perm.verMargem && <div className="flex justify-between text-xs text-cinza"><span>Custo {brl(totais.custo)}</span><span>Margem {brl(totais.margem)}</span></div>}
              </div>
            </Secao>
          </div>
        )}
      </div>

      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}
      <div className="sticky bottom-20 z-20 mt-4 lg:static">
        <button className="btn-primario w-full py-4 text-base shadow-lg shadow-black/40" disabled={salvando}>
          <Save size={20} /> {perm.precificar ? `Salvar · ${brl(totais.total)}` : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

function ItensEditor({ itens, onChange, catalogo, verPreco, verCusto, precoDoServico }: {
  itens: ItemForm[]; onChange: (v: ItemForm[]) => void; catalogo: { id: string; descricao: string; valor: number }[]; verPreco: boolean; verCusto: boolean
  precoDoServico: (s: { id: string; valor: number }) => number
}) {
  const alterar = (i: number, campo: keyof ItemForm, valor: string) => {
    const novo = [...itens]
    if (campo === 'descricao') {
      novo[i] = { ...novo[i], descricao: valor }
      const cat = catalogo.find((s) => s.descricao === valor)
      if (cat && verPreco && !novo[i].preco) novo[i].preco = precoDoServico(cat)
    } else if (campo === 'tipo') {
      novo[i] = { ...novo[i], tipo: valor as TipoItem }
    } else {
      novo[i] = { ...novo[i], [campo]: Number(valor) }
    }
    onChange(novo)
  }
  // Classes completas (o Tailwind não detecta classes montadas por partes).
  const colunas = verCusto
    ? 'grid-cols-[1fr_auto] sm:grid-cols-[150px_1fr_70px_110px_110px_auto]'
    : verPreco
      ? 'grid-cols-[1fr_auto] sm:grid-cols-[150px_1fr_70px_110px_auto]'
      : 'grid-cols-[1fr_auto] sm:grid-cols-[150px_1fr_70px_auto]'

  return (
    <div className="space-y-2">
      <datalist id="catalogo-servicos">
        {catalogo.map((s) => <option key={s.id} value={s.descricao}>{verPreco ? brl(precoDoServico(s)) : ''}</option>)}
      </datalist>
      {itens.map((it, i) => (
        <div key={it.id ?? i} className={`grid gap-2 rounded-lg border border-borda bg-painel p-2 sm:border-0 sm:bg-transparent sm:p-0 ${colunas}`}>
          <select className="input col-span-2 sm:col-span-1" value={it.tipo} onChange={(e) => alterar(i, 'tipo', e.target.value)} aria-label="Tipo do item">
            {Object.entries(TIPOS_ITEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="input col-span-2 sm:col-span-1" list={it.tipo === 'mao_obra' ? 'catalogo-servicos' : undefined} placeholder="Descrição" value={it.descricao} onChange={(e) => alterar(i, 'descricao', e.target.value)} />
          <div className="col-span-2 flex gap-2 sm:contents">
            <input className="input w-20 sm:w-auto" type="number" step="0.5" inputMode="decimal" title="Quantidade / horas" placeholder="Qtd" value={it.qtd || ''} onChange={(e) => alterar(i, 'qtd', e.target.value)} />
            {verPreco && <input className="input flex-1" type="number" step="0.01" inputMode="decimal" placeholder="Preço R$" title="Preço de venda" value={it.preco || ''} onChange={(e) => alterar(i, 'preco', e.target.value)} />}
            {verCusto && <input className="input flex-1" type="number" step="0.01" inputMode="decimal" placeholder="Custo R$" title="Custo (só Dono)" value={it.custo || ''} onChange={(e) => alterar(i, 'custo', e.target.value)} />}
            <button type="button" onClick={() => onChange(itens.filter((_, j) => j !== i))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-cinza hover:text-red-500" aria-label="Remover item"><Trash2 size={18} /></button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange([...itens, { tipo: 'mao_obra', descricao: '', qtd: 1, preco: 0, custo: 0 }])} className="btn-secundario"><Plus size={16} /> Serviço</button>
          <button type="button" onClick={() => onChange([...itens, { tipo: 'peca', descricao: '', qtd: 1, preco: 0, custo: 0 }])} className="btn-secundario"><Plus size={16} /> Peça</button>
        </div>
        {verPreco && <span className="text-sm text-cinza">Subtotal <strong className="text-forte">{brl(totaisOS(itens).subtotal)}</strong></span>}
      </div>
    </div>
  )
}
