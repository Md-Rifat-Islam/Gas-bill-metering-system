import { ArrowDownRight, ArrowUpRight, Minus, Lock } from 'lucide-react'
import { cn } from '@/utils/helpers'

// Same hex values the existing charts already use, so old and new charts
// sit side by side without a visible style change.
export const CHART = {
  brand: '#0062f5',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  grid: '#f0f2f8',
  muted: '#a8b2cc',
}

export const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #e4e8f2',
  boxShadow: '0 4px 16px rgba(0,0,0,.06)',
  fontSize: 12,
}

// ── number formatting ────────────────────────────────────────────────────────

/** Whole-taka amount, no decimals — KPI cards and tables. */
export function formatTaka(n: number | string) {
  return `৳ ${Math.round(Number(n) || 0).toLocaleString('en-BD')}`
}

/** Short axis label in the units people here actually use: k, L (lakh), Cr (crore). */
export function compactTaka(v: number) {
  const n = Math.abs(v)
  const s = v < 0 ? '-' : ''
  const trim = (x: number) => x.toFixed(1).replace(/\.0$/, '')
  if (n >= 1e7) return `${s}৳${trim(n / 1e7)}Cr`
  if (n >= 1e5) return `${s}৳${trim(n / 1e5)}L`
  if (n >= 1e3) return `${s}৳${trim(n / 1e3)}k`
  return `${s}৳${n.toFixed(0)}`
}

export const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)

export function shortMonth(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleString('en', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`
}

export function rateTone(rate: number): 'success' | 'warning' | 'danger' {
  return rate >= 80 ? 'success' : rate >= 50 ? 'warning' : 'danger'
}

// ── layout pieces ────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('card', className)}>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="text-base font-semibold text-surface-800">{title}</div>
          {subtitle && <div className="text-xs text-surface-400 mt-0.5">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function LockedCard({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('card flex items-center gap-3 text-surface-400', className)}>
      <Lock className="w-4 h-4 shrink-0" />
      <span className="text-sm">{label} requires Accountant or Super Admin access.</span>
    </div>
  )
}

/** Same look as the Table / Spreadsheet toggle on the Billing page. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="flex gap-1 bg-surface-100 rounded-xl p-1 self-start">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
            value === o.value ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Same structure as the shared StatCard, plus an optional footer line (usually a Delta). */
export function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  footer,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color?: string
  footer?: React.ReactNode
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-surface-500">{label}</div>
          <div className="text-2xl font-bold text-surface-900 mt-1 truncate">{value}</div>
          {sub && <div className="text-xs text-surface-400 mt-1">{sub}</div>}
        </div>
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', color || 'bg-brand-50')}>
          <Icon className="w-5 h-5 text-brand-600" />
        </div>
      </div>
      {footer && <div className="pt-3 border-t border-surface-100">{footer}</div>}
    </div>
  )
}

/**
 * Change versus the previous period. `invert` flips the colours for numbers
 * where going up is bad (outstanding dues). `unit` is '%' for a relative
 * change or ' pts' for a difference between two rates.
 */
export function Delta({
  value,
  invert,
  unit = '%',
  label = 'vs previous month',
}: {
  value: number | null | undefined
  invert?: boolean
  unit?: string
  label?: string
}) {
  if (value === null || value === undefined || !isFinite(value)) {
    return <div className="text-xs text-surface-400">No previous month to compare</div>
  }
  const flat = Math.abs(value) < 0.05
  const good = invert ? value < 0 : value > 0
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-semibold',
          flat ? 'text-surface-500' : good ? 'text-success-600' : 'text-danger-600'
        )}
      >
        <Icon className="w-3.5 h-3.5" />
        {Math.abs(value).toFixed(1)}
        {unit}
      </span>
      <span className="text-surface-400">{label}</span>
    </div>
  )
}

export function relChange(current?: number, previous?: number) {
  if (current === undefined || previous === undefined || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

const TONE_BAR: Record<string, string> = {
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
}

export function ProgressRow({
  label,
  sublabel,
  percent,
  right,
  tone = 'brand',
}: {
  label: string
  sublabel?: string
  percent: number
  right?: React.ReactNode
  tone?: 'brand' | 'success' | 'warning' | 'danger'
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <span className="text-sm font-medium text-surface-700 truncate">{label}</span>
          {sublabel && <span className="text-xs text-surface-400 ml-2">{sublabel}</span>}
        </div>
        {right && <div className="text-xs text-surface-500 shrink-0">{right}</div>}
      </div>
      <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', TONE_BAR[tone])}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  )
}