import { useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { useApi } from '../lib/hooks'
import Login from '../pages/Login'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { data, loading, reload } = useApi(() => api.auth.status(), [])
  const publicPath = location.pathname.startsWith('/share/')

  if (publicPath) return <>{children}</>
  if (loading && !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f5f6fa] text-sm text-slate-400">
        <Loader2 size={17} className="mr-2 animate-spin" /> 正在检查登录状态…
      </div>
    )
  }
  if (data?.enabled && !data.authenticated) {
    return <Login onSuccess={reload} />
  }
  return <>{children}</>
}
