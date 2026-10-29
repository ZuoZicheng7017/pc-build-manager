import { Link } from 'react-router-dom'
import { CalendarDays, Image, MapPin, Paperclip, User } from 'lucide-react'
import type { Order } from '../../shared/types'
import { money, fmtDate, fmtTime, weekdayCN, dayNumber, monthLabel } from '../lib/format'
import { StatusBadge, PaymentBadge, ServiceBadge, PartsSourceBadge } from './badges'

export function OrderCard({ order }: { order: Order }) {
  const done = order.status === 'completed'
  return (
    <Link
      to={`/orders/${order.id}`}
      className="group card block p-4 transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md sm:p-5"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="hidden w-14 shrink-0 flex-col items-center rounded-xl bg-slate-50 py-2.5 text-center sm:flex">
          <span className="text-[10px] font-medium text-slate-400">{monthLabel(order.appointment_at)}</span>
          <span className="tabular text-2xl font-semibold leading-tight text-slate-900">{dayNumber(order.appointment_at)}</span>
          <span className="text-[10px] text-slate-400">{weekdayCN(order.appointment_at)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={order.status} />
            <span className="text-[11px] font-medium tracking-wide text-slate-400">{order.order_no}</span>
            {order.priority === 'urgent' && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600 ring-1 ring-inset ring-rose-200">加急</span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-semibold text-slate-900">{order.customer_name}</span>
            <span className="text-xs text-slate-400">{order.contact_phone || order.customer_phone}</span>
            <ServiceBadge type={order.service_type} />
            {order.parts_source !== 'shop' && <PartsSourceBadge source={order.parts_source} />}
          </div>

          <div className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
            <MapPin size={13} className="mt-0.5 shrink-0 text-slate-300" />
            <span className="line-clamp-1">{order.address || '未填写上门地址'}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1"><CalendarDays size={12} />{fmtDate(order.appointment_at)} {fmtTime(order.appointment_at)}</span>
            {(order.service_count ?? 0) > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={12} />{order.service_count} 项服务</span>}
            {(order.item_count ?? 0) > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={12} />{order.item_count} 项配件</span>}
            {order.staff_name && <span className="inline-flex items-center gap-1"><User size={12} />{order.staff_name}</span>}
            {(order.media_count ?? 0) > 0 && <span className="inline-flex items-center gap-1"><Image size={12} />{order.media_count}</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`tabular text-base font-semibold sm:text-lg ${done ? 'text-slate-400' : 'text-slate-900'}`}>{money(order.total_cents)}</span>
          <PaymentBadge status={order.payment_status} />
        </div>
      </div>
    </Link>
  )
}
