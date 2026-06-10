import { useState, useEffect, useCallback, useRef } from 'react'

// ── useDebounce ───────────────────────────────────────────────────────────────
export function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ── useLocalStorage ───────────────────────────────────────────────────────────
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : initial
    } catch {
      return initial
    }
  })

  const set = useCallback(
    (val: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof val === 'function' ? (val as (p: T) => T)(prev) : val
        localStorage.setItem(key, JSON.stringify(next))
        return next
      })
    },
    [key]
  )

  return [value, set] as const
}

// ── useConfirm ────────────────────────────────────────────────────────────────
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean
    title: string
    message: string
    resolve?: (confirmed: boolean) => void
  }>({ open: false, title: '', message: '' })

  const confirm = useCallback((title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, title, message, resolve })
    })
  }, [])

  const handleClose = useCallback((confirmed: boolean) => {
    state.resolve?.(confirmed)
    setState({ open: false, title: '', message: '' })
  }, [state])

  return { confirmState: state, confirm, handleClose }
}

// ── usePageTitle ──────────────────────────────────────────────────────────────
export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title
    document.title = `${title} — GasBill`
    return () => { document.title = prev }
  }, [title])
}

// ── usePrevious ───────────────────────────────────────────────────────────────
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>()
  useEffect(() => { ref.current = value }, [value])
  return ref.current
}
