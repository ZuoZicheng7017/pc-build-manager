import type {
  BuildTemplate,
  Customer,
  CustomerAddress,
  DashboardData,
  Order,
  OrderDetail,
  OrderListResult,
  OrderMedia,
  MediaCategory,
  OrderStatus,
  Part,
  PartPrice,
  PaymentKind,
  ReportData,
  ServiceItem,
  SharedOrder,
  StockMovement,
  Settings,
  Staff,
  TemplateItem,
} from '../../shared/types'

const BASE = '/api'

export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof Blob)) headers.set('Content-Type', 'application/json')
  const res = await fetch(BASE + path, { ...init, headers })
  if (!res.ok) {
    let body: { error?: string; details?: unknown } | null = null
    try { body = await res.json() } catch { /* ignore */ }
    throw new ApiError(body?.error || `请求失败（${res.status}）`, res.status, body?.details)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) }
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== 0) search.set(k, String(v))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

export interface OrderQuery {
  status?: string
  q?: string
  staffId?: number
  customerId?: number
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export type OrderPayload = {
  customer_id: number
  staff_id?: number | null
  template_id?: number | null
  service_type?: string
  status?: OrderStatus
  priority?: string
  parts_source?: string
  appointment_at?: string
  address?: string
  contact_name?: string
  contact_phone?: string
  description?: string
  labor_fee_cents?: number
  service_extra_cents?: number
  travel_fee_cents?: number
  material_fee_cents?: number
  discount_cents?: number
  paid_cents?: number
  payment_method?: string
  warranty_months?: number
  precheck?: { id: string; label: string; done: boolean }[]
  parts_confirmed?: boolean
  parts_confirm_note?: string
  items?: {
    part_id?: number | null
    name?: string
    spec?: string
    qty: number
    unit_price_cents: number
    cost_cents?: number
    note?: string
  }[]
  services?: {
    service_item_id?: number | null
    name?: string
    price_cents?: number
    qty: number
    note?: string
  }[]
}

export type PartPayload = Partial<Omit<Part, 'id' | 'created_at' | 'updated_at'>> & { name: string; price_note?: string }
export type CustomerPayload = Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'order_count' | 'total_spent_cents' | 'last_order_at'>> & { name: string }
export type StaffPayload = Partial<Omit<Staff, 'id' | 'created_at' | 'order_count' | 'completed_count'>> & { name: string }
export type TemplatePayload = {
  name: string
  purpose?: string
  budget_cents?: number
  level?: string
  labor_fee_cents?: number
  notes?: string
  items?: Pick<TemplateItem, 'part_id' | 'qty' | 'unit_price_cents' | 'note'>[]
}

export interface CustomerDetailData extends Customer {
  orders: Order[]
  addresses: CustomerAddress[]
  stats: {
    order_count: number
    total_spent_cents: number
    completed_count: number
    first_order_at: string | null
    last_order_at: string | null
  }
}

export interface SystemInfo {
  version: string
  node: string
  platform: string
  data_dir: string
  backup_dir: string
  last_auto_backup_at: string
  db_size: number
  uploads_size: number
  counts: {
    customers: number
    orders: number
    parts: number
    staff: number
    templates: number
    services: number
    media: number
  }
  started_at: string
}

export const api = {
  auth: {
    status: () => request<{ enabled: boolean; authenticated: boolean }>('/auth/status'),
    login: (password: string) => request<{ ok: boolean }>('/auth/login', json('POST', { password })),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  },

  dashboard: () => request<DashboardData>('/dashboard'),
  reports: (months = 6) => request<ReportData>(`/reports?months=${months}`),

  orders: {
    list: (params: OrderQuery = {}) => request<OrderListResult>('/orders' + qs(params as Record<string, string | number | undefined>)),
    get: (id: number) => request<OrderDetail>(`/orders/${id}`),
    create: (payload: OrderPayload) => request<OrderDetail>('/orders', json('POST', payload)),
    update: (id: number, payload: OrderPayload) => request<OrderDetail>(`/orders/${id}`, json('PUT', payload)),
    remove: (id: number) => request<void>(`/orders/${id}`, { method: 'DELETE' }),
    setStatus: (id: number, status: OrderStatus, note = '') =>
      request<OrderDetail>(`/orders/${id}/status`, json('PATCH', { status, note })),
    setChecklist: (id: number, checklist: OrderDetail['checklist']) =>
      request<OrderDetail>(`/orders/${id}/checklist`, json('PATCH', { checklist })),
    setPayment: (id: number, paid_cents: number, payment_method: string) =>
      request<OrderDetail>(`/orders/${id}/payment`, json('PATCH', { paid_cents, payment_method })),
    addPayment: (id: number, payload: { kind: PaymentKind; amount_cents: number; method: string; note?: string; paid_at?: string }) =>
      request<OrderDetail>(`/orders/${id}/payments`, json('POST', payload)),
    deletePayment: (paymentId: number) => request<OrderDetail>(`/payments/${paymentId}`, { method: 'DELETE' }),
    setPrecheck: (id: number, precheck: { id: string; label: string; done: boolean }[], parts_confirmed?: boolean, parts_confirm_note?: string) =>
      request<OrderDetail>(`/orders/${id}/precheck`, json('PATCH', { precheck, parts_confirmed, parts_confirm_note })),
    setFollowUp: (id: number, payload: { follow_up_at: string; follow_up_note: string; rating: number }) =>
      request<OrderDetail>(`/orders/${id}/followup`, json('PATCH', payload)),
    deleteMedia: (mediaId: number) => request<void>(`/media/${mediaId}`, { method: 'DELETE' }),
    share: (id: number) => request<{ token: string }>(`/orders/${id}/share`, { method: 'POST' }),
    revokeShare: (id: number) => request<void>(`/orders/${id}/share`, { method: 'DELETE' }),
    restore: (id: number) => request<OrderDetail>(`/trash/orders/${id}/restore`, { method: 'POST' }),
    purge: (id: number) => request<void>(`/trash/orders/${id}`, { method: 'DELETE' }),
    removeHard: (id: number) => request<void>(`/orders/${id}?hard=1`, { method: 'DELETE' }),
  },

  trash: {
    orders: () => request<Order[]>('/trash/orders'),
    customers: () => request<Customer[]>('/trash/customers'),
    parts: () => request<Part[]>('/trash/parts'),
  },

  shared: (token: string) => request<SharedOrder>(`/share/${token}`),

  serviceItems: {
    list: (activeOnly = false) => request<ServiceItem[]>('/service-items' + (activeOnly ? '?active=1' : '')),
    create: (payload: Partial<ServiceItem> & { name: string }) => request<ServiceItem>('/service-items', json('POST', payload)),
    update: (id: number, payload: Partial<ServiceItem> & { name: string }) => request<ServiceItem>(`/service-items/${id}`, json('PUT', payload)),
    remove: (id: number) => request<void>(`/service-items/${id}`, { method: 'DELETE' }),
    initDefaults: () => request<{ added: number }>('/service-items/defaults', { method: 'POST' }),
  },

  customers: {
    list: (params: { q?: string; level?: string } = {}) => request<Customer[]>('/customers' + qs(params)),
    get: (id: number) => request<CustomerDetailData>(`/customers/${id}`),
    create: (payload: CustomerPayload) => request<Customer>('/customers', json('POST', payload)),
    update: (id: number, payload: CustomerPayload) => request<Customer>(`/customers/${id}`, json('PUT', payload)),
    remove: (id: number) => request<void>(`/customers/${id}`, { method: 'DELETE' }),
    addresses: (customerId: number) => request<CustomerAddress[]>(`/customers/${customerId}/addresses`),
    createAddress: (customerId: number, payload: Partial<CustomerAddress>) => request<CustomerAddress>(`/customers/${customerId}/addresses`, json('POST', payload)),
    updateAddress: (id: number, payload: Partial<CustomerAddress>) => request<CustomerAddress>(`/addresses/${id}`, json('PUT', payload)),
    deleteAddress: (id: number) => request<void>(`/addresses/${id}`, { method: 'DELETE' }),
    setDefaultAddress: (id: number) => request<CustomerAddress>(`/addresses/${id}/default`, { method: 'PATCH' }),
    restore: (id: number) => request<Customer>(`/trash/customers/${id}/restore`, { method: 'POST' }),
    purge: (id: number) => request<void>(`/trash/customers/${id}`, { method: 'DELETE' }),
    removeHard: (id: number) => request<void>(`/customers/${id}?hard=1`, { method: 'DELETE' }),
  },

  staff: {
    list: () => request<Staff[]>('/staff'),
    create: (payload: StaffPayload) => request<Staff>('/staff', json('POST', payload)),
    update: (id: number, payload: StaffPayload) => request<Staff>(`/staff/${id}`, json('PUT', payload)),
    remove: (id: number) => request<void>(`/staff/${id}`, { method: 'DELETE' }),
  },

  parts: {
    list: (params: { q?: string; category?: string; lowStock?: boolean; status?: string } = {}) =>
      request<Part[]>('/parts' + qs({ ...params, lowStock: params.lowStock ? 1 : undefined })),
    create: (payload: PartPayload) => request<Part>('/parts', json('POST', payload)),
    update: (id: number, payload: PartPayload) => request<Part>(`/parts/${id}`, json('PUT', payload)),
    remove: (id: number) => request<void>(`/parts/${id}`, { method: 'DELETE' }),
    updatePrice: (id: number, payload: { cost_cents: number; sale_cents: number; supplier?: string; note?: string }) =>
      request<Part>(`/parts/${id}/price`, json('PUT', payload)),
    prices: (id: number) => request<PartPrice[]>(`/parts/${id}/prices`),
    changeStock: (id: number, payload: { kind: 'in' | 'out' | 'set'; qty: number; note?: string }) =>
      request<Part>(`/parts/${id}/stock`, json('POST', payload)),
    movements: (id: number) => request<StockMovement[]>(`/parts/${id}/movements`),
    restore: (id: number) => request<Part>(`/trash/parts/${id}/restore`, { method: 'POST' }),
    purge: (id: number) => request<void>(`/trash/parts/${id}`, { method: 'DELETE' }),
    removeHard: (id: number) => request<void>(`/parts/${id}?hard=1`, { method: 'DELETE' }),
  },

  prices: {
    list: () => request<(Part & { last_price_at: string | null })[]>('/prices'),
  },

  templates: {
    list: (params: { q?: string; purpose?: string } = {}) => request<BuildTemplate[]>('/templates' + qs(params)),
    get: (id: number) => request<BuildTemplate>(`/templates/${id}`),
    create: (payload: TemplatePayload) => request<BuildTemplate>('/templates', json('POST', payload)),
    update: (id: number, payload: TemplatePayload) => request<BuildTemplate>(`/templates/${id}`, json('PUT', payload)),
    remove: (id: number) => request<void>(`/templates/${id}`, { method: 'DELETE' }),
    createOrder: (id: number, payload: { customer_id: number; appointment_at?: string; staff_id?: number | null; notes?: string }) =>
      request<OrderDetail>(`/templates/${id}/create-order`, json('POST', payload)),
  },

  settings: {
    get: () => request<Settings>('/settings'),
    update: (payload: Partial<Settings>) => request<Settings>('/settings', json('PUT', payload)),
    systemInfo: () => request<SystemInfo>('/system/info'),
    runBackup: () => request<{ name: string; size: number; created_at: string }>('/backup/run', { method: 'POST' }),
  },

  uploadMedia(orderId: number, file: File, caption: string, onProgress?: (percent: number) => void, category: MediaCategory = 'during'): Promise<OrderMedia> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const kind = file.type.startsWith('video/') ? 'video' : 'image'
      xhr.open('POST', `${BASE}/orders/${orderId}/media?kind=${kind}&caption=${encodeURIComponent(caption)}&category=${encodeURIComponent(category)}`)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as OrderMedia)
        } else {
          let message = `上传失败（${xhr.status}）`
          try { message = (JSON.parse(xhr.responseText) as { error?: string }).error || message } catch { /* ignore */ }
          reject(new ApiError(message, xhr.status))
        }
      }
      xhr.onerror = () => reject(new ApiError('网络异常，上传失败', 0))
      xhr.send(file)
    })
  },
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return '操作失败，请稍后重试'
}
