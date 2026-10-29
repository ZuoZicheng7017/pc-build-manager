import { useEffect, useState } from 'react'
import { MessageSquareHeart, Star } from 'lucide-react'
import type { OrderDetail } from '../../shared/types'
import { api, errorMessage } from '../lib/api'
import { useFeedback } from '../lib/feedback'
import { Button, Field, Input, Textarea } from './ui'

export function FollowUpCard({ order, onUpdated }: { order: OrderDetail; onUpdated: (order: OrderDetail) => void }) {
  const { toast } = useFeedback()
  const [date, setDate] = useState(order.follow_up_at || '')
  const [rating, setRating] = useState(order.rating || 0)
  const [note, setNote] = useState(order.follow_up_note || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDate(order.follow_up_at || '')
    setRating(order.rating || 0)
    setNote(order.follow_up_note || '')
  }, [order.id, order.follow_up_at, order.rating, order.follow_up_note])

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api.orders.setFollowUp(order.id, { follow_up_at: date, follow_up_note: note, rating })
      onUpdated(updated)
      toast('回访记录已保存')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><MessageSquareHeart size={15} className="text-rose-500" /> 售后回访</h2>
          <p className="mt-0.5 text-xs text-slate-400">{order.follow_up_at ? `上次回访 ${order.follow_up_at}` : '完工 7 天后建议回访一次'}</p>
        </div>
        {order.follow_up_at && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600">已回访</span>}
      </div>

      <div className="mt-3 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} type="button" onClick={() => setRating(star === rating ? 0 : star)} aria-label={`${star} 星`} className="p-0.5">
            <Star size={18} className={star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />
          </button>
        ))}
        <span className="ml-1 text-[10px] text-slate-400">{rating > 0 ? `${rating} 星` : '未评分'}</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="回访日期"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="回访备注" className="sm:col-span-2"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="使用是否正常、有没有异响、是否需要二次上门…" /></Field>
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={save} loading={saving}>保存回访</Button>
      </div>
    </section>
  )
}
