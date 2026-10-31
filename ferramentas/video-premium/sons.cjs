// Trilha e efeitos sintetizados (sem direitos autorais): pad ambiente em Lá menor, whoosh e impacto.
const fs = require('fs')
const path = require('path')
const SR = 44100
const pasta = __dirname

function salvarWav(arquivo, amostras) {
  let pico = 0
  for (const v of amostras) pico = Math.max(pico, Math.abs(v))
  const ganho = pico ? 0.89 / pico : 1
  const buf = Buffer.alloc(44 + amostras.length * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + amostras.length * 2, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(amostras.length * 2, 40)
  amostras.forEach((v, i) => buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * ganho * 32767))), 44 + i * 2))
  fs.writeFileSync(path.join(pasta, arquivo), buf)
}

// ---------- Trilha: pad + baixo + pulso suave (Am – F – C – G, 4 s por acorde) ----------
function trilha(segundos) {
  const n = Math.floor(segundos * SR)
  const out = new Float32Array(n)
  const acordes = [
    { baixo: 55.0, notas: [220.0, 261.63, 329.63, 440.0] },  // Am
    { baixo: 43.65, notas: [174.61, 220.0, 261.63, 349.23] }, // F
    { baixo: 65.41, notas: [196.0, 261.63, 329.63, 392.0] },  // C
    { baixo: 49.0, notas: [196.0, 246.94, 293.66, 392.0] },   // G
  ]
  const DUR = 4
  for (let i = 0; i < n; i++) {
    const t = i / SR
    let s = 0
    // cada acorde soa com entrada e saída suaves que se sobrepõem
    const idx = Math.floor(t / DUR)
    for (const k of [idx - 1, idx]) {
      if (k < 0) continue
      const a = acordes[k % acordes.length]
      const tl = t - k * DUR
      if (tl < 0 || tl > DUR + 1.5) continue
      const env = Math.min(1, tl / 1.2) * (tl > DUR ? Math.max(0, 1 - (tl - DUR) / 1.5) : 1)
      for (const f of a.notas) {
        const vib = 1 + 0.0015 * Math.sin(2 * Math.PI * 0.3 * t + f)
        for (const det of [0.998, 1, 1.002]) {
          const ph = 2 * Math.PI * f * det * vib * t
          s += env * (Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph)) * 0.05
        }
      }
      s += env * Math.sin(2 * Math.PI * a.baixo * t) * 0.22
    }
    // pulso: batida grave suave a cada tempo (96 bpm) + chimbal discreto no contratempo
    const bpm = 96, tb = 60 / bpm
    const pb = t % tb
    s += Math.sin(2 * Math.PI * (50 + 40 * Math.exp(-pb * 30)) * pb) * Math.exp(-pb * 9) * 0.35
    const ph2 = (t + tb / 2) % tb
    s += (Math.random() * 2 - 1) * Math.exp(-ph2 * 60) * 0.04
    // tremolo lento de "respiração"
    s *= 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.125 * t)
    out[i] = s
  }
  return out
}

// ---------- Whoosh: ruído filtrado com varredura de frequência ----------
function whoosh() {
  const d = 0.9, n = Math.floor(d * SR)
  const out = new Float32Array(n)
  let y = 0, y2 = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = t / d
    const corte = 300 + 4200 * Math.sin(Math.PI * Math.min(1, x * 1.1))
    const a = 1 - Math.exp(-2 * Math.PI * corte / SR)
    const r = Math.random() * 2 - 1
    y += a * (r - y)
    y2 += a * (y - y2)
    out[i] = (y2 - y * 0.3) * Math.pow(Math.sin(Math.PI * x), 1.6)
  }
  return out
}

// ---------- Impacto da abertura: subgrave + estalo filtrado ----------
function impacto() {
  const d = 2.2, n = Math.floor(d * SR)
  const out = new Float32Array(n)
  let y = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const f = 38 + 60 * Math.exp(-t * 6)
    let s = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.6) * 0.9
    const r = Math.random() * 2 - 1
    y += 0.08 * (r - y)
    s += y * Math.exp(-t * 7) * 1.5
    out[i] = s
  }
  return out
}

const segundos = Number(process.argv[2] || 150)
salvarWav('trilha.wav', trilha(segundos))
salvarWav('whoosh.wav', whoosh())
salvarWav('impacto.wav', impacto())
console.log('ok: trilha.wav (' + segundos + 's), whoosh.wav, impacto.wav')
