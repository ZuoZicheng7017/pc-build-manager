import { AsyncLocalStorage } from 'node:async_hooks'
import type { DatabaseSync } from 'node:sqlite'

export interface Tenant {
  accountId: number
  username: string
  isAdmin: boolean
  db: DatabaseSync
  dataDir: string
  uploadDir: string
  backupDir: string
}

const storage = new AsyncLocalStorage<Tenant>()

export function runWithTenant<T>(tenant: Tenant, fn: () => T): T {
  return storage.run(tenant, fn)
}

export function currentTenant(): Tenant | undefined {
  return storage.getStore()
}
