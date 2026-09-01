import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Upload, X, ZoomIn, Loader2 } from 'lucide-react'
import { paymentsAPI } from '@/api/client'
import { Modal } from '@/components/ui'
import { formatCurrency } from '@/utils/helpers'
import { compressImage } from '@/utils/imageCompression'
import toast from 'react-hot-toast'

// ── Optional proof upload — same compression behavior as the other proof
// inputs in the app, but explicitly NOT required here (admin manual entry
// via this modal doesn't mandate a screenshot). ──────────────────────────────
function OptionalProofInput({ value, onChange }: { value: File | null; onChange: (f: File | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const isImage = value?.type.startsWith('image/')

  const handleFile = async (file: File | null) => {
    if (!file) { setPreview(null); onChange(null); return }

    if (!file.type.startsWith('image/')) {
      setPreview(null)
      onChange(file)
      return
    }

    setCompressing(true)
    try {
      const compressed = await compressImage(file, {
        maxWidth: 1600, maxHeight: 1600, quality: 0.7, maxSizeMB: 1,
      })
      setPreview(URL.createObjectURL(compressed))
      onChange(compressed)
    } catch {
      setPreview(URL.createObjectURL(file))
      onChange(file)
    } finally {
      setCompressing(false)
    }
  }

  return (
    <div>
      <label className="label">
        Payment Proof <span className="text-surface-400 font-normal text-xs">(optional — image or PDF)</span>
      </label>
      {value ? (
        <div className="flex items-center justify-between gap-3 border border-surface-200 rounded-xl p-3 bg-surface-50">
          <div className="flex items-center gap-2 min-w-0">
            {preview ? (
              <div className="relative w-10 h-10 shrink-0">
                <img src={preview} alt="proof" className="w-10 h-10 rounded-lg object-cover cursor-zoom-in" onClick={() => setLightbox(true)} />
                {compressing && (
                  <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                    <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                {compressing ? <Loader2 className="w-4 h-4 text-brand-500 animate-spin" /> : <Upload className="w-4 h-4 text-brand-500" />}
              </div>
            )}
            <span className="text-sm text-surface-600 truncate">
              {value.name} <span className="text-surface-400">· {(value.size / 1024 / 1024).toFixed(2)} MB</span>
            </span>
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
            aria-label="Payment proof (optional)"
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

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  /** Bill being paid — required when recording a NEW payment. */
  bill?: any
  /**
   * When set, the modal opens in EDIT mode for this existing payment
   * instead of recording a new one: fields are pre-filled from it, and
   * saving calls PATCH instead of POST. Super Admin only — enforced both
   * here (the entry point that opens edit mode should already be gated on
   * can.editPayments) and on the backend (PaymentEditPermission).
   */
  editPayment?: {
    id: number
    bill_number?: string
    unit_no?: string
    allottee_name?: string
    paid_amount: string | number
    payment_method: string
    transaction_id?: string
    payment_date: string
    notes?: string
  } | null
  /** Called after a successful save, in addition to the default bill/payments cache invalidation. */
  onPaid?: () => void
}

export function PaymentModal({ open, onClose, bill, editPayment, onPaid }: PaymentModalProps) {
  const qc = useQueryClient()
  const isEdit = !!editPayment

  const { register, handleSubmit, reset, watch } = useForm({
    defaultValues: {
      paid_amount: bill?.due_amount || 0,
      payment_method: 'Cash',
      transaction_id: '',
      payment_date: new Date().toISOString().slice(0, 10),
      notes: '',
    },
  })
  const [proof, setProof] = useState<File | null>(null)

  // Reset whenever the modal (re)opens, for either mode.
  useEffect(() => {
    if (!open) return
    if (editPayment) {
      reset({
        paid_amount: Number(editPayment.paid_amount),
        payment_method: editPayment.payment_method,
        transaction_id: editPayment.transaction_id || '',
        payment_date: editPayment.payment_date,
        notes: editPayment.notes || '',
      })
    } else {
      reset({
        paid_amount: bill?.due_amount || 0,
        payment_method: 'Cash',
        transaction_id: '',
        payment_date: new Date().toISOString().slice(0, 10),
        notes: '',
      })
    }
    setProof(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bill, editPayment])

  const enteredAmount = Number(watch('paid_amount')) || 0
  const previousDue = Number(bill?.due_amount || 0)
  const remainingDue = Math.max(0, previousDue - enteredAmount)
  // Live overpay preview only makes sense when recording a brand-new
  // payment against a bill's current due amount — editing an existing
  // payment has its own due-amount math (see the backend's "effective
  // due" calculation in PaymentSerializer.validate), so this client-side
  // check is skipped in edit mode and left to the server's response.
  const overpaying = !isEdit && enteredAmount > previousDue

  const save = useMutation({
    mutationFn: (data: any) => {
      // THE FIX: this used to send a plain object with a manually forced
      // multipart/form-data header — axios doesn't convert a plain object
      // into real multipart data just because the header says so, so the
      // backend was receiving a mismatched/malformed body. Building actual
      // FormData (same pattern as ManualPaymentModal) fixes that, and lets
      // an optional proof file ride along correctly when present.
      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') fd.append(k, String(v))
      })
      if (proof) fd.append('proof_image', proof)

      if (isEdit) {
        return paymentsAPI.update(editPayment!.id, fd)
      }
      fd.append('bill_id', String(bill.id))
      return paymentsAPI.create(fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bill', bill?.id] })
      qc.invalidateQueries({ queryKey: ['payments', bill?.id] })
      qc.invalidateQueries({ queryKey: ['bills'] })
      qc.invalidateQueries({ queryKey: ['all-payments'] })
      toast.success(isEdit ? 'Payment updated' : 'Payment recorded')
      onClose(); reset(); setProof(null)
      onPaid?.()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Payment' : 'Record Payment'} size="sm">
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        {isEdit ? (
          <div className="bg-surface-50 rounded-xl p-4 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-surface-500">Bill</span>
              <span className="font-mono font-semibold">{editPayment?.bill_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-500">Unit</span>
              <span className="font-semibold">
                {editPayment?.unit_no}{editPayment?.allottee_name ? ` — ${editPayment.allottee_name}` : ''}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-surface-50 rounded-xl p-4 text-sm space-y-1.5">
            <div className="flex justify-between"><span className="text-surface-500">Bill</span><span className="font-mono font-semibold">{bill?.bill_number}</span></div>
            <div className="flex justify-between"><span className="text-surface-500">Total</span><span className="font-semibold">{formatCurrency(bill?.total_amount || 0)}</span></div>
            <div className="flex justify-between"><span className="text-surface-500">Previous Paid</span><span className="text-success-600 font-semibold">{formatCurrency(bill?.paid_amount || 0)}</span></div>
            <div className="flex justify-between border-t border-surface-200 pt-1.5">
              <span className="font-semibold">Previous Due</span>
              <span className="text-danger-600 font-bold text-base">{formatCurrency(previousDue)}</span>
            </div>
          </div>
        )}

        <div>
          <label className="label" htmlFor="pay-amount">Amount (৳) <span className="text-danger-500">*</span></label>
          <input
            id="pay-amount"
            {...register('paid_amount', { required: true, min: 0.01 })}
            type="number"
            step="0.01"
            className="input"
            aria-label="Payment amount"
            title="Payment amount"
          />
        </div>

        {/* Live remaining-due preview — new payments only, see overpaying comment above */}
        {!isEdit && (
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

        <div>
          <label className="label" htmlFor="pay-method">Payment Method <span className="text-danger-500">*</span></label>
          <select
            id="pay-method"
            {...register('payment_method', { required: true })}
            className="input"
            aria-label="Payment method"
            title="Payment method"
          >
            <option value="Cash">Cash</option>
            <option value="Bank">Bank Transfer</option>
            <option value="bKash">bKash</option>
            <option value="Card">Card</option>
            <option value="SSLCommerz">SSLCommerz</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pay-txn">Transaction ID</label>
          <input
            id="pay-txn"
            {...register('transaction_id')}
            className="input"
            placeholder="Optional"
            aria-label="Transaction ID"
            title="Transaction ID"
          />
        </div>
        <div>
          {/* THE FIX: this field didn't exist at all — Payment.payment_date
              is a required model field with no default, so every submission
              through this modal failed with "payment_date: This field is
              required." Added here, defaulting to today. */}
          <label className="label" htmlFor="pay-date">Payment Date <span className="text-danger-500">*</span></label>
          <input
            id="pay-date"
            {...register('payment_date', { required: true })}
            type="date"
            className="input"
            aria-label="Payment date"
            title="Payment date"
          />
        </div>

        <OptionalProofInput value={proof} onChange={setProof} />

        <div>
          <label className="label" htmlFor="pay-notes">Notes</label>
          <textarea
            id="pay-notes"
            {...register('notes')}
            className="input"
            rows={2}
            aria-label="Notes"
            title="Notes"
          />
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" className="btn-secondary" onClick={onClose} aria-label="Cancel" title="Cancel">
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={save.isPending || overpaying}
            aria-label={isEdit ? 'Save changes' : 'Record payment'}
            title={isEdit ? 'Save changes' : 'Record payment'}
          >
            {save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}