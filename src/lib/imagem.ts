function carregar(arquivo: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(arquivo)
  })
}

function redimensionar(img: HTMLImageElement, maxLado: number) {
  const escala = Math.min(1, maxLado / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * escala)
  canvas.height = Math.round(img.height * escala)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * Prepara a foto da câmera: arquivo completo (máx. 1600px, JPEG 70%) para enviar ao Storage
 * e uma miniatura pequena (texto) que viaja junto com o registro e aparece mesmo offline.
 */
export async function prepararFoto(arquivo: File): Promise<{ blob: Blob; miniatura: string }> {
  const img = await carregar(arquivo)
  try {
    const grande = redimensionar(img, 1600)
    const blob = await new Promise<Blob>((ok, erro) => grande.toBlob((b) => (b ? ok(b) : erro(new Error('Falha na foto'))), 'image/jpeg', 0.7))
    const miniatura = redimensionar(img, 240).toDataURL('image/jpeg', 0.6)
    return { blob, miniatura }
  } finally {
    URL.revokeObjectURL(img.src)
  }
}
