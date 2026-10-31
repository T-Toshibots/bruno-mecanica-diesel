import { useState } from 'react'
import { CheckCircle2, Download, FileUp, Loader2, XCircle } from 'lucide-react'
import { db } from '../../db/banco'
import { interpretarPlanilha, lerCSV, MODELO_CSV, type Celula, type ClienteImport } from '../../domain/importacao'
import { gravarVarios, type Operacao } from '../../sync/motor'
import { CadastrosAbas } from '../../components/CadastrosAbas'
import { Aviso, Cabecalho, Kpi, Secao } from '../../components/ui'

const digitos = (v: string) => v.replace(/\D/g, '')

interface Previa {
  arquivo: string
  clientes: (ClienteImport & { existenteId?: string; veiculosNovos: number })[]
  faltando: string[]
}

async function lerArquivo(arquivo: File): Promise<Celula[][]> {
  if (/\.xlsx$/i.test(arquivo.name)) {
    // Carregado só quando necessário, para não pesar o app.
    const { default: lerXlsx } = await import('read-excel-file')
    return (await lerXlsx(arquivo)) as Celula[][]
  }
  const bytes = await arquivo.arrayBuffer()
  let texto = new TextDecoder('utf-8').decode(bytes)
  // Excel antigo salva CSV em Windows-1252: se aparecer caractere inválido, relê nessa codificação.
  if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(bytes)
  return lerCSV(texto)
}

export function Importar() {
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [atualizar, setAtualizar] = useState(false)
  const [estado, setEstado] = useState<'' | 'lendo' | 'gravando' | 'pronto'>('')
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState('')

  const escolher = async (arquivo?: File) => {
    if (!arquivo) return
    setErro(''); setResultado(''); setEstado('lendo')
    try {
      const { clientes, faltando } = interpretarPlanilha(await lerArquivo(arquivo))
      const existentes = (await db.t('clientes').toArray()).filter((c) => !c.deleted_at)
      const porDoc = new Map(existentes.map((c) => [digitos(c.documento), c.id]))
      const placas = new Set((await db.t('veiculos').toArray()).filter((v) => !v.deleted_at).map((v) => v.placa.replace('-', '')))
      setPrevia({
        arquivo: arquivo.name,
        faltando,
        clientes: clientes.map((c) => ({
          ...c,
          existenteId: porDoc.get(digitos(c.documento)),
          veiculosNovos: c.veiculos.filter((v) => !placas.has(v.placa.replace('-', ''))).length,
        })),
      })
    } catch {
      setErro('Não foi possível ler o arquivo. Use CSV (separado por ; ou ,) ou Excel .xlsx.')
    }
    setEstado('')
  }

  const validos = previa?.clientes.filter((c) => !c.erros.length) ?? []
  const comErro = previa?.clientes.filter((c) => c.erros.length) ?? []
  const novos = validos.filter((c) => !c.existenteId)

  const importar = async () => {
    if (!previa) return
    setEstado('gravando')
    const placas = new Set((await db.t('veiculos').toArray()).filter((v) => !v.deleted_at).map((v) => v.placa.replace('-', '')))
    const agora = new Date().toISOString()
    const ops: Operacao[] = []
    let nc = 0, ac = 0, nv = 0
    for (const c of validos) {
      if (c.existenteId && !atualizar && !c.veiculos.length) continue
      const id = c.existenteId ?? crypto.randomUUID()
      if (!c.existenteId) {
        nc++
        ops.push({ tabela: 'clientes', dados: {
          id, tipo: c.tipo, nome: c.nome, fantasia: c.fantasia, documento: c.documento, ie: c.ie, telefone: c.telefone, email: c.email,
          contato: c.contato, cep: c.cep, endereco: c.endereco, cidade: c.cidade, uf: c.uf,
          modalidade: c.tipo === 'PJ' ? 'frotista' : 'avulso', forma_pagamento: c.tipo === 'PJ' ? 'boleto' : 'pix', condicao: c.tipo === 'PJ' ? '30d' : 'avista',
          exige_pedido: false, ativo: true,
        } })
      } else if (atualizar) {
        ac++
        const campos = Object.fromEntries(Object.entries({ fantasia: c.fantasia, ie: c.ie, telefone: c.telefone || undefined, email: c.email, contato: c.contato, cep: c.cep, endereco: c.endereco, cidade: c.cidade, uf: c.uf }).filter(([, v]) => v))
        ops.push({ tabela: 'clientes', dados: { id, ...campos } })
      }
      for (const v of c.veiculos) {
        if (placas.has(v.placa.replace('-', ''))) continue
        placas.add(v.placa.replace('-', ''))
        nv++
        const vid = crypto.randomUUID()
        ops.push({ tabela: 'veiculos', dados: { id: vid, cliente_id: id, ...v } })
        ops.push({ tabela: 'veiculo_clientes_hist', dados: { veiculo_id: vid, cliente_id: id, de: agora } })
      }
    }
    for (let i = 0; i < ops.length; i += 300) await gravarVarios(ops.slice(i, i + 300))
    setResultado(`${nc} cliente(s) novo(s), ${ac} atualizado(s) e ${nv} veículo(s) importado(s).${comErro.length ? ` ${comErro.length} linha(s) com erro foram ignoradas.` : ''}`)
    setPrevia(null)
    setEstado('pronto')
  }

  const baixarModelo = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + MODELO_CSV], { type: 'text/csv;charset=utf-8' }))
    a.download = 'modelo-importacao-clientes-veiculos.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <CadastrosAbas />
      <Cabecalho titulo="Importar planilha" subtitulo="Clientes e veículos de uma vez, a partir do Excel ou CSV" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Secao titulo="Como funciona">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-prata">
            <li>Baixe o modelo e preencha no Excel (uma linha por veículo; repita o cliente se ele tiver vários).</li>
            <li>Obrigatórios: <strong>nome</strong> e <strong>CNPJ/CPF</strong>. Os nomes das colunas podem variar (ex.: "Razão Social", "CNPJ").</li>
            <li>Salve como <strong>.xlsx</strong> ou <strong>CSV</strong> e envie aqui. Nada é gravado antes da sua confirmação.</li>
          </ol>
          <button onClick={baixarModelo} className="btn-secundario mt-3 w-full"><Download size={16} /> Baixar modelo</button>
        </Secao>

        <div className="space-y-4 lg:col-span-2">
          <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda bg-card p-6 text-center hover:border-brand">
            {estado === 'lendo' ? <Loader2 className="animate-spin text-brand" size={32} /> : <FileUp className="text-brand" size={32} />}
            <span className="font-semibold text-forte">{previa ? previa.arquivo : 'Escolher arquivo (.xlsx ou .csv)'}</span>
            <span className="text-xs text-cinza">Toque para selecionar</span>
            <input type="file" accept=".csv,.xlsx,text/csv" className="hidden" onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {resultado && <Aviso><CheckCircle2 size={16} className="mr-1 inline texto-ok" />Importação concluída: {resultado}</Aviso>}

          {previa && previa.faltando.length > 0 && (
            <Aviso tipo="erro">Colunas obrigatórias não encontradas: {previa.faltando.join(', ')}. Confira o cabeçalho (primeira linha) da planilha.</Aviso>
          )}

          {previa && !previa.faltando.length && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Kpi rotulo="Clientes novos" valor={String(novos.length)} destaque="brand" />
                <Kpi rotulo="Já cadastrados" valor={String(validos.length - novos.length)} />
                <Kpi rotulo="Veículos novos" valor={String(validos.reduce((s, c) => s + c.veiculosNovos, 0))} />
                <Kpi rotulo="Com erro" valor={String(comErro.length)} destaque={comErro.length ? 'alerta' : 'ok'} />
              </div>
              <Secao titulo="Prévia">
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-borda text-left text-xs text-cinza">
                        <th className="py-1.5">Linha</th><th className="py-1.5">Cliente</th><th className="py-1.5">Documento</th><th className="py-1.5">Veículos</th><th className="py-1.5">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previa.clientes.slice(0, 200).map((c) => (
                        <tr key={c.linha} className="border-b border-borda/50 align-top">
                          <td className="py-1.5 text-cinza">{c.linha}</td>
                          <td className="py-1.5 text-forte">{c.nome || '—'}</td>
                          <td className="py-1.5 text-cinza">{c.documento}</td>
                          <td className="py-1.5 text-cinza">{c.veiculos.map((v) => v.placa).join(', ') || '—'}</td>
                          <td className="py-1.5">
                            {c.erros.length
                              ? <span className="inline-flex items-start gap-1 texto-alerta"><XCircle size={14} className="mt-0.5 shrink-0" />{c.erros.join('; ')}</span>
                              : <span className="texto-ok">{c.existenteId ? 'já cadastrado' : 'novo'}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="mt-3 flex min-h-11 items-center gap-3 text-sm text-prata">
                  <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={atualizar} onChange={(e) => setAtualizar(e.target.checked)} />
                  Atualizar dados dos clientes já cadastrados (telefone, endereço, e-mail…)
                </label>
                <button onClick={importar} disabled={!validos.length || estado === 'gravando'} className="btn-primario mt-2 w-full py-3.5">
                  {estado === 'gravando' ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} Importar {validos.length} cliente(s)
                </button>
              </Secao>
            </>
          )}
        </div>
      </div>
    </>
  )
}
