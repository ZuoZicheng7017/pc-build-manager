import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

interface FeedbackValue {
  toast: (message: string, type?: ToastType) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackValue | null>(null)

let seq = 0

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++seq
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3600)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve })
    })
  }, [])

  const finish = useCallback((value: boolean) => {
    setConfirmState((state) => {
      state?.resolve(value)
      return null
    })
  }, [])

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm])

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-3 top-3 z-[120] flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-2 sm:right-5 sm:top-5">
        {toasts.map((item) => (
          <div
            key={item.id}
            className="animate-toast pointer-events-auto flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg shadow-slate-900/5"
          >
            {item.type === 'success' && <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-500" size={18} />}
            {item.type === 'error' && <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-rose-500" size={18} />}
            {item.type === 'info' && <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-blue-500" size={18} />}
            <p className="flex-1 text-sm leading-relaxed text-slate-700">{item.message}</p>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== item.id))}
              className="rounded-md p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
              aria-label="关闭提示"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/40 p-4 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true">
          <div className="animate-pop w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">{confirmState.title}</h3>
            {confirmState.message && <div className="mt-2 text-sm leading-relaxed text-slate-500">{confirmState.message}</div>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => finish(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                {confirmState.cancelText ?? '取消'}
              </button>
              <button
                type="button"
                onClick={() => finish(true)}
                className={
                  confirmState.danger
                    ? 'rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700'
                    : 'rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700'
                }
              >
                {confirmState.confirmText ?? '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  )
}

export function useFeedback(): FeedbackValue {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider')
  return ctx
}
