export * from './usePermissions'

import { useState, useEffect, useCallback, useRef } from 'react'

export function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title
    document.title = `${title} — GasBill`
    return () => { document.title = prev }
  }, [title])
}