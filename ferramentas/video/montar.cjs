// Junta o vídeo gravado com a narração (cada fala começa 0,3 s depois do início da sua cena).
const { execFileSync } = require('child_process')
const path = require('path')
const ff = require('ffmpeg-static')
const pasta = __dirname
const t = require(path.join(pasta, 'linha-do-tempo.json'))
const saida = process.argv[2]
const args = ['-y', '-loglevel', 'error', '-i', t.video]
t.cenas.forEach((c) => args.push('-i', path.join(pasta, 'audio', c.id + '.wav')))
const filtros = t.cenas.map((c, i) => `[${i + 1}:a]adelay=${c.inicio_ms + 300}|${c.inicio_ms + 300},volume=1.6[a${i}]`)
filtros.push(`${t.cenas.map((_, i) => `[a${i}]`).join('')}amix=inputs=${t.cenas.length}:normalize=0[voz]`)
args.push('-filter_complex', filtros.join(';'), '-map', '0:v', '-map', '[voz]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', saida)
execFileSync(ff, args, { stdio: 'inherit' })
console.log('ok:', saida)
