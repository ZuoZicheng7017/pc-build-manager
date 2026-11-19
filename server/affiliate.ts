import crypto from 'node:crypto'
import { db, nowIso } from './db'

export interface PddConfig {
  client_id: string
  client_secret: string
  pid: string
  updated_at: string
}

interface PddGoods {
  goods_id?: number
  goods_name?: string
  goods_thumbnail_url?: string
  goods_image_url?: string
  min_group_price?: number
  min_normal_price?: number
  mall_name?: string
  sales_tip?: string
  coupon_discount?: number
}

export interface MarketSearchItem {
  external_id: string
  title: string
  price_cents: number
  image_url: string
  shop_name: string
  url: string
  sales_tip: string
}

export function getPddConfig(): PddConfig {
  const row = db.prepare("SELECT client_id, client_secret, pid, updated_at FROM affiliate_configs WHERE platform = 'pdd'").get() as
    | PddConfig
    | undefined
  return row ?? { client_id: '', client_secret: '', pid: '', updated_at: '' }
}

export function savePddConfig(input: { client_id?: string; client_secret?: string; pid?: string }): PddConfig {
  const current = getPddConfig()
  const clientId = String(input.client_id ?? current.client_id).trim()
  const secret = String(input.client_secret ?? '').trim() || current.client_secret
  const pid = String(input.pid ?? current.pid).trim()
  db.prepare(`
    INSERT INTO affiliate_configs (platform, client_id, client_secret, pid, updated_at)
    VALUES ('pdd', ?, ?, ?, ?)
    ON CONFLICT(platform) DO UPDATE SET client_id = excluded.client_id, client_secret = excluded.client_secret, pid = excluded.pid, updated_at = excluded.updated_at
  `).run(clientId, secret, pid, nowIso())
  return getPddConfig()
}

function sign(params: Record<string, string>, secret: string): string {
  const content = Object.keys(params)
    .filter((key) => key !== 'sign' && params[key] !== '')
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('')
  return crypto.createHash('md5').update(`${secret}${content}${secret}`, 'utf8').digest('hex').toUpperCase()
}

export async function searchPdd(keyword: string, page = 1, pageSize = 20): Promise<MarketSearchItem[]> {
  const config = getPddConfig()
  if (!config.client_id || !config.client_secret) throw new Error('请先在设置中填写多多进宝 client_id 和 client_secret')
  if (!config.pid) throw new Error('请先在设置中填写多多进宝推广位 PID')
  const params: Record<string, string> = {
    type: 'pdd.ddk.goods.search',
    client_id: config.client_id,
    timestamp: String(Math.floor(Date.now() / 1000)),
    data_type: 'JSON',
    q: keyword.trim(),
    pid: config.pid,
    page: String(page),
    page_size: String(Math.min(Math.max(pageSize, 1), 50)),
  }
  params.sign = sign(params, config.client_secret)
  const response = await fetch('https://gw-api.pinduoduo.com/api/router', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15_000),
  })
  const body = await response.json() as {
    error_response?: { error_msg?: string; sub_msg?: string }
    goods_search_response?: { goods_list?: PddGoods[] }
  }
  if (body.error_response) throw new Error(body.error_response.sub_msg || body.error_response.error_msg || '多多进宝接口返回错误')
  if (!response.ok) throw new Error(`多多进宝接口 HTTP ${response.status}`)
  return (body.goods_search_response?.goods_list ?? []).map((goods) => ({
    external_id: String(goods.goods_id ?? ''),
    title: String(goods.goods_name ?? ''),
    price_cents: Number(goods.min_group_price ?? goods.min_normal_price ?? 0),
    image_url: String(goods.goods_thumbnail_url ?? goods.goods_image_url ?? ''),
    shop_name: String(goods.mall_name ?? ''),
    url: `https://mobile.yangkeduo.com/goods.html?goods_id=${goods.goods_id ?? ''}`,
    sales_tip: String(goods.sales_tip ?? ''),
  })).filter((item) => item.title && item.external_id)
}
