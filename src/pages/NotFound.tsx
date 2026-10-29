import { Link } from 'react-router-dom'
import { ArrowLeft, Compass } from 'lucide-react'
import { Button } from '../components/ui'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#f5f6fa] px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand-500 shadow-sm ring-1 ring-slate-200/70">
        <Compass size={28} />
      </div>
      <p className="mt-5 text-5xl font-semibold tracking-tight text-slate-900">404</p>
      <p className="mt-2 text-sm font-medium text-slate-700">这个页面不存在</p>
      <p className="mt-1 text-xs text-slate-400">可能是链接输错了，或者这条记录已经被删除。</p>
      <Link to="/" className="mt-6"><Button><ArrowLeft size={15} /> 回到工作台</Button></Link>
    </div>
  )
}
