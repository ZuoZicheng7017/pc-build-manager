import { useEffect, useState } from 'react'
import type { Customer } from '../../shared/types'
import { CUSTOMER_LEVELS, CUSTOMER_LEVEL_LABELS, CUSTOMER_SOURCES } from '../../shared/types'
import { api, errorMessage, type CustomerPayload } from '../lib/api'
import { useFeedback } from '../lib/feedback'
import { Button, Field, Input, Modal, Select, Textarea } from './ui'

const empty: CustomerPayload = {
  name: '', phone: '', wechat: '', address: '', district: '', source: '转介绍', level: 'normal', tags: '', notes: '',
}

export function CustomerFormModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initial: Customer | null
  onSaved: (customer: Customer) => void
}) {
  const { toast, confirm } = useFeedback()
  const [form, setForm] = useState<CustomerPayload>({ ...empty })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({
        name: initial.name, phone: initial.phone, wechat: initial.wechat, address: initial.address,
        district: initial.district, source: initial.source, level: initial.level, tags: initial.tags, notes: initial.notes,
      })
    } else {
      setForm({ ...empty })
    }
  }, [open, initial])

  const save = async () => {
    if (!form.name.trim()) {
      toast('请填写客户称呼', 'error')
      return
    }
    setSaving(true)
    try {
      const phone = (form.phone ?? '').trim()
      if (!initial && phone.length >= 7) {
        const matches = await api.customers.list({ q: phone })
        const duplicate = matches.find((c) => c.phone === phone)
        if (duplicate) {
          const ok = await confirm({
            title: '这个手机号已经存在客户',
            message: `已有「${duplicate.name}」，确定还要新建一个客户吗？`,
            confirmText: '仍然新建',
          })
          if (!ok) return
        }
      }
      const saved = initial ? await api.customers.update(initial.id, form) : await api.customers.create(form)
      toast(initial ? '客户信息已更新' : '客户已创建')
      onSaved(saved)
      onClose()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? '编辑客户' : '新建客户'}
      description={initial ? initial.name : '把联系方式、地址和偏好记下来，下次上门更省事'}
      footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button onClick={save} loading={saving}>保存</Button></>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="称呼" required className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="王先生 / 林女士 / 张同学" autoFocus />
        </Field>
        <Field label="手机号"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="138…" /></Field>
        <Field label="微信"><Input value={form.wechat} onChange={(e) => setForm({ ...form, wechat: e.target.value })} /></Field>
        <Field label="默认地址" className="sm:col-span-2">
          <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="小区 / 楼栋 / 单元 / 门牌号" />
        </Field>
        <Field label="区域"><Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} placeholder="西湖区" /></Field>
        <Field label="客户等级">
          <Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Customer['level'] })}>
            {CUSTOMER_LEVELS.map((level) => <option key={level} value={level}>{CUSTOMER_LEVEL_LABELS[level]}</option>)}
          </Select>
        </Field>
        <Field label="客户来源">
          <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            {CUSTOMER_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}
          </Select>
        </Field>
        <Field label="标签" hint="多个标签用英文逗号分隔"><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="游戏玩家,爽快" /></Field>
        <Field label="备注" className="sm:col-span-2">
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="偏好、禁忌、历史问题、开票需求…" />
        </Field>
      </div>
    </Modal>
  )
}
