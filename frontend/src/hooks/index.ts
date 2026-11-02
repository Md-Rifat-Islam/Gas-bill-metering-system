export * from './usePermissions'

import { useState, useEffect, useCallback } from 'react'

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
    document.title = `${title} — DECO`
    return () => { document.title = prev }
  }, [title])
}

// ── Persisted state ──────────────────────────────────────────────────────────
// Drop-in replacement for useState that keeps its value in sessionStorage.
// List pages unmount when you open a detail page or switch sidebar menus, which
// wipes plain useState. With this hook the search text, filters, page number
// and view mode are restored when you come back.
//
//   const [filters, setFilters] = usePersistedState('billing:filters', EMPTY)
//   const [page, setPage]       = usePersistedState('billing:page', 1)
//
// - sessionStorage = survives navigation and refresh, cleared when the tab closes.
// - Object values are merged over the initial value, so adding a new filter
//   field later doesn't break values already saved in someone's browser.
// - Call clearPersistedState() on logout so the next user starts clean.
const PERSIST_PREFIX = 'persist:'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function usePersistedState<T>(key: string, initial: T) {
  const storageKey = PERSIST_PREFIX + key

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw !== null) {
        const parsed = JSON.parse(raw)
        if (isPlainObject(initial) && isPlainObject(parsed)) {
          return { ...initial, ...parsed } as T
        }
        return parsed as T
      }
    } catch {
      // corrupted value or storage unavailable — fall back to the default
    }
    return initial
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // storage full / blocked (private mode) — state still works in memory
    }
  }, [storageKey, value])

  return [value, setValue] as const
}

/** Remove every persisted filter/search value (call on logout). */
export function clearPersistedState() {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(PERSIST_PREFIX))
      .forEach((k) => sessionStorage.removeItem(k))
  } catch {
    // ignore
  }
}

/**
 * Promise-based confirmation dialog hook, used everywhere a destructive
 * action (delete user / staff / building / unit / bill / payment) needs a
 * "Are you sure?" gate before firing the mutation.
 *
 * Usage:
 *   const { confirmState, confirm, handleClose } = useConfirm()
 *   const onDeleteClick = async () => {
 *     const ok = await confirm('Delete user', 'This action cannot be undone.')
 *     if (ok) deleteMutation.mutate(id)
 *   }
 *   <ConfirmDialog
 *     open={confirmState.open}
 *     title={confirmState.title}
 *     message={confirmState.message}
 *     danger
 *     onClose={() => handleClose(false)}
 *     onConfirm={() => handleClose(true)}
 *   />
 */
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
    setState((prev) => {
      prev.resolve?.(confirmed)
      return { open: false, title: '', message: '' }
    })
  }, [])

  return { confirmState: state, confirm, handleClose }
}