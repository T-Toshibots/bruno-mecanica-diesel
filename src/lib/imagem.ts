/** Reduz a foto da câmera para caber bem no armazenamento do aparelho. */
export function comprimirImagem(arquivo: File, maxLado = 1024, qualidade = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * escala)
      canvas.height = Math.round(img.height * escala)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/jpeg', qualidade))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(arquivo)
  })
}
