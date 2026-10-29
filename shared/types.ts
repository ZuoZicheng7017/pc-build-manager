// ─── 前后端共享类型与常量 ────────────────────────────────────────────────
// 金额字段统一为「分」（整数），时间字段为 ISO 8601 字符串。

export type OrderStatus =
  | 'pending'
  | 'scheduled'
  | 'en_route'
  | 'working'
  | 'completed'
  | 'cancelled'
  | 'after_sales'

export type ServiceType = 'new' | 'upgrade' | 'repair' | 'maintenance' | 'other'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type PaymentMethod = 'cash' | 'wechat' | 'alipay' | 'card' | 'other'
export type Priority = 'normal' | 'urgent'
export type PartsSource = 'customer' | 'shop' | 'mixed'
export type PartStatus = 'active' | 'inactive'
export type CustomerLevel = 'normal' | 'key' | 'vip'
export type StaffRole = 'owner' | 'engineer' | 'apprentice'
export type StaffStatus = 'active' | 'inactive'
export type MediaKind = 'image' | 'video' | 'file'
export type MediaCategory = 'before' | 'during' | 'after' | 'serial' | 'signature' | 'other'
export type TemplatePurpose = 'office' | 'gaming' | 'design' | 'video' | 'stream' | 'home' | 'other'
export type TemplateLevel = 'entry' | 'mainstream' | 'high' | 'flagship'

export interface Staff {
  id: number
  name: string
  phone: string
  role: StaffRole
  color: string
  status: StaffStatus
  commission_rate: number
  hired_at: string
  notes: string
  created_at: string
  order_count?: number
  completed_count?: number
}

export interface CustomerAddress {
  id: number
  customer_id: number
  label: string
  address: string
  contact_name: string
  phone: string
  is_default: number
  created_at: string
}

export interface Customer {
  id: number
  name: string
  phone: string
  wechat: string
  address: string
  district: string
  source: string
  level: CustomerLevel
  tags: string
  notes: string
  deleted_at: string
  created_at: string
  updated_at: string
  order_count?: number
  total_spent_cents?: number
  last_order_at?: string | null
}

export interface Part {
  id: number
  name: string
  category: string
  brand: string
  model: string
  spec: string
  unit: string
  cost_cents: number
  sale_cents: number
  stock: number
  min_stock: number
  supplier: string
  warranty_months: number
  status: PartStatus
  notes: string
  deleted_at: string
  created_at: string
  updated_at: string
}

export interface StockMovement {
  id: number
  part_id: number
  order_id: number | null
  kind: 'in' | 'out' | 'adjust' | 'order_out' | 'order_in'
  qty: number
  note: string
  created_at: string
  order_no?: string | null
}

export interface PartPrice {
  id: number
  part_id: number
  cost_cents: number
  sale_cents: number
  supplier: string
  note: string
  recorded_at: string
}

export interface TemplateItem {
  id?: number
  template_id?: number
  part_id: number
  qty: number
  unit_price_cents: number
  note: string
  part_name?: string
  part_spec?: string
  part_category?: string
  current_sale_cents?: number
  current_cost_cents?: number
}

export interface BuildTemplate {
  id: number
  name: string
  purpose: TemplatePurpose
  budget_cents: number
  level: TemplateLevel
  labor_fee_cents: number
  notes: string
  created_at: string
  updated_at: string
  items?: TemplateItem[]
  total_cents?: number
  cost_cents?: number
  item_count?: number
}

export interface ServiceItem {
  id: number
  name: string
  category: string
  price_cents: number
  duration_minutes: number
  description: string
  active: PartStatus
  sort_order: number
  created_at: string
  updated_at: string
}

export interface OrderService {
  id?: number
  order_id?: number
  service_item_id: number | null
  name: string
  price_cents: number
  qty: number
  note: string
}

export type PaymentKind = 'deposit' | 'final' | 'other' | 'refund'

export interface OrderPayment {
  id: number
  order_id: number
  kind: PaymentKind
  amount_cents: number
  method: PaymentMethod
  note: string
  paid_at: string
  created_at: string
}

export interface OrderItem {
  id?: number
  order_id?: number
  part_id: number | null
  name: string
  spec: string
  qty: number
  unit_price_cents: number
  cost_cents: number
  note: string
}

export interface OrderMedia {
  id: number
  order_id: number
  kind: MediaKind
  file_name: string
  stored_name: string
  mime: string
  size: number
  category: MediaCategory
  caption: string
  created_at: string
  url: string
}

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  before: '上门前',
  during: '装机中',
  after: '完工效果',
  serial: '序列号/外观',
  signature: '客户签名',
  other: '其他',
}

export const MEDIA_CATEGORIES = Object.keys(MEDIA_CATEGORY_LABELS) as MediaCategory[]

export interface OrderLog {
  id: number
  order_id: number
  action: string
  detail: string
  operator: string
  created_at: string
}

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

export interface Order {
  id: number
  order_no: string
  customer_id: number
  staff_id: number | null
  template_id: number | null
  service_type: ServiceType
  status: OrderStatus
  priority: Priority
  parts_source: PartsSource
  appointment_at: string
  address: string
  contact_name: string
  contact_phone: string
  description: string
  labor_fee_cents: number
  service_extra_cents: number
  travel_fee_cents: number
  material_fee_cents: number
  discount_cents: number
  total_cents: number
  cost_cents: number
  paid_cents: number
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  warranty_months: number
  checklist_json: string
  precheck_json: string
  parts_confirmed: number
  parts_confirm_note: string
  follow_up_at: string
  follow_up_note: string
  rating: number
  deleted_at: string
  inventory_applied: number
  completed_at: string | null
  share_token: string | null
  created_at: string
  updated_at: string
  customer_name?: string
  customer_phone?: string
  staff_name?: string
  template_name?: string | null
  item_count?: number
  service_count?: number
  media_count?: number
  items?: OrderItem[]
  services?: OrderService[]
  payments?: OrderPayment[]
}

export interface OrderDetail extends Order {
  customer: Customer | null
  staff: Staff | null
  items: OrderItem[]
  services: OrderService[]
  payments: OrderPayment[]
  media: OrderMedia[]
  logs: OrderLog[]
  checklist: ChecklistItem[]
  precheck: ChecklistItem[]
}

export interface SharedOrder {
  shop: { name: string; phone: string; address: string }
  order: {
    order_no: string
    status: OrderStatus
    service_type: ServiceType
    parts_source: PartsSource
    appointment_at: string
    address: string
    contact_name: string
    warranty_months: number
    total_cents: number
    labor_fee_cents: number
    travel_fee_cents: number
    material_fee_cents: number
    discount_cents: number
    description: string
    completed_at: string | null
  }
  customer_name: string
  staff_name: string | null
  services: OrderService[]
  items: OrderItem[]
  media: OrderMedia[]
  checklist: { done: number; total: number }
}

export interface OrderListResult {
  items: Order[]
  total: number
  page: number
  pageSize: number
}

export interface ReportData {
  range: { from: string; to: string; months: number }
  stats: {
    orders: number
    completed: number
    revenueCents: number
    costCents: number
    profitCents: number
    avgTicketCents: number
    unpaidCents: number
  }
  monthly: { month: string; count: number; revenueCents: number }[]
  services: { name: string; qty: number; revenueCents: number }[]
  sources: { source: string; count: number; revenueCents: number }[]
  weekdays: { weekday: number; count: number; revenueCents: number }[]
  hours: { hour: number; count: number }[]
  topCustomers: { id: number; name: string; count: number; revenueCents: number }[]
  staff: { id: number; name: string; color: string; count: number; revenueCents: number; commissionCents: number }[]
}

export interface Settings {
  shop_name: string
  shop_phone: string
  shop_address: string
  default_travel_fee_cents: number
  default_warranty_months: number
  default_labor_fee_cents: number
  auto_backup_enabled: boolean
  auto_backup_retention: number
  last_auto_backup_at: string
  ui_mode: 'full' | 'service'
}

export interface DashboardData {
  stats: {
    todayOrders: number
    upcoming7: number
    pendingCount: number
    monthOrders: number
    monthCompleted: number
    monthRevenueCents: number
    monthProfitCents: number
    totalCustomers: number
    partsCount: number
    lowStockCount: number
  }
  trend: { month: string; revenueCents: number; count: number }[]
  statusDistribution: { status: OrderStatus; count: number }[]
  todaySchedule: Order[]
  upcomingSchedule: Order[]
  lowStock: Part[]
  recentOrders: Order[]
  staffRanking: { id: number; name: string; color: string; count: number; revenueCents: number; commissionCents: number }[]
  reminders: {
    id: string
    kind: 'today' | 'overdue' | 'unpaid' | 'warranty' | 'followup'
    title: string
    detail: string
    order_id: number
    tone: 'blue' | 'amber' | 'red' | 'violet'
  }[]
}

// ─── 展示元数据 ────────────────────────────────────────────────────────

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: string; dot: string }> = {
  pending: { label: '待确认', tone: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  scheduled: { label: '已预约', tone: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  en_route: { label: '上门中', tone: 'bg-cyan-50 text-cyan-700 ring-cyan-200', dot: 'bg-cyan-500' },
  working: { label: '装机中', tone: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  completed: { label: '已完成', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  cancelled: { label: '已取消', tone: 'bg-slate-100 text-slate-500 ring-slate-200', dot: 'bg-slate-400' },
  after_sales: { label: '售后中', tone: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
}

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_META) as OrderStatus[]

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  new: '新机组装',
  upgrade: '升级改造',
  repair: '故障维修',
  maintenance: '清灰保养',
  other: '其他服务',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: '未收款',
  partial: '部分收款',
  paid: '已结清',
}

export const PARTS_SOURCE_LABELS: Record<PartsSource, string> = {
  customer: '客户自备',
  shop: '我方提供',
  mixed: '部分自备',
}

export const PARTS_SOURCE_DESCRIPTIONS: Record<PartsSource, string> = {
  customer: '配件由客户自备，只收取装机服务费',
  shop: '配件由我方提供，按配件成交价 + 服务费结算',
  mixed: '部分配件由客户自备，按实际计费项结算',
}

export const PARTS_SOURCES = Object.keys(PARTS_SOURCE_LABELS) as PartsSource[]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  card: '银行卡',
  other: '其他',
}

export const PART_CATEGORIES = [
  'CPU',
  '主板',
  '内存',
  '硬盘',
  '显卡',
  '电源',
  '散热',
  '机箱',
  '显示器',
  '外设',
  '其他',
] as const

export const CUSTOMER_SOURCES = ['转介绍', '抖音', '小红书', '闲鱼', '朋友圈', '老客户', '其他']

export const CUSTOMER_LEVEL_LABELS: Record<CustomerLevel, string> = {
  normal: '普通',
  key: '重点',
  vip: 'VIP',
}

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  owner: '老板',
  engineer: '装机师',
  apprentice: '学徒',
}

export const TEMPLATE_PURPOSE_LABELS: Record<TemplatePurpose, string> = {
  office: '办公',
  gaming: '游戏',
  design: '设计',
  video: '剪辑',
  stream: '直播',
  home: '家用',
  other: '其他',
}

export const TEMPLATE_LEVEL_LABELS: Record<TemplateLevel, string> = {
  entry: '入门',
  mainstream: '主流',
  high: '高端',
  flagship: '旗舰',
}

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  deposit: '定金',
  final: '尾款',
  other: '其他收款',
  refund: '退款',
}

export const PAYMENT_KINDS = Object.keys(PAYMENT_KIND_LABELS) as PaymentKind[]

export const SERVICE_CATEGORIES = ['装机', '系统', '维护', '检测', '加收', '其他']

export const DEFAULT_SERVICE_ITEMS = [
  { name: '标准上门装机', category: '装机', price_cents: 20000, duration_minutes: 120, description: '基础装机、走线、点亮测试' },
  { name: '新机系统 + 驱动', category: '系统', price_cents: 8000, duration_minutes: 60, description: '装系统、驱动、常用软件' },
  { name: '清灰保养', category: '维护', price_cents: 10000, duration_minutes: 60, description: '清灰、换硅脂、风扇检查' },
  { name: '故障检测', category: '检测', price_cents: 5000, duration_minutes: 30, description: '上门检测，不含维修配件' },
  { name: '水冷 / ITX 加收', category: '加收', price_cents: 5000, duration_minutes: 30, description: '水冷或小机箱额外工时' },
  { name: '夜间 / 加急', category: '加收', price_cents: 5000, duration_minutes: 0, description: '非标准时段或加急上门' },
]

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]
export const SERVICE_TYPES = Object.keys(SERVICE_TYPE_LABELS) as ServiceType[]
export const TEMPLATE_PURPOSES = Object.keys(TEMPLATE_PURPOSE_LABELS) as TemplatePurpose[]
export const TEMPLATE_LEVELS = Object.keys(TEMPLATE_LEVEL_LABELS) as TemplateLevel[]
export const CUSTOMER_LEVELS = Object.keys(CUSTOMER_LEVEL_LABELS) as CustomerLevel[]
export const STAFF_ROLES = Object.keys(STAFF_ROLE_LABELS) as StaffRole[]

export const DEFAULT_PRECHECK: ChecklistItem[] = [
  { id: 'cpu', label: 'CPU 接口与主板一致', done: false },
  { id: 'ram', label: '内存代数（DDR4 / DDR5）与主板一致', done: false },
  { id: 'gpu', label: '显卡长度 / 厚度与机箱空间匹配', done: false },
  { id: 'cooler', label: '散热器高度 / 水冷位与机箱匹配', done: false },
  { id: 'psu', label: '电源功率 / 显卡供电接口满足', done: false },
  { id: 'storage', label: '硬盘接口与 M.2 数量确认', done: false },
  { id: 'case', label: '机箱支持的主板板型确认', done: false },
  { id: 'data', label: '客户数据已备份 / 系统盘已确认', done: false },
]

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: 'parts', label: '核对配件型号与数量', done: false },
  { id: 'esd', label: '做好静电防护', done: false },
  { id: 'build', label: '硬件安装到位、螺丝固定', done: false },
  { id: 'cable', label: '走线整理、风道合理', done: false },
  { id: 'bios', label: 'BIOS / XMP / 启动项设置', done: false },
  { id: 'os', label: '系统安装与激活', done: false },
  { id: 'driver', label: '驱动与外设调试', done: false },
  { id: 'stress', label: '烤机压力测试', done: false },
  { id: 'clean', label: '现场清洁、旧件交接', done: false },
  { id: 'accept', label: '客户验收与使用说明', done: false },
]

export function calcOrderTotal(input: {
  items: { qty: number; unit_price_cents: number; cost_cents: number }[]
  labor_fee_cents: number
  travel_fee_cents: number
  material_fee_cents: number
  discount_cents: number
}): { total: number; cost: number; profit: number } {
  const partsTotal = input.items.reduce((s, i) => s + i.qty * i.unit_price_cents, 0)
  const partsCost = input.items.reduce((s, i) => s + i.qty * i.cost_cents, 0)
  const total = partsTotal + input.labor_fee_cents + input.travel_fee_cents + input.material_fee_cents - input.discount_cents
  return { total: Math.max(0, total), cost: partsCost, profit: Math.max(0, total) - partsCost }
}

export function paymentStatusOf(total: number, paid: number): PaymentStatus {
  if (paid <= 0) return 'unpaid'
  if (paid >= total && total > 0) return 'paid'
  if (total === 0 && paid > 0) return 'paid'
  return 'partial'
}
