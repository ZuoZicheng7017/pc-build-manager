import { useEffect, useRef, useState } from 'react'
import { Eraser, PenLine } from 'lucide-react'
import { Button } from './ui'

export function SignaturePad({ onSave, saving }: { onSave: (blob: Blob) => void; saving?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = 800 * ratio
    canvas.height = 260 * ratio
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * 800, y: ((e.clientY - rect.top) / rect.height) * 260 }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.setPointerCapture(e.pointerId)
    drawing.current = true
    const p = point(e)
    last.current = p
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + 0.1, p.y + 0.1)
    ctx.stroke()
    setHasInk(true)
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    const p = point(e)
    if (!ctx || !last.current) return
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false
    last.current = null
    canvasRef.current?.releasePointerCapture(e.pointerId)
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, 800, 260)
    setHasInk(false)
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasInk) return
    canvas.toBlob((blob) => { if (blob) onSave(blob) }, 'image/png')
  }

  return (
    <div>
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-1">
        <canvas
          ref={canvasRef}
          className="h-40 w-full touch-none rounded-lg bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><PenLine size={11} /> 请客户在框内手写签名，确认已验收装机服务。</p>
      <div className="mt-3 flex justify-between">
        <Button size="sm" variant="ghost" onClick={clear}><Eraser size={13} /> 清空</Button>
        <Button size="sm" onClick={save} loading={saving} disabled={!hasInk}>保存签名</Button>
      </div>
    </div>
  )
}
