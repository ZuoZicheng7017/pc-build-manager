import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { errorMessage } from './api'

export function useApi<T>(loader: () => Promise<T>, deps: DependencyList = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    loaderRef.current()
      .then((result) => { if (alive) setData(result) })
      .catch((err) => { if (alive) setError(errorMessage(err)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, loading, error, reload, setData }
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useDocTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · 装机管家` : '装机管家 · 上门装机管理'
  }, [title])
}
