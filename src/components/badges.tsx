import {
  CUSTOMER_LEVEL_LABELS,
  ORDER_STATUS_META,
  PARTS_SOURCE_LABELS,
  PAYMENT_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  STAFF_ROLE_LABELS,
  type CustomerLevel,
  type OrderStatus,
  type PartsSource,
  type PaymentStatus,
  type ServiceType,
  type StaffRole,
} from '../../shared/types'
import { Badge } from './ui'

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = ORDER_STATUS_META[status] ?? ORDER_STATUS_META.pending
  const active = status === 'en_route' || status === 'working'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.tone} ${className ?? ''}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${active ? 'animate-pulse' : ''}`} />
      {meta.label}
    </span>
  )
}

export function ServiceBadge({ type }: { type: ServiceType }) {
  return <Badge tone="slate">{SERVICE_TYPE_LABELS[type] ?? '其他服务'}</Badge>
}

export function PartsSourceBadge({ source }: { source: PartsSource }) {
  const tone = source === 'customer' ? 'green' : source === 'mixed' ? 'violet' : 'brand'
  return <Badge tone={tone}>{PARTS_SOURCE_LABELS[source]}</Badge>
}

const levelTones: Record<CustomerLevel, 'slate' | 'blue' | 'amber'> = {
  normal: 'slate',
  key: 'blue',
  vip: 'amber',
}

export function CustomerLevelBadge({ level }: { level: CustomerLevel }) {
  return <Badge tone={levelTones[level]}>{CUSTOMER_LEVEL_LABELS[level]}</Badge>
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const tone = status === 'paid' ? 'green' : status === 'partial' ? 'amber' : 'red'
  return <Badge tone={tone}>{PAYMENT_STATUS_LABELS[status]}</Badge>
}

export function StaffRoleBadge({ role }: { role: StaffRole }) {
  return <Badge tone={role === 'owner' ? 'violet' : role === 'engineer' ? 'blue' : 'slate'}>{STAFF_ROLE_LABELS[role]}</Badge>
}
