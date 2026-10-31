// Servidor estático simples: serve a pasta indicada em /bruno-mecanica-diesel/ (troca de pasta via arquivo)
const http = require('http'), fs = require('fs'), path = require('path')
const tipos = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json' }
const raizArq = process.argv[2]
http.createServer((req, res) => {
  const raiz = fs.readFileSync(raizArq, 'utf8').trim()
  let p = decodeURIComponent(req.url.split('?')[0]).replace('/bruno-mecanica-diesel', '')
  if (p === '/' || p === '') p = '/index.html'
  const f = path.join(raiz, p)
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
    res.end(d)
  })
}).listen(4174)
