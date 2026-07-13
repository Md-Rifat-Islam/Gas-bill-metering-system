import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import {
  CreditCard, Search, ExternalLink, Plus, Clock, Upload, X, ZoomIn, Download, Loader2,
} from 'lucide-react'
import { paymentsAPI, billingAPI, reportsAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState, Pagination } from '@/components/ui'
import { formatCurrency, formatDate } from '@/utils/helpers'
import toast from 'react-hot-toast'

const METHOD_COLORS: Record<string, string> = {
  Cash: 'badge-green',
  Bank: 'badge-blue',
  bKash: 'badge-yellow',
  Card: 'badge-blue',
  SSLCommerz: 'badge-blue',
}

const STATUS_COLORS: Record<string, string> = {
  Pending:  'badge-yellow',
  Approved: 'badge-green',
  Rejected: 'badge-red',
}

// ── Proof file input (single-purpose, mandatory) ──────────────────────────────
function ProofInput({ value, onChange }: { value: File | null; onChange: (f: File | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState(false)
  const isImage = value?.type.startsWith('image/')

  const handleFile = (file: File | null) => {
    if (!file) { setPreview(null); onChange(null); return }
    if (file.type.startsWith('image/')) setPreview(URL.createObjectURL(file))
    else setPreview(null)
    onChange(file)
  }

  return (
    <div>
      <label className="label">
        Payment Proof <span className="text-danger-500">*</span>
        <span className="text-surface-400 font-normal text-xs"> (image or PDF)</span>
      </label>
      {value ? (
        <div className="flex items-center justify-between gap-3 border border-surface-200 rounded-xl p-3 bg-surface-50">
          <div className="flex items-center gap-2 min-w-0">
            {preview ? (
              <img src={preview} alt="proof" className="w-10 h-10 rounded-lg object-cover cursor-zoom-in shrink-0" onClick={() => setLightbox(true)} />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <Upload className="w-4 h-4 text-brand-500" />
              </div>
            )}
            <span className="text-sm text-surface-600 truncate">{value.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isImage && (
              <button type="button" className="btn-ghost btn-sm !p-1.5" onClick={() => setLightbox(true)} title="Zoom In">
                <ZoomIn className="w-4 h-4" />
              </button>
            )}
            <button type="button" className="btn-ghost btn-sm !p-1.5" onClick={() => handleFile(null)} title="Remove">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-surface-200 rounded-xl p-4 cursor-pointer hover:border-brand-300 transition-colors bg-surface-50">
          <Upload className="w-4 h-4 text-surface-400" />
          <span className="text-sm text-surface-500">Upload screenshot / invoice / PDF</span>
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            aria-label="Payment proof"
            onChange={e => handleFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}

      {lightbox && preview && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(false)}>
          <img src={preview} alt="Payment proof" className="max-w-full max-h-full rounded-xl object-contain" />
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(false)} title="Close">
            <X className="w-8 h-8" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Manual Payment Entry Modal ────────────────────────────────────────────────
function ManualPaymentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, watch } = useForm({
    defaultValues: {
      bill_id: '',
      paid_amount: '',
      payment_method: 'Cash',
      transaction_id: '',
      payment_date: new Date().toISOString().slice(0, 10),
      notes: '',
    },
  })
  const [proof, setProof] = useState<File | null>(null)
  const [billSearch, setBillSearch] = useState('')

  const selectedBillId = watch('bill_id')
  const enteredAmount = Number(watch('paid_amount')) || 0

  // Fetch a working set of bills to search/select from — mirrors the
  // page_size:500 + client-side filter pattern already used elsewhere
  // (e.g. units-all on MetersPage) rather than assuming server-side search
  // support that isn't confirmed on this endpoint.
  const { data: billsData } = useQuery({
    queryKey: ['bills-for-payment'],
    queryFn: () => billingAPI.list({ page_size: 500 }).then(r => {
      const raw = r.data; return Array.isArray(raw) ? raw : (raw.results ?? [])
    }),
    enabled: open,
  })
  const bills = (billsData ?? []).filter((b: any) =>
    b.status !== 'Paid' && (
      !billSearch ||
      b.bill_number?.toLowerCase().includes(billSearch.toLowerCase()) ||
      b.unit_no?.toLowerCase().includes(billSearch.toLowerCase()) ||
      b.allottee_name?.toLowerCase().includes(billSearch.toLowerCase())
    )
  )

  const selectedBill = (billsData ?? []).find((b: any) => String(b.id) === String(selectedBillId))
  const previousDue = Number(selectedBill?.due_amount || 0)
  const remainingDue = Math.max(0, previousDue - enteredAmount)
  const overpaying = Boolean(selectedBill) && enteredAmount > previousDue

  const save = useMutation({
    mutationFn: (data: any) => {
      if (!proof) throw new Error('Payment proof is required.')
      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') fd.append(k, String(v)) })
      fd.append('proof_image', proof)
      return paymentsAPI.create(fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-payments'] })
      qc.invalidateQueries({ queryKey: ['billing'] })
      toast.success('Payment recorded')
      onClose(); reset(); setProof(null); setBillSearch('')
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Record Manual Payment" size="lg">
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div>
          <label className="label">Bill *</label>
          <input
            className="input mb-2"
            placeholder="Search bill no., unit, customer…"
            value={billSearch}
            onChange={e => setBillSearch(e.target.value)}
          />
          <select {...register('bill_id', { required: true })} className="input" size={5}>
            {bills.length === 0 && <option disabled>No matching unpaid bills</option>}
            {bills.map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.bill_number} — {b.unit_no} ({b.allottee_name || 'Unassigned'}) — Due: {b.due_amount}
              </option>
            ))}
          </select>
        </div>

        {/* Previous paid/due for the selected bill */}
        {selectedBill && (
          <div className="bg-surface-50 rounded-xl p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-surface-500">Previous Paid</span>
              <span className="text-success-600 font-semibold">{formatCurrency(selectedBill.paid_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-surface-200 pt-1">
              <span className="font-semibold text-surface-700">Previous Due</span>
              <span className="text-danger-600 font-bold">{formatCurrency(previousDue)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Amount (৳) *</label>
            <input {...register('paid_amount', { required: true, min: 0.01 })} type="number" step="0.01" className="input" />
          </div>
          <div>
            <label className="label">Payment Method *</label>
            <select {...register('payment_method', { required: true })} className="input">
              <option value="Cash">Cash</option>
              <option value="Bank">Bank Transfer</option>
              <option value="bKash">bKash</option>
              <option value="Card">Card</option>
              <option value="SSLCommerz">SSLCommerz</option>
            </select>
          </div>
          <div>
            <label className="label">Transaction ID *</label>
            <input {...register('transaction_id', { required: true })} className="input" placeholder="Reference / receipt no." />
          </div>
          <div>
            <label className="label">Payment Date *</label>
            <input {...register('payment_date', { required: true })} type="date" className="input" />
          </div>
        </div>

        {/* Live remaining-due preview — recalculates as the amount is typed */}
        {selectedBill && (
          <div className={`rounded-xl p-3 flex justify-between items-center text-sm ${
            overpaying ? 'bg-danger-50' : remainingDue === 0 ? 'bg-success-50' : 'bg-brand-50'
          }`}>
            <span className={overpaying ? 'text-danger-600 font-medium' : 'text-surface-600'}>
              {overpaying ? 'Exceeds due amount' : 'Remaining Due After This Payment'}
            </span>
            <span className={`font-bold ${
              overpaying ? 'text-danger-700' : remainingDue === 0 ? 'text-success-700' : 'text-brand-700'
            }`}>
              {formatCurrency(remainingDue)}
            </span>
          </div>
        )}

        <ProofInput value={proof} onChange={setProof} />

        <div>
          <label className="label">Notes</label>
          <textarea {...register('notes')} className="input" rows={2} placeholder="Any additional information…" />
        </div>

        <div className="flex gap-3 justify-end pt-2 border-t border-surface-100">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending || overpaying}>
            {save.isPending ? 'Saving…' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const navigate = useNavigate()
  const [methodFilter, setMethodFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [entryModal, setEntryModal] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['all-payments', page, methodFilter, statusFilter],
    queryFn: () => paymentsAPI.list({
      page,
      payment_method: methodFilter || undefined,
      status: statusFilter || undefined,
    }).then(r => r.data),
  })

  const { data: pendingData } = useQuery({
    queryKey: ['payments-pending-count'],
    queryFn: () => paymentsAPI.pending().then(r => r.data),
    refetchInterval: 60_000,
  })
  const pendingCount = pendingData?.count ?? pendingData?.results?.length ?? 0

  const payments = data?.results || []

  const handleExport = async () => {
    setExporting(true)
    try {
      // Exports exactly what's currently filtered — same method/status
      // params the list query itself is using.
      await reportsAPI.exportPaymentsExcel({
        payment_method: methodFilter || undefined,
        status: statusFilter || undefined,
      })
    } catch {
      toast.error('Could not export payments')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">All payment transactions across the system</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => navigate('/payments/pending')}>
            <Clock className="w-4 h-4" />
            Pending Approvals
            {pendingCount > 0 && (
              <span className="ml-1.5 bg-danger-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {pendingCount}
              </span>
            )}
          </button>
          <button className="btn-secondary" onClick={handleExport} disabled={exporting} title="Export current view to Excel">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export Excel
          </button>
          <button className="btn-primary" onClick={() => setEntryModal(true)}>
            <Plus className="w-4 h-4" /> Record Payment
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <select className="input max-w-[160px]" value={methodFilter}
          onChange={e => { setMethodFilter(e.target.value); setPage(1) }}
          title="Filter by payment method"
        >
          <option value="">All Methods</option>
          <option>Cash</option>
          <option>Bank</option>
          <option>bKash</option>
          <option>Card</option>
          <option>SSLCommerz</option>
        </select>
        <select className="input max-w-[160px]" value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          title="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill No.</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Transaction ID</th>
                  <th>Received / Reviewed By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={9}>
                    <EmptyState icon={CreditCard} title="No payments found" />
                  </td></tr>
                ) : payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="text-surface-600 text-sm">{formatDate(p.payment_date)}</td>
                    <td>
                      <span className="font-mono text-xs font-semibold text-brand-700">{p.bill_number}</span>
                    </td>
                    <td className="font-mono font-bold text-success-600">{formatCurrency(p.paid_amount)}</td>
                    <td><span className={METHOD_COLORS[p.payment_method] || 'badge-gray'}>{p.payment_method}</span></td>
                    <td><span className={STATUS_COLORS[p.status] || 'badge-gray'}>{p.status}</span></td>
                    <td className="text-xs text-surface-400 capitalize">{p.source}</td>
                    <td className="font-mono text-xs text-surface-400">{p.transaction_id || '—'}</td>
                    <td className="text-surface-600 text-sm">
                      {p.reviewed_by_name || p.received_by_name || '—'}
                    </td>
                    <td>
                      <button className="btn-ghost btn-sm"
                        onClick={() => navigate(`/billing/${p.bill}`)}
                        title="View Bill"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={data?.count || 0} onChange={setPage} />
        </>
      )}

      <ManualPaymentModal open={entryModal} onClose={() => setEntryModal(false)} />
    </div>
  )
}