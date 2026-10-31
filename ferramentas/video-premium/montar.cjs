// Montagem premium: quadros capturados → vídeo 30 fps + narração + trilha com ducking + efeitos.
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const ff = require('ffmpeg-static')

const pasta = __dirname
const l = JSON.parse(fs.readFileSync(path.join(pasta, 'linha.json'), 'utf8'))
const saida = process.argv[2]

// 1) lista de quadros com duração real de cada um (captura tem taxa variável)
const q = l.quadros
const linhas = []
for (let i = 0; i < q.length; i++) {
  const d = i < q.length - 1 ? Math.max(0.001, q[i + 1].t - q[i].t) : 0.5
  linhas.push(`file '${q[i].arq.replace(/\\/g, '/')}'`, `duration ${d.toFixed(4)}`)
}
linhas.push(`file '${q[q.length - 1].arq.replace(/\\/g, '/')}'`)
const lista = path.join(pasta, 'quadros.txt')
fs.writeFileSync(lista, linhas.join('\n'))
const total = q[q.length - 1].t + 0.5
const deslocamento = q[0].t // o vídeo começa no primeiro quadro

// 2) áudio
const falas = fs.readdirSync(path.join(pasta, 'falas')).filter((f) => f.endsWith('.wav')).sort()
const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista]
falas.forEach((f) => args.push('-i', path.join(pasta, 'falas', f)))
const iTrilha = falas.length + 1, iWhoosh = iTrilha + 1, iImpacto = iTrilha + 2
args.push('-i', path.join(pasta, 'trilha.wav'), '-i', path.join(pasta, 'whoosh.wav'), '-i', path.join(pasta, 'impacto.wav'))

const ms = (t) => Math.max(0, Math.round((t - deslocamento) * 1000))
const ordemIds = ['abertura', 'acessos', 'painel', 'orcamento', 'aprovacao', 'mecanico', 'assinatura', 'offline', 'financeiro', 'fechamento']
const f = []
falas.forEach((arq, i) => {
  const id = arq.replace(/^\d+-|\.wav$/g, '')
  const quando = l.falas.find((x) => x.id === id)?.t ?? 0
  f.push(`[${i + 1}:a]aresample=48000,adelay=${ms(quando)}|${ms(quando)}[v${i}]`)
})
f.push(`${falas.map((_, i) => `[v${i}]`).join('')}amix=inputs=${falas.length}:normalize=0,volume=1.0[voz]`)
f.push(`[voz]asplit=2[vozA][vozSC]`)
f.push(`[${iTrilha}:a]aresample=48000,atrim=0:${total.toFixed(2)},afade=t=in:d=2.5,afade=t=out:st=${(total - 3.5).toFixed(2)}:d=3.5,volume=0.13[mus]`)
f.push(`[mus][vozSC]sidechaincompress=threshold=0.015:ratio=6:attack=20:release=450[musd]`)
const wh = l.whoosh
f.push(`[${iWhoosh}:a]aresample=48000,volume=0.22,asplit=${wh.length}${wh.map((_, i) => `[w${i}]`).join('')}`)
wh.forEach((t, i) => f.push(`[w${i}]adelay=${ms(t - 0.12)}|${ms(t - 0.12)}[wd${i}]`))
f.push(`${wh.map((_, i) => `[wd${i}]`).join('')}amix=inputs=${wh.length}:normalize=0[wh]`)
f.push(`[${iImpacto}:a]aresample=48000,volume=0.4,adelay=${ms(l.impacto[0] + 1.2)}|${ms(l.impacto[0] + 1.2)}[imp]`)
f.push(`[vozA][musd][wh][imp]amix=inputs=4:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[final]`)

args.push('-filter_complex', f.join(';'), '-map', '0:v', '-map', '[final]',
  '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high',
  '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-t', total.toFixed(2), '-movflags', '+faststart', saida)
console.log(`montando ${q.length} quadros, ${total.toFixed(1)}s, ${ordemIds.length} falas...`)
execFileSync(ff, args, { stdio: 'inherit' })
console.log('ok:', saida)
