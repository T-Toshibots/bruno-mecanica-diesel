import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Plus, Save, Trash2, X } from 'lucide-react'
import { db, getConfig } from '../data/db'
import { veiculosRepo } from '../data/repos/clientes'
import { osRepo } from '../data/repos/os'
import { MECANICOS_PADRAO } from '../data/seed'
import type { Cliente, ItemOS, OrdemServico, ServicoCatalogo, Veiculo } from '../data/types'
import { brl, FORMAS_PAGAMENTO, LOCAIS, mascaraPlaca, numeroOS, somaItens, TIPOS_OS } from '../lib/format'
import { comprimirImagem } from '../lib/imagem'
import { Assinatura } from '../components/Assinatura'
import { Cabecalho, Campo, Secao } from '../components/ui'

const nova = (): OrdemServico => ({
  numero: 0, clienteId: 0, local: 'oficina', tipo: 'corretiva', mecanico: 'Bruno', relato: '', diagnostico: '',
  servicos: [{ descricao: '', qtd: 1, valor: 0 }], pecas: [], deslocamento: 0, desconto: 0, total: 0,
  formaPagamento: 'pix', status: 'aberta', abertaEm: new Date().toISOString(), fotos: [], atualizadoEm: '',
})

export function OSForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [os, setOs] = useState<OrdemServico>(nova)
  const [descontoPct, setDescontoPct] = useState(0)
  const [novoVeiculo, setNovoVeiculo] = useState<Veiculo | null>(null)
  const [proximo, setProximo] = useState(0)

  const clientes = useLiveQuery(() => db.clientes.orderBy('nome').filter((c) => c.ativo).toArray(), [], [] as Cliente[])
  const veiculos = useLiveQuery(() => (os.clienteId ? veiculosRepo.doCliente(os.clienteId) : []), [os.clienteId], [] as Veiculo[])
  const catalogo = useLiveQuery(() => db.catalogo.toArray(), [], [] as ServicoCatalogo[])
  const mecanicos = useLiveQuery(() => getConfig('mecanicos', MECANICOS_PADRAO), [], MECANICOS_PADRAO)

  useEffect(() => {
    if (id) {
      osRepo.obter(Number(id)).then((x) => {
        if (!x) return
        setOs(x)
        const sub = somaItens(x.servicos) + somaItens(x.pecas) + x.deslocamento
        setDescontoPct(sub ? Math.round((x.desconto / sub) * 1000) / 10 : 0)
      })
    } else {
      osRepo.proximoNumero().then(setProximo)
      const cli = params.get('cliente')
      if (cli) db.clientes.get(Number(cli)).then((c) => c && escolherCliente(c))
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof OrdemServico>(k: K, v: OrdemServico[K]) => setOs((p) => ({ ...p, [k]: v }))

  function escolherCliente(c?: Cliente) {
    if (!c) return set('clienteId', 0)
    setOs((p) => ({ ...p, clienteId: c.id!, veiculoId: undefined, formaPagamento: c.formaPagamento }))
    setDescontoPct(c.descontoPadrao ?? 0)
    setNovoVeiculo(null)
  }

  const subtotal = somaItens(os.servicos) + somaItens(os.pecas) + (Number(os.deslocamento) || 0)
  const desconto = Math.round(subtotal * descontoPct) / 100
  const total = subtotal - desconto

  const adicionarFotos = async (arquivos: FileList | null) => {
    if (!arquivos) return
    const novas = await Promise.all([...arquivos].map((a) => comprimirImagem(a)))
    setOs((p) => ({ ...p, fotos: [...p.fotos, ...novas] }))
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (!os.clienteId) return alert('Selecione o cliente.')
    let veiculoId = os.veiculoId
    if (novoVeiculo?.placa) veiculoId = await veiculosRepo.salvar({ ...novoVeiculo, clienteId: os.clienteId })
    const limpar = (itens: ItemOS[]) => itens.filter((i) => i.descricao.trim())
    const salvoId = await osRepo.salvar({
      ...os, veiculoId, servicos: limpar(os.servicos), pecas: limpar(os.pecas), desconto, total,
      deslocamento: Number(os.deslocamento) || 0,
    })
    navigate(`/os/${salvoId}`, { replace: true })
  }

  return (
    <form onSubmit={salvar}>
      <Cabecalho
        titulo={id ? `Editar ${numeroOS(os.numero)}` : 'Nova OS'}
        subtitulo={id ? undefined : `Será criada como ${numeroOS(proximo)} — funciona sem internet`}
        acoes={<button className="btn-primario hidden sm:inline-flex"><Save size={18} /> Salvar OS</button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Cliente e veículo">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Cliente" className="sm:col-span-2">
              <select className="input" value={os.clienteId || ''} onChange={(e) => escolherCliente(clientes.find((c) => c.id === Number(e.target.value)))} required>
                <option value="">Selecione…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.fantasia || c.nome}</option>)}
              </select>
              <Link to="/clientes/novo" className="mt-1 inline-block text-xs text-brand">+ cadastrar novo cliente</Link>
            </Campo>
            {os.clienteId > 0 && (
              <Campo rotulo="Veículo" className="sm:col-span-2">
                <select
                  className="input"
                  value={novoVeiculo ? 'novo' : os.veiculoId ?? ''}
                  onChange={(e) => {
                    if (e.target.value === 'novo') {
                      setNovoVeiculo({ clienteId: os.clienteId, placa: '', marca: '', modelo: '' })
                      set('veiculoId', undefined)
                    } else {
                      setNovoVeiculo(null)
                      const v = veiculos.find((x) => x.id === Number(e.target.value))
                      setOs((p) => ({ ...p, veiculoId: v?.id, km: v?.km ?? p.km }))
                    }
                  }}
                >
                  <option value="">Sem veículo</option>
                  {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}{v.frota ? ` (frota ${v.frota})` : ''}</option>)}
                  <option value="novo">+ Novo veículo…</option>
                </select>
              </Campo>
            )}
            {novoVeiculo && (
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-brand/30 bg-brand/5 p-3 sm:col-span-2">
                <input className="input uppercase" placeholder="Placa" value={novoVeiculo.placa} onChange={(e) => setNovoVeiculo({ ...novoVeiculo, placa: mascaraPlaca(e.target.value) })} required />
                <input className="input" placeholder="Marca" value={novoVeiculo.marca} onChange={(e) => setNovoVeiculo({ ...novoVeiculo, marca: e.target.value })} />
                <input className="input" placeholder="Modelo" value={novoVeiculo.modelo} onChange={(e) => setNovoVeiculo({ ...novoVeiculo, modelo: e.target.value })} />
              </div>
            )}
            <Campo rotulo="KM no atendimento">
              <input className="input" type="number" inputMode="numeric" value={os.km ?? ''} onChange={(e) => set('km', e.target.value ? Number(e.target.value) : undefined)} />
            </Campo>
            <Campo rotulo="Mecânico responsável">
              <select className="input" value={os.mecanico} onChange={(e) => set('mecanico', e.target.value)}>
                {mecanicos.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Local">
              <select className="input" value={os.local} onChange={(e) => set('local', e.target.value as OrdemServico['local'])}>
                {Object.entries(LOCAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Tipo de serviço">
              <select className="input" value={os.tipo} onChange={(e) => set('tipo', e.target.value as OrdemServico['tipo'])}>
                {Object.entries(TIPOS_OS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Problema e diagnóstico">
          <div className="space-y-3">
            <Campo rotulo="Relato do cliente">
              <textarea className="input min-h-20" value={os.relato} onChange={(e) => set('relato', e.target.value)} placeholder="O que o cliente informou…" required />
            </Campo>
            <Campo rotulo="Diagnóstico / serviço executado">
              <textarea className="input min-h-20" value={os.diagnostico} onChange={(e) => set('diagnostico', e.target.value)} placeholder="O que foi constatado e feito…" />
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Serviços">
          <ItensEditor itens={os.servicos} onChange={(v) => set('servicos', v)} sugestoes={catalogo} rotuloQtd="Qtd/h" />
        </Secao>

        <Secao titulo="Peças">
          <ItensEditor itens={os.pecas} onChange={(v) => set('pecas', v)} rotuloQtd="Qtd" />
        </Secao>

        <Secao titulo="Fotos">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {os.fotos.map((f, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-lg">
                <img src={f} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" onClick={() => set('fotos', os.fotos.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white" aria-label="Remover foto"><X size={14} /></button>
              </div>
            ))}
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-borda text-xs text-cinza hover:border-brand hover:text-brand">
              <Camera size={24} /> Adicionar
              <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => adicionarFotos(e.target.files)} />
            </label>
          </div>
        </Secao>

        <Secao titulo="Assinatura do cliente">
          <Assinatura valor={os.assinatura} onChange={(v) => set('assinatura', v)} />
        </Secao>

        <div className="lg:col-span-2">
          <Secao titulo="Valores e pagamento">
            <div className="grid gap-3 sm:grid-cols-4">
              <Campo rotulo="Deslocamento (R$)">
                <input className="input" type="number" step="0.01" inputMode="decimal" value={os.deslocamento || ''} onChange={(e) => set('deslocamento', Number(e.target.value))} />
              </Campo>
              <Campo rotulo="Desconto (%)">
                <input className="input" type="number" step="0.5" inputMode="decimal" value={descontoPct || ''} onChange={(e) => setDescontoPct(Number(e.target.value))} />
              </Campo>
              <Campo rotulo="Forma de pagamento" className="sm:col-span-2">
                <select className="input" value={os.formaPagamento} onChange={(e) => set('formaPagamento', e.target.value as OrdemServico['formaPagamento'])}>
                  {Object.entries(FORMAS_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Campo>
            </div>
            <div className="mt-4 space-y-1 rounded-lg bg-painel p-4 text-sm">
              <div className="flex justify-between"><span className="text-cinza">Serviços</span><span>{brl(somaItens(os.servicos))}</span></div>
              <div className="flex justify-between"><span className="text-cinza">Peças</span><span>{brl(somaItens(os.pecas))}</span></div>
              <div className="flex justify-between"><span className="text-cinza">Deslocamento</span><span>{brl(Number(os.deslocamento) || 0)}</span></div>
              {desconto > 0 && <div className="flex justify-between text-emerald-400"><span>Desconto</span><span>− {brl(desconto)}</span></div>}
              <div className="flex justify-between border-t border-borda pt-2 font-titulo text-2xl font-bold text-brand"><span>Total</span><span>{brl(total)}</span></div>
            </div>
          </Secao>
        </div>
      </div>

      <div className="sticky bottom-20 z-20 mt-4 lg:static">
        <button className="btn-primario w-full py-3.5 text-base shadow-lg shadow-black/50"><Save size={20} /> Salvar OS · {brl(total)}</button>
      </div>
    </form>
  )
}

function ItensEditor({ itens, onChange, sugestoes, rotuloQtd }: {
  itens: ItemOS[]; onChange: (v: ItemOS[]) => void; sugestoes?: ServicoCatalogo[]; rotuloQtd: string
}) {
  const listaId = sugestoes ? 'catalogo-servicos' : undefined
  const alterar = (i: number, campo: keyof ItemOS, valor: string) => {
    const novo = [...itens]
    if (campo === 'descricao') {
      novo[i] = { ...novo[i], descricao: valor }
      const cat = sugestoes?.find((s) => s.descricao === valor)
      if (cat && !novo[i].valor) novo[i].valor = cat.valor
    } else {
      novo[i] = { ...novo[i], [campo]: Number(valor) }
    }
    onChange(novo)
  }

  return (
    <div className="space-y-2">
      {sugestoes && (
        <datalist id={listaId}>
          {sugestoes.map((s) => <option key={s.id} value={s.descricao}>{brl(s.valor)}</option>)}
        </datalist>
      )}
      {itens.map((it, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-borda bg-painel p-2 sm:grid-cols-[1fr_70px_110px_auto] sm:border-0 sm:bg-transparent sm:p-0">
          <input className="input col-span-2 sm:col-span-1" list={listaId} placeholder="Descrição" value={it.descricao} onChange={(e) => alterar(i, 'descricao', e.target.value)} />
          <div className="col-span-2 grid grid-cols-[70px_1fr_auto] gap-2 sm:contents">
            <input className="input" type="number" step="0.5" inputMode="decimal" title={rotuloQtd} placeholder={rotuloQtd} value={it.qtd || ''} onChange={(e) => alterar(i, 'qtd', e.target.value)} />
            <input className="input" type="number" step="0.01" inputMode="decimal" placeholder="Valor R$" value={it.valor || ''} onChange={(e) => alterar(i, 'valor', e.target.value)} />
            <button type="button" onClick={() => onChange(itens.filter((_, j) => j !== i))} className="rounded-lg px-2 text-cinza hover:text-red-400" aria-label="Remover"><Trash2 size={18} /></button>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={() => onChange([...itens, { descricao: '', qtd: 1, valor: 0 }])} className="btn-secundario px-3 py-1.5 text-xs"><Plus size={14} /> Adicionar</button>
        <span className="text-sm text-cinza">Subtotal <span className="font-semibold text-white">{brl(somaItens(itens))}</span></span>
      </div>
    </div>
  )
}
