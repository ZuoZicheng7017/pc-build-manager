import { DatabaseSync } from 'node:sqlite'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { DATA_DIR, UPLOAD_DIR, createAccountDatabase, getDefaultDb } from './db'
import type { Tenant } from './context'
import type { Account } from '../shared/types'

const CONTROL_DB = path.join(DATA_DIR, 'accounts.db')
fs.mkdirSync(DATA_DIR, { recursive: true })
const control = new DatabaseSync(CONTROL_DB)
control.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    data_dir TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shares (
    token TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`)

const COOKIE = 'pc_account_session'
const DAY = 24 * 60 * 60 * 1000
const dbCache = new Map<number, DatabaseSync>()

function hash(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function now(): string {
  return new Date().toISOString()
}

function rowToAccount(row: Record<string, unknown>): Account {
  return {
    id: Number(row.id),
    username: String(row.username),
    is_admin: Number(row.is_admin),
    status: String(row.status),
    created_at: String(row.created_at),
  }
}

export function ensureOwnerAccount(): void {
  let owner = control.prepare("SELECT id FROM accounts WHERE is_admin = 1 ORDER BY id LIMIT 1").get() as { id: number } | undefined
  if (!owner) {
    const count = (control.prepare('SELECT COUNT(*) AS c FROM accounts').get() as { c: number }).c
    if (count > 0) return
    const salt = crypto.randomBytes(16).toString('hex')
    const password = process.env.APP_PASSWORD || 'Zzc010423'
    control.prepare(`
      INSERT INTO accounts (username, password_hash, salt, is_admin, status, data_dir, created_at)
      VALUES (?, ?, ?, 1, 'active', ?, ?)
    `).run('xiaozuozhuangji', hash(password, salt), salt, DATA_DIR, now())
    owner = control.prepare("SELECT id FROM accounts WHERE username = 'xiaozuozhuangji'").get() as { id: number }
  }
  // 迁移旧版本已有的分享 token，保证升级前的链接仍然可用
  try {
    const rows = getDefaultDb().prepare("SELECT id, share_token FROM orders WHERE share_token IS NOT NULL AND share_token <> ''").all() as { id: number; share_token: string }[]
    const insert = control.prepare('INSERT OR IGNORE INTO shares (token, account_id, order_id, created_at) VALUES (?, ?, ?, ?)')
    for (const row of rows) insert.run(row.share_token, owner.id, row.id, now())
  } catch { /* ignore */ }
}

function accountRow(id: number): Record<string, unknown> | undefined {
  return control.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Record<string, unknown> | undefined
}

export function getAccount(id: number): Account | undefined {
  const row = accountRow(id)
  return row ? rowToAccount(row) : undefined
}

export function listAccounts(): Account[] {
  return (control.prepare('SELECT * FROM accounts ORDER BY id').all() as Record<string, unknown>[]).map(rowToAccount)
}

export function getAccountByUsername(username: string): Account | undefined {
  const row = control.prepare('SELECT * FROM accounts WHERE username = ?').get(username.trim()) as Record<string, unknown> | undefined
  return row ? rowToAccount(row) : undefined
}

export function verifyPassword(username: string, password: string): Account | undefined {
  const row = control.prepare('SELECT * FROM accounts WHERE username = ?').get(username.trim()) as
    | { id: number; username: string; password_hash: string; salt: string; status: string; is_admin: number; created_at: string }
    | undefined
  if (!row || row.status !== 'active') return undefined
  const actual = Buffer.from(hash(password, row.salt), 'hex')
  const expected = Buffer.from(row.password_hash, 'hex')
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return undefined
  return rowToAccount(row as unknown as Record<string, unknown>)
}

export function createAccount(username: string, password: string): Account {
  const name = username.trim()
  if (name.length < 2) throw new Error('用户名至少 2 个字符')
  if (password.length < 6) throw new Error('密码至少 6 个字符')
  if (getAccountByUsername(name)) throw new Error('用户名已存在')
  const salt = crypto.randomBytes(16).toString('hex')
  const info = control.prepare(`
    INSERT INTO accounts (username, password_hash, salt, is_admin, status, data_dir, created_at)
    VALUES (?, ?, ?, 0, 'active', '', ?)
  `).run(name, hash(password, salt), salt, now())
  const id = Number(info.lastInsertRowid)
  const dir = path.join(DATA_DIR, 'accounts', String(id))
  control.prepare('UPDATE accounts SET data_dir = ? WHERE id = ?').run(dir, id)
  return getAccount(id)!
}

export function setAccountPassword(id: number, password: string): void {
  if (password.length < 6) throw new Error('密码至少 6 个字符')
  const salt = crypto.randomBytes(16).toString('hex')
  control.prepare('UPDATE accounts SET password_hash = ?, salt = ? WHERE id = ?').run(hash(password, salt), salt, id)
  control.prepare('DELETE FROM sessions WHERE account_id = ?').run(id)
}

export function setAccountStatus(id: number, status: 'active' | 'inactive'): void {
  control.prepare('UPDATE accounts SET status = ? WHERE id = ?').run(status, id)
  if (status === 'inactive') control.prepare('DELETE FROM sessions WHERE account_id = ?').run(id)
}

export function createSession(accountId: number): string {
  const token = crypto.randomUUID()
  const expires = new Date(Date.now() + 30 * DAY).toISOString()
  control.prepare('INSERT INTO sessions (token, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, accountId, expires, now())
  return token
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie || ''
  const out: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return out
}

export function sessionAccount(req: IncomingMessage): Account | undefined {
  const token = parseCookies(req)[COOKIE]
  if (!token) return undefined
  const row = control.prepare(`
    SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now()) as Record<string, unknown> | undefined
  return row ? rowToAccount(row) : undefined
}

export function setSessionCookie(res: ServerResponse, token: string): void {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`)
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
}

export function logout(req: IncomingMessage): void {
  const token = parseCookies(req)[COOKIE]
  if (token) control.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function tenantFor(account: Account): Tenant {
  const row = accountRow(account.id)!
  const dataDir = path.resolve(String(row.data_dir))
  const isOwner = dataDir === path.resolve(DATA_DIR)
  const db = isOwner ? getDefaultDb() : (dbCache.get(account.id) ?? createAccountDatabase(path.join(dataDir, 'app.db')))
  if (!isOwner) dbCache.set(account.id, db)
  const uploadDir = isOwner ? UPLOAD_DIR : path.join(UPLOAD_DIR, 'accounts', String(account.id))
  const backupRoot = process.env.BACKUP_DIR || path.join(path.dirname(DATA_DIR), 'backups')
  return {
    accountId: account.id,
    username: account.username,
    isAdmin: Boolean(account.is_admin),
    db,
    dataDir,
    uploadDir,
    backupDir: isOwner ? backupRoot : path.join(backupRoot, 'accounts', String(account.id)),
  }
}

export function registerShare(token: string, accountId: number, orderId: number): void {
  control.prepare('INSERT OR REPLACE INTO shares (token, account_id, order_id, created_at) VALUES (?, ?, ?, ?)')
    .run(token, accountId, orderId, now())
}

export function unregisterShare(token: string): void {
  control.prepare('DELETE FROM shares WHERE token = ?').run(token)
}

export function shareAccount(token: string): { accountId: number; orderId: number } | undefined {
  const row = control.prepare('SELECT account_id, order_id FROM shares WHERE token = ?').get(token) as
    | { account_id: number; order_id: number }
    | undefined
  return row ? { accountId: row.account_id, orderId: row.order_id } : undefined
}
