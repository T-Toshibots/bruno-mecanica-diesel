import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { CloudOff, Image, RefreshCw, Trash2 } from 'lucide-react'
import { useSessao } from '../../app/sessao'
import { db, getLocal } from '../../db/banco'
import { dataHora, tempoRelativo } from '../../lib/format'
import { useStatusSync } from '../../sync/agendador'
import { assinarRede, setSimularOffline, simulandoOffline } from '../../sync/rede'
import { liberarArquivosEnviados, sincronizar } from '../../sync/sincronizar'
import { Aviso, Cabecalho, Kpi, Secao, Vazio } from '../../components/ui'

const NOMES_TABELA: Record<string, string> = {
  os: 'OS', os_itens: 'Item de OS', os_veiculos: 'Veículo da OS', os_mecanicos: 'Mecânico da OS', os_fotos: 'Foto',
  os_assinaturas: 'Assinatura', os_status_hist: 'Histórico de status', clientes: 'Cliente', veiculos: 'Veículo',
  funcionarios: 'Funcionário', funcionarios_salario: 'Salário', servicos_catalogo: 'Serviço do catálogo',
  oficina_config: 'Dados da oficina', perfis: 'Usuário', os_apontamentos: 'Horas trabalhadas', os_aprovacoes: 'Aprovação',
  cliente_contatos: 'Contato do cliente', cliente_precos: 'Preço do cliente', fornecedores: 'Fornecedor', veiculo_clientes_hist: 'Dono do veículo',
}

function SecaoFotos() {
  const s = useStatusSync()
  const enviadasNoAparelho = useLiveQuery(() => db.arquivos.where('enviado').equals(1).count(), [], 0)
  return (
    <Secao titulo="Fotos">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-prata">
          <Image size={18} className="shrink-0 text-brand" />
          <span><strong className="text-forte">{s.fotosPendentes}</strong> aguardando envio · <strong className="text-forte">{enviadasNoAparelho}</strong> já enviadas e ainda guardadas no aparelho</span>
        </div>
        <button className="btn-secundario" disabled={!enviadasNoAparelho}
          onClick={async () => { if (confirm('Liberar o espaço das fotos já enviadas? As miniaturas continuam; a foto completa fica disponível com internet.')) await liberarArquivosEnviados() }}>
          Liberar espaço
        </button>
      </div>
      {s.arquivos && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-cinza">Enviando fotos: {s.arquivos.enviados} de {s.arquivos.total}</div>
          <BarraProgresso valor={s.arquivos.enviados} total={s.arquivos.total} />
        </div>
      )}
    </Secao>
  )
}

export function BarraProgresso({ valor, total, fina }: { valor: number; total: number; fina?: boolean }) {
  return (
    <div className={`${fina ? 'h-1' : 'h-2 rounded-full'} bg-painel`}>
      <div className={`${fina ? 'h-1' : 'h-2 rounded-full'} bg-brand transition-all`} style={{ width: `${total ? (valor / total) * 100 : 0}%` }} />
    </div>
  )
}

/** O service worker terminou de guardar o app? (antes disso, abrir sem internet não funciona) */
function useProntoOffline() {
  const [pronto, setPronto] = useState<boolean | null>(null)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return setPronto(false)
    let ativo = true
    navigator.serviceWorker.getRegistration().then((r) => ativo && setPronto(!!r?.active))
    navigator.serviceWorker.ready.then(() => ativo && setPronto(true))
    return () => { ativo = false }
  }, [])
  return pronto
}

export function Sincronizacao() {
  const prontoOffline = useProntoOffline()
  const { perm } = useSessao()
  const s = useStatusSync()
  const simulando = useSyncExternalStore(assinarRede, simulandoOffline)
  const fila = useLiveQuery(() => db.outbox.orderBy('seq').toArray(), [], [])
  const erros = useLiveQuery(() => db.sync_erros.reverse().toArray(), [], [])
  const conflitos = useLiveQuery(async () => (await db.t('sync_conflitos').toArray()).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [], [])
  const info = useLiveQuery(async () => ({
    ultimo: await getLocal<string | null>('ultimo_sync', null),
    persistente: await getLocal<boolean>('armazenamento_persistente', false),
    device: await getLocal<string>('device_id', ''),
  }), [], undefined)

  return (
    <>
      <Cabecalho titulo="Sincronização" subtitulo="Tudo é salvo primeiro no aparelho e enviado quando houver internet." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Conexão" valor={s.online ? 'Online' : 'Offline'} destaque={s.online ? 'ok' : 'alerta'} />
        <Kpi rotulo="Pendências" valor={String(s.pendentes)} destaque={s.pendentes ? 'brand' : undefined} detalhe={s.maisAntiga ? `mais antiga ${tempoRelativo(s.maisAntiga)}` : 'nada a enviar'} />
        <Kpi rotulo="Último envio" valor={tempoRelativo(info?.ultimo ?? undefined)} detalhe={info?.ultimo ? dataHora(info.ultimo) : undefined} />
        <Kpi rotulo="Recusadas" valor={String(s.erros)} destaque={s.erros ? 'alerta' : undefined} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button className="btn-primario py-4 text-base" disabled={!s.online || s.sincronizando} onClick={() => sincronizar({ forcar: true })}>
          <RefreshCw size={20} className={s.sincronizando ? 'animate-spin' : ''} /> {s.sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
        <button className={simulando ? 'btn-perigo py-4 text-base' : 'btn-secundario py-4 text-base'} onClick={() => setSimularOffline(!simulando)}>
          <CloudOff size={20} /> {simulando ? 'Desligar modo avião simulado' : 'Simular sem internet (demonstração)'}
        </button>
      </div>
      {s.ultimoErro && <div className="mt-3"><Aviso tipo="alerta">{s.ultimoErro}</Aviso></div>}
      {prontoOffline === false && (
        <div className="mt-3"><Aviso tipo="alerta">O app ainda está sendo guardado neste aparelho. Mantenha a internet ligada até este aviso sumir antes de usar sem internet.</Aviso></div>
      )}
      {prontoOffline && <p className="mt-3 text-xs texto-ok">✓ App guardado neste aparelho: abre mesmo sem internet.</p>}
      {!info?.persistente && (
        <div className="mt-3"><Aviso tipo="alerta">O navegador não garantiu armazenamento permanente. Instale o app na tela inicial e use-o com frequência para evitar perda de dados (principalmente no iPhone).</Aviso></div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2"><SecaoFotos /></div>
        <Secao titulo={`Fila de envio (${fila.length})`}>
          {fila.length === 0 ? <Vazio texto="Tudo enviado." /> : (
            <ul className="divide-y divide-borda text-sm">
              {fila.slice(0, 50).map((f) => (
                <li key={f.seq} className="py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-forte">{NOMES_TABELA[f.tabela] ?? f.tabela}</span>
                    <span className="text-xs text-cinza">{tempoRelativo(f.criado_em)}</span>
                  </div>
                  {f.tentativas > 0 && (
                    <div className="text-xs texto-alerta">
                      {f.tentativas} tentativa(s) — {f.erro}. Próxima {f.proxima_tentativa > Date.now() ? `em ${Math.ceil((f.proxima_tentativa - Date.now()) / 1000)}s` : 'agora'}
                    </div>
                  )}
                </li>
              ))}
              {fila.length > 50 && <li className="py-2 text-xs text-cinza">+ {fila.length - 50} item(ns)</li>}
            </ul>
          )}
        </Secao>

        <Secao titulo={`Recusadas pelo servidor (${erros.length})`} acoes={erros.length > 0 && <button className="text-xs text-cinza hover:text-forte" onClick={() => db.sync_erros.clear()}>Limpar</button>}>
          {erros.length === 0 ? <Vazio texto="Nenhuma alteração recusada." /> : (
            <ul className="divide-y divide-borda text-sm">
              {erros.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2 py-2">
                  <div>
                    <div className="font-semibold text-forte">{NOMES_TABELA[e.tabela] ?? e.tabela}</div>
                    <div className="text-xs text-prata">{e.mensagem} A alteração foi desfeita neste aparelho.</div>
                    <div className="text-xs text-cinza">{dataHora(e.data)}</div>
                  </div>
                  <button onClick={() => db.sync_erros.delete(e.id!)} className="flex h-10 w-10 shrink-0 items-center justify-center text-cinza hover:text-forte" aria-label="Dispensar"><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        {perm.verConflitos && (
          <div className="lg:col-span-2">
            <Secao titulo={`Conflitos registrados (${conflitos.length})`}>
              <p className="mb-2 text-xs text-cinza">Quando duas pessoas alteram o mesmo registro, vale a última gravação; a versão substituída fica aqui.</p>
              {conflitos.length === 0 ? <Vazio texto="Nenhum conflito." /> : (
                <ul className="divide-y divide-borda text-sm">
                  {conflitos.slice(0, 30).map((c) => (
                    <li key={c.id} className="py-2">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-forte">{NOMES_TABELA[c.tabela] ?? c.tabela}</span>
                        <span className="text-xs text-cinza">{dataHora(c.updated_at)} · {c.usuario_nome}</span>
                      </div>
                      <details className="text-xs text-cinza">
                        <summary className="cursor-pointer py-1">Ver versão substituída</summary>
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-painel p-2">{JSON.stringify(c.perdedor, null, 2)}</pre>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-cinza">Aparelho: {info?.device.slice(0, 8)} · Modo demonstração (servidor simulado neste navegador).</p>
    </>
  )
}
