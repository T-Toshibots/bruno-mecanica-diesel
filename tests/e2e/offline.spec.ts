import { expect, test, type Page } from '@playwright/test'

async function entrar(page: Page, nome: string) {
  await page.getByRole('button', { name: new RegExp(nome) }).click()
  await expect(page.getByRole('link', { name: /Online|Sincronizando/ })).toBeVisible({ timeout: 15_000 })
}

async function sair(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click()
}

test('mecânico abre chamado sem internet; ao reconectar recebe número oficial e a secretária vê', async ({ page, context }) => {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))

  await page.goto('./')
  await entrar(page, 'Carlos')

  // Mecânico: sem financeiro e sem valores
  await expect(page.getByRole('heading', { name: 'Minhas OS' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Financeiro' })).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText('R$')

  // O app precisa estar guardado para uso offline antes do modo avião (como no celular: abrir uma vez com internet)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))

  // Modo avião
  await context.setOffline(true)
  await expect(page.getByRole('link', { name: /Offline/ })).toBeVisible()
  await page.getByRole('link', { name: 'Abrir chamado em campo' }).click()
  await page.locator('select').first().selectOption({ index: 1 })
  await page.getByPlaceholder('O que o motorista/cliente informou…').fill('E2E: pane elétrica na estrada')
  await page.getByRole('button', { name: 'Salvar' }).last().click()

  await expect(page).toHaveURL(/#\/os\/[0-9a-f-]{36}$/)
  await expect(page.getByText(/Número provisório P-/)).toBeVisible()
  await expect(page.getByText('Não sincronizada')).toBeVisible()

  // Fecha e reabre o app ainda offline: os dados continuam no aparelho
  await page.reload()
  await expect(page.getByText('E2E: pane elétrica na estrada')).toBeVisible()

  // Volta a internet → sincroniza e recebe o número oficial
  await context.setOffline(false)
  await expect(page.getByText(/Número provisório/)).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.font-titulo', { hasText: /^OS \d{5}$/ }).first()).toBeVisible()

  // Secretária vê o chamado para completar
  await sair(page)
  await entrar(page, 'Ana Paula')
  await expect(page.getByText('E2E: pane elétrica na estrada')).toBeVisible({ timeout: 10_000 })

  expect(erros).toEqual([])
})

test('secretária não vê configurações nem margem; dono vê', async ({ page }) => {
  await page.goto('./')
  await entrar(page, 'Ana Paula')
  await expect(page.getByLabel('Configurações')).toHaveCount(0)
  await page.goto('./#/financeiro')
  await expect(page.getByText('Margem no mês')).toHaveCount(0)
  // Troca direto pelo botão do topo
  await page.getByRole('button', { name: 'Trocar perfil' }).click()
  await page.getByRole('button', { name: /Bruno/ }).click()
  await expect(page.getByText('Bruno · Dono')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Margem no mês')).toBeVisible()
  await expect(page.getByLabel('Configurações')).toBeVisible()
})
