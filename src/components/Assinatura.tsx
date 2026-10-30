import { useEffect, useRef } from 'react'
import { Eraser } from 'lucide-react'

/** Campo de assinatura com o dedo (celular) ou mouse. */
export function Assinatura({ valor, onChange }: { valor?: string; onChange: (v?: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const desenhando = useRef(false)

  useEffect(() => {
    const c = ref.current!
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = c.offsetHeight * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111'
    if (valor) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, c.offsetWidth, c.offsetHeight)
      img.src = valor
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  const inicio = (e: React.PointerEvent) => {
    desenhando.current = true
    ref.current!.setPointerCapture(e.pointerId)
    const ctx = ref.current!.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(...pos(e))
  }
  const mover = (e: React.PointerEvent) => {
    if (!desenhando.current) return
    const ctx = ref.current!.getContext('2d')!
    ctx.lineTo(...pos(e))
    ctx.stroke()
  }
  const fim = () => {
    if (!desenhando.current) return
    desenhando.current = false
    onChange(ref.current!.toDataURL('image/png'))
  }
  const limpar = () => {
    const c = ref.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    onChange(undefined)
  }

  return (
    <div>
      <canvas
        ref={ref}
        className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-borda bg-white"
        onPointerDown={inicio}
        onPointerMove={mover}
        onPointerUp={fim}
        onPointerLeave={fim}
      />
      <div className="mt-2 flex items-center justify-between text-xs text-cinza">
        <span>Assine com o dedo no quadro acima</span>
        <button type="button" onClick={limpar} className="inline-flex items-center gap-1 hover:text-white"><Eraser size={14} /> Limpar</button>
      </div>
    </div>
  )
}
