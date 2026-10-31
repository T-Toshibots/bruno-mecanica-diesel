import { useEffect, useState } from 'react'
import { CloudOff } from 'lucide-react'
import type { OSFoto } from '../domain/tipos'
import { obterArquivo } from '../sync/sincronizar'

/**
 * Mostra a foto da OS: completa se estiver no aparelho (ou houver internet para baixar);
 * senão, a miniatura, com aviso. Tocar abre a foto em tamanho real.
 */
export function FotoOS({ foto, className = '' }: { foto: Pick<OSFoto, 'imagem' | 'arquivo_id' | 'miniatura' | 'legenda'>; className?: string }) {
  const [url, setUrl] = useState<string | null>(foto.imagem ?? null)
  const [soMiniatura, setSoMiniatura] = useState(false)

  useEffect(() => {
    if (foto.imagem || !foto.arquivo_id) return
    let objeto: string | null = null
    let ativo = true
    obterArquivo(foto.arquivo_id).then((blob) => {
      if (!ativo) return
      if (blob) {
        objeto = URL.createObjectURL(blob)
        setUrl(objeto)
      } else setSoMiniatura(true)
    })
    return () => { ativo = false; if (objeto) URL.revokeObjectURL(objeto) }
  }, [foto.imagem, foto.arquivo_id])

  const src = url ?? foto.miniatura
  if (!src) return <div className={`flex items-center justify-center bg-painel text-xs text-cinza ${className}`}>sem imagem</div>
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer" className={`relative block overflow-hidden ${className}`} onClick={(e) => !url && e.preventDefault()}>
      <img src={src} alt={foto.legenda ?? 'Foto da OS'} className="h-full w-full object-cover" />
      {soMiniatura && (
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white" title="Foto completa disponível com internet">
          <CloudOff size={10} /> miniatura
        </span>
      )}
    </a>
  )
}
