import { expect, test, type Page } from '@playwright/test'

// PNG 1x1 para simular a foto da câmera
const FOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function entrar(page: Page, nome: string) {
  await page.goto('./')
  await page.getByRole('button', { name: new RegExp(nome) }).click()
  await expect(page.getByRole('link', { name: /Online|Sincronizando/ })).toBeVisible({ timeout: 15_000 })
}

async function assinar(page: Page, canvasIndex = 0) {
  const c = page.locator('canvas').nth(canvasIndex)
  const box = (await c.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 })
  await page.mouse.move(box.x + 200, box.y + 30, { steps: 5 })
  await page.mouse.up()
}

test('fluxo completo: orçamento com cavalo + carreta, aprovação, horas, foto e finalização assinada', async ({ page }) => {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))
  await entrar(page, 'Bruno')

  await page.goto('./#/os/nova')
  await page.locator('select').first().selectOption({ label: 'Rota Sul' })
  // marca dois veículos (cavalo e carreta)
  const veiculos = page.locator('button', { hasText: /Cavalo mecânico|Carreta/ })
  await veiculos.filter({ hasText: 'Cavalo mecânico' }).first().click()
  await veiculos.filter({ hasText: 'Carreta' }).first().click()
  // Nada pode alargar a página no celular (rolagem lateral esconde o botão Salvar)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByPlaceholder('O que o motorista/cliente informou…').fill('E2E: freio da carreta e óleo do cavalo')
  await page.getByPlaceholder('Descrição').first().fill('Troca de óleo e filtros')
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: FOTO })
  await expect(page.getByPlaceholder('Legenda')).toBeVisible()
  await page.getByPlaceholder('Legenda').fill('Antes do serviço')
  await page.getByRole('button', { name: /^Salvar ·/ }).click()
  await expect(page).toHaveURL(/#\/os\/[0-9a-f-]{36}$/)
  await expect(page.getByText('Itens — ', { exact: false }).first()).toBeVisible() // agrupado por veículo

  // Aprovação com pedido (Rota Sul exige) e já iniciando a execução
  await page.getByRole('button', { name: 'Registrar aprovação' }).click()
  await page.getByPlaceholder('Ex.: Marcos (frota)').fill('Marcos')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('Este cliente exige número de pedido/autorização.')).toBeVisible()
  await page.locator('.fixed input').nth(1).fill('PED-123')
  await page.getByText('Já iniciar a execução').click()
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('Em execução').first()).toBeVisible()
  await expect(page.getByText(/Aprovado por Marcos via WhatsApp/).first()).toBeVisible()

  // Horas
  await page.getByRole('button', { name: 'Iniciar serviço' }).click()
  await expect(page.getByText('● trabalhando agora')).toBeVisible()

  // Finalizar com assinatura do mecânico (encerra as horas)
  await page.getByRole('button', { name: 'Finalizar' }).click()
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText('Colha a assinatura do mecânico responsável.')).toBeVisible()
  await assinar(page, 0)
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByText(/OS travada/)).toBeVisible()
  await expect(page.getByText(/Mecânico responsável — Bruno/)).toBeVisible()
  await expect(page.getByText('Horas trabalhadas')).toBeVisible()

  // Foto enviada pela fila própria
  await page.goto('./#/sincronizacao')
  await expect(page.getByText(/0\s*aguardando envio/)).toBeVisible({ timeout: 15_000 })
  expect(erros).toEqual([])
})

test('rascunho da OS é recuperado depois de fechar o app', async ({ page }) => {
  await entrar(page, 'Ana Paula')
  await page.goto('./#/os/nova')
  await page.getByPlaceholder('O que o motorista/cliente informou…').fill('E2E rascunho: barulho no câmbio')
  await page.waitForTimeout(1500)
  await page.reload()
  await expect(page.getByText(/Rascunho recuperado/)).toBeVisible()
  await expect(page.getByPlaceholder('O que o motorista/cliente informou…')).toHaveValue('E2E rascunho: barulho no câmbio')
  await page.getByRole('button', { name: 'Descartar rascunho' }).click()
  await expect(page.getByPlaceholder('O que o motorista/cliente informou…')).toHaveValue('')
})

test('duplicar OS e abrir retorno em garantia', async ({ page }) => {
  await entrar(page, 'Ana Paula')
  await page.goto('./#/os?f=faturada')
  await page.locator('main a[href^="#/os/"]:not([href$="/nova"])').first().click()
  await page.getByRole('button', { name: 'Retorno em garantia' }).click()
  await expect(page.getByRole('heading', { name: 'Retorno em garantia' })).toBeVisible()
  await expect(page.getByText(/Retorno em garantia vinculado à OS original/)).toBeVisible()
  await page.goBack()
  await page.getByRole('button', { name: 'Duplicar' }).click()
  await expect(page.getByRole('heading', { name: 'Nova OS / orçamento' })).toBeVisible()
  await expect(page.getByPlaceholder('Descrição').first()).not.toHaveValue('')
})
