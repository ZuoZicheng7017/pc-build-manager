import { db, nowIso } from './db'

export interface LinkInfo {
  url: string
  platform: 'pdd' | 'jd' | 'taobao' | 'manual'
  title: string
  price_cents: number
  image_url: string
  shop_name: string
  warning: string
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
}

function meta(html: string, key: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return decode(match[1])
  }
  return ''
}

function platformOf(url: URL): LinkInfo['platform'] {
  const host = url.hostname.toLowerCase()
  if (host.includes('pinduoduo') || host.includes('yangkeduo')) return 'pdd'
  if (host.includes('jd.com') || host.includes('3.cn')) return 'jd'
  if (host.includes('taobao') || host.includes('tmall')) return 'taobao'
  return 'manual'
}

function isProductPage(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  if (host.includes('jd.com')) return /\/\d+\.html/.test(url.pathname)
  if (host.includes('pinduoduo') || host.includes('yangkeduo')) {
    return url.pathname.includes('goods') || url.searchParams.has('goods_id')
  }
  if (host.includes('taobao') || host.includes('tmall')) {
    return url.pathname.includes('item.htm') || url.pathname.includes('/item/')
  }
  return true
}

function jsonLdPrice(html: string): number {
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]) as unknown
      const products = Array.isArray(data) ? data : [data]
      for (const product of products as Array<Record<string, unknown>>) {
        if (product['@type'] !== 'Product') continue
        const offers = product.offers as Record<string, unknown> | Array<Record<string, unknown>> | undefined
        const offer = Array.isArray(offers) ? offers[0] : offers
        const raw = Number(offer?.price ?? offer?.lowPrice ?? 0)
        if (Number.isFinite(raw) && raw > 0) return Math.round(raw * 100)
      }
    } catch { /* ignore malformed JSON-LD */ }
  }
  return 0
}

function parsePrice(html: string, platform: LinkInfo['platform']): number {
  const metaPrice = meta(html, 'product:price:amount') || meta(html, 'og:price:amount')
  const fromMeta = Number(metaPrice)
  if (Number.isFinite(fromMeta) && fromMeta > 0) return Math.round(fromMeta * 100)
  const fromJsonLd = jsonLdPrice(html)
  if (fromJsonLd > 0) return fromJsonLd
  if (platform === 'pdd') {
    const pdd = html.match(/"(?:minGroupPrice|minOnSaleGroupPrice|groupPrice)"\s*:\s*([0-9]+)/)
    if (pdd) return Number(pdd[1])
  }
  return 0
}

async function jdPrice(url: URL): Promise<number> {
  const sku = url.pathname.match(/\/(\d+)\.html/)?.[1]
  if (!sku) return 0
  try {
    const res = await fetch(`https://p.3.cn/prices/mgets?skuIds=J_${sku}`, {
      headers: { 'User-Agent': UA, Referer: 'https://item.jd.com/' },
      signal: AbortSignal.timeout(8_000),
    })
    const data = await res.json() as Array<{ p?: string }>
    return Math.round(Number(data[0]?.p || 0) * 100)
  } catch {
    return 0
  }
}

export async function inspectProductLink(rawUrl: string): Promise<LinkInfo> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
    if (!/^https?:$/.test(url.protocol)) throw new Error()
  } catch {
    throw new Error('请粘贴完整的 http(s) 商品链接')
  }
  let html = ''
  let finalUrl = url
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal: AbortSignal.timeout(12_000),
    })
    finalUrl = new URL(res.url)
    html = (await res.text()).slice(0, 2_000_000)
  } catch {
    throw new Error('链接读取失败，可能被平台拦截；请手动填写标题和价格')
  }

  const title = decode(meta(html, 'og:title') || meta(html, 'twitter:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '')
    .replace(/\s*[-_|].*(京东|淘宝|天猫|拼多多).*$/i, '')
    .slice(0, 200)
  const image = meta(html, 'og:image') || meta(html, 'twitter:image')
  const shop = meta(html, 'og:site_name') || finalUrl.hostname.replace(/^www\./, '')
  const productPage = isProductPage(finalUrl)
  let price = productPage ? parsePrice(html, platformOf(finalUrl)) : 0
  if (!price && productPage && platformOf(finalUrl) === 'jd') price = await jdPrice(finalUrl)
  const warning = !productPage
    ? '这个链接不像商品详情页，请打开具体商品后复制链接；先手动填写标题和价格'
    : !price
      ? '没有读取到价格，请手动填写；之后仍可点击“更新价格”重试'
      : ''

  return {
    url: finalUrl.toString(),
    platform: platformOf(finalUrl),
    title: title || '未读取到标题',
    price_cents: price,
    image_url: image,
    shop_name: shop,
    warning,
  }
}

export async function refreshMarketPrice(id: number): Promise<{ price_cents: number; checked_at: string; error: string }> {
  const row = db.prepare('SELECT url FROM market_items WHERE id = ?').get(id) as { url: string } | undefined
  if (!row) throw new Error('配件行情不存在')
  if (!row.url) throw new Error('这个配件没有商品链接')
  try {
    const info = await inspectProductLink(row.url)
    const checkedAt = nowIso()
    if (info.price_cents > 0) {
      db.prepare('UPDATE market_items SET price_cents = ?, price_checked_at = ?, price_error = ?, updated_at = ? WHERE id = ?')
        .run(info.price_cents, checkedAt, '', checkedAt, id)
      return { price_cents: info.price_cents, checked_at: checkedAt, error: '' }
    }
    db.prepare('UPDATE market_items SET price_checked_at = ?, price_error = ?, updated_at = ? WHERE id = ?')
      .run(checkedAt, info.warning || '未读取到价格', checkedAt, id)
    return { price_cents: 0, checked_at: checkedAt, error: info.warning || '未读取到价格' }
  } catch (err) {
    const checkedAt = nowIso()
    const message = err instanceof Error ? err.message : '价格更新失败'
    db.prepare('UPDATE market_items SET price_checked_at = ?, price_error = ?, updated_at = ? WHERE id = ?')
      .run(checkedAt, message, checkedAt, id)
    return { price_cents: 0, checked_at: checkedAt, error: message }
  }
}
