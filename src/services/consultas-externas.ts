// Consultas públicas usadas no cadastro. Só funcionam com internet; offline o preenchimento é manual.

import { estaOnline } from '../sync/rede'

const digitos = (v: string) => v.replace(/\D/g, '')

export class ErroConsulta extends Error {}

async function buscarJSON(url: string) {
  if (!estaOnline()) throw new ErroConsulta('Sem internet: preencha manualmente.')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (r.status === 404) throw new ErroConsulta('Não encontrado.')
    if (!r.ok) throw new ErroConsulta('Serviço de consulta indisponível agora. Tente mais tarde.')
    return await r.json()
  } catch (e) {
    if (e instanceof ErroConsulta) throw e
    throw new ErroConsulta('Não foi possível consultar. Verifique a internet.')
  } finally {
    clearTimeout(t)
  }
}

export interface Endereco { cep: string; endereco: string; cidade: string; uf: string }

export async function buscarCEP(cep: string): Promise<Endereco> {
  const c = digitos(cep)
  if (c.length !== 8) throw new ErroConsulta('CEP deve ter 8 dígitos.')
  const d = await buscarJSON(`https://viacep.com.br/ws/${c}/json/`)
  if (d.erro) throw new ErroConsulta('CEP não encontrado.')
  return {
    cep: `${c.slice(0, 5)}-${c.slice(5)}`,
    endereco: [d.logradouro, d.bairro].filter(Boolean).join(', '),
    cidade: d.localidade ?? '',
    uf: d.uf ?? '',
  }
}

export interface DadosCNPJ extends Partial<Endereco> { nome: string; fantasia?: string; telefone?: string; email?: string }

export async function buscarCNPJ(cnpj: string): Promise<DadosCNPJ> {
  const c = digitos(cnpj)
  if (c.length !== 14) throw new ErroConsulta('CNPJ deve ter 14 dígitos.')
  const d = await buscarJSON(`https://brasilapi.com.br/api/cnpj/v1/${c}`)
  const cep = digitos(String(d.cep ?? ''))
  const tel = digitos(String(d.ddd_telefone_1 ?? ''))
  return {
    nome: d.razao_social ?? '',
    fantasia: d.nome_fantasia || undefined,
    cep: cep ? `${cep.slice(0, 5)}-${cep.slice(5)}` : undefined,
    endereco: [d.descricao_tipo_de_logradouro, d.logradouro, d.numero, d.bairro].filter(Boolean).join(' ').trim() || undefined,
    cidade: d.municipio ?? undefined,
    uf: d.uf ?? undefined,
    telefone: tel.length >= 10 ? tel.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : undefined,
    email: d.email ? String(d.email).toLowerCase() : undefined,
  }
}
