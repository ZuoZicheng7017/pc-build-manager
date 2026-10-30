import { useState } from 'react'
import { Cpu, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { Button, Input } from '../components/ui'

export default function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.auth.login(username.trim(), password)
      onSuccess()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-ink-950 via-ink-950 to-brand-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/15"><Cpu size={26} /></span>
          <h1 className="mt-4 text-xl font-semibold text-white">装机管家</h1>
          <p className="mt-1 text-xs text-slate-400">客户地址和现场照片已加密保护</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900"><LockKeyhole size={16} className="text-brand-600" /> 登录账户</div>
          <div className="relative mb-2">
            <UserRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名，例如：小左" autoFocus className="h-11 pl-9" />
          </div>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" className="h-11" />
          {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
          <Button type="submit" loading={loading} className="mt-4 w-full"><ShieldCheck size={15} /> 进入系统</Button>
          <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-400">不同账户的数据、照片和备份完全独立</p>
        </form>
      </div>
    </div>
  )
}
