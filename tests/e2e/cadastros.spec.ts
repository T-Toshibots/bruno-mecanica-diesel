import { expect, test } from '@playwright/test'

const CSV = [
  'Razão Social;CNPJ;Telefone;Cidade;UF;Placa;Tipo;Marca;Modelo;Frota',
  'Transportadora Teste E2E Ltda;11.222.333/0001-81;(11) 99999-1234;Campinas;SP;TST1E23;cavalo;Volvo;FH 500;900',
  'Transportadora Teste E2E Ltda;11.222.333/0001-81;;;;TST4567;carreta;Randon;Sider;901',
  'Linha com erro;123;;;;;;;;',
].join('\n')

test('secretária importa clientes e veículos por planilha', async ({ page }) => {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))
  await page.goto('./')
  await page.getByRole('button', { name: /Ana Paula/ }).click()
  await expect(page.getByRole('link', { name: /Online|Sincronizando/ })).toBeVisible({ timeout: 15_000 })

  await page.goto('./#/cadastros/importar')
  await page.locator('input[type=file]').setInputFiles({ name: 'clientes.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf-8') })
  await expect(page.getByText('CPF/CNPJ inválido')).toBeVisible()
  await page.getByRole('button', { name: /Importar 1 cliente/ }).click()
  await expect(page.getByText(/1 cliente\(s\) novo\(s\), 0 atualizado\(s\) e 2 veículo\(s\)/)).toBeVisible()

  await page.goto('./#/cadastros/veiculos')
  await page.getByPlaceholder(/Buscar placa/).fill('TST')
  await expect(page.getByText('TST-1E23')).toBeVisible()
  await expect(page.getByText('TST-4567')).toBeVisible()
  expect(erros).toEqual([])
})

test('OS de cliente com tabela própria usa o preço do cliente', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /Bruno/ }).click()
  await expect(page.getByRole('link', { name: /Online|Sincronizando/ })).toBeVisible({ timeout: 15_000 })
  await page.goto('./#/os/nova')
  await page.locator('select').first().selectOption({ label: 'Rota Sul' })
  await expect(page.getByText('Tabela de preços do cliente aplicada')).toBeVisible()
  await page.getByRole('button', { name: 'Hora técnica' }).click()
  // Rota Sul tem hora técnica própria de R$ 135 (padrão da oficina: R$ 150)
  await expect(page.locator('input[title="Preço de venda"]').last()).toHaveValue('135')
})
