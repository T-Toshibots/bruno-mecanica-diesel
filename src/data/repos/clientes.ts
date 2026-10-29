import { db, registrarOutbox } from '../db'
import type { Cliente, Veiculo } from '../types'

export const clientesRepo = {
  listar: () => db.clientes.orderBy('nome').toArray(),
  obter: (id: number) => db.clientes.get(id),
  async salvar(c: Cliente) {
    const id = (await db.clientes.put(c)) as number
    await registrarOutbox('clientes', c.id ? 'editar' : 'criar', id)
    return id
  },
}

export const veiculosRepo = {
  listar: () => db.veiculos.toArray(),
  doCliente: (clienteId: number) => db.veiculos.where('clienteId').equals(clienteId).toArray(),
  async salvar(v: Veiculo) {
    const id = (await db.veiculos.put(v)) as number
    await registrarOutbox('veiculos', v.id ? 'editar' : 'criar', id)
    return id
  },
  async excluir(id: number) {
    await db.veiculos.delete(id)
    await registrarOutbox('veiculos', 'excluir', id)
  },
}
