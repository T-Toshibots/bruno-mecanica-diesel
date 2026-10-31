import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { db } from '../db/banco'
import { nomeCliente, useLista } from '../db/consultas'
import { primeiroErro, veiculoSchema } from '../domain/schemas'
import type { TipoVeiculo, Veiculo } from '../domain/tipos'
import { data, mascaraPlaca, TIPOS_VEICULO } from '../lib/format'
import { excluir, gravarVarios, type Operacao } from '../sync/motor'
import { Aviso, Campo, Modal } from './ui'

export type VeiculoForm = Partial<Veiculo> & { cliente_id: string }

/**
 * Cadastro de veículo. Trocar o cliente dono mantém o histórico:
 * fecha o período do dono anterior e abre um novo (as OS antigas continuam com o cliente da época).
 */
export function VeiculoModal({ veiculo, onFechar }: { veiculo: VeiculoForm; onFechar: () => void }) {
  const [v, setV] = useState(veiculo)
  const [erro, setErro] = useState('')
  const clientes = useLista('clientes').sort((a, b) => nomeCliente(a).localeCompare(nomeCliente(b)))
  const historico = useLiveQuery(
    async () => (v.id ? (await db.t('veiculo_clientes_hist').where('veiculo_id').equals(v.id).toArray()).filter((h) => !h.deleted_at).sort((a, b) => b.de.localeCompare(a.de)) : []),
    [v.id], [],
  )
  const set = <K extends keyof VeiculoForm>(k: K, val: VeiculoForm[K]) => setV((p) => ({ ...p, [k]: val }))
  const num = (s: string) => (s === '' ? undefined : Number(s))
  const trocouDono = !!veiculo.id && v.cliente_id !== veiculo.cliente_id

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    const msg = primeiroErro(veiculoSchema.safeParse(v))
    if (msg) return setErro(msg)
    if (!v.cliente_id) return setErro('Selecione o cliente dono do veículo.')
    const placaNorm = (v.placa ?? '').replace('-', '')
    const duplicada = (await db.t('veiculos').toArray()).find((x) => !x.deleted_at && x.id !== v.id && x.placa.replace('-', '') === placaNorm)
    if (duplicada) return setErro(`A placa ${v.placa} já está cadastrada.`)

    const agora = new Date().toISOString()
    const id = v.id ?? crypto.randomUUID()
    const ops: Operacao[] = [{ tabela: 'veiculos', dados: { ...v, id } }]
    if (!veiculo.id) ops.push({ tabela: 'veiculo_clientes_hist', dados: { veiculo_id: id, cliente_id: v.cliente_id, de: agora } })
    if (trocouDono) {
      const aberto = historico.find((h) => !h.ate)
      if (aberto) ops.push({ tabela: 'veiculo_clientes_hist', dados: { id: aberto.id, ate: agora } })
      ops.push({ tabela: 'veiculo_clientes_hist', dados: { veiculo_id: id, cliente_id: v.cliente_id, de: agora } })
    }
    await gravarVarios(ops)
    onFechar()
  }

  return (
    <Modal aberto titulo={v.id ? `Veículo ${veiculo.placa}` : 'Novo veículo'} onFechar={onFechar}>
      <form onSubmit={salvar} className="grid grid-cols-2 gap-3">
        <Campo rotulo="Cliente dono" className="col-span-2">
          <select className="input" value={v.cliente_id} onChange={(e) => set('cliente_id', e.target.value)}>
            <option value="">Selecione…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{nomeCliente(c)}</option>)}
          </select>
        </Campo>
        {trocouDono && <div className="col-span-2"><Aviso tipo="alerta">O veículo passará para outro cliente. O histórico e as OS antigas são mantidos.</Aviso></div>}
        <Campo rotulo="Placa"><input className="input uppercase" value={v.placa ?? ''} onChange={(e) => set('placa', mascaraPlaca(e.target.value))} /></Campo>
        <Campo rotulo="Tipo">
          <select className="input" value={v.tipo ?? 'cavalo'} onChange={(e) => set('tipo', e.target.value as TipoVeiculo)}>
            {Object.entries(TIPOS_VEICULO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Marca"><input className="input" value={v.marca ?? ''} onChange={(e) => set('marca', e.target.value)} /></Campo>
        <Campo rotulo="Modelo"><input className="input" value={v.modelo ?? ''} onChange={(e) => set('modelo', e.target.value)} /></Campo>
        <Campo rotulo="Ano"><input className="input" type="number" inputMode="numeric" value={v.ano ?? ''} onChange={(e) => set('ano', num(e.target.value))} /></Campo>
        <Campo rotulo="Nº frota"><input className="input" value={v.frota ?? ''} onChange={(e) => set('frota', e.target.value)} /></Campo>
        <Campo rotulo="KM atual"><input className="input" type="number" inputMode="numeric" value={v.km ?? ''} onChange={(e) => set('km', num(e.target.value))} /></Campo>
        <Campo rotulo="Horímetro"><input className="input" type="number" inputMode="numeric" value={v.horimetro ?? ''} onChange={(e) => set('horimetro', num(e.target.value))} /></Campo>
        <Campo rotulo="Chassi" className="col-span-2"><input className="input uppercase" value={v.chassi ?? ''} onChange={(e) => set('chassi', e.target.value.toUpperCase())} /></Campo>

        {historico.length > 0 && (
          <div className="col-span-2">
            <span className="label">Histórico de donos</span>
            <ul className="space-y-1 text-xs">
              {historico.map((h) => (
                <li key={h.id} className="flex justify-between gap-2 rounded bg-card px-2 py-1.5">
                  <span className="text-forte">{nomeCliente(clientes.find((c) => c.id === h.cliente_id))}</span>
                  <span className="text-cinza">{data(h.de)} → {h.ate ? data(h.ate) : 'atual'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {erro && <div className="col-span-2"><Aviso tipo="erro">{erro}</Aviso></div>}
        <div className="col-span-2 mt-2 flex gap-2">
          {v.id && (
            <button type="button" className="btn-perigo" aria-label="Excluir veículo"
              onClick={async () => { if (confirm('Excluir este veículo? As OS antigas continuam no histórico.')) { await excluir('veiculos', v.id!); onFechar() } }}>
              <Trash2 size={16} />
            </button>
          )}
          <button className="btn-primario flex-1">Salvar veículo</button>
        </div>
      </form>
    </Modal>
  )
}
