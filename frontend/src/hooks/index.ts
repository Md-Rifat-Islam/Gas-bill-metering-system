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
    document.title = `${title} — DECO`
    return () => { document.title = prev }
  }, [title])
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
