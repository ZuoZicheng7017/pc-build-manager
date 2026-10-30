import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { db } from './db'
import { Router, handleError, readJson, sendJson, type Ctx } from './http'
import { registerOrderRoutes } from './routes/orders'
import { registerCustomerRoutes } from './routes/customers'
import { registerStaffRoutes } from './routes/staff'
import { registerPartRoutes } from './routes/parts'
import { registerTemplateRoutes } from './routes/templates'
import { registerDashboardRoutes } from './routes/dashboard'
import { registerSettingsRoutes } from './routes/settings'
import { registerServiceRoutes } from './routes/services'
import { registerReportRoutes } from './routes/reports'
import { startAutoBackupLoop } from './backup'
import {
  clearSessionCookie, createAccount, createSession, ensureOwnerAccount, getAccount, listAccounts,
  logout, sessionAccount, setAccountPassword, setAccountStatus, setSessionCookie, tenantFor, verifyPassword,
} from './accounts'
import { runWithTenant } from './context'
import { resolveUpload } from './helpers'

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'
const startedAt = Date.now()
const distDir = path.join(process.cwd(), 'dist')

ensureOwnerAccount()
const router = new Router()
router.get('/api/health', (ctx) => {
  sendJson(ctx.res, { ok: true, version: '1.2.0', uptime: Math.floor((Date.now() - startedAt) / 1000), time: new Date().toISOString() })
})
router.get('/api/auth/status', (ctx) => {
  const account = sessionAccount(ctx.req)
  sendJson(ctx.res, { enabled: true, authenticated: Boolean(account), account: account ?? null })
})
router.post('/api/auth/login', async (ctx) => {
  const body = await readJson<{ username?: string; password?: string }>(ctx.req)
  const account = verifyPassword(String(body.username ?? ''), String(body.password ?? ''))
  if (!account) {
    sendJson(ctx.res, { error: '用户名或密码不正确' }, 401)
    return
  }
  setSessionCookie(ctx.res, createSession(account.id))
  sendJson(ctx.res, { ok: true, account })
})
router.post('/api/auth/logout', (ctx) => {
  logout(ctx.req)
  clearSessionCookie(ctx.res)
  sendJson(ctx.res, { ok: true })
})
router.get('/api/accounts', (ctx) => {
  const account = sessionAccount(ctx.req)
  if (!account?.is_admin) { sendJson(ctx.res, { error: '只有主账户可以管理账户' }, 403); return }
  sendJson(ctx.res, listAccounts())
})
router.post('/api/accounts', async (ctx) => {
  const current = sessionAccount(ctx.req)
  if (!current?.is_admin) { sendJson(ctx.res, { error: '只有主账户可以创建账户' }, 403); return }
  const body = await readJson<{ username?: string; password?: string }>(ctx.req)
  try {
    const account = createAccount(String(body.username ?? ''), String(body.password ?? ''))
    sendJson(ctx.res, account, 201)
  } catch (err) {
    sendJson(ctx.res, { error: err instanceof Error ? err.message : '创建失败' }, 422)
  }
})
router.patch('/api/accounts/:id/password', async (ctx) => {
  const current = sessionAccount(ctx.req)
  if (!current?.is_admin) { sendJson(ctx.res, { error: '只有主账户可以重置密码' }, 403); return }
  const body = await readJson<{ password?: string }>(ctx.req)
  try {
    setAccountPassword(Number(ctx.params.id), String(body.password ?? ''))
    sendJson(ctx.res, { ok: true })
  } catch (err) {
    sendJson(ctx.res, { error: err instanceof Error ? err.message : '重置失败' }, 422)
  }
})
router.patch('/api/accounts/:id/status', async (ctx) => {
  const current = sessionAccount(ctx.req)
  if (!current?.is_admin) { sendJson(ctx.res, { error: '只有主账户可以停用账户' }, 403); return }
  const body = await readJson<{ status?: string }>(ctx.req)
  if (body.status !== 'active' && body.status !== 'inactive') { sendJson(ctx.res, { error: '无效状态' }, 422); return }
  if (Number(ctx.params.id) === current.id) { sendJson(ctx.res, { error: '不能停用自己' }, 422); return }
  setAccountStatus(Number(ctx.params.id), body.status)
  sendJson(ctx.res, getAccount(Number(ctx.params.id)))
})
registerDashboardRoutes(router)
registerOrderRoutes(router)
registerCustomerRoutes(router)
registerStaffRoutes(router)
registerPartRoutes(router)
registerServiceRoutes(router)
registerReportRoutes(router)
registerTemplateRoutes(router)
registerSettingsRoutes(router)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function contentType(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

function serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, cache: string, csp?: string): void {
  let stat: fs.Stats
  try {
    stat = fs.statSync(file)
  } catch {
    sendJson(res, { error: '文件不存在' }, 404)
    return
  }
  if (!stat.isFile()) {
    sendJson(res, { error: '文件不存在' }, 404)
    return
  }
  const headers: http.OutgoingHttpHeaders = {
    'Content-Type': contentType(file),
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache,
    'Last-Modified': stat.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  }
  if (csp) headers['Content-Security-Policy'] = csp
  const range = req.headers.range
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (!match) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` })
      res.end()
      return
    }
    let start = match[1] === '' ? NaN : Number(match[1])
    let end = match[2] === '' ? NaN : Number(match[2])
    if (Number.isNaN(start)) {
      const suffix = Number.isNaN(end) ? 0 : end
      start = Math.max(0, stat.size - suffix)
      end = stat.size - 1
    } else {
      if (Number.isNaN(end)) end = stat.size - 1
      end = Math.min(end, stat.size - 1)
    }
    if (start < 0 || start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` })
      res.end()
      return
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`
    headers['Content-Length'] = end - start + 1
    res.writeHead(206, headers)
    if (req.method === 'HEAD') { res.end(); return }
    createReadStream(file, { start, end }).pipe(res)
    return
  }
  headers['Content-Length'] = stat.size
  res.writeHead(200, headers)
  if (req.method === 'HEAD') { res.end(); return }
  createReadStream(file).pipe(res)
}

function serveUploads(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
  const rel = decodeURIComponent(pathname.replace(/^\/uploads\/?/, ''))
  if (!rel) { sendJson(res, { error: '文件不存在' }, 404); return }
  let file: string
  try {
    file = resolveUpload(rel)
  } catch {
    sendJson(res, { error: '非法的文件路径' }, 400)
    return
  }
  serveFile(req, res, file, 'public, max-age=31536000, immutable', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'")
}

const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

function serveSpa(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
  if (!fs.existsSync(distDir)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>装机管家 API</title>
      <body style="font-family:system-ui;padding:40px;line-height:1.8">
      <h2>装机管家 API 已启动</h2>
      <p>开发模式请访问前端地址 <a href="http://localhost:5173">http://localhost:5173</a>。</p>
      <p>生产模式请先执行 <code>pnpm build</code>，再访问本地址。</p>
      <p>健康检查：<a href="/api/health">/api/health</a></p></body></html>`)
    return
  }
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  let file = path.join(distDir, safePath)
  if (!file.startsWith(distDir)) file = path.join(distDir, 'index.html')
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(distDir, 'index.html')
  }
  const isHtml = file.endsWith('.html')
  serveFile(req, res, file, isHtml ? 'no-cache' : 'public, max-age=31536000, immutable', isHtml ? APP_CSP : undefined)
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  const started = Date.now()
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = decodeURIComponent(url.pathname)

  res.on('finish', () => {
    if (!pathname.startsWith('/assets') && !pathname.startsWith('/uploads')) {
      console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`)
    }
  })

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,X-File-Name',
      })
      res.end()
      return
    }

    const account = sessionAccount(req)
    const publicApi = pathname.startsWith('/api/auth/') || pathname === '/api/health' || pathname.startsWith('/api/share/')
    if (pathname.startsWith('/api/') && !publicApi && !account) {
      sendJson(res, { error: '请先登录', authRequired: true }, 401)
      return
    }

    const matched = router.match(req.method || 'GET', pathname)
    if (matched) {
      const ctx: Ctx = { req, res, url, params: matched.params }
      if (account) {
        await runWithTenant(tenantFor(account), () => matched.handler(ctx))
      } else {
        await matched.handler(ctx)
      }
      return
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, { error: '接口不存在' }, 404)
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, { error: '方法不允许' }, 405)
      return
    }

    if (pathname.startsWith('/uploads/')) {
      serveUploads(req, res, pathname)
      return
    }

    serveSpa(req, res, pathname)
  } catch (err) {
    handleError(err, res)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`\n  装机管家 API  →  http://${HOST}:${PORT}`)
  if (HOST === '0.0.0.0') {
    const addresses = Object.values(os.networkInterfaces()).flat()
      .filter((item): item is os.NetworkInterfaceInfo => Boolean(item) && item!.family === 'IPv4' && !item!.internal)
      .map((item) => item.address)
    for (const address of addresses) console.log(`  局域网访问    →  http://${address}:${PORT}`)
    console.log('  账户登录      →  已启用（每账户独立数据）')
  }
  console.log(`  数据目录      →  ${process.env.DATA_DIR || path.join(process.cwd(), 'data')}`)
  if (fs.existsSync(distDir)) console.log(`  前端静态资源  →  ${distDir}\n`)
  else console.log(`  开发模式请另开终端运行 pnpm dev:web（http://localhost:5173）\n`)
  startAutoBackupLoop()
})

async function shutdown(): Promise<void> {
  console.log('\n正在关闭服务...')
  server.close()
  try { db.close() } catch { /* ignore */ }
  setTimeout(() => process.exit(0), 300)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
