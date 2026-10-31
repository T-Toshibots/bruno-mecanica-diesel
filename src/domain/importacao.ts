// Importação inicial de clientes e veículos por planilha (CSV ou Excel).
// Cada linha traz um cliente e, opcionalmente, um veículo dele. Linhas com o mesmo
// CPF/CNPJ são agrupadas no mesmo cliente.
import { validarDocumento, validarPlaca } from './validacao'
import type { TipoVeiculo } from './tipos'

export type Celula = string | number | boolean | Date | null | undefined

/** Lê CSV com separador ; ou , (o Excel em português salva com ;) e campos entre aspas. */
export function lerCSV(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const primeira = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ','
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      if (linha.some((x) => x.trim())) linhas.push(linha)
      linha = []
    } else campo += c
  }
  linha.push(campo)
  if (linha.some((x) => x.trim())) linhas.push(linha)
  return linhas
}

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

/** Nomes de coluna aceitos (sem acento, sem espaço) → campo do sistema. */
const SINONIMOS: Record<string, string[]> = {
  nome: ['nome', 'razaosocial', 'cliente', 'nomecliente'],
  fantasia: ['fantasia', 'nomefantasia'],
  documento: ['documento', 'cnpj', 'cpf', 'cpfcnpj', 'cnpjcpf'],
  ie: ['ie', 'inscricaoestadual'],
  telefone: ['telefone', 'fone', 'celular', 'whatsapp'],
  email: ['email'],
  contato: ['contato', 'responsavel'],
  cep: ['cep'],
  endereco: ['endereco', 'logradouro'],
  cidade: ['cidade', 'municipio'],
  uf: ['uf', 'estado'],
  placa: ['placa'],
  tipo_veiculo: ['tipoveiculo', 'tipo'],
  marca: ['marca'],
  modelo: ['modelo'],
  ano: ['ano'],
  frota: ['frota', 'nfrota', 'numerofrota'],
  chassi: ['chassi'],
  km: ['km', 'quilometragem'],
}

export function mapearColunas(cabecalho: Celula[]): Record<string, number> {
  const mapa: Record<string, number> = {}
  cabecalho.forEach((c, i) => {
    const n = normalizar(String(c ?? ''))
    for (const [campo, nomes] of Object.entries(SINONIMOS)) if (!(campo in mapa) && nomes.includes(n)) mapa[campo] = i
  })
  return mapa
}

const TIPOS_VEICULO: Record<string, TipoVeiculo> = {
  cavalo: 'cavalo', cavalomecanico: 'cavalo', truck: 'truck', toco: 'toco', carreta: 'carreta', semireboque: 'carreta',
  bitrem: 'bitrem', rodotrem: 'rodotrem', utilitario: 'utilitario', van: 'utilitario',
}

export interface VeiculoImport { placa: string; tipo: TipoVeiculo; marca: string; modelo: string; ano?: number; frota?: string; chassi?: string; km?: number }
export interface ClienteImport {
  linha: number
  tipo: 'PF' | 'PJ'
  nome: string
  fantasia?: string
  documento: string
  ie?: string
  telefone: string
  email?: string
  contato?: string
  cep?: string
  endereco?: string
  cidade?: string
  uf?: string
  veiculos: VeiculoImport[]
  erros: string[]
}

const digitos = (v: string) => v.replace(/\D/g, '')

function formatarDocumento(d: string) {
  return d.length === 11
    ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

function formatarPlaca(p: string) {
  const s = p.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return s.length === 7 ? `${s.slice(0, 3)}-${s.slice(3)}` : s
}

/** Converte as linhas da planilha em clientes (com veículos) e aponta os erros de cada um. */
export function interpretarPlanilha(linhas: Celula[][]): { clientes: ClienteImport[]; colunas: Record<string, number>; faltando: string[] } {
  const [cab = [], ...dados] = linhas
  const colunas = mapearColunas(cab)
  const faltando = ['nome', 'documento'].filter((c) => !(c in colunas))
  if (faltando.length) return { clientes: [], colunas, faltando }

  const val = (l: Celula[], campo: string) => {
    const i = colunas[campo]
    const v = i === undefined ? undefined : l[i]
    return v == null ? '' : String(v).trim()
  }
  const porDoc = new Map<string, ClienteImport>()
  dados.forEach((l, idx) => {
    const doc = digitos(val(l, 'documento'))
    const chave = doc || `sem-doc-${idx}`
    let c = porDoc.get(chave)
    if (!c) {
      const tipo = doc.length === 11 ? 'PF' : 'PJ'
      c = {
        linha: idx + 2, tipo, nome: val(l, 'nome'), fantasia: val(l, 'fantasia') || undefined, documento: formatarDocumento(doc),
        ie: val(l, 'ie') || undefined, telefone: val(l, 'telefone'), email: val(l, 'email') || undefined, contato: val(l, 'contato') || undefined,
        cep: val(l, 'cep') || undefined, endereco: val(l, 'endereco') || undefined, cidade: val(l, 'cidade') || undefined,
        uf: val(l, 'uf').toUpperCase().slice(0, 2) || undefined, veiculos: [], erros: [],
      }
      if (!c.nome) c.erros.push('Nome vazio')
      if (!validarDocumento(tipo, doc)) c.erros.push('CPF/CNPJ inválido')
      porDoc.set(chave, c)
    }
    const placa = val(l, 'placa')
    if (placa) {
      if (!validarPlaca(placa)) c.erros.push(`Placa inválida: ${placa}`)
      else if (!c.veiculos.some((v) => v.placa === formatarPlaca(placa))) {
        const ano = Number(val(l, 'ano')) || undefined
        const km = Number(digitos(val(l, 'km'))) || undefined
        c.veiculos.push({
          placa: formatarPlaca(placa), tipo: TIPOS_VEICULO[normalizar(val(l, 'tipo_veiculo'))] ?? 'outro',
          marca: val(l, 'marca') || '—', modelo: val(l, 'modelo') || '—', ano, km,
          frota: val(l, 'frota') || undefined, chassi: val(l, 'chassi').toUpperCase() || undefined,
        })
      }
    }
  })
  return { clientes: [...porDoc.values()], colunas, faltando }
}

export const MODELO_CSV = [
  'nome;fantasia;cnpj_cpf;telefone;email;contato;cep;endereco;cidade;uf;placa;tipo_veiculo;marca;modelo;ano;frota;km',
  'Transportes Exemplo Ltda;Exemplo;11.222.333/0001-81;(11) 99999-0000;frota@exemplo.com;Marcos;13000-000;Rua A, 100;Campinas;SP;ABC1D23;cavalo;Volvo;FH 540;2020;101;350000',
  'Transportes Exemplo Ltda;Exemplo;11.222.333/0001-81;;;;;;;;DEF4567;carreta;Randon;Graneleira;2019;102;',
  'José da Silva;;529.982.247-25;(11) 98888-0000;;;;;Itatiba;SP;GHI8J90;truck;Mercedes-Benz;Atego 2430;2018;;210000',
].join('\n')
