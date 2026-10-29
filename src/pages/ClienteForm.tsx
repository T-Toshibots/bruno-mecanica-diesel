import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save } from 'lucide-react'
import { clientesRepo } from '../data/repos/clientes'
import type { Cliente } from '../data/types'
import { CONDICOES, FORMAS_PAGAMENTO, mascaraDocumento, mascaraTelefone, MODALIDADES } from '../lib/format'
import { Cabecalho, Campo, Secao } from '../components/ui'

const NOVO: Cliente = {
  tipo: 'PJ', nome: '', documento: '', telefone: '', modalidade: 'avulso', formaPagamento: 'pix',
  condicao: 'avista', ativo: true, criadoEm: '',
}

export function ClienteForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [c, setC] = useState<Cliente>(NOVO)

  useEffect(() => {
    if (id) clientesRepo.obter(Number(id)).then((x) => x && setC(x))
  }, [id])

  const set = <K extends keyof Cliente>(k: K, v: Cliente[K]) => setC((p) => ({ ...p, [k]: v }))
  const num = (v: string) => (v === '' ? undefined : Number(v))

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    const novoId = await clientesRepo.salvar({ ...c, criadoEm: c.criadoEm || new Date().toISOString() })
    navigate(`/clientes/${novoId}`, { replace: true })
  }

  return (
    <form onSubmit={salvar}>
      <Cabecalho
        titulo={id ? 'Editar cliente' : 'Novo cliente'}
        acoes={<button className="btn-primario"><Save size={18} /> Salvar</button>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Identificação">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Tipo">
              <select className="input" value={c.tipo} onChange={(e) => set('tipo', e.target.value as Cliente['tipo'])}>
                <option value="PJ">Pessoa jurídica</option>
                <option value="PF">Pessoa física</option>
              </select>
            </Campo>
            <Campo rotulo={c.tipo === 'PJ' ? 'CNPJ' : 'CPF'}>
              <input className="input" inputMode="numeric" value={c.documento} onChange={(e) => set('documento', mascaraDocumento(e.target.value))} required />
            </Campo>
            <Campo rotulo={c.tipo === 'PJ' ? 'Razão social' : 'Nome completo'} className="sm:col-span-2">
              <input className="input" value={c.nome} onChange={(e) => set('nome', e.target.value)} required />
            </Campo>
            {c.tipo === 'PJ' && (
              <>
                <Campo rotulo="Nome fantasia">
                  <input className="input" value={c.fantasia ?? ''} onChange={(e) => set('fantasia', e.target.value)} />
                </Campo>
                <Campo rotulo="Inscrição estadual">
                  <input className="input" value={c.ie ?? ''} onChange={(e) => set('ie', e.target.value)} />
                </Campo>
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
            <Campo rotulo="Responsável / contato">
              <input className="input" value={c.contato ?? ''} onChange={(e) => set('contato', e.target.value)} />
            </Campo>
            <Campo rotulo="Telefone / WhatsApp">
              <input className="input" inputMode="tel" value={c.telefone} onChange={(e) => set('telefone', mascaraTelefone(e.target.value))} required />
            </Campo>
            <Campo rotulo="E-mail" className="sm:col-span-2">
              <input className="input" type="email" value={c.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </Campo>
            <Campo rotulo="CEP">
              <input className="input" inputMode="numeric" value={c.cep ?? ''} onChange={(e) => set('cep', e.target.value)} />
            </Campo>
            <Campo rotulo="Endereço">
              <input className="input" value={c.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} />
            </Campo>
            <Campo rotulo="Cidade">
              <input className="input" value={c.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} />
            </Campo>
            <Campo rotulo="UF">
              <input className="input" maxLength={2} value={c.uf ?? ''} onChange={(e) => set('uf', e.target.value.toUpperCase())} />
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Comercial e faturamento">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Modalidade" className="sm:col-span-2">
              <select className="input" value={c.modalidade} onChange={(e) => set('modalidade', e.target.value as Cliente['modalidade'])}>
                {Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Forma de pagamento">
              <select className="input" value={c.formaPagamento} onChange={(e) => set('formaPagamento', e.target.value as Cliente['formaPagamento'])}>
                {Object.entries(FORMAS_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Condição de faturamento">
              <select className="input" value={c.condicao} onChange={(e) => set('condicao', e.target.value as Cliente['condicao'])}>
                {Object.entries(CONDICOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            {c.condicao === 'mensal' && (
              <Campo rotulo="Dia do vencimento (fechamento)">
                <input className="input" type="number" min={1} max={28} value={c.diaFechamento ?? ''} onChange={(e) => set('diaFechamento', num(e.target.value))} />
              </Campo>
            )}
            {c.modalidade === 'contrato' && (
              <Campo rotulo="Valor do contrato mensal (R$)">
                <input className="input" type="number" step="0.01" value={c.valorContrato ?? ''} onChange={(e) => set('valorContrato', num(e.target.value))} />
              </Campo>
            )}
            <Campo rotulo="Limite de crédito (R$)">
              <input className="input" type="number" step="0.01" value={c.limiteCredito ?? ''} onChange={(e) => set('limiteCredito', num(e.target.value))} />
            </Campo>
            <Campo rotulo="Desconto padrão (%)">
              <input className="input" type="number" step="0.5" value={c.descontoPadrao ?? ''} onChange={(e) => set('descontoPadrao', num(e.target.value))} />
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Observações">
          <textarea className="input min-h-32" value={c.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} placeholder="Ex.: horário de recebimento, contato do financeiro, particularidades da frota…" />
        </Secao>
      </div>
      <div className="mt-4 flex justify-end">
        <button className="btn-primario w-full sm:w-auto"><Save size={18} /> Salvar cliente</button>
      </div>
    </form>
  )
}
