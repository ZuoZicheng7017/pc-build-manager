import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendJson } from './http'

export const APP_PASSWORD = process.env.APP_PASSWORD || ''
const COOKIE = 'pc_build_session'
const MAX_AGE = 30 * 24 * 60 * 60

export function authEnabled(): boolean {
  return APP_PASSWORD.length > 0
}

function expectedToken(): string {
  return createHmac('sha256', APP_PASSWORD).update('pc-build-manager-session-v1').digest('hex')
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie || ''
  const result: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return result
}

export function isAuthenticated(req: IncomingMessage): boolean {
  if (!authEnabled()) return true
  const token = parseCookies(req)[COOKIE]
  if (!token) return false
  const expected = expectedToken()
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function setSession(res: ServerResponse): void {
  const token = expectedToken()
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`)
}

export function clearSession(res: ServerResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
}

export function checkPassword(input: string): boolean {
  if (!authEnabled()) return true
  const a = Buffer.from(input)
  const b = Buffer.from(APP_PASSWORD)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function authStatus(req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, { enabled: authEnabled(), authenticated: isAuthenticated(req) })
}
