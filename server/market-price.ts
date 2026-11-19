import { listAccounts, tenantFor } from './accounts'
import { runWithTenant } from './context'
import { db } from './db'
import { refreshMarketPrice } from './market-link'

const DAY = 24 * 60 * 60 * 1000
let running = false

export async function refreshAllMarketPrices(): Promise<{ checked: number; updated: number; failed: number }> {
  if (running) return { checked: 0, updated: 0, failed: 0 }
  running = true
  let checked = 0
  let updated = 0
  let failed = 0
  try {
    for (const account of listAccounts()) {
      if (account.status !== 'active') continue
      await runWithTenant(tenantFor(account), async () => {
        const rows = db.prepare("SELECT id FROM market_items WHERE url <> '' LIMIT 100").all() as { id: number }[]
        for (const row of rows) {
          checked += 1
          const result = await refreshMarketPrice(row.id)
          if (result.price_cents > 0) updated += 1
          else failed += 1
          await new Promise((resolve) => setTimeout(resolve, 1_500))
        }
      })
    }
  } finally {
    running = false
  }
  return { checked, updated, failed }
}

export function startMarketPriceLoop(): void {
  const run = () => {
    refreshAllMarketPrices()
      .then((result) => {
        if (result.checked > 0) {
          console.log(`[配件行情] 每日价格检查：${result.checked} 个，更新 ${result.updated} 个，失败 ${result.failed} 个`)
        }
      })
      .catch((err) => console.error('[配件行情] 价格检查失败', err))
  }
  setTimeout(run, 60_000)
  setInterval(run, DAY)
}
