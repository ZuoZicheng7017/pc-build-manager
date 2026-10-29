import type { IncomingMessage, ServerResponse } from 'node:http'
import { ZodError, type ZodType } from 'zod'

export class HttpError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export interface Ctx {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  params: Record<string, string>
}

type Handler = (ctx: Ctx) => Promise<void> | void

interface Route {
  method: string
  segments: string[]
  handler: Handler
}

export class Router {
  private routes: Route[] = []

  add(method: string, pattern: string, handler: Handler): void {
    this.routes.push({ method, segments: pattern.split('/').filter(Boolean), handler })
  }

  get(pattern: string, handler: Handler) { this.add('GET', pattern, handler) }
  post(pattern: string, handler: Handler) { this.add('POST', pattern, handler) }
  put(pattern: string, handler: Handler) { this.add('PUT', pattern, handler) }
  patch(pattern: string, handler: Handler) { this.add('PATCH', pattern, handler) }
  delete(pattern: string, handler: Handler) { this.add('DELETE', pattern, handler) }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    const parts = pathname.split('/').filter(Boolean)
    for (const route of this.routes) {
      if (route.method !== method) continue
      if (route.segments.length !== parts.length) continue
      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < parts.length; i++) {
        const seg = route.segments[i]
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(parts[i])
        } else if (seg !== parts[i]) {
          ok = false
          break
        }
      }
      if (ok) return { handler: route.handler, params }
    }
    return null
  }
}

export function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

export function sendNoContent(res: ServerResponse): void {
  res.writeHead(204, { 'Cache-Control': 'no-store' })
  res.end()
}

export async function readJson<T>(req: IncomingMessage, limitBytes = 4 * 1024 * 1024): Promise<T> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > limitBytes) throw new HttpError(413, '请求体过大')
    chunks.push(buf)
  }
  if (size === 0) return {} as T
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    throw new HttpError(400, '请求体不是合法的 JSON')
  }
}

export function validate<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    throw new HttpError(422, '表单校验未通过：' + details.map((d) => `${d.path || '字段'} ${d.message}`).join('；'), details)
  }
  return result.data
}

export function handleError(err: unknown, res: ServerResponse): void {
  if (res.headersSent) {
    res.end()
    return
  }
  if (err instanceof HttpError) {
    sendJson(res, { error: err.message, details: err.details }, err.status)
    return
  }
  if (err instanceof ZodError) {
    sendJson(res, { error: '表单校验未通过', details: err.issues }, 422)
    return
  }
  console.error('[server error]', err)
  const message = err instanceof Error ? err.message : '服务器内部错误'
  sendJson(res, { error: '服务器内部错误', details: message }, 500)
}

export function queryInt(url: URL, key: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = url.searchParams.get(key)
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  if (Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export function queryStr(url: URL, key: string): string {
  return (url.searchParams.get(key) ?? '').trim()
}
