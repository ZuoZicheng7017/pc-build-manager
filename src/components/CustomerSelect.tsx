import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import type { Customer } from '../../shared/types'
import { cn } from './ui'

export function CustomerSelect({
  customers,
  value,
  onChange,
  placeholder = '搜索并选择客户…',
}: {
  customers: Customer[]
  value: number
  onChange: (id: number) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = customers.find((c) => c.id === value)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    setTimeout(() => inputRef.current?.focus(), 20)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => `${c.name} ${c.phone} ${c.wechat} ${c.address}`.toLowerCase().includes(q))
  }, [customers, keyword])

  const choose = (id: number) => {
    onChange(id)
    setOpen(false)
    setKeyword('')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn('input-base flex h-[42px] items-center justify-between gap-2 text-left', open && 'border-brand-400 ring-4 ring-brand-100')}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">{selected.name.slice(0, 1)}</span>
            <span className="min-w-0 truncate text-sm text-slate-800">{selected.name}</span>
            <span className="shrink-0 text-xs text-slate-400">{selected.phone}</span>
          </span>
        ) : (
          <span className="text-sm text-slate-400">{placeholder}</span>
        )}
        <ChevronDown size={16} className={cn('shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
          <div className="relative border-b border-slate-100 p-2">
            <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="输入姓名、电话、微信…"
              className="h-9 w-full rounded-lg bg-slate-50 pl-8 pr-8 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-brand-100"
            />
            {keyword && (
              <button type="button" onClick={() => setKeyword('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" aria-label="清空">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-400">没有匹配客户</p>
            ) : filtered.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => choose(customer.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{customer.name.slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-slate-800">{customer.name}</span>
                    {customer.id === value && <Check size={12} className="shrink-0 text-brand-500" />}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate-400">{customer.phone || '无电话'} · {customer.address || '无地址'}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
