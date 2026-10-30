import { DatabaseSync } from 'node:sqlite'
import crypto from 'node:crypto'
import path from 'node:path'

const [username, password] = process.argv.slice(2)
if (!username || !password || password.length < 6) {
  console.error('用法：pnpm reset-password <用户名> <新密码（至少6位）>')
  process.exit(1)
}
const file = path.join(process.cwd(), 'data', 'accounts.db')
const db = new DatabaseSync(file)
const row = db.prepare('SELECT id FROM accounts WHERE username = ?').get(username)
if (!row) {
  console.error(`账户不存在：${username}`)
  process.exit(1)
}
const salt = crypto.randomBytes(16).toString('hex')
const hash = crypto.scryptSync(password, salt, 64).toString('hex')
db.prepare('UPDATE accounts SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, row.id)
db.prepare('DELETE FROM sessions WHERE account_id = ?').run(row.id)
console.log(`已重置「${username}」的密码，请重新登录。`)
