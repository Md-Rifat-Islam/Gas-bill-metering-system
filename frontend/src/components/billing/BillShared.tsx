// Shared building blocks for the Bill Detail screens. Both the staff page
// (pages/billing/BillDetailPage.tsx) and the customer portal page
// (pages/portal/PortalBillDetailPage.tsx) render these, so wording, row
// order and number formatting are identical on both sites.
import type { ReactNode } from 'react'
import type { Bill } from '@/types'
import { formatCurrency, formatDate } from '@/utils/helpers'
import { BILL_LABELS as L, buildChargeRows, isKgBilled, type ChargeTone } from '@/utils/billLabels'

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-sm font-bold text-surface-500 uppercase tracking-wider mb-4">{children}</div>
}

// ── Unit details ──────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <div className="text-surface-500">{label}</div>
      <div className={`font-semibold text-surface-800 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </>
  )
}

export function UnitDetailsCard({ bill, showMobile = false }: { bill: Bill; showMobile?: boolean }) {
  // The portal serializer may not expose every field; hide the card
  // entirely rather than show a block of dashes.
  if (!bill.project_name && !bill.building_name && !bill.unit_no) return null
  return (
    <div className="card">
      <SectionTitle>{L.unitDetails}</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 text-sm">
        <InfoRow label={L.project} value={bill.project_name || '—'} />
        <InfoRow label={L.building} value={bill.building_name || '—'} />
        <InfoRow label={L.unit} value={bill.unit_no || '—'} />
        <InfoRow label={L.allottee} value={bill.allottee_name || '—'} />
        {showMobile && <InfoRow label={L.mobile} value={bill.allottee_mobile || '—'} mono />}
      </div>
    </div>
  )
}

// ── Meter readings ────────────────────────────────────────────────────────────

export function MeterReadingsCard({ bill }: { bill: Bill }) {
  return (
    <div className="card">
      <SectionTitle>{L.meterReadings}</SectionTitle>
      <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
        <div className="bg-surface-50 rounded-xl p-3 sm:p-4">
          <div className="text-xs text-surface-400 mb-1">{L.previous}</div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-surface-700">{bill.previous_reading}</div>
          <div className="text-xs text-surface-400">m³</div>
        </div>
        <div className="bg-brand-50 rounded-xl p-3 sm:p-4">
          <div className="text-xs text-brand-400 mb-1">{L.consumed}</div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-brand-700">{bill.total_usage_m3}</div>
          <div className="text-xs text-brand-400">m³</div>
        </div>
        <div className="bg-surface-50 rounded-xl p-3 sm:p-4">
          <div className="text-xs text-surface-400 mb-1">{L.current}</div>
          <div className="text-lg sm:text-2xl font-bold font-mono text-surface-700">{bill.current_reading}</div>
          <div className="text-xs text-surface-400">m³</div>
        </div>
      </div>

      {isKgBilled(bill) && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
          <div className="bg-surface-50 rounded-xl p-4">
            <div className="text-xs text-surface-400 mb-1">{L.conversionRatio}</div>
            <div className="text-lg font-bold font-mono text-surface-700">{bill.conversion_factor}</div>
            <div className="text-xs text-surface-400">kg / m³</div>
          </div>
          <div className="bg-brand-50 rounded-xl p-4">
            <div className="text-xs text-brand-400 mb-1">{L.finalUsage}</div>
            <div className="text-lg font-bold font-mono text-brand-700">{bill.total_usage_kg}</div>
            <div className="text-xs text-brand-400">kg</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Charges / summary ─────────────────────────────────────────────────────────

const TONE_CLASS: Record<ChargeTone, string> = {
  normal: 'font-semibold text-surface-800',
  muted: 'text-surface-400',
  warn: 'text-warning-600',
  success: 'text-success-600',
}

function SummaryRow({ label, value, tone = 'normal' }: { label: string; value: string; tone?: ChargeTone }) {
  return (
    <div className="flex justify-between">
      <span className="text-surface-500">{label}</span>
      <span className={TONE_CLASS[tone]}>{value}</span>
    </div>
  )
}

export function BillSummaryCard({ bill, sticky = false }: { bill: Bill; sticky?: boolean }) {
  return (
    <div className={`card ${sticky ? 'lg:sticky lg:top-4' : ''}`}>
      <SectionTitle>{L.charges}</SectionTitle>
      <div className="space-y-2.5 text-sm">
        {buildChargeRows(bill).map(r => (
          <SummaryRow key={r.key} label={r.label} value={r.value} tone={r.tone} />
        ))}

        <div className="border-t-2 border-surface-900 pt-3 flex justify-between">
          <span className="font-bold text-surface-900">{L.total}</span>
          <span className="font-bold text-xl text-brand-700">{formatCurrency(bill.total_amount)}</span>
        </div>

        <div className="pt-1 space-y-2">
          <SummaryRow label={L.paid} value={formatCurrency(bill.paid_amount)} tone="success" />
          <div className="bg-danger-50 rounded-xl p-3 flex justify-between">
            <span className="font-semibold text-danger-700">{L.due}</span>
            <span className="font-bold text-danger-700">{formatCurrency(bill.due_amount)}</span>
          </div>
        </div>
      </div>

      {bill.is_adjusted && bill.adjustment_reason && (
        <div className="mt-4 p-3 bg-warning-50 rounded-xl text-xs text-warning-700">
          <span className="font-semibold">{L.adjustment}: </span>{bill.adjustment_reason}
        </div>
      )}
    </div>
  )
}

// ── Payment history ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  Approved: 'badge-green',
  Pending: 'badge-yellow',
  Rejected: 'badge-red',
}

export function PaymentHistoryCard({ payments }: { payments: any[] }) {
  return (
    <div className="card">
      <SectionTitle>{L.paymentHistory} ({payments.length})</SectionTitle>
      {payments.length === 0 ? (
        <p className="text-sm text-surface-400">{L.noPayments}</p>
      ) : (
        <div className="space-y-2">
          {payments.map((p: any) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 px-3 bg-surface-50 rounded-xl text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-surface-800">{formatCurrency(p.paid_amount)}</span>
                <span className="badge-blue">{p.payment_method}</span>
                {p.status && <span className={STATUS_BADGE[p.status] ?? 'badge-gray'}>{p.status}</span>}
                {p.transaction_id && (
                  <span className="text-xs font-mono text-surface-400">#{p.transaction_id}</span>
                )}
              </div>
              <div className="text-surface-400 text-xs">{formatDate(p.payment_date)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}