/**
 * 上传前压缩图片：最长边 2000px，JPEG 质量 0.82。
 * 手机原图动辄 5-10MB，压缩后通常 300-800KB，显著节省流量与磁盘。
 */
export async function prepareImage(file: File): Promise<File> {
  const compressible = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  if (!compressible || file.size < 350 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const maxSide = 2000
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1200 * 1024) return file
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

export function isVideo(file: File | { mime: string }): boolean {
  const mime = 'mime' in file ? file.mime : file.type
  return mime.startsWith('video/')
}
