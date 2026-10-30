const digitos = (v: string) => v.replace(/\D/g, '')

export function validarCPF(valor: string): boolean {
  const c = digitos(valor)
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

export function validarCNPJ(valor: string): boolean {
  const c = digitos(valor)
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = pesos.reduce((s, p, i) => s + p * Number(c[i]), 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13])
}

export const validarDocumento = (tipo: 'PF' | 'PJ', valor: string) =>
  tipo === 'PF' ? validarCPF(valor) : validarCNPJ(valor)

/** Aceita placa antiga (ABC1234) e Mercosul (ABC1D23), com ou sem hífen. */
export function validarPlaca(valor: string): boolean {
  const p = valor.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p)
}
