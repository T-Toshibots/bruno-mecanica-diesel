import { db, getConfig, registrarOutbox, setConfig } from '../db'
import type { OrdemServico, StatusOS } from '../types'

export const osRepo = {
  listar: () => db.os.orderBy('abertaEm').reverse().toArray(),
  obter: (id: number) => db.os.get(id),
  doCliente: (clienteId: number) => db.os.where('clienteId').equals(clienteId).reverse().sortBy('abertaEm'),

  async proximoNumero() {
    return getConfig<number>('proximoNumero', 1)
  },

  async salvar(os: OrdemServico) {
    os.atualizadoEm = new Date().toISOString()
    if (!os.id) {
      return db.transaction('rw', [db.os, db.config, db.outbox], async () => {
        const numero = await getConfig<number>('proximoNumero', 1)
        const id = (await db.os.add({ ...os, numero })) as number
        await setConfig('proximoNumero', numero + 1)
        await registrarOutbox('os', 'criar', id)
        return id
      })
    }
    await db.os.put(os)
    await registrarOutbox('os', 'editar', os.id)
    return os.id
  },

  async mudarStatus(os: OrdemServico, status: StatusOS, extras: Partial<OrdemServico> = {}) {
    const agora = new Date().toISOString()
    const novo: OrdemServico = { ...os, ...extras, status }
    if (status === 'concluida' && !novo.concluidaEm) novo.concluidaEm = agora
    if (status === 'faturada' && !novo.faturadaEm) novo.faturadaEm = agora
    return osRepo.salvar(novo)
  },

  async marcarPago(os: OrdemServico, pago: boolean) {
    return osRepo.salvar({ ...os, pagoEm: pago ? new Date().toISOString() : undefined })
  },
}
