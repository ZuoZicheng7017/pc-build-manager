import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { calcOrderTotal, DEFAULT_CHECKLIST, type ChecklistItem } from '../shared/types'
import { currentTenant } from './context'

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
const DB_FILE = path.join(DATA_DIR, 'app.db')

fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const defaultDb = new DatabaseSync(DB_FILE)

/**
 * 所有业务代码仍然使用 db.prepare / db.exec；
 * 请求进入账户上下文后自动路由到该账户独立的 SQLite 文件。
 */
export const db = new Proxy(defaultDb, {
  get(target, prop) {
    const conn = currentTenant()?.db ?? target
    const value = Reflect.get(conn, prop, conn)
    return typeof value === 'function' ? value.bind(conn) : value
  },
}) as DatabaseSync

export function getDefaultDb(): DatabaseSync {
  return defaultDb
}

export function createAccountDatabase(file: string): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const conn = new DatabaseSync(file)
  conn.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `)
  const hasSchema = (conn.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table'").get() as { c: number }).c > 0
  if (!hasSchema) {
    const objects = defaultDb.prepare(`
      SELECT sql FROM sqlite_master
      WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
      ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'view' THEN 3 ELSE 4 END
    `).all() as { sql: string }[]
    for (const object of objects) conn.exec(object.sql)
  }
  ensureDefaultSettings(conn)
  return conn
}

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`)

db.exec(`
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'engineer',
  color TEXT NOT NULL DEFAULT '#4f46e5',
  status TEXT NOT NULL DEFAULT 'active',
  commission_rate INTEGER NOT NULL DEFAULT 0,
  hired_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  wechat TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'normal',
  tags TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  deleted_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '默认地址',
  address TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '其他',
  brand TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  spec TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '个',
  cost_cents INTEGER NOT NULL DEFAULT 0,
  sale_cents INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  warranty_months INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NOT NULL DEFAULT '',
  deleted_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS part_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  cost_cents INTEGER NOT NULL,
  sale_cents INTEGER NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'other',
  budget_cents INTEGER NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'mainstream',
  labor_fee_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS template_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  part_id INTEGER REFERENCES parts(id) ON DELETE SET NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL DEFAULT 'new',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  parts_source TEXT NOT NULL DEFAULT 'shop',
  appointment_at TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  labor_fee_cents INTEGER NOT NULL DEFAULT 0,
  travel_fee_cents INTEGER NOT NULL DEFAULT 0,
  material_fee_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'wechat',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  warranty_months INTEGER NOT NULL DEFAULT 0,
  checklist_json TEXT NOT NULL DEFAULT '[]',
  follow_up_at TEXT NOT NULL DEFAULT '',
  follow_up_note TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT NOT NULL DEFAULT '',
  inventory_applied INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  share_token TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  part_id INTEGER REFERENCES parts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  spec TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS order_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'image',
  file_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'during',
  caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  operator TEXT NOT NULL DEFAULT '我',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '装机',
  price_cents INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_item_id INTEGER REFERENCES service_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  qty INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  order_id INTEGER,
  kind TEXT NOT NULL,
  qty INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'final',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'wechat',
  note TEXT NOT NULL DEFAULT '',
  paid_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_appointment ON orders(appointment_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_media_order ON order_media(order_id);
CREATE INDEX IF NOT EXISTS idx_logs_order ON order_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_prices_part ON part_prices(part_id);
CREATE INDEX IF NOT EXISTS idx_titems_template ON template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_order_services_order ON order_services(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_part ON stock_movements(part_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON stock_movements(order_id);
`)

// 轻量迁移：老数据库没有 parts_source 时补列（旧单默认视为我方提供配件）
function ensureColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}
ensureColumn('orders', 'parts_source', "TEXT NOT NULL DEFAULT 'shop'")
ensureColumn('orders', 'service_extra_cents', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('orders', 'precheck_json', "TEXT NOT NULL DEFAULT '[]'")
ensureColumn('orders', 'parts_confirmed', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('orders', 'parts_confirm_note', "TEXT NOT NULL DEFAULT ''")
ensureColumn('order_media', 'category', "TEXT NOT NULL DEFAULT 'during'")
ensureColumn('orders', 'follow_up_at', "TEXT NOT NULL DEFAULT ''")
ensureColumn('orders', 'follow_up_note', "TEXT NOT NULL DEFAULT ''")
ensureColumn('orders', 'rating', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('staff', 'commission_rate', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('orders', 'deleted_at', "TEXT NOT NULL DEFAULT ''")
ensureColumn('orders', 'inventory_applied', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('customers', 'deleted_at', "TEXT NOT NULL DEFAULT ''")
ensureColumn('parts', 'deleted_at', "TEXT NOT NULL DEFAULT ''")
// 未删除工单视图：列表、报表、提醒都只看 active_orders；回收站直接查 orders
db.exec("DROP VIEW IF EXISTS active_orders")
db.exec("CREATE VIEW active_orders AS SELECT * FROM orders WHERE deleted_at = ''")
db.exec("DROP VIEW IF EXISTS active_customers")
db.exec("CREATE VIEW active_customers AS SELECT * FROM customers WHERE deleted_at = ''")
db.exec("DROP VIEW IF EXISTS active_parts")
db.exec("CREATE VIEW active_parts AS SELECT * FROM parts WHERE deleted_at = ''")

// 老库兼容：客户主地址迁移为默认地址
const legacyAddresses = db.prepare(`
  SELECT c.id, c.name, c.phone, c.address, c.created_at FROM customers c
  WHERE c.address <> '' AND NOT EXISTS (SELECT 1 FROM customer_addresses a WHERE a.customer_id = c.id)
`).all() as { id: number; name: string; phone: string; address: string; created_at: string }[]
for (const row of legacyAddresses) {
  db.prepare(`
    INSERT INTO customer_addresses (customer_id, label, address, contact_name, phone, is_default, created_at)
    VALUES (?, '默认地址', ?, ?, ?, 1, ?)
  `).run(row.id, row.address, row.name, row.phone, row.created_at)
}

// 老库兼容：已有服务费但没有服务明细的工单，把服务费视为“其他服务费”
const legacyServiceRows = db.prepare(`
  SELECT o.id, o.labor_fee_cents FROM orders o
  WHERE o.labor_fee_cents > 0 AND o.service_extra_cents = 0
    AND NOT EXISTS (SELECT 1 FROM order_services s WHERE s.order_id = o.id)
`).all() as { id: number; labor_fee_cents: number }[]
for (const row of legacyServiceRows) {
  db.prepare('UPDATE orders SET service_extra_cents = ? WHERE id = ?').run(row.labor_fee_cents, row.id)
}

// 老库兼容：把已收金额迁移成一条收款流水
const legacyPayments = db.prepare(`
  SELECT id, paid_cents, payment_method, updated_at FROM orders o
  WHERE o.paid_cents > 0 AND NOT EXISTS (SELECT 1 FROM order_payments p WHERE p.order_id = o.id)
`).all() as { id: number; paid_cents: number; payment_method: string; updated_at: string }[]
for (const row of legacyPayments) {
  db.prepare(`
    INSERT INTO order_payments (order_id, kind, amount_cents, method, note, paid_at, created_at)
    VALUES (?, 'other', ?, ?, '历史收款（迁移）', ?, ?)
  `).run(row.id, row.paid_cents, row.payment_method, row.updated_at, row.updated_at)
}

// ─── 时间工具（本地时区） ──────────────────────────────────────────────

export function nowIso(): string {
  return toLocalIso(new Date())
}

export function toLocalIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function todayStr(): string {
  return toLocalIso(new Date()).slice(0, 10)
}

export function addDays(days: number, hour = 10, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return toLocalIso(d)
}

function monthDate(offset: number, day: number, hour = 15): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  d.setDate(day)
  d.setHours(hour, 0, 0, 0)
  return toLocalIso(d)
}

export function monthKey(offset = 0): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── 设置 ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Record<string, string> = {
  shop_name: '我的装机工作室',
  shop_phone: '',
  shop_address: '',
  default_travel_fee_cents: '0',
  default_warranty_months: '12',
  default_labor_fee_cents: '20000',
  auto_backup_enabled: '1',
  auto_backup_retention: '7',
  last_auto_backup_at: '',
  ui_mode: 'full',
}

function ensureDefaultSettings(conn: DatabaseSync = db): void {
  const stmt = conn.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) stmt.run(key, value)
}

export function getSettingsMap(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const map = { ...DEFAULT_SETTINGS }
  for (const row of rows) map[row.key] = row.value
  return map
}

export function writeSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

// ─── 种子数据 ─────────────────────────────────────────────────────────

interface SeedPart {
  id: number
  name: string
  category: string
  brand: string
  model: string
  spec: string
  cost: number
  sale: number
  stock: number
  min: number
  supplier: string
  warranty: number
}

const SEED_PARTS: Omit<SeedPart, 'id'>[] = [
  { name: 'i3-12100F 散片', category: 'CPU', brand: 'Intel', model: 'i3-12100F', spec: '4 核 8 线程 / LGA1700', cost: 460, sale: 499, stock: 6, min: 2, supplier: '数码港', warranty: 36 },
  { name: 'i5-14600KF 盒装', category: 'CPU', brand: 'Intel', model: 'i5-14600KF', spec: '14 核 20 线程 / LGA1700', cost: 1490, sale: 1599, stock: 4, min: 2, supplier: '数码港', warranty: 36 },
  { name: 'i7-14700KF 盒装', category: 'CPU', brand: 'Intel', model: 'i7-14700KF', spec: '20 核 28 线程 / LGA1700', cost: 2440, sale: 2599, stock: 2, min: 1, supplier: '数码港', warranty: 36 },
  { name: 'R5 7500F 盒装', category: 'CPU', brand: 'AMD', model: 'R5 7500F', spec: '6 核 12 线程 / AM5', cost: 980, sale: 1049, stock: 5, min: 2, supplier: '芯城科技', warranty: 36 },
  { name: '微星 B760M MORTAR II', category: '主板', brand: '微星', model: 'B760M MORTAR II', spec: 'DDR5 / mATX / WiFi6', cost: 1020, sale: 1099, stock: 4, min: 1, supplier: '数码港', warranty: 36 },
  { name: '华硕 TUF B650M-PLUS', category: '主板', brand: '华硕', model: 'TUF B650M-PLUS', spec: 'DDR5 / mATX / 重炮手', cost: 1110, sale: 1199, stock: 3, min: 1, supplier: '芯城科技', warranty: 36 },
  { name: '华硕 H610M-A', category: '主板', brand: '华硕', model: 'H610M-A', spec: 'DDR4 / mATX', cost: 550, sale: 599, stock: 6, min: 2, supplier: '数码港', warranty: 36 },
  { name: '金百达 银爵 DDR5 6000 16G×2', category: '内存', brand: '金百达', model: '银爵 DDR5', spec: '6000MHz 16G×2 套条', cost: 640, sale: 699, stock: 8, min: 2, supplier: '存储之家', warranty: 60 },
  { name: '光威 天策 DDR4 3200 16G×2', category: '内存', brand: '光威', model: '天策 DDR4', spec: '3200MHz 16G×2 套条', cost: 360, sale: 399, stock: 7, min: 2, supplier: '存储之家', warranty: 60 },
  { name: '金百达 DDR4 3200 16G', category: '内存', brand: '金百达', model: 'DDR4 3200', spec: '3200MHz 16G 单条', cost: 215, sale: 239, stock: 10, min: 3, supplier: '存储之家', warranty: 60 },
  { name: '致态 TiPlus7100 1TB', category: '硬盘', brand: '致态', model: 'TiPlus7100', spec: 'PCIe 4.0 NVMe 1TB', cost: 505, sale: 549, stock: 9, min: 3, supplier: '存储之家', warranty: 60 },
  { name: '铠侠 RC20 500G', category: '硬盘', brand: '铠侠', model: 'RC20', spec: 'PCIe 3.0 NVMe 500G', cost: 265, sale: 289, stock: 8, min: 3, supplier: '存储之家', warranty: 36 },
  { name: '三星 990 PRO 2TB', category: '硬盘', brand: '三星', model: '990 PRO', spec: 'PCIe 4.0 NVMe 2TB', cost: 1200, sale: 1299, stock: 3, min: 1, supplier: '存储之家', warranty: 60 },
  { name: '七彩虹 RTX 4060 Ultra W OC 8G', category: '显卡', brand: '七彩虹', model: 'RTX 4060 Ultra W', spec: '8G GDDR6 / 三风扇', cost: 2260, sale: 2399, stock: 3, min: 1, supplier: '显卡工坊', warranty: 36 },
  { name: '华硕 TUF RTX 4070 SUPER 12G', category: '显卡', brand: '华硕', model: 'RTX 4070 SUPER', spec: '12G GDDR6X / TUF', cost: 4650, sale: 4899, stock: 2, min: 1, supplier: '显卡工坊', warranty: 36 },
  { name: '蓝宝石 RX 7800 XT 16G', category: '显卡', brand: '蓝宝石', model: 'RX 7800 XT', spec: '16G GDDR6 / 白金版', cost: 3700, sale: 3899, stock: 2, min: 1, supplier: '显卡工坊', warranty: 36 },
  { name: '振华 冰山金蝶 650W', category: '电源', brand: '振华', model: '冰山金蝶 650', spec: '650W 金牌 / 全模组', cost: 455, sale: 499, stock: 5, min: 2, supplier: '机电总汇', warranty: 60 },
  { name: '长城 V6 600W', category: '电源', brand: '长城', model: 'V6 600W', spec: '600W 铜牌 / 直出', cost: 315, sale: 349, stock: 6, min: 2, supplier: '机电总汇', warranty: 36 },
  { name: '海韵 FOCUS GX-850', category: '电源', brand: '海韵', model: 'FOCUS GX-850', spec: '850W 金牌 / 全模组 ATX3.0', cost: 830, sale: 899, stock: 3, min: 1, supplier: '机电总汇', warranty: 120 },
  { name: '利民 PA120 SE', category: '散热', brand: '利民', model: 'PA120 SE', spec: '双塔 6 热管 / 风冷', cost: 145, sale: 169, stock: 8, min: 2, supplier: '散热专门店', warranty: 36 },
  { name: '九州风神 AK620', category: '散热', brand: '九州风神', model: 'AK620', spec: '双塔 6 热管 / 数显', cost: 220, sale: 249, stock: 4, min: 2, supplier: '散热专门店', warranty: 36 },
  { name: '先马 朱雀 Air', category: '机箱', brand: '先马', model: '朱雀 Air', spec: 'ATX / 网孔前面板 / 送 3 风扇', cost: 175, sale: 199, stock: 5, min: 2, supplier: '机电总汇', warranty: 12 },
  { name: '联力 包豪斯 O11D', category: '机箱', brand: '联力', model: 'O11D', spec: '双仓海景房 / ATX', cost: 540, sale: 599, stock: 2, min: 1, supplier: '机电总汇', warranty: 12 },
  { name: 'AOC 24G2 165Hz', category: '显示器', brand: 'AOC', model: '24G2', spec: '23.8 英寸 / 1080P / 165Hz', cost: 730, sale: 799, stock: 3, min: 1, supplier: '显示设备城', warranty: 36 },
  { name: '罗技 G102', category: '外设', brand: '罗技', model: 'G102', spec: '有线鼠标 / 8000DPI', cost: 110, sale: 129, stock: 6, min: 2, supplier: '外设小铺', warranty: 24 },
]

function seedDatabase(): void {
  const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
  // 只在真正的空库写入演示数据，避免给已经录入真实数据的库混入示例
  if (count('staff') > 0 || count('customers') > 0 || count('orders') > 0 || count('parts') > 0) return

  db.exec('BEGIN')
  try {
    seedDatabaseInner()
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function seedDatabaseInner(): void {
  const now = nowIso()
  const staffRows = [
    { name: '陈立', phone: '138-0000-0001', role: 'owner', color: '#4f46e5', hired_at: '2022-03-01', notes: '工作室负责人，主攻高端主机与水冷' },
    { name: '李航', phone: '138-0000-0002', role: 'engineer', color: '#0891b2', hired_at: '2024-06-12', notes: '装机、系统调试、上门维修' },
    { name: '王锐', phone: '138-0000-0003', role: 'apprentice', color: '#7c3aed', hired_at: '2026-08-01', notes: '学徒，负责清灰保养与协助装机' },
  ]
  const insStaff = db.prepare('INSERT INTO staff (name, phone, role, color, status, hired_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const staffIds: number[] = []
  for (const s of staffRows) {
    const info = insStaff.run(s.name, s.phone, s.role, s.color, 'active', s.hired_at, s.notes, now)
    staffIds.push(Number(info.lastInsertRowid))
  }

  const customers = [
    { name: '王浩然', phone: '138-1234-5678', wechat: 'wanghr_pc', address: '西湖区文三路 90 号东部软件园 3 号楼 502', district: '西湖区', source: '抖音', level: 'vip', tags: '游戏玩家,爽快', notes: '偏好白色海景房，家里有猫' },
    { name: '林晓', phone: '139-2233-4455', wechat: 'linxiao_88', address: '拱墅区湖墅南路 188 号 3 单元 601', district: '拱墅区', source: '转介绍', level: 'normal', tags: '上班族', notes: '晚上 7 点后方便上门' },
    { name: '张一鸣', phone: '137-8899-0011', wechat: 'zym_gamer', address: '滨江区江南大道 228 号星光国际 2 幢 1802', district: '滨江区', source: '小红书', level: 'key', tags: '设计师,升级', notes: '需要保留旧硬盘数据' },
    { name: '刘建国', phone: '136-5566-7788', wechat: 'ljg_1968', address: '上城区解放路 168 号 5 单元 302', district: '上城区', source: '闲鱼', level: 'normal', tags: '长辈,清灰', notes: '说话声音大，人很客气' },
    { name: '赵敏', phone: '135-6677-8899', wechat: 'zhaomin_design', address: '余杭区欧美金融城 EFC 5 幢 1201', district: '余杭区', source: '朋友介绍', level: 'vip', tags: '剪辑师,高预算', notes: '需要 4K 剪辑与达芬奇调色' },
    { name: '周子涵', phone: '188-1234-0000', wechat: 'zhouzh_6', address: '萧山区市心中路 123 号 8 楼', district: '萧山区', source: '抖音', level: 'normal', tags: '学生党', notes: '预算敏感，喜欢 RGB' },
    { name: '孙悦', phone: '186-0000-1234', wechat: 'sunyue_hr', address: '西湖区古墩路 456 号 2 单元 1102', district: '西湖区', source: '转介绍', level: 'key', tags: '人事,办公', notes: '公司采购，需要开票' },
    { name: '吴磊', phone: '189-9876-5432', wechat: 'wulei_pc', address: '钱塘区学源街 18 号 6 幢 401', district: '钱塘区', source: '闲鱼', level: 'normal', tags: '售后', notes: '显卡有异响，已返厂检测' },
    { name: '郑凯', phone: '177-5555-6666', wechat: 'zhengkai_k', address: '拱墅区丰潭路 380 号 1 幢 703', district: '拱墅区', source: '其他', level: 'normal', tags: '', notes: '' },
  ]
  const insCustomer = db.prepare(`
    INSERT INTO customers (name, phone, wechat, address, district, source, level, tags, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const customerIds: number[] = []
  for (const c of customers) {
    const info = insCustomer.run(c.name, c.phone, c.wechat, c.address, c.district, c.source, c.level, c.tags, c.notes, now, now)
    customerIds.push(Number(info.lastInsertRowid))
  }

  const insPart = db.prepare(`
    INSERT INTO parts (name, category, brand, model, spec, unit, cost_cents, sale_cents, stock, min_stock, supplier, warranty_months, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '个', ?, ?, ?, ?, ?, ?, 'active', '', ?, ?)`)
  const insPrice = db.prepare(`
    INSERT INTO part_prices (part_id, cost_cents, sale_cents, supplier, note, recorded_at) VALUES (?, ?, ?, ?, '初始价格', ?)`)
  const parts: SeedPart[] = []
  for (const p of SEED_PARTS) {
    const info = insPart.run(p.name, p.category, p.brand, p.model, p.spec, p.cost * 100, p.sale * 100, p.stock, p.min, p.supplier, p.warranty, now, now)
    const id = Number(info.lastInsertRowid)
    parts.push({ ...p, id })
    insPrice.run(id, p.cost * 100, p.sale * 100, p.supplier, now)
  }
  const byName = (name: string) => {
    const p = parts.find((x) => x.name === name)
    if (!p) throw new Error(`seed part missing: ${name}`)
    return p
  }

  const templates: { name: string; purpose: string; budget: number; level: string; labor: number; notes: string; parts: [string, number][] }[] = [
    {
      name: '3000 元家用办公主机', purpose: 'office', budget: 3000, level: 'entry', labor: 150, notes: '网页、Office、网课、轻量影音，安静省电',
      parts: [['i3-12100F 散片', 1], ['华硕 H610M-A', 1], ['金百达 DDR4 3200 16G', 1], ['铠侠 RC20 500G', 1], ['长城 V6 600W', 1], ['利民 PA120 SE', 1], ['先马 朱雀 Air', 1]],
    },
    {
      name: '7000 元主流游戏主机', purpose: 'gaming', budget: 7000, level: 'mainstream', labor: 200, notes: '1080P/2K 高画质网游与 3A，白色主题',
      parts: [['R5 7500F 盒装', 1], ['华硕 TUF B650M-PLUS', 1], ['金百达 银爵 DDR5 6000 16G×2', 1], ['致态 TiPlus7100 1TB', 1], ['七彩虹 RTX 4060 Ultra W OC 8G', 1], ['振华 冰山金蝶 650W', 1], ['利民 PA120 SE', 1], ['先马 朱雀 Air', 1]],
    },
    {
      name: '12500 元 2K 高画质主机', purpose: 'gaming', budget: 12500, level: 'high', labor: 300, notes: '2K 高刷 3A、直播推流，海景房灯效',
      parts: [['i7-14700KF 盒装', 1], ['微星 B760M MORTAR II', 1], ['金百达 银爵 DDR5 6000 16G×2', 1], ['三星 990 PRO 2TB', 1], ['华硕 TUF RTX 4070 SUPER 12G', 1], ['海韵 FOCUS GX-850', 1], ['九州风神 AK620', 1], ['联力 包豪斯 O11D', 1]],
    },
    {
      name: '10000 元设计剪辑主机', purpose: 'design', budget: 10000, level: 'high', labor: 300, notes: 'PR / AE / 达芬奇 4K 剪辑，32G 内存起步',
      parts: [['i7-14700KF 盒装', 1], ['微星 B760M MORTAR II', 1], ['金百达 银爵 DDR5 6000 16G×2', 1], ['三星 990 PRO 2TB', 1], ['七彩虹 RTX 4060 Ultra W OC 8G', 1], ['振华 冰山金蝶 650W', 1], ['九州风神 AK620', 1], ['先马 朱雀 Air', 1]],
    },
  ]
  const insTemplate = db.prepare(`
    INSERT INTO templates (name, purpose, budget_cents, level, labor_fee_cents, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const insTItem = db.prepare(`
    INSERT INTO template_items (template_id, part_id, qty, unit_price_cents, note) VALUES (?, ?, ?, ?, '')`)
  const templateIds: number[] = []
  for (const t of templates) {
    const info = insTemplate.run(t.name, t.purpose, t.budget * 100, t.level, t.labor * 100, t.notes, now, now)
    const id = Number(info.lastInsertRowid)
    templateIds.push(id)
    for (const [name, qty] of t.parts) {
      const p = byName(name)
      insTItem.run(id, p.id, qty, p.sale * 100)
    }
  }

  const insOrder = db.prepare(`
    INSERT INTO orders (order_no, customer_id, staff_id, template_id, service_type, status, priority, parts_source, appointment_at, address, contact_name, contact_phone, description, labor_fee_cents, travel_fee_cents, material_fee_cents, discount_cents, total_cents, cost_cents, paid_cents, payment_method, payment_status, warranty_months, checklist_json, completed_at, share_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
  const insItem = db.prepare(`
    INSERT INTO order_items (order_id, part_id, name, spec, qty, unit_price_cents, cost_cents, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, '')`)
  const insLog = db.prepare(`
    INSERT INTO order_logs (order_id, action, detail, operator, created_at) VALUES (?, ?, ?, '系统', ?)`)

  let seq = 0
  function seedOrder(input: {
    customer: number
    staff: number
    template?: number
    service: string
    status: string
    priority?: string
    partsSource?: 'customer' | 'shop' | 'mixed'
    appointment: string
    created?: string
    completed?: string | null
    description?: string
    parts?: [string, number][]
    labor: number
    travel?: number
    material?: number
    discount?: number
    paid?: number
    payment_method?: string
    warranty?: number
    withChecklist?: boolean
  }): number {
    const items = (input.parts ?? []).map(([name, qty]) => {
      const p = byName(name)
      return { part_id: p.id, name: p.name, spec: p.spec, qty, unit_price_cents: p.sale * 100, cost_cents: p.cost * 100 }
    })
    const totals = calcOrderTotal({
      items,
      labor_fee_cents: input.labor * 100,
      travel_fee_cents: (input.travel ?? 50) * 100,
      material_fee_cents: (input.material ?? 0) * 100,
      discount_cents: (input.discount ?? 0) * 100,
    })
    const paid = (input.paid ?? 0) * 100
    const payment_status = paid <= 0 ? 'unpaid' : paid >= totals.total ? 'paid' : 'partial'
    const datePart = (input.appointment || input.created || now).slice(0, 10).replace(/-/g, '')
    seq += 1
    const orderNo = `SO${datePart}-${String(seq).padStart(3, '0')}`
    const created = input.created ?? input.appointment
    const checklist = input.withChecklist
      ? DEFAULT_CHECKLIST.map((c) => ({ ...c, done: input.status === 'completed' || input.status === 'after_sales' }))
      : []
    const partsSource = input.partsSource ?? ((input.parts?.length ?? 0) > 0 ? 'shop' : 'customer')
    const info = insOrder.run(
      orderNo, customerIds[input.customer], staffIds[input.staff], input.template ?? null, input.service, input.status,
      input.priority ?? 'normal', partsSource, input.appointment, '', '', '', input.description ?? '',
      input.labor * 100, (input.travel ?? 50) * 100, (input.material ?? 0) * 100, (input.discount ?? 0) * 100,
      totals.total, totals.cost, paid, input.payment_method ?? 'wechat', payment_status,
      input.warranty ?? 12, JSON.stringify(checklist), input.completed ?? null, created, created,
    )
    const orderId = Number(info.lastInsertRowid)
    for (const item of items) {
      insItem.run(orderId, item.part_id, item.name, item.spec, item.qty, item.unit_price_cents, item.cost_cents)
    }
    insLog.run(orderId, '创建工单', '系统初始化演示数据', created)
    if (input.status === 'completed' || input.status === 'after_sales') {
      insLog.run(orderId, '完成装机', '客户验收通过，已收款', input.completed ?? created)
    }
    return orderId
  }

  const addr = (id: number) => {
    const c = customers[id]
    return { name: c.name, phone: c.phone, address: c.address, district: c.district }
  }
  const setContact = db.prepare('UPDATE orders SET address = ?, contact_name = ?, contact_phone = ? WHERE id = ?')

  // 今天的待办 / 明天预约
  seedOrder({
    customer: 0, staff: 1, template: templateIds[1], service: 'new', status: 'scheduled', priority: 'normal',
    appointment: addDays(0, 14, 0), created: addDays(-2, 20, 0), description: '白色主题游戏主机，需要装好 Win11 与常用软件',
    parts: [['R5 7500F 盒装', 1], ['华硕 TUF B650M-PLUS', 1], ['金百达 银爵 DDR5 6000 16G×2', 1], ['致态 TiPlus7100 1TB', 1], ['七彩虹 RTX 4060 Ultra W OC 8G', 1], ['振华 冰山金蝶 650W', 1], ['利民 PA120 SE', 1], ['先马 朱雀 Air', 1]],
    labor: 200, travel: 50, withChecklist: true,
  })
  seedOrder({
    customer: 1, staff: 1, service: 'repair', status: 'pending', priority: 'urgent',
    appointment: addDays(0, 19, 30), created: addDays(0, 9, 10), description: '开机反复重启，疑似电源或主板问题，先上门检测',
    labor: 100, travel: 50,
  })
  seedOrder({
    customer: 2, staff: 2, service: 'upgrade', status: 'scheduled',
    appointment: addDays(1, 10, 0), created: addDays(-1, 16, 0), description: '加装 32G 内存与 2TB 固态，保留旧盘数据',
    parts: [['金百达 银爵 DDR5 6000 16G×2', 1], ['三星 990 PRO 2TB', 1]],
    labor: 100, travel: 50, withChecklist: true,
  })
  // 昨天的完工单
  const o4 = seedOrder({
    customer: 3, staff: 0, service: 'maintenance', status: 'completed',
    appointment: addDays(-1, 15, 0), created: addDays(-3, 11, 0), completed: addDays(-1, 16, 30),
    description: '主机清灰、更换硅脂、风扇异响处理',
    labor: 150, travel: 50, paid: 200, withChecklist: true,
  })
  // 上周完工的高端单
  const o5 = seedOrder({
    customer: 4, staff: 0, template: templateIds[3], service: 'new', status: 'completed',
    appointment: addDays(-6, 13, 0), created: addDays(-10, 18, 0), completed: addDays(-6, 17, 0),
    description: '4K 剪辑工作站，达芬奇调色，需装黑苹果双系统（客户自备硬盘）',
    parts: [['i7-14700KF 盒装', 1], ['微星 B760M MORTAR II', 1], ['金百达 银爵 DDR5 6000 16G×2', 1], ['三星 990 PRO 2TB', 1], ['七彩虹 RTX 4060 Ultra W OC 8G', 1], ['振华 冰山金蝶 650W', 1], ['九州风神 AK620', 1], ['先马 朱雀 Air', 1]],
    labor: 300, travel: 80, paid: 9422, material: 0, withChecklist: true,
  })
  // 售后单
  const o6 = seedOrder({
    customer: 7, staff: 1, template: templateIds[2], service: 'new', status: 'after_sales',
    appointment: addDays(-20, 14, 0), created: addDays(-25, 10, 0), completed: addDays(-20, 18, 0),
    description: '显卡高负载异响，已返厂检测，等待换新',
    parts: [['i7-14700KF 盒装', 1], ['微星 B760M MORTAR II', 1], ['金百达 银爵 DDR5 6000 16G×2', 1], ['三星 990 PRO 2TB', 1], ['华硕 TUF RTX 4070 SUPER 12G', 1], ['海韵 FOCUS GX-850', 1], ['九州风神 AK620', 1], ['联力 包豪斯 O11D', 1]],
    labor: 300, travel: 50, paid: 12692, warranty: 36, withChecklist: true,
  })
  // 历史单，用于收入趋势
  seedOrder({
    customer: 5, staff: 1, template: templateIds[0], service: 'new', status: 'completed',
    appointment: monthDate(-5, 12, 14), created: monthDate(-5, 8, 19), completed: monthDate(-5, 12, 18),
    description: '学生党办公 + 轻度网游主机', parts: [['i3-12100F 散片', 1], ['华硕 H610M-A', 1], ['金百达 DDR4 3200 16G', 1], ['铠侠 RC20 500G', 1], ['长城 V6 600W', 1], ['利民 PA120 SE', 1], ['先马 朱雀 Air', 1]],
    labor: 150, travel: 50, paid: 2543, withChecklist: true,
  })
  seedOrder({
    customer: 6, staff: 2, template: templateIds[1], service: 'new', status: 'completed',
    appointment: monthDate(-4, 18, 10), created: monthDate(-4, 14, 20), completed: monthDate(-4, 18, 13),
    description: '公司办公机 3 台中的第一台，需开发票', parts: [['R5 7500F 盒装', 1], ['华硕 TUF B650M-PLUS', 1], ['金百达 银爵 DDR5 6000 16G×2', 1], ['致态 TiPlus7100 1TB', 1], ['七彩虹 RTX 4060 Ultra W OC 8G', 1], ['振华 冰山金蝶 650W', 1], ['利民 PA120 SE', 1], ['先马 朱雀 Air', 1]],
    labor: 200, travel: 50, paid: 7012, withChecklist: true,
  })
  seedOrder({
    customer: 8, staff: 0, service: 'upgrade', status: 'completed',
    appointment: monthDate(-3, 9, 15), created: monthDate(-3, 5, 12), completed: monthDate(-3, 9, 17),
    description: '老机器升级显卡与电源', parts: [['七彩虹 RTX 4060 Ultra W OC 8G', 1], ['海韵 FOCUS GX-850', 1]],
    labor: 150, travel: 50, paid: 3498, withChecklist: true,
  })
  seedOrder({
    customer: 4, staff: 0, template: templateIds[2], service: 'new', status: 'completed',
    appointment: monthDate(-2, 22, 13), created: monthDate(-2, 18, 21), completed: monthDate(-2, 22, 17),
    description: '2K 高刷游戏主机，海景房灯效同步', parts: [['i7-14700KF 盒装', 1], ['微星 B760M MORTAR II', 1], ['金百达 银爵 DDR5 6000 16G×2', 1], ['三星 990 PRO 2TB', 1], ['华硕 TUF RTX 4070 SUPER 12G', 1], ['海韵 FOCUS GX-850', 1], ['九州风神 AK620', 1], ['联力 包豪斯 O11D', 1]],
    labor: 300, travel: 50, paid: 12692, withChecklist: true,
  })
  seedOrder({
    customer: 1, staff: 1, service: 'repair', status: 'completed',
    appointment: monthDate(-1, 6, 20), created: monthDate(-1, 5, 10), completed: monthDate(-1, 6, 21),
    description: '系统蓝屏，重装系统并更换内存', parts: [['金百达 DDR4 3200 16G', 1]],
    labor: 100, travel: 50, paid: 389, withChecklist: true,
  })
  seedOrder({
    customer: 2, staff: 2, service: 'maintenance', status: 'completed',
    appointment: monthDate(0, 8, 11), created: monthDate(0, 6, 9), completed: monthDate(0, 8, 12),
    description: '季度保养，清灰换硅脂', labor: 150, travel: 50, paid: 200, withChecklist: true,
  })

  // 更新订单联系信息
  const allOrders = db.prepare('SELECT id, customer_id FROM orders').all() as { id: number; customer_id: number }[]
  for (const o of allOrders) {
    const idx = customerIds.indexOf(o.customer_id)
    if (idx >= 0) {
      const a = addr(idx)
      setContact.run(a.address, a.name, a.phone, o.id)
    }
  }

  // 演示现场图片（SVG 占位图，可删除）
  seedDemoMedia([o4, o5, o6])

  // 设置默认值由 ensureDefaultSettings() 统一写入，避免覆盖用户已保存的配置
}

function seedDemoMedia(orderIds: number[]): void {
  const themes = [
    { bg1: '#0f172a', bg2: '#312e81', accent: '#818cf8', title: '装机现场 · 走线整理', sub: '全模组线材 + 背线仓理线' },
    { bg1: '#111827', bg2: '#0e7490', accent: '#67e8f9', title: '装机现场 · 点亮测试', sub: '一次点亮，压力测试通过' },
    { bg1: '#1c1917', bg2: '#7c2d12', accent: '#fdba74', title: '完工验收 · 桌面效果', sub: '系统与驱动安装完成，客户验收' },
  ]
  const insMedia = db.prepare(`
    INSERT INTO order_media (order_id, kind, file_name, stored_name, mime, size, caption, created_at) VALUES (?, 'image', ?, ?, 'image/svg+xml', ?, ?, ?)`)
  orderIds.forEach((orderId, oi) => {
    const rows = db.prepare('SELECT id, completed_at, created_at FROM orders WHERE id = ?').get(orderId) as { id: number; completed_at: string | null; created_at: string }
    const date = rows.completed_at ?? rows.created_at
    const month = date.slice(0, 7)
    const dir = path.join(UPLOAD_DIR, month)
    fs.mkdirSync(dir, { recursive: true })
    for (let i = 0; i < 2; i++) {
      const t = themes[(oi + i) % themes.length]
      const stored = `${month}/demo-${orderId}-${i + 1}.svg`
      const svg = demoPhotoSvg(t, 1200, 800)
      fs.writeFileSync(path.join(UPLOAD_DIR, stored), svg)
      insMedia.run(orderId, `现场照片-${i + 1}.svg`, stored, svg.length, i === 0 ? t.title : `${t.title}（二）`, date)
    }
  })
}

function demoPhotoSvg(t: { bg1: string; bg2: string; accent: string; title: string; sub: string }, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.bg1}"/><stop offset="1" stop-color="${t.bg2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="50%">
      <stop offset="0" stop-color="${t.accent}" stop-opacity=".45"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".16"/><stop offset="1" stop-color="#ffffff" stop-opacity=".02"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${w / 2}" cy="${h * 0.44}" r="${w * 0.4}" fill="url(#glow)"/>
  <g transform="translate(${w / 2 - 170} ${h / 2 - 210})">
    <rect x="0" y="0" width="340" height="430" rx="28" fill="#0b1120" stroke="${t.accent}" stroke-opacity=".55" stroke-width="3"/>
    <rect x="22" y="22" width="296" height="330" rx="16" fill="url(#glass)" stroke="#ffffff" stroke-opacity=".18"/>
    <rect x="48" y="56" width="244" height="22" rx="11" fill="${t.accent}" opacity=".85"/>
    <rect x="48" y="92" width="170" height="12" rx="6" fill="#ffffff" opacity=".28"/>
    <rect x="48" y="118" width="210" height="12" rx="6" fill="#ffffff" opacity=".16"/>
    <circle cx="170" cy="210" r="54" fill="none" stroke="${t.accent}" stroke-width="6" opacity=".8"/>
    <circle cx="170" cy="210" r="22" fill="${t.accent}" opacity=".5"/>
    <rect x="48" y="290" width="244" height="8" rx="4" fill="#ffffff" opacity=".12"/>
    <rect x="48" y="310" width="180" height="8" rx="4" fill="#ffffff" opacity=".08"/>
    <rect x="86" y="366" width="168" height="10" rx="5" fill="#ffffff" opacity=".18"/>
  </g>
  <text x="64" y="${h - 108}" fill="#ffffff" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="46" font-weight="700">${t.title}</text>
  <text x="66" y="${h - 62}" fill="#ffffff" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="24" opacity=".62">${t.sub}</text>
  <text x="${w - 64}" y="${h - 62}" text-anchor="end" fill="${t.accent}" font-family="monospace" font-size="20" opacity=".9">PC BUILD MANAGER</text>
</svg>`
}

ensureDefaultSettings()
// 默认空库启动；如需演示数据，首次启动前设置 SEED_DEMO=1
if (process.env.SEED_DEMO === '1') seedDatabase()

export function touchOrder(orderId: number, action: string, detail: string, operator = '我', at = nowIso()): void {
  db.prepare('INSERT INTO order_logs (order_id, action, detail, operator, created_at) VALUES (?, ?, ?, ?, ?)').run(orderId, action, detail, operator, at)
}

export function checklistDoneCount(json: string): { done: number; total: number } {
  try {
    const list = JSON.parse(json) as ChecklistItem[]
    return { done: list.filter((i) => i.done).length, total: list.length }
  } catch {
    return { done: 0, total: 0 }
  }
}
