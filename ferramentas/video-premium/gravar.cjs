// Gravação premium: captura de tela em Full HD (screencast JPEG) + linha do tempo para a montagem.
const { chromium } = require('playwright-core')
const fs = require('fs')
const path = require('path')

const PASTA = __dirname
const QUADROS = path.join(PASTA, 'quadros')
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const agora = () => Date.now() / 1000

// Falas (texto da narração do usuário) e duração de cada trecho de áudio
const DUR = Object.fromEntries(fs.readFileSync(path.join(PASTA, 'falas', 'duracoes.txt'), 'utf8').trim().split('\n').map((l) => { const [id, d] = l.trim().split(' '); return [id, Number(d)] }))
const FALAS = {
  abertura: 'Bruno, este é o sistema da Bruno Mecânica Diesel. Orçamento, ordem de serviço, clientes e financeiro: tudo num lugar só, no celular e no computador.',
  acessos: 'Cada um da equipe tem o seu acesso. Você, como dono, vê tudo. A secretária cuida dos cadastros e das cobranças. E o mecânico vê só o serviço dele, sem valores.',
  painel: 'Logo de cara, você vê quanto faturou no mês, quanto sobrou de lucro, o que tem para receber e o que está atrasado. E o sistema ainda mostra a previsão dos próximos meses.',
  orcamento: 'Montar um orçamento é rápido. Escolhe a transportadora, marca o cavalo e a carreta, e o preço já vem certo, pela tabela combinada com aquele cliente.',
  aprovacao: 'Cliente aprovou pelo WhatsApp? Registra quem aprovou e o número do pedido, e o orçamento vira ordem de serviço na hora.',
  mecanico: 'No celular, o mecânico recebe a ordem, vê o que tem que fazer e marca as horas trabalhadas com um toque.',
  assinatura: 'Terminou? O motorista assina na tela do celular. A ordem fica fechada, e ninguém mexe mais. Só você.',
  offline: 'E no pátio da transportadora ou na beira da estrada, sem sinal, o sistema continua funcionando. Quando a internet volta, tudo sobe sozinho.',
  financeiro: 'No financeiro, você acompanha o que entra, quem são os clientes que mais trazem serviço e o que mais se faz na oficina.',
  fechamento: 'E vem mais por aí: ordem de serviço em PDF com PIX, envio direto pelo WhatsApp e o histórico completo de cada placa. Bruno Mecânica Diesel: a oficina organizada, do pátio ao caixa.',
}

/** Divide a fala em frases e distribui o tempo do áudio proporcionalmente ao tamanho de cada frase. */
function frasesCronometradas(id) {
  const frases = FALAS[id].match(/[^.?!:]+[.?!:]?/g).map((f) => f.trim()).filter(Boolean)
  const total = frases.reduce((s, f) => s + f.length, 0)
  const dur = DUR[id] * 1000
  let t = 0
  return frases.map((texto) => {
    const d = (texto.length / total) * dur
    const r = { texto: texto.replace(/:$/, ''), ini: Math.round(t), fim: Math.round(t + d - 60) }
    t += d
    return r
  })
}

;(async () => {
  fs.rmSync(QUADROS, { recursive: true, force: true })
  fs.mkdirSync(QUADROS, { recursive: true })
  const navegador = await chromium.launch({ channel: 'chrome', headless: true, args: ['--force-device-scale-factor=1'] })
  const ctx = await navegador.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await ctx.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push('erro: ' + e.message))
  await page.goto('http://localhost:4174/palco.html')
  await page.evaluate(() => document.fonts.ready)
  const app = page.frameLocator('#app')
  const quadro = () => page.frames().find((f) => f.url().includes('4173'))

  // ---------- captura ----------
  const cdp = await ctx.newCDPSession(page)
  const quadros = []
  let n = 0
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const arq = path.join(QUADROS, String(n++).padStart(6, '0') + '.jpg')
    fs.writeFileSync(arq, Buffer.from(data, 'base64'))
    quadros.push({ arq, t: metadata.timestamp })
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
  const t0 = agora()
  const linha = { falas: [], whoosh: [], impacto: [] }

  // ---------- utilitários de câmera e cliques ----------
  async function retangulo(loc) {
    await loc.scrollIntoViewIfNeeded()
    return loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  }
  async function focar(loc, escala = 1.4, alvoY = 520, alvoX = 960) {
    const r = await retangulo(loc)
    if (!r.w || !r.h) return // elemento invisível: não move a câmera
    await page.evaluate(([r, s, y, x]) => {
      const a = document.getElementById('aparelho'), f = document.getElementById('app')
      const cx = a.offsetLeft + f.offsetLeft + r.x + r.w / 2, cy = a.offsetTop + f.offsetTop + r.y + r.h / 2
      document.getElementById('mundo').style.transform = `translate(${x - cx * s}px, ${y - cy * s}px) scale(${s})`
    }, [r, escala, alvoY, alvoX])
    await espera(1150)
  }
  async function geral() { await page.evaluate(() => window.camera()); await espera(1150) }
  async function clicar(loc, { focarEm, alvoY, alvoX } = {}) {
    if (focarEm) await focar(loc, focarEm, alvoY, alvoX)
    else await loc.scrollIntoViewIfNeeded()
    const b = await loc.boundingBox()
    if (b && b.x > 0 && b.y > 0 && b.x < 1900 && b.y < 1060) {
      await page.evaluate(([x, y]) => window.cursor(x, y), [b.x + b.width / 2, b.y + b.height / 2])
      await espera(560)
      await page.evaluate(() => window.clique())
    }
    try { await loc.click({ timeout: 6000 }) } catch { await loc.dispatchEvent('click') }
    await espera(320)
  }
  async function digitar(loc, texto, atraso = 24) {
    await loc.focus()
    const b = await loc.boundingBox()
    if (b) { await page.evaluate(([x, y]) => window.cursor(x, y), [b.x + 30, b.y + b.height / 2]); await page.evaluate(() => window.clique()) }
    await loc.pressSequentially(texto, { delay: atraso })
    await espera(200)
  }
  async function rolarApp(y) { await quadro()?.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y) }
  async function trocarPerfil(nome) {
    await app.getByRole('button', { name: 'Trocar perfil' }).first().click()
    await espera(300)
    await app.locator('.fixed button', { hasText: nome }).first().click()
    await app.locator('main').first().waitFor()
    await espera(1800)
  }
  async function assinar(canvas) {
    await canvas.scrollIntoViewIfNeeded()
    const b = await canvas.boundingBox()
    if (!b) return
    const pts = [[0.1, 0.62], [0.2, 0.3], [0.3, 0.72], [0.42, 0.28], [0.52, 0.66], [0.64, 0.34], [0.76, 0.6], [0.9, 0.42]]
    const p = (i) => [b.x + b.width * pts[i][0], b.y + b.height * pts[i][1]]
    await page.evaluate(([x, y]) => window.cursor(x, y), p(0)); await espera(450)
    await page.mouse.move(...p(0)); await page.mouse.down()
    for (let i = 1; i < pts.length; i++) {
      await page.evaluate(([x, y]) => window.cursor(x, y), p(i))
      await page.mouse.move(...p(i), { steps: 7 })
      await espera(90)
    }
    await page.mouse.up()
    await espera(250)
  }

  // ---------- estrutura de cena ----------
  async function cena(id, { num, titulo, preparar, modo, acoes, semCapitulo }) {
    if (!semCapitulo) {
      linha.whoosh.push(agora() - t0)
      await page.evaluate(() => window.semManchete())
      await page.evaluate(([n, t]) => window.capitulo(n, t), [num, titulo])
      const iniCap = Date.now()
      if (modo) await page.evaluate((m) => window.modo(m), modo)
      await page.evaluate(() => window.camera())
      try { if (preparar) await preparar() } catch (e) { erros.push(`${id} (preparo): ${e.message.split('\n')[0]}`) }
      const resta = 1300 - (Date.now() - iniCap)
      if (resta > 0) await espera(resta)
      await page.evaluate(() => window.fecharCapitulo())
      if (modo) await page.evaluate((m) => window.entrada(m), modo)
      await page.evaluate(([n, t]) => window.manchete(n, t), [num, titulo])
      await espera(350)
    }
    const iniFala = agora() - t0 + 0.25
    linha.falas.push({ id, t: iniFala })
    await espera(250)
    await page.evaluate((f) => window.legendas(f), frasesCronometradas(id))
    const ini = Date.now()
    try { if (acoes) await acoes() } catch (e) { erros.push(`${id}: ${e.message.split('\n')[0]}`) }
    const minimo = (DUR[id] + 0.7) * 1000
    const passou = Date.now() - ini
    if (passou < minimo) await espera(minimo - passou)
  }

  // ---------- 01 abertura ----------
  await espera(400)
  linha.impacto.push(agora() - t0 + 0.1)
  await cena('abertura', {
    semCapitulo: true,
    acoes: async () => { await page.evaluate(() => window.mostrarTela('intro', ['Ordens de serviço', 'Clientes e frota', 'Financeiro', 'Celular e computador', 'Funciona sem internet'], 700)) },
  })
  await app.getByText('Entrar como').waitFor({ timeout: 30000 })

  // ---------- 02 acessos ----------
  await cena('acessos', {
    num: '02', titulo: 'Um acesso para cada pessoa', modo: 'desktop',
    acoes: async () => {
      await espera(1100)
      await focar(app.locator('.card').first(), 1.3, 560)
      for (const nome of ['Bruno', 'Ana Paula', 'Carlos']) {
        const b = await app.locator('button', { hasText: nome }).first().boundingBox()
        if (b) { await page.evaluate(([x, y]) => window.cursor(x, y), [b.x + b.width * 0.6, b.y + b.height / 2]); await espera(1700) }
      }
      await geral()
    },
  })

  // ---------- 03 painel do dono ----------
  await cena('painel', {
    num: '03', titulo: 'Painel do dono', modo: 'desktop',
    preparar: async () => { await app.locator('button', { hasText: 'Bruno' }).first().click(); await espera(2600); await rolarApp(0) },
    acoes: async () => {
      await espera(900)
      await focar(app.locator('main .grid').first(), 1.45, 470)
      await espera(2600)
      await focar(app.locator('section', { hasText: 'Faturamento e projeção' }).first(), 1.3, 520)
      await espera(2600)
      await geral()
    },
  })

  // ---------- 04 orçamento ----------
  await cena('orcamento', {
    num: '04', titulo: 'Orçamento em poucos toques', modo: 'desktop',
    preparar: async () => {
      await trocarPerfil('Ana Paula')
      await app.getByRole('button', { name: 'Nova OS' }).first().click()
      await espera(900)
      await app.locator('select').first().selectOption({ label: 'Rota Sul' })
      await espera(600)
      await app.getByPlaceholder('O que o motorista/cliente informou…').fill('Embreagem patinando na subida')
      await app.getByRole('button', { name: 'Carlos', exact: true }).click()
      await rolarApp(0)
    },
    acoes: async () => {
      await espera(700)
      await clicar(app.locator('button', { hasText: 'Cavalo mecânico' }).first(), { focarEm: 1.5, alvoY: 560 })
      await clicar(app.locator('button', { hasText: 'Carreta' }).first())
      const desc = app.getByPlaceholder('Descrição').first()
      await focar(desc, 1.45, 520)
      await digitar(desc, 'Troca de embreagem', 22)
      await desc.press('Escape'); await desc.press('Tab')
      await espera(500)
      await clicar(app.getByRole('button', { name: 'Hora técnica' }))
      await focar(app.getByText('Tabela de preços do cliente aplicada'), 1.6, 480)
      await espera(1400)
      await focar(app.locator('.font-titulo', { hasText: 'Total' }).last(), 1.5, 560)
      await espera(1200)
    },
  })

  // ---------- 05 aprovação ----------
  await cena('aprovacao', {
    num: '05', titulo: 'Aprovação registrada', modo: 'desktop',
    preparar: async () => {
      await app.getByRole('button', { name: /^Salvar ·/ }).click()
      await app.getByRole('button', { name: 'Registrar aprovação' }).waitFor({ timeout: 10000 })
      await rolarApp(0)
    },
    acoes: async () => {
      await espera(600)
      await clicar(app.getByRole('button', { name: 'Registrar aprovação' }), { focarEm: 1.35, alvoY: 420 })
      await espera(400)
      await focar(app.locator('.fixed.inset-0 > div').first(), 1.3, 560)
      await digitar(app.getByPlaceholder('Ex.: Marcos (frota)'), 'Marcos (frota)', 20)
      await digitar(app.locator('.fixed input').nth(1), 'PED-4521', 30)
      await clicar(app.getByText('Já iniciar a execução'))
      await clicar(app.getByRole('button', { name: 'Confirmar' }))
      await espera(700)
      await geral()
    },
  })

  // ---------- 06 mecânico no celular ----------
  await cena('mecanico', {
    num: '06', titulo: 'O mecânico no celular', modo: 'celular',
    preparar: async () => {
      await espera(500)
      await trocarPerfil('Carlos')
      await app.locator('a', { hasText: 'Embreagem patinando' }).first().click()
      await app.getByRole('button', { name: 'Iniciar serviço' }).waitFor({ timeout: 10000 })
      await rolarApp(0)
    },
    acoes: async () => {
      await espera(1500)
      await clicar(app.getByRole('button', { name: 'Iniciar serviço' }), { focarEm: 1.12, alvoX: 1460, alvoY: 560 })
      await espera(1600)
      await geral()
    },
  })

  // ---------- 07 assinatura ----------
  await cena('assinatura', {
    num: '07', titulo: 'Assinatura na tela', modo: 'celular',
    preparar: async () => { await app.getByRole('button', { name: 'Finalizar' }).click(); await espera(600) },
    acoes: async () => {
      await espera(1300)
      const telas = app.locator('.fixed canvas')
      await assinar(telas.nth(0))
      await app.locator('.fixed input').nth(1).fill('João (motorista)')
      await assinar(telas.nth(1))
      await clicar(app.getByRole('button', { name: 'Confirmar' }))
      await espera(900)
      await rolarApp(0)
      await espera(600)
    },
  })

  // ---------- 08 sem internet ----------
  await cena('offline', {
    num: '08', titulo: 'Funciona sem internet', modo: 'celular',
    preparar: async () => { await app.getByRole('link', { name: 'Sincronizar' }).last().click(); await espera(800); await rolarApp(0) },
    acoes: async () => {
      await espera(1300)
      await clicar(app.getByRole('button', { name: /Simular sem internet/ }))
      await espera(900)
      await clicar(app.getByRole('button', { name: 'Abrir chamado' }))
      await espera(700)
      await app.locator('select').first().selectOption({ index: 2 })
      await digitar(app.getByPlaceholder('O que o motorista/cliente informou…'), 'Pane elétrica na rodovia', 18)
      await clicar(app.getByRole('button', { name: 'Salvar', exact: true }).last())
      await espera(1600)
      await clicar(app.getByRole('link', { name: /Offline/ }))
      await espera(500)
      await clicar(app.getByRole('button', { name: /Desligar modo avião/ }))
      await espera(2200)
      await quadro()?.evaluate(() => history.back())
      await espera(1800)
    },
  })

  // ---------- 09 financeiro ----------
  await cena('financeiro', {
    num: '09', titulo: 'Financeiro na palma da mão', modo: 'desktop',
    preparar: async () => {
      await espera(500)
      await trocarPerfil('Bruno')
      await app.getByRole('link', { name: 'Financeiro' }).first().click()
      await espera(1500)
      await rolarApp(0)
    },
    acoes: async () => {
      await espera(800)
      await focar(app.locator('main .grid').first(), 1.4, 470)
      await espera(1800)
      await focar(app.locator('section', { hasText: 'Contas a receber' }).first(), 1.25, 520)
      await espera(1800)
      await geral()
    },
  })

  // ---------- 10 fechamento ----------
  linha.whoosh.push(agora() - t0)
  await page.evaluate(() => { window.semManchete(); window.modo('fim') })
  await cena('fechamento', {
    semCapitulo: true,
    acoes: async () => {
      await page.evaluate(() => window.mostrarTela('fim', ['PDF com QR Code PIX', 'Envio pelo WhatsApp', 'Histórico por placa', 'Financeiro completo', 'Login na nuvem'], 650))
      await espera(Math.max(0, DUR.fechamento * 1000 - 6200))
      await page.evaluate(() => window.slogan())
    },
  })
  await espera(1500)

  const total = agora() - t0
  await cdp.send('Page.stopScreencast')
  await espera(500)
  await navegador.close()
  fs.writeFileSync(path.join(PASTA, 'linha.json'), JSON.stringify({ t0, total, quadros: quadros.map((q) => ({ arq: q.arq, t: q.t - t0 })), ...linha }, null, 1))
  console.log(`quadros: ${quadros.length} | duração ${total.toFixed(1)}s | ${(quadros.length / total).toFixed(1)} qps`)
  console.log(erros.length ? 'AVISOS:\n' + erros.join('\n') : 'SEM ERROS')
})()
