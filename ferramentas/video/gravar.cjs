// Grava a apresentação: o navegador percorre o sistema real seguindo o roteiro, cena a cena.
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const PASTA = __dirname
const roteiro = JSON.parse(fs.readFileSync(path.join(PASTA, 'roteiro.json'), 'utf8'))
const duracoes = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(PASTA, 'duracoes.json'), 'utf8').replace(/^﻿/, '')).map((d) => [d.id, d.segundos]))
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const navegador = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: path.join(PASTA, 'bruto'), size: { width: 1280, height: 720 } } })
  const page = await ctx.newPage()
  const t0 = Date.now()
  const erros = []
  page.on('pageerror', (e) => erros.push('palco: ' + e.message))
  await page.goto('http://localhost:4174/palco.html')
  const app = page.frameLocator('#app')
  const quadro = () => page.frames().find((f) => f.url().includes('4173'))
  const linhaDoTempo = []

  async function clicar(loc, { duplo = false } = {}) {
    await loc.scrollIntoViewIfNeeded()
    const b = await loc.boundingBox()
    if (b) {
      await page.evaluate(([x, y]) => window.moverCursor(x, y), [b.x + b.width / 2, b.y + b.height / 2])
      await espera(500)
      await page.evaluate(() => window.cliqueCursor())
    }
    await loc.click()
    if (duplo) await espera(200)
    await espera(350)
  }
  async function digitar(loc, texto) {
    await clicar(loc)
    await loc.pressSequentially(texto, { delay: 35 })
    await espera(250)
  }
  async function rolar(y) {
    await quadro()?.evaluate((top) => window.scrollTo({ top, behavior: 'smooth' }), y)
    await espera(1200)
  }
  async function trocarPerfil(nome) {
    await clicar(app.getByRole('button', { name: 'Trocar perfil' }).first())
    await espera(400)
    await clicar(app.locator('.fixed button', { hasText: nome }).first())
    await espera(2200)
  }

  async function cena(id, visual, acoes = async () => {}) {
    const c = roteiro.find((r) => r.id === id)
    const inicio = Date.now()
    linhaDoTempo.push({ id, inicio_ms: inicio - t0 })
    await page.evaluate((v) => window.cena(v), { titulo: c.titulo, legenda: c.fala, ...visual })
    try { await acoes() } catch (e) { erros.push(`${id}: ${e.message.split('\n')[0]}`) }
    const minimo = (duracoes[id] + 1.0) * 1000
    const passou = Date.now() - inicio
    if (passou < minimo) await espera(minimo - passou)
  }

  await cena('capa', { modo: 'capa', capaTitulo: 'Sistema de Gestão da Oficina', capaItens: ['Ordens de serviço', 'Clientes e frota', 'Financeiro', 'Celular e computador', 'Funciona sem internet'] })

  await cena('perfis', { modo: 'desktop' }, async () => {
    await app.getByText('Entrar como').waitFor({ timeout: 20000 })
    for (const n of ['Bruno', 'Ana Paula', 'Carlos']) {
      const b = await app.locator('button', { hasText: n }).first().boundingBox()
      if (b) { await page.evaluate(([x, y]) => window.moverCursor(x, y), [b.x + b.width / 2, b.y + b.height / 2]); await espera(1400) }
    }
  })

  await cena('dono', { modo: 'desktop' }, async () => {
    await clicar(app.locator('button', { hasText: 'Bruno' }).first())
    await espera(2500)
    await rolar(380)
    await espera(2000)
    await rolar(0)
  })

  await cena('orcamento', { modo: 'desktop' }, async () => {
    await trocarPerfil('Ana Paula')
    await clicar(app.getByRole('button', { name: 'Nova OS' }).first())
    await espera(1200)
    const cliente = app.locator('select').first()
    await clicar(cliente)
    await cliente.selectOption({ label: 'Rota Sul' })
    await espera(800)
    await clicar(app.locator('button', { hasText: 'Cavalo mecânico' }).first())
    await clicar(app.locator('button', { hasText: 'Carreta' }).first())
    await clicar(app.getByRole('button', { name: 'Carlos', exact: true }))
    await digitar(app.getByPlaceholder('O que o motorista/cliente informou…'), 'Embreagem patinando na subida')
    await digitar(app.getByPlaceholder('Descrição').first(), 'Troca de embreagem')
    // fecha a lista de sugestões do catálogo (senão o próximo clique só fecha a lista)
    await app.getByPlaceholder('Descrição').first().press('Escape')
    await app.getByPlaceholder('Descrição').first().press('Tab')
    await espera(600)
    await clicar(app.getByRole('button', { name: 'Hora técnica' }))
    await rolar(2400)
    await espera(2000)
    await clicar(app.getByRole('button', { name: /^Salvar ·/ }))
    await espera(1800)
  })

  await cena('aprovacao', { modo: 'desktop' }, async () => {
    await clicar(app.getByRole('button', { name: 'Registrar aprovação' }))
    await digitar(app.getByPlaceholder('Ex.: Marcos (frota)'), 'Marcos (frota)')
    await digitar(app.locator('.fixed input').nth(1), 'PED-4521')
    await clicar(app.getByText('Já iniciar a execução'))
    await clicar(app.getByRole('button', { name: 'Confirmar' }))
    await espera(1500)
  })

  await cena('mecanico', { modo: 'celular' }, async () => {
    await espera(900)
    await trocarPerfil('Carlos')
    await espera(800)
    await clicar(app.locator('a', { hasText: 'Embreagem patinando' }).first())
    await espera(1500)
    await clicar(app.getByRole('button', { name: 'Iniciar serviço' }))
    await espera(1500)
  })

  await cena('finalizar', { modo: 'celular' }, async () => {
    await clicar(app.getByRole('button', { name: 'Finalizar' }))
    await espera(600)
    const tela = app.locator('.fixed canvas').first()
    await tela.scrollIntoViewIfNeeded()
    const b = await tela.boundingBox()
    if (b) {
      const pts = [[0.12, 0.6], [0.25, 0.35], [0.38, 0.7], [0.5, 0.3], [0.62, 0.65], [0.75, 0.4], [0.88, 0.55]]
      await page.evaluate(([x, y]) => window.moverCursor(x, y), [b.x + b.width * pts[0][0], b.y + b.height * pts[0][1]])
      await espera(500)
      await page.mouse.move(b.x + b.width * pts[0][0], b.y + b.height * pts[0][1])
      await page.mouse.down()
      for (const [px, py] of pts.slice(1)) {
        const x = b.x + b.width * px, y = b.y + b.height * py
        await page.evaluate(([cx, cy]) => window.moverCursor(cx, cy), [x, y])
        await page.mouse.move(x, y, { steps: 8 })
        await espera(120)
      }
      await page.mouse.up()
    }
    await espera(500)
    await clicar(app.getByRole('button', { name: 'Confirmar' }))
    await espera(1500)
    await rolar(0)
  })

  await cena('offline', { modo: 'celular' }, async () => {
    await clicar(app.getByRole('link', { name: 'Sincronizar' }).last())
    await espera(800)
    await clicar(app.getByRole('button', { name: /Simular sem internet/ }))
    await espera(1000)
    await clicar(app.getByRole('button', { name: 'Abrir chamado' }))
    await espera(1000)
    await app.locator('select').first().selectOption({ index: 2 })
    await digitar(app.getByPlaceholder('O que o motorista/cliente informou…'), 'Pane elétrica na rodovia')
    await clicar(app.getByRole('button', { name: 'Salvar', exact: true }).last())
    await espera(2200)
    await clicar(app.getByRole('link', { name: /Offline/ }))
    await espera(600)
    await clicar(app.getByRole('button', { name: /Desligar modo avião/ }))
    await espera(3000)
    await quadro()?.evaluate(() => history.back())
    await espera(2500)
  })

  await cena('financeiro', { modo: 'desktop' }, async () => {
    await espera(900)
    await trocarPerfil('Bruno')
    await clicar(app.getByRole('link', { name: 'Financeiro' }).first())
    await espera(1800)
    await rolar(450)
    await espera(1200)
    await rolar(1100)
  })

  await cena('fim', { modo: 'capa', capaTitulo: 'Próximos passos', capaItens: ['PDF com QR Code PIX', 'Envio pelo WhatsApp', 'Histórico por placa', 'Financeiro completo', 'Login real na nuvem'] })

  const total = Date.now() - t0
  await ctx.close()
  const video = await page.video().path()
  await navegador.close()
  fs.writeFileSync(path.join(PASTA, 'linha-do-tempo.json'), JSON.stringify({ video, total_ms: total, cenas: linhaDoTempo }, null, 2))
  console.log('vídeo bruto:', video, '| duração', Math.round(total / 1000) + 's')
  console.log(erros.length ? 'AVISOS:\n' + erros.join('\n') : 'SEM ERROS')
})()
