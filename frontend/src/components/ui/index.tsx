import { useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cn, getBillStatusBadge } from '@/utils/helpers'

// ── Body scroll lock (ref-counted so nested/stacked modals don't fight) ──────
let openModalCount = 0
function lockBodyScroll() {
  openModalCount++
  document.body.style.overflow = 'hidden'
}
function unlockBodyScroll() {
  openModalCount = Math.max(0, openModalCount - 1)
  if (openModalCount === 0) document.body.style.overflow = ''
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

// ── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}
export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Body scroll lock + focus trap + Escape-to-close + restore focus on close.
  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement
    lockBodyScroll()

    // Focus the first focusable element once the panel has mounted.
    const focusTimer = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      first?.focus()
    }, 0)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      unlockBodyScroll()
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 py-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'relative bg-white rounded-2xl shadow-2xl w-full animate-fadeIn my-auto',
          'max-h-[90vh] flex flex-col',
          sizes[size]
        )}
      >
        <div className="flex items-center justify-between p-6 border-b border-surface-100 shrink-0">
          <h2 id="modal-title" className="text-lg font-bold text-surface-900">{title}</h2>
          <button onClick={onClose} className="btn-ghost btn-sm !p-1.5" title="Close Modal" aria-label="Close modal">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('w-5 h-5 animate-spin text-brand-500', className)} />
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner className="w-8 h-8" />
    </div>
  )
}

// ── Status Badge ─────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  return <span className={getBillStatusBadge(status)}>{status}</span>
}

// ── Pagination ───────────────────────────────────────────────────────────────
interface PaginationProps {
  page: number
  count: number
  pageSize?: number
  onChange: (page: number) => void
}
export function Pagination({ page, count, pageSize = 20, onChange }: PaginationProps) {
  const pages = Math.ceil(count / pageSize)
  if (pages <= 1) return null
  return (
    <div className="flex items-center gap-2 justify-end mt-4">
      <button
        className="btn-secondary btn-sm !px-2"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        title="Previous Page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm text-surface-500">
        Page {page} of {pages}
      </span>
      <button
        className="btn-secondary btn-sm !px-2"
        disabled={page === pages}
        onClick={() => onChange(page + 1)}
        title="Next Page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }: {
  icon?: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-surface-400" />
        </div>
      )}
      <div className="text-base font-semibold text-surface-700 mb-1">{title}</div>
      {description && <div className="text-sm text-surface-400 mb-4">{description}</div>}
      {action}
    </div>
  )
}

// ── Confirm Dialog ───────────────────────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, danger }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  danger?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-surface-600 mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
          Confirm
        </button>
      </div>
    </Modal>
  )
}

// ── Stats Card ───────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon: Icon, color, change }: {
  label: string
  value: string | number
  icon: React.ElementType
  color?: string
  change?: string
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-surface-500">{label}</div>
          <div className="text-2xl font-bold text-surface-900 mt-1">{value}</div>
          {change && <div className="text-xs text-success-600 font-medium mt-1">{change}</div>}
        </div>
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', color || 'bg-brand-50')}>
          <Icon className="w-5 h-5 text-brand-600" />
        </div>
      </div>
    </div>
  )
}

// ── PermissionGate ────────────────────────────────────────────────────────────
export function PermissionGate({
  allowed,
  fallback = null,
  children,
}: {
  allowed: boolean
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  return allowed ? <>{children}</> : <>{fallback}</>
}

// ── AccessDenied ──────────────────────────────────────────────────────────────
export function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-danger-50 flex items-center justify-center">
        <svg className="w-8 h-8 text-danger-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <div className="text-center">
        <div className="font-semibold text-surface-800">Access Denied</div>
        <div className="text-sm text-surface-400 mt-1">You don't have permission to view this section.</div>
      </div>
    </div>
  )
}