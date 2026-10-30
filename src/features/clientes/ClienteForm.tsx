import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save } from 'lucide-react'
import { db } from '../../db/banco'
import { clienteSchema, primeiroErro } from '../../domain/schemas'
import type { Cliente } from '../../domain/tipos'
import { CONDICOES, FORMAS_PAGAMENTO, mascaraDocumento, mascaraTelefone, MODALIDADES } from '../../lib/format'
import { gravar } from '../../sync/motor'
import { Aviso, Cabecalho, Campo, Secao } from '../../components/ui'

type Form = Omit<Cliente, 'id' | 'created_at' | 'updated_at' | 'version'> & { id?: string }

const NOVO: Form = {
  tipo: 'PJ', nome: '', documento: '', telefone: '', modalidade: 'avulso', forma_pagamento: 'pix',
  condicao: 'avista', exige_pedido: false, ativo: true,
}

export function ClienteForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [c, setC] = useState<Form>(NOVO)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (id) db.t('clientes').get(id).then((x) => x && setC(x))
  }, [id])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setC((p) => ({ ...p, [k]: v }))
  const num = (v: string) => (v === '' ? undefined : Number(v))

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    const msg = primeiroErro(clienteSchema.safeParse(c))
    if (msg) return setErro(msg)
    const salvo = await gravar('clientes', c)
    navigate(`/clientes/${salvo.id}`, { replace: true })
  }

  return (
    <form onSubmit={salvar}>
      <Cabecalho titulo={id ? 'Editar cliente' : 'Novo cliente'} acoes={<button className="btn-primario"><Save size={18} /> Salvar</button>} />
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
              <input className="input" inputMode="numeric" value={c.documento} onChange={(e) => set('documento', mascaraDocumento(e.target.value))} />
            </Campo>
            <Campo rotulo={c.tipo === 'PJ' ? 'Razão social' : 'Nome completo'} className="sm:col-span-2">
              <input className="input" value={c.nome} onChange={(e) => set('nome', e.target.value)} />
            </Campo>
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

        <Secao titulo="Contato e endereço">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Responsável de frota / contato"><input className="input" value={c.contato ?? ''} onChange={(e) => set('contato', e.target.value)} /></Campo>
            <Campo rotulo="Telefone / WhatsApp"><input className="input" inputMode="tel" value={c.telefone} onChange={(e) => set('telefone', mascaraTelefone(e.target.value))} /></Campo>
            <Campo rotulo="E-mail" className="sm:col-span-2"><input className="input" type="email" value={c.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Campo>
            <Campo rotulo="CEP"><input className="input" inputMode="numeric" value={c.cep ?? ''} onChange={(e) => set('cep', e.target.value)} /></Campo>
            <Campo rotulo="Endereço"><input className="input" value={c.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} /></Campo>
            <Campo rotulo="Cidade"><input className="input" value={c.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} /></Campo>
            <Campo rotulo="UF"><input className="input" maxLength={2} value={c.uf ?? ''} onChange={(e) => set('uf', e.target.value.toUpperCase())} /></Campo>
          </div>
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
              <Campo rotulo="Dia de fechamento / vencimento">
                <input className="input" type="number" min={1} max={28} value={c.dia_fechamento ?? ''} onChange={(e) => set('dia_fechamento', num(e.target.value))} />
              </Campo>
            )}
            {c.modalidade === 'contrato' && (
              <Campo rotulo="Valor do contrato mensal (R$)">
                <input className="input" type="number" step="0.01" value={c.valor_contrato ?? ''} onChange={(e) => set('valor_contrato', num(e.target.value))} />
              </Campo>
            )}
            <Campo rotulo="Limite de crédito (R$)"><input className="input" type="number" step="0.01" value={c.limite_credito ?? ''} onChange={(e) => set('limite_credito', num(e.target.value))} /></Campo>
            <Campo rotulo="Desconto padrão (%)"><input className="input" type="number" step="0.5" value={c.desconto_padrao ?? ''} onChange={(e) => set('desconto_padrao', num(e.target.value))} /></Campo>
            <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
              <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={c.exige_pedido} onChange={(e) => set('exige_pedido', e.target.checked)} />
              <span className="text-sm text-prata">Exige número de pedido/autorização para faturar</span>
            </label>
          </div>
        </Secao>

        <Secao titulo="Observações">
          <textarea className="input min-h-32" value={c.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} placeholder="Horário de recebimento, contato do financeiro, particularidades da frota…" />
        </Secao>
      </div>
      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}
      <div className="mt-4 flex justify-end"><button className="btn-primario w-full sm:w-auto"><Save size={18} /> Salvar cliente</button></div>
    </form>
  )
}
