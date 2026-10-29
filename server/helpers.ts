import fs from 'node:fs'
import path from 'node:path'
import { UPLOAD_DIR } from './db'
import { HttpError } from './http'

export function resolveUpload(storedName: string): string {
  const root = path.resolve(UPLOAD_DIR)
  const target = path.resolve(root, storedName)
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new HttpError(400, '非法的文件路径')
  }
  return target
}

export function removeUpload(storedName: string): void {
  try {
    fs.unlinkSync(resolveUpload(storedName))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[media] 删除文件失败', storedName, err)
  }
}

export function ensureMonthDir(): { month: string; dir: string } {
  const d = new Date()
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const dir = path.join(UPLOAD_DIR, month)
  fs.mkdirSync(dir, { recursive: true })
  return { month, dir }
}

export const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/x-m4v': 'm4v',
}

export function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const entry = Object.entries(MIME_EXT).find(([, e]) => e === ext)
  return entry ? entry[0] : ''
}

export function extFromMime(mime: string): string {
  return MIME_EXT[mime] ?? ''
}

export function fmtCents(cents: number): string {
  return (cents / 100).toFixed(2)
}
