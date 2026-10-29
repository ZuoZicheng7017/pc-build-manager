import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Search,
  X,
} from 'lucide-react'

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'dark'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 active:bg-brand-800',
  secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm shadow-slate-900/[0.02] hover:border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-rose-600 text-white shadow-sm shadow-rose-600/20 hover:bg-rose-700',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  dark: 'bg-slate-900 text-white hover:bg-slate-800',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-xs',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-11 gap-2 rounded-xl px-5 text-sm',
  icon: 'h-9 w-9 rounded-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium outline-none transition focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-55',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label?: ReactNode
  hint?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <label className={cn('block', className)}>
      {label && (
        <span className="label-base">
          {label}
          {required && <span className="text-rose-500">*</span>}
        </span>
      )}
      {children}
      {hint && <span className="mt-1 block text-xs leading-relaxed text-slate-400">{hint}</span>}
    </label>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('input-base', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('input-base resize-y leading-relaxed', className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('input-base cursor-pointer appearance-none bg-[length:16px] pr-9', className)}
      style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
      }}
      {...props}
    >
      {children}
    </select>
  )
}

const badgeTones = {
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
} as const

export type BadgeTone = keyof typeof badgeTones

export function Badge({ tone = 'slate', className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', badgeTones[tone], className)}>
      {children}
    </span>
  )
}

export function Avatar({ name, color, size = 'md' }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white', sizes[size])}
      style={{ backgroundColor: color || '#4f46e5' }}
    >
      {name ? name.trim().slice(0, 1) : '?'}
    </span>
  )
}

const modalSizes = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof modalSizes
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className={cn('animate-pop flex max-h-[94dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl', modalSizes[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-slate-950/40 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="animate-slide-in absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: { key: T; label: string; count?: number }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5', className)}>
      {items.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition',
              active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-800',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn('rounded-full px-1.5 py-px text-[10px] tabular', active ? 'bg-white/15 text-white' : 'bg-slate-200/70 text-slate-500')}>
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">{eyebrow}</p>}
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  )
}

const statTones = {
  brand: 'bg-brand-50 text-brand-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: ReactNode
  tone?: keyof typeof statTones
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn('card flex flex-col gap-3 p-4 sm:p-5', onClick && 'cursor-pointer transition hover:-translate-y-0.5 hover:border-slate-300')}
    >
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', statTones[tone])}>{icon}</span>
      </div>
      <div>
        <p className="tabular text-[26px] font-semibold leading-none tracking-tight text-slate-900">{value}</p>
        {hint && <p className="mt-2 text-xs leading-relaxed text-slate-400">{hint}</p>}
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        {icon ?? <Inbox size={22} />}
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function LoadingBlock({ label = '正在加载…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-16 text-sm text-slate-400', className)}>
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">加载失败</p>
      <p className="max-w-md text-xs text-slate-400">{message}</p>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>重新加载</Button>}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = '搜索…',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-base h-10 py-0 pl-9 pr-9"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600" aria-label="清空">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <div className="flex flex-col items-center justify-between gap-3 px-1 py-4 text-xs text-slate-500 sm:flex-row">
      <span>共 {total} 条 · 第 {page} / {pages} 页</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={14} /> 上一页
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          下一页 <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}

export function ProgressBar({ value, total, className, tone = 'brand' }: { value: number; total: number; className?: string; tone?: 'brand' | 'emerald' | 'amber' }) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  const colors = { brand: 'bg-brand-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500' }
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className={cn('h-full rounded-full transition-all duration-300', colors[tone])} style={{ width: `${percent}%` }} />
    </div>
  )
}

export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-3.5 sm:grid-cols-2', className)}>{children}</div>
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-slate-100', className)} />
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-2 text-sm text-slate-600', className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 accent-brand-600"
      />
      <span>{label}</span>
    </label>
  )
}
