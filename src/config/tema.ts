/**
 * Marca e dados da oficina. Para atender outra oficina, troque apenas este arquivo
 * (e as imagens em /public). Nenhuma regra de negócio depende destes valores.
 */
export const tema = {
  nomeSistema: 'Bruno Mecânica Diesel',
  nomeCurto: 'Bruno',
  complemento: 'Mecânica Diesel',
  slogan: 'Manutenção pesada de caminhões',
  logo: 'logo.png',
  icone: 'icon-192.png',
  cores: {
    /** cor principal no tema escuro */
    brand: '#F7931E',
    brandClaro: '#FFA733',
    /** cor principal no tema claro (mais escura para ter contraste no sol) */
    brandTemaClaro: '#B85F00',
    ferrugem: '#C1440E',
    fundoEscuro: '#0F0F0F',
  },
  oficinaPadrao: {
    nome: 'Bruno Mecânica Diesel',
    documento: '00.000.000/0001-00',
    telefone: '(11) 99999-0000',
    email: 'contato@brunomecanicadiesel.com.br',
    endereco: 'Rod. Exemplo, km 100',
    cidade: 'São Paulo - SP',
    pix: '00.000.000/0001-00',
    valor_hora: 150,
    deslocamento_fixo: 200,
    valor_km: 3.5,
    garantia_texto: 'Serviços com garantia de 90 dias contados da data de finalização, exceto peças fornecidas pelo cliente.',
  },
}

/** Aplica as cores do tema nas variáveis CSS usadas pelo Tailwind. */
export function aplicarCoresDoTema() {
  const c = tema.cores
  const css = `
    :root { --color-brand: ${c.brand}; --color-brand-claro: ${c.brandClaro}; --color-ferrugem: ${c.ferrugem}; }
    :root[data-theme="light"] { --color-brand: ${c.brandTemaClaro}; --color-brand-claro: ${c.brand}; }
  `
  const el = document.createElement('style')
  el.textContent = css
  document.head.appendChild(el)
}
