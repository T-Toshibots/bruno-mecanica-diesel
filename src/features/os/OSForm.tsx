import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ChevronDown, Crosshair, Loader2, Plus, Save, ShieldAlert, Trash2, Truck, X } from 'lucide-react'
import { useSessao } from '../../app/sessao'
import { db, getLocal, setLocal } from '../../db/banco'
import { nomeCliente, useLista, useOSCompleta, useOSCompletas, type OSCompleta } from '../../db/consultas'
import { totaisOS } from '../../domain/calculos'
import { possiveisRetornos } from '../../domain/garantia'
import { precoServico, valorDeslocamento, valorHora } from '../../domain/precos'
import { osSchema, primeiroErro, veiculoSchema } from '../../domain/schemas'
import type { MomentoFoto, OrdemServico, TipoItem, TipoVeiculo, Veiculo } from '../../domain/tipos'
import {
  brl, data, dataHora, FORMAS_PAGAMENTO, LOCAIS, mascaraPlaca, MOMENTOS_FOTO, numeroOS, TIPOS_ITEM, TIPOS_OS, TIPOS_VEICULO,
} from '../../lib/format'
import { prepararFoto } from '../../lib/imagem'
import { gravarVarios, guardarArquivo, proximoNumeroProvisorio, type Operacao } from '../../sync/motor'
import { Assinatura } from '../../components/Assinatura'
import { FotoOS } from '../../components/FotoOS'
import { Aviso, Cabecalho, Campo, Secao } from '../../components/ui'

interface ItemForm {
  id?: string
  tipo: TipoItem
  descricao: string
  qtd: number
  preco: number
  custo: number
  /** No formulário o item aponta para o veículo (veiculo_id); ao salvar vira os_veiculo_id. */
  veiculo_id?: string
  servico_id?: string
  codigo?: string
  origem?: 'oficina' | 'cliente'
  fornecedor_id?: string
  garantia_dias?: number
}
interface VeiculoOSForm { id?: string; veiculo_id: string; km?: number; horimetro?: number }
interface FotoForm { id?: string; arquivo_id?: string; miniatura?: string; imagem?: string; blob?: Blob; legenda?: string; momento: MomentoFoto }
type Cab = Pick<OrdemServico, 'cliente_id' | 'local' | 'tipo' | 'relato' | 'diagnostico' | 'desconto_pct' | 'forma_pagamento'> &
  Partial<Pick<OrdemServico, 'solicitante' | 'pedido_numero' | 'previsao_entrega' | 'endereco' | 'lat' | 'lng' | 'os_origem_id'>>

interface Rascunho {
  salvoEm: string
  cab: Cab
  veiculos: VeiculoOSForm[]
  mecanicos: string[]
  itens: ItemForm[]
  fotos: FotoForm[]
  assinatura: { id?: string; nome: string; documento?: string; imagem?: string }
}

/** Assinatura do estado do formulário, para saber se o usuário mudou algo. */
const retrato = (cab: Cab, veiculos: VeiculoOSForm[], mecanicos: string[], itens: ItemForm[], fotos: FotoForm[], assinatura: Rascunho['assinatura']) =>
  JSON.stringify({ cab, veiculos, mecanicos, itens, fotos: fotos.map((f) => [f.id, f.miniatura?.length, f.legenda, f.momento]), assinatura })

const CAB_INICIAL: Cab = { cliente_id: '', local: 'oficina', tipo: 'corretiva', relato: '', diagnostico: '', desconto_pct: 0, forma_pagamento: 'pix' }
const ITEM_VAZIO: ItemForm = { tipo: 'mao_obra', descricao: '', qtd: 1, preco: 0, custo: 0 }

/** Copia itens de outra OS (duplicar ou retorno em garantia) ligando-os aos mesmos veículos. */
function itensDe(os: OSCompleta, garantia: boolean): ItemForm[] {
  const veicPorOV = new Map(os.osVeiculos.map((v) => [v.id, v.veiculo_id]))
  return os.itens
    .filter((i) => !garantia || (i.tipo === 'mao_obra' && i.garantia_dias))
    .map((i) => ({
      tipo: i.tipo, descricao: garantia ? `${i.descricao} (garantia)` : i.descricao, qtd: i.qtd,
      preco: garantia ? 0 : i.preco, custo: garantia ? 0 : i.custo, veiculo_id: i.os_veiculo_id ? veicPorOV.get(i.os_veiculo_id) : undefined,
      servico_id: i.servico_id, codigo: i.codigo, origem: i.origem, fornecedor_id: i.fornecedor_id, garantia_dias: garantia ? undefined : i.garantia_dias,
    }))
}

export function OSForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { sessao, perm } = useSessao()
  const existente = useOSCompleta(id)
  const todas = useOSCompletas()
  const clientes = useLista('clientes').filter((c) => c.ativo).sort((a, b) => nomeCliente(a).localeCompare(nomeCliente(b)))
  const perfis = useLista('perfis')
  // Só quem executa serviço (secretária não entra na lista de mecânicos)
  const funcionarios = useLista('funcionarios').filter((f) => f.ativo && perfis.find((p) => p.funcionario_id === f.id)?.papel !== 'secretaria')
  /** Quem abre a OS já fica como responsável, exceto a secretária. */
  const mecanicoPadrao = sessao.funcionario_id && sessao.papel !== 'secretaria' ? [sessao.funcionario_id] : []
  const catalogo = useLista('servicos_catalogo')
  const precos = useLista('cliente_precos')
  const fornecedores = useLista('fornecedores').filter((f) => f.ativo)
  const oficina = useLiveQuery(() => db.t('oficina_config').get('oficina'), [])

  const [cab, setCab] = useState<Cab>(CAB_INICIAL)
  const [veiculosOS, setVeiculosOS] = useState<VeiculoOSForm[]>([])
  const [novoVeiculo, setNovoVeiculo] = useState<Partial<Veiculo> | null>(null)
  const [mecanicos, setMecanicos] = useState<string[]>(mecanicoPadrao)
  const [itens, setItens] = useState<ItemForm[]>([ITEM_VAZIO])
  const [fotos, setFotos] = useState<FotoForm[]>([])
  const [momento, setMomento] = useState<MomentoFoto>('antes')
  const [assinatura, setAssinatura] = useState<Rascunho['assinatura']>({ nome: '' })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [gps, setGps] = useState('')
  const [rascunhoDe, setRascunhoDe] = useState<string | null>(null)
  /** Muda quando o carregamento termina, para o rascunho guardar o estado inicial. */
  const [pronto, setPronto] = useState(false)
  const carregado = useRef(false)
  /** Estado logo após carregar: só salva rascunho se o usuário mudar algo. */
  const inicial = useRef<string | null>(null)
  /** Estado vazio da montagem: se nada for carregado, qualquer digitação (mesmo antes de carregar) conta como mudança. */
  const vazio = useRef(retrato(CAB_INICIAL, [], mecanicoPadrao, [ITEM_VAZIO], [], { nome: '' }))
  const chaveRascunho = `rascunho_os_${id ?? 'nova'}`

  const fotosExist = useLiveQuery(async () => (id ? (await db.t('os_fotos').where('os_id').equals(id).toArray()).filter((f) => !f.deleted_at) : []), [id], [])
  const assinaturasExist = useLiveQuery(async () => (id ? (await db.t('os_assinaturas').where('os_id').equals(id).toArray()).filter((f) => !f.deleted_at) : []), [id], [])
  const veiculosCliente = useLiveQuery(
    async () => (cab.cliente_id ? (await db.t('veiculos').where('cliente_id').equals(cab.cliente_id).toArray()).filter((v) => !v.deleted_at) : []),
    [cab.cliente_id], [],
  )

  // Preenche o formulário uma única vez: rascunho salvo → OS existente → duplicar/garantia → cliente.
  useEffect(() => {
    if (carregado.current || todas === undefined || (id && existente === undefined)) return
    carregado.current = true
    ;(async () => {
      await preencher()
      setPronto(true)
    })()
    async function preencher() {
      const r = await getLocal<Rascunho | null>(chaveRascunho, null)
      if (r && (existente ? r.salvoEm > existente.updated_at : !params.toString())) {
        setCab(r.cab); setVeiculosOS(r.veiculos); setMecanicos(r.mecanicos); setItens(r.itens); setFotos(r.fotos); setAssinatura(r.assinatura)
        setRascunhoDe(r.salvoEm)
        return
      }
      if (existente) {
        setCab({
          cliente_id: existente.cliente_id, local: existente.local, tipo: existente.tipo, relato: existente.relato, diagnostico: existente.diagnostico,
          desconto_pct: existente.desconto_pct, forma_pagamento: existente.forma_pagamento, solicitante: existente.solicitante,
          pedido_numero: existente.pedido_numero, previsao_entrega: existente.previsao_entrega, endereco: existente.endereco,
          lat: existente.lat, lng: existente.lng, os_origem_id: existente.os_origem_id,
        })
        setVeiculosOS(existente.osVeiculos.map(({ id, veiculo_id, km, horimetro }) => ({ id, veiculo_id, km, horimetro })))
        setMecanicos(existente.mecanicos.map((m) => m.id))
        const veicPorOV = new Map(existente.osVeiculos.map((v) => [v.id, v.veiculo_id]))
        setItens(existente.itens.map(({ id, tipo, descricao, qtd, preco, custo, os_veiculo_id, servico_id, codigo, origem, fornecedor_id, garantia_dias }) => ({
          id, tipo, descricao, qtd, preco, custo, veiculo_id: os_veiculo_id ? veicPorOV.get(os_veiculo_id) : undefined, servico_id, codigo, origem, fornecedor_id, garantia_dias,
        })))
        const fs = await db.t('os_fotos').where('os_id').equals(existente.id).toArray()
        setFotos(fs.filter((f) => !f.deleted_at).map(({ id, arquivo_id, miniatura, imagem, legenda, momento }) => ({ id, arquivo_id, miniatura, imagem, legenda, momento: momento ?? 'durante' })))
        const as = (await db.t('os_assinaturas').where('os_id').equals(existente.id).toArray()).find((a) => a.papel === 'cliente' && !a.deleted_at)
        if (as) setAssinatura({ id: as.id, nome: as.nome, documento: as.documento, imagem: as.imagem })
        return
      }
      const origemId = params.get('duplicar') ?? params.get('garantia')
      const origem = origemId ? todas?.find((o) => o.id === origemId) : undefined
      if (origem) {
        const garantia = params.has('garantia')
        setCab({
          ...CAB_INICIAL, cliente_id: origem.cliente_id, local: origem.local, forma_pagamento: origem.forma_pagamento,
          tipo: garantia ? 'garantia' : origem.tipo, desconto_pct: garantia ? 0 : origem.desconto_pct,
          relato: garantia ? `Retorno em garantia da ${numeroOS(origem)}: ` : origem.relato, os_origem_id: garantia ? origem.id : undefined,
        })
        setVeiculosOS(origem.osVeiculos.map(({ veiculo_id }) => ({ veiculo_id })))
        setMecanicos(origem.mecanicos.map((m) => m.id))
        const copiados = itensDe(origem, garantia)
        setItens(copiados.length ? copiados : [ITEM_VAZIO])
        return
      }
      inicial.current = vazio.current
      const cli = params.get('cliente')
      if (cli) escolherCliente(cli)
    }
  }, [todas, existente]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rascunho salvo automaticamente: nada se perde se o app fechar ou a bateria acabar.
  useEffect(() => {
    if (!pronto) return
    const atual = retrato(cab, veiculosOS, mecanicos, itens, fotos, assinatura)
    // Dados carregados (rascunho/OS/duplicação): o estado logo após carregar é o inicial.
    if (inicial.current === null) { inicial.current = atual; return }
    if (atual === inicial.current) return
    const t = setTimeout(() => {
      setLocal(chaveRascunho, { salvoEm: new Date().toISOString(), cab, veiculos: veiculosOS, mecanicos, itens, fotos, assinatura } satisfies Rascunho)
    }, 800)
    return () => clearTimeout(t)
  }, [pronto, cab, veiculosOS, mecanicos, itens, fotos, assinatura, chaveRascunho])

  const retornos = useMemo(
    () => possiveisRetornos(todas ?? [], veiculosOS.map((v) => v.veiculo_id), itens.filter((i) => i.tipo === 'mao_obra'), new Date(), id),
    [todas, veiculosOS, itens, id],
  )

  if (id && existente === null) return <Aviso tipo="erro">OS não encontrada ou sem permissão.</Aviso>
  if (existente?.travada && sessao.papel !== 'dono') return <Aviso tipo="alerta">Esta OS está finalizada e travada. Só o Dono pode reabrir.</Aviso>

  const set = <K extends keyof Cab>(k: K, v: Cab[K]) => setCab((p) => ({ ...p, [k]: v }))
  const clienteSel = clientes.find((c) => c.id === cab.cliente_id)
  const veiculoPorId = new Map(veiculosCliente.map((v) => [v.id, v]))

  function escolherCliente(cid: string) {
    db.t('clientes').get(cid).then((c) => {
      setCab((p) => ({ ...p, cliente_id: cid, forma_pagamento: c?.forma_pagamento ?? p.forma_pagamento, desconto_pct: c?.desconto_padrao ?? 0 }))
    })
    setVeiculosOS([])
    setNovoVeiculo(null)
  }

  const alternarVeiculo = (v: Veiculo) =>
    setVeiculosOS((l) => (l.some((x) => x.veiculo_id === v.id) ? l.filter((x) => x.veiculo_id !== v.id) : [...l, { veiculo_id: v.id, km: v.tipo === 'carreta' ? undefined : v.km }]))

  const totais = totaisOS(itens, cab.desconto_pct)
  const padrao = { valor_hora: oficina?.valor_hora ?? 0, deslocamento_fixo: oficina?.deslocamento_fixo ?? 0, valor_km: oficina?.valor_km ?? 0 }
  const tabelaPropria = !!cab.cliente_id && precos.some((p) => p.cliente_id === cab.cliente_id)
  const precoDoServico = (s: { id: string; valor: number }) => precoServico(s, cab.cliente_id, precos).valor
  const adicionarItem = (item: ItemForm) => setItens((l) => [...l.filter((i) => i.descricao.trim() || i.preco), item])

  const marcarComoGarantia = () => {
    const r = retornos[0]
    setCab((p) => ({ ...p, tipo: 'garantia', os_origem_id: r.osId }))
    setItens((l) => l.map((i) => (retornos.some((x) => x.servico.toLowerCase() === i.descricao.trim().toLowerCase()) ? { ...i, preco: 0 } : i)))
  }

  const capturarGPS = () => {
    if (!navigator.geolocation) return setGps('Este aparelho não informa a localização.')
    setGps('Obtendo localização…')
    navigator.geolocation.getCurrentPosition(
      (p) => { setCab((c) => ({ ...c, lat: p.coords.latitude, lng: p.coords.longitude })); setGps('') },
      () => setGps('Localização não autorizada ou indisponível.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const adicionarFotos = async (arquivos: FileList | null) => {
    if (!arquivos) return
    const novas = await Promise.all([...arquivos].map((a) => prepararFoto(a)))
    setFotos((p) => [...p, ...novas.map(({ blob, miniatura }) => ({ blob, miniatura, momento }))])
  }

  const descartarRascunho = async () => {
    await setLocal(chaveRascunho, null)
    location.reload()
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
      const status = perm.precificar ? (cab.tipo === 'garantia' ? 'aprovado' : 'orcamento') : 'rascunho'
      ops.push({ tabela: 'os', dados: { id: osId, ...cab, numero: null, numero_provisorio: await proximoNumeroProvisorio(), status, aberta_em: agora, travada: false } })
      ops.push({ tabela: 'os_status_hist', dados: { os_id: osId, de: null, para: status, motivo: cab.tipo === 'garantia' ? 'Retorno em garantia' : undefined, usuario_nome: sessao.nome, data: agora } })
    }

    // Veículos (vários por OS)
    const lista = [...veiculosOS]
    if (novoVeiculo) {
      const vid = crypto.randomUUID()
      ops.push({ tabela: 'veiculos', dados: { id: vid, cliente_id: cab.cliente_id, tipo: 'cavalo', ...novoVeiculo } })
      ops.push({ tabela: 'veiculo_clientes_hist', dados: { veiculo_id: vid, cliente_id: cab.cliente_id, de: agora } })
      lista.push({ veiculo_id: vid })
    }
    const ovPorVeiculo = new Map<string, string>()
    for (const antigo of existente?.osVeiculos ?? []) if (!lista.some((x) => x.id === antigo.id)) ops.push({ tabela: 'os_veiculos', dados: { id: antigo.id, deleted_at: agora } })
    for (const ov of lista) {
      const ovId = ov.id ?? crypto.randomUUID()
      ovPorVeiculo.set(ov.veiculo_id, ovId)
      ops.push({ tabela: 'os_veiculos', dados: { id: ovId, os_id: osId, veiculo_id: ov.veiculo_id, km: ov.km, horimetro: ov.horimetro } })
    }

    // Mecânicos
    const mecAtuais = existente ? (await db.t('os_mecanicos').where('os_id').equals(osId).toArray()).filter((m) => !m.deleted_at) : []
    for (const m of mecAtuais) if (!mecanicos.includes(m.funcionario_id)) ops.push({ tabela: 'os_mecanicos', dados: { id: m.id, deleted_at: agora } })
    for (const fid of mecanicos) if (!mecAtuais.some((m) => m.funcionario_id === fid)) ops.push({ tabela: 'os_mecanicos', dados: { os_id: osId, funcionario_id: fid } })

    // Itens (registros separados), ligados ao veículo
    const validos = itens.filter((i) => i.descricao.trim())
    for (const antigo of existente?.itens ?? []) if (!validos.some((i) => i.id === antigo.id)) ops.push({ tabela: 'os_itens', dados: { id: antigo.id, deleted_at: agora } })
    validos.forEach(({ veiculo_id, ...i }, ordem) => ops.push({
      tabela: 'os_itens',
      dados: { ...i, os_id: osId, ordem, qtd: Number(i.qtd) || 0, preco: Number(i.preco) || 0, custo: Number(i.custo) || 0, os_veiculo_id: veiculo_id ? ovPorVeiculo.get(veiculo_id) : undefined },
    }))

    // Fotos: arquivo completo vai para a fila própria; o registro leva a miniatura
    for (const f of fotosExist) if (!fotos.some((x) => x.id === f.id)) ops.push({ tabela: 'os_fotos', dados: { id: f.id, deleted_at: agora } })
    for (const f of fotos) {
      if (f.id) {
        const atual = fotosExist.find((x) => x.id === f.id)
        if (atual && (atual.legenda !== f.legenda || atual.momento !== f.momento)) ops.push({ tabela: 'os_fotos', dados: { id: f.id, legenda: f.legenda, momento: f.momento } })
        continue
      }
      const arquivoId = crypto.randomUUID()
      if (f.blob) await guardarArquivo(arquivoId, osId, f.blob)
      ops.push({ tabela: 'os_fotos', dados: { os_id: osId, arquivo_id: f.blob ? arquivoId : undefined, miniatura: f.miniatura, imagem: f.imagem, legenda: f.legenda, momento: f.momento } })
    }

    const assAtual = assinaturasExist.find((x) => x.id === assinatura.id)
    if (assinatura.imagem && (assAtual?.imagem !== assinatura.imagem || assAtual?.nome !== assinatura.nome || assAtual?.documento !== assinatura.documento))
      ops.push({ tabela: 'os_assinaturas', dados: { id: assinatura.id, os_id: osId, papel: 'cliente', nome: assinatura.nome, documento: assinatura.documento, imagem: assinatura.imagem, offline: !navigator.onLine, data: agora } })

    await gravarVarios(ops)
    await setLocal(chaveRascunho, null)
    navigate(`/os/${osId}`, { replace: true })
  }

  const titulo = existente ? `Editar ${numeroOS(existente)}` : cab.tipo === 'garantia' ? 'Retorno em garantia' : perm.precificar ? 'Nova OS / orçamento' : 'Abrir chamado'

  return (
    <form onSubmit={salvar}>
      <Cabecalho
        titulo={titulo}
        subtitulo={existente ? undefined : 'Salva no aparelho na hora — funciona sem internet'}
        acoes={<button className="btn-primario hidden sm:inline-flex" disabled={salvando}><Save size={18} /> Salvar</button>}
      />
      <div className="mb-4 space-y-2 empty:hidden">
        {rascunhoDe && (
          <Aviso>
            Rascunho recuperado ({dataHora(rascunhoDe)}).{' '}
            <button type="button" className="font-semibold text-brand underline" onClick={descartarRascunho}>Descartar rascunho</button>
          </Aviso>
        )}
        {!perm.precificar && !existente && <Aviso>O chamado será completado e precificado pela secretária. Descreva o problema e registre fotos.</Aviso>}
        {cab.os_origem_id && <Aviso>Retorno em garantia vinculado à OS original — sem cobrança por padrão.</Aviso>}
        {retornos.length > 0 && cab.tipo !== 'garantia' && (
          <Aviso tipo="alerta">
            <ShieldAlert size={16} className="mr-1 inline" />
            Possível retorno em garantia: {retornos.map((r) => `${r.servico} (${r.numero}, garantia até ${data(r.garantiaAte)})`).join('; ')}.{' '}
            {perm.precificar && <button type="button" className="font-semibold underline" onClick={marcarComoGarantia}>Marcar como retorno em garantia</button>}
          </Aviso>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Secao titulo="Cliente e veículos">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Cliente" className="sm:col-span-2">
              <select className="input" value={cab.cliente_id} onChange={(e) => escolherCliente(e.target.value)} required>
                <option value="">Selecione…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{nomeCliente(c)}</option>)}
              </select>
              {perm.editarCadastros && <Link to="/clientes/novo" className="mt-1 inline-block py-1 text-xs text-brand">+ cadastrar novo cliente</Link>}
            </Campo>

            {cab.cliente_id && (
              <div className="sm:col-span-2">
                <span className="label">Veículos atendidos (toque para marcar — ex.: cavalo + carreta)</span>
                <div className="space-y-2">
                  {veiculosCliente.map((v) => {
                    const sel = veiculosOS.find((x) => x.veiculo_id === v.id)
                    return (
                      <div key={v.id} className={`rounded-lg border p-2 ${sel ? 'border-brand bg-brand/5' : 'border-borda bg-painel'}`}>
                        <button type="button" onClick={() => alternarVeiculo(v)} className="flex min-h-10 w-full min-w-0 items-center gap-2 overflow-hidden text-left text-sm">
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${sel ? 'border-brand bg-brand text-black' : 'border-borda'}`}>{sel && '✓'}</span>
                          <Truck size={16} className="shrink-0 text-brand" />
                          <span className="shrink-0 font-semibold text-forte">{v.placa}</span>
                          <span className="min-w-0 truncate text-cinza">{TIPOS_VEICULO[v.tipo]} · {v.marca} {v.modelo}{v.frota ? ` · frota ${v.frota}` : ''}</span>
                        </button>
                        {sel && v.tipo !== 'carreta' && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <input className="input" type="number" inputMode="numeric" placeholder="KM na entrada" value={sel.km ?? ''}
                              onChange={(e) => setVeiculosOS((l) => l.map((x) => (x.veiculo_id === v.id ? { ...x, km: e.target.value ? Number(e.target.value) : undefined } : x)))} />
                            <input className="input" type="number" inputMode="numeric" placeholder="Horímetro" value={sel.horimetro ?? ''}
                              onChange={(e) => setVeiculosOS((l) => l.map((x) => (x.veiculo_id === v.id ? { ...x, horimetro: e.target.value ? Number(e.target.value) : undefined } : x)))} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {perm.editarCadastros && !novoVeiculo && (
                    <button type="button" className="btn-secundario" onClick={() => setNovoVeiculo({ placa: '', marca: '', modelo: '', tipo: 'cavalo' })}><Plus size={16} /> Novo veículo</button>
                  )}
                  {novoVeiculo && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-brand/30 bg-brand/5 p-3">
                      <input className="input uppercase" placeholder="Placa" value={novoVeiculo.placa} onChange={(e) => setNovoVeiculo({ ...novoVeiculo, placa: mascaraPlaca(e.target.value) })} />
                      <select className="input" value={novoVeiculo.tipo} onChange={(e) => setNovoVeiculo({ ...novoVeiculo, tipo: e.target.value as TipoVeiculo })}>
                        {Object.entries(TIPOS_VEICULO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                      </select>
                      <input className="input" placeholder="Marca" value={novoVeiculo.marca} onChange={(e) => setNovoVeiculo({ ...novoVeiculo, marca: e.target.value })} />
                      <input className="input" placeholder="Modelo" value={novoVeiculo.modelo} onChange={(e) => setNovoVeiculo({ ...novoVeiculo, modelo: e.target.value })} />
                      <button type="button" className="col-span-2 text-xs text-cinza underline" onClick={() => setNovoVeiculo(null)}>cancelar novo veículo</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <Campo rotulo="Motorista / solicitante"><input className="input" value={cab.solicitante ?? ''} onChange={(e) => set('solicitante', e.target.value)} /></Campo>
            <Campo rotulo="Previsão de entrega"><input className="input" type="date" value={cab.previsao_entrega?.slice(0, 10) ?? ''} onChange={(e) => set('previsao_entrega', e.target.value || undefined)} /></Campo>
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
            {cab.local !== 'oficina' && (
              <div className="sm:col-span-2">
                <span className="label">Endereço do atendimento</span>
                <div className="flex gap-2">
                  <input className="input" placeholder="Pátio, posto, rodovia km…" value={cab.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} />
                  <button type="button" onClick={capturarGPS} className="btn-secundario shrink-0 px-3" title="Usar a localização do aparelho (GPS)" aria-label="Capturar GPS"><Crosshair size={16} /></button>
                </div>
                <p className="mt-1 text-xs text-cinza">
                  {gps || (cab.lat != null ? <>GPS: {cab.lat.toFixed(5)}, {cab.lng?.toFixed(5)} · <a className="text-brand underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${cab.lat},${cab.lng}`}>ver no mapa</a></> : 'GPS opcional — pede permissão do aparelho.')}
                </p>
              </div>
            )}
            {perm.verTodasOS && (
              <div className="sm:col-span-2">
                <span className="label">Mecânico(s) responsável(is)</span>
                <div className="flex flex-wrap gap-2">
                  {funcionarios.map((f) => {
                    const sel = mecanicos.includes(f.id)
                    return (
                      <button type="button" key={f.id} onClick={() => setMecanicos(sel ? mecanicos.filter((x) => x !== f.id) : [...mecanicos, f.id])}
                        className={`min-h-10 rounded-full px-4 text-sm font-semibold ${sel ? 'bg-brand text-black' : 'border border-borda bg-painel text-prata'}`}>{f.nome}</button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Secao>

        <Secao titulo="Problema e diagnóstico">
          <div className="space-y-3">
            <Campo rotulo="Defeito relatado"><textarea className="input min-h-24" value={cab.relato} onChange={(e) => set('relato', e.target.value)} placeholder="O que o motorista/cliente informou…" /></Campo>
            <Campo rotulo="Diagnóstico / serviço executado / observações"><textarea className="input min-h-24" value={cab.diagnostico} onChange={(e) => set('diagnostico', e.target.value)} placeholder="O que foi constatado e feito…" /></Campo>
          </div>
        </Secao>

        <div className="lg:col-span-2">
          <Secao titulo="Mão de obra, peças, terceiros e deslocamento">
            {perm.precificar && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-secundario" onClick={() => adicionarItem({ ...ITEM_VAZIO, descricao: 'Hora técnica', preco: valorHora(cab.cliente_id, precos, padrao).valor })}><Plus size={16} /> Hora técnica</button>
                <button type="button" className="btn-secundario" onClick={() => adicionarItem({ ...ITEM_VAZIO, tipo: 'deslocamento', descricao: 'Deslocamento', preco: valorDeslocamento(cab.cliente_id, precos, padrao).valor })}><Plus size={16} /> Deslocamento</button>
                <button type="button" className="btn-secundario" onClick={() => adicionarItem({ ...ITEM_VAZIO, tipo: 'socorro', descricao: 'Socorro / atendimento fora de horário' })}><Plus size={16} /> Socorro</button>
                {tabelaPropria && <span className="chip bg-brand/10 text-brand ring-brand/30">Tabela de preços do cliente aplicada</span>}
              </div>
            )}
            <ItensEditor
              itens={itens} onChange={setItens} catalogo={catalogo} fornecedores={fornecedores}
              veiculos={veiculosOS.map((v) => veiculoPorId.get(v.veiculo_id)).filter((v): v is Veiculo => !!v)}
              verPreco={perm.precificar} verCusto={perm.verCusto} precoDoServico={precoDoServico}
            />
          </Secao>
        </div>

        <Secao titulo="Fotos">
          <div className="mb-3 flex gap-2">
            {(Object.keys(MOMENTOS_FOTO) as MomentoFoto[]).map((m) => (
              <button type="button" key={m} onClick={() => setMomento(m)} className={`min-h-10 flex-1 rounded-lg text-sm font-semibold ${momento === m ? 'bg-brand text-black' : 'border border-borda bg-painel text-prata'}`}>{MOMENTOS_FOTO[m]}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fotos.map((f, i) => (
              <div key={f.id ?? i} className="space-y-1">
                <div className="relative">
                  <FotoOS foto={f} className="aspect-square rounded-lg" />
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] font-semibold uppercase text-white">{MOMENTOS_FOTO[f.momento]}</span>
                  <button type="button" onClick={() => setFotos(fotos.filter((_, j) => j !== i))} className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white" aria-label="Remover foto"><X size={16} /></button>
                </div>
                <input className="input min-h-9 py-1.5 text-xs" placeholder="Legenda" value={f.legenda ?? ''} onChange={(e) => setFotos(fotos.map((x, j) => (j === i ? { ...x, legenda: e.target.value } : x)))} />
              </div>
            ))}
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-borda text-xs font-semibold text-cinza hover:border-brand hover:text-brand">
              <Camera size={28} /> Foto ({MOMENTOS_FOTO[momento].toLowerCase()})
              <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { adicionarFotos(e.target.files); e.target.value = '' }} />
            </label>
          </div>
        </Secao>

        <Secao titulo="Assinatura do cliente / motorista">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Campo rotulo="Nome"><input className="input" value={assinatura.nome} onChange={(e) => setAssinatura({ ...assinatura, nome: e.target.value })} /></Campo>
            <Campo rotulo="Documento (RG/CPF)"><input className="input" value={assinatura.documento ?? ''} onChange={(e) => setAssinatura({ ...assinatura, documento: e.target.value })} /></Campo>
          </div>
          <Assinatura valor={assinatura.imagem} onChange={(imagem) => setAssinatura({ ...assinatura, imagem })} />
          <p className="mt-2 text-xs text-cinza">A assinatura do mecânico é colhida ao finalizar a OS.</p>
        </Secao>

        {perm.precificar && (
          <div className="lg:col-span-2">
            <Secao titulo="Valores e pagamento">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo rotulo="Desconto (%)"><input className="input" type="number" step="0.5" inputMode="decimal" value={cab.desconto_pct || ''} onChange={(e) => set('desconto_pct', Number(e.target.value))} /></Campo>
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
      {/* Celular: barra fixa acima da navegação inferior (fica sempre ao alcance do polegar) */}
      <div className="h-24 lg:hidden" />
      <div className="fixed inset-x-0 bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] z-20 px-4 lg:static lg:mt-4 lg:px-0">
        <button className="btn-primario w-full py-4 text-base shadow-lg shadow-black/40" disabled={salvando}>
          {salvando ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} {perm.precificar ? `Salvar · ${brl(totais.total)}` : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

function ItensEditor({ itens, onChange, catalogo, fornecedores, veiculos, verPreco, verCusto, precoDoServico }: {
  itens: ItemForm[]
  onChange: (v: ItemForm[]) => void
  catalogo: { id: string; descricao: string; valor: number; garantia_dias?: number }[]
  fornecedores: { id: string; nome: string }[]
  veiculos: Veiculo[]
  verPreco: boolean
  verCusto: boolean
  precoDoServico: (s: { id: string; valor: number }) => number
}) {
  const [aberto, setAberto] = useState<number | null>(null)
  const alterar = (i: number, p: Partial<ItemForm>) => onChange(itens.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const alterarDescricao = (i: number, valor: string) => {
    const cat = catalogo.find((s) => s.descricao === valor)
    const it = itens[i]
    alterar(i, cat
      ? { descricao: valor, servico_id: cat.id, garantia_dias: cat.garantia_dias, preco: verPreco && !it.preco ? precoDoServico(cat) : it.preco }
      : { descricao: valor, servico_id: undefined })
  }
  const colunas = verCusto
    ? 'grid-cols-[1fr_auto] sm:grid-cols-[150px_1fr_70px_110px_110px_auto]'
    : verPreco
      ? 'grid-cols-[1fr_auto] sm:grid-cols-[150px_1fr_70px_110px_auto]'
      : 'grid-cols-[1fr_auto] sm:grid-cols-[150px_1fr_70px_auto]'
  const temDetalhes = (it: ItemForm) => it.tipo === 'peca' || it.tipo === 'terceiro' || veiculos.length > 1 || it.tipo === 'mao_obra'

  return (
    <div className="space-y-2">
      <datalist id="catalogo-servicos">
        {catalogo.map((s) => <option key={s.id} value={s.descricao}>{verPreco ? brl(precoDoServico(s)) : ''}</option>)}
      </datalist>
      {itens.map((it, i) => (
        <div key={it.id ?? i} className="rounded-lg border border-borda bg-painel p-2 sm:border-0 sm:bg-transparent sm:p-0">
          <div className={`grid gap-2 ${colunas}`}>
            <select className="input col-span-2 sm:col-span-1" value={it.tipo} onChange={(e) => alterar(i, { tipo: e.target.value as TipoItem })} aria-label="Tipo do item">
              {Object.entries(TIPOS_ITEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className="input col-span-2 sm:col-span-1" list={it.tipo === 'mao_obra' ? 'catalogo-servicos' : undefined} placeholder="Descrição" value={it.descricao} onChange={(e) => alterarDescricao(i, e.target.value)} />
            <div className="col-span-2 flex gap-2 sm:contents">
              <input className="input w-20 sm:w-auto" type="number" step="0.5" inputMode="decimal" title="Quantidade / horas" placeholder="Qtd" value={it.qtd || ''} onChange={(e) => alterar(i, { qtd: Number(e.target.value) })} />
              {verPreco && <input className="input flex-1" type="number" step="0.01" inputMode="decimal" placeholder="Preço R$" title="Preço de venda" value={it.preco || ''} onChange={(e) => alterar(i, { preco: Number(e.target.value) })} />}
              {verCusto && <input className="input flex-1" type="number" step="0.01" inputMode="decimal" placeholder="Custo R$" title="Custo (só Dono)" value={it.custo || ''} onChange={(e) => alterar(i, { custo: Number(e.target.value) })} />}
              <div className="flex shrink-0">
                {temDetalhes(it) && (
                  <button type="button" onClick={() => setAberto(aberto === i ? null : i)} className="flex h-11 w-9 items-center justify-center text-cinza hover:text-forte" aria-label="Detalhes do item">
                    <ChevronDown size={18} className={aberto === i ? 'rotate-180' : ''} />
                  </button>
                )}
                <button type="button" onClick={() => onChange(itens.filter((_, j) => j !== i))} className="flex h-11 w-9 items-center justify-center text-cinza hover:text-red-500" aria-label="Remover item"><Trash2 size={18} /></button>
              </div>
            </div>
          </div>
          {(aberto === i || (veiculos.length > 1 && !it.veiculo_id && it.descricao)) && temDetalhes(it) && (
            <div className="mt-2 grid gap-2 rounded-lg bg-card p-2 sm:grid-cols-4">
              {veiculos.length > 1 && (
                <select className="input" value={it.veiculo_id ?? ''} onChange={(e) => alterar(i, { veiculo_id: e.target.value || undefined })} aria-label="Veículo do item">
                  <option value="">Veículo: todos</option>
                  {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} ({TIPOS_VEICULO[v.tipo]})</option>)}
                </select>
              )}
              {(it.tipo === 'peca' || it.tipo === 'terceiro') && (
                <>
                  {it.tipo === 'peca' && <input className="input" placeholder="Código / referência" value={it.codigo ?? ''} onChange={(e) => alterar(i, { codigo: e.target.value })} />}
                  {it.tipo === 'peca' && (
                    <select className="input" value={it.origem ?? 'oficina'} onChange={(e) => alterar(i, { origem: e.target.value as ItemForm['origem'], ...(e.target.value === 'cliente' ? { preco: 0, custo: 0 } : {}) })} aria-label="Origem da peça">
                      <option value="oficina">Fornecida pela oficina</option>
                      <option value="cliente">Fornecida pelo cliente</option>
                    </select>
                  )}
                  {verPreco && (
                    <select className="input" value={it.fornecedor_id ?? ''} onChange={(e) => alterar(i, { fornecedor_id: e.target.value || undefined })} aria-label="Fornecedor">
                      <option value="">Fornecedor…</option>
                      {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  )}
                </>
              )}
              {it.tipo === 'mao_obra' && (
                <input className="input" type="number" placeholder="Garantia (dias)" title="Garantia em dias" value={it.garantia_dias ?? ''} onChange={(e) => alterar(i, { garantia_dias: e.target.value ? Number(e.target.value) : undefined })} />
              )}
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange([...itens, { ...ITEM_VAZIO }])} className="btn-secundario"><Plus size={16} /> Serviço</button>
          <button type="button" onClick={() => onChange([...itens, { ...ITEM_VAZIO, tipo: 'peca', origem: 'oficina' }])} className="btn-secundario"><Plus size={16} /> Peça</button>
          <button type="button" onClick={() => onChange([...itens, { ...ITEM_VAZIO, tipo: 'terceiro' }])} className="btn-secundario"><Plus size={16} /> Terceiro</button>
        </div>
        {verPreco && <span className="text-sm text-cinza">Subtotal <strong className="text-forte">{brl(totaisOS(itens).subtotal)}</strong></span>}
      </div>
    </div>
  )
}
