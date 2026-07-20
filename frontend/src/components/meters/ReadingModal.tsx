import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Camera, X, Upload, ZoomIn, Lock } from 'lucide-react'
import { metersAPI } from '@/api/client'
import { Modal } from '@/components/ui'
import toast from 'react-hot-toast'

// ── Photo capture component ───────────────────────────────────────────────────
export function PhotoCapture({ value, onChange }: {
  value: File | null
  onChange: (file: File | null) => void
}) {
  const fileRef     = useRef<HTMLInputElement>(null)
  const cameraRef   = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState(false)

  const handleFile = (file: File | null) => {
    if (!file) { setPreview(null); onChange(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    onChange(file)
  }

  return (
    <div>
      <label className="label">Meter Photo <span className="text-surface-400 font-normal text-xs">(optional)</span></label>

      {preview ? (
        <div className="relative w-full rounded-xl overflow-hidden border border-surface-200 bg-surface-50">
          <img
            src={preview}
            alt="Meter reading"
            className="w-full h-52 md:h-44 object-cover cursor-zoom-in"
            onClick={() => setLightbox(true)}
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              type="button"
              title="Zoom In"
              onClick={() => setLightbox(true)}
              className="w-8 h-8 rounded-lg bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Remove Photo"
              onClick={() => handleFile(null)}
              className="w-8 h-8 rounded-lg bg-black/50 text-white flex items-center justify-center hover:bg-red-500/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-lg">
            {value?.name}
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-surface-200 rounded-xl p-6 text-center bg-surface-50">
          <Camera className="w-8 h-8 text-surface-300 mx-auto mb-2" />
          <p className="text-sm text-surface-400 mb-4">Take a photo or upload from gallery</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {/* Camera capture (mobile) */}
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="w-full btn-secondary btn-sm"
            >
              <Camera className="w-3.5 h-3.5" /> Camera
            </button>
            {/* File upload */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-secondary btn-sm"
            >
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label="Capture meter photo using camera"
            onChange={e => handleFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload meter photo"
            onChange={e => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {/* Lightbox */}
      {lightbox && preview && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <img src={preview} alt="Meter reading" className="max-w-full max-h-full rounded-xl object-contain" />
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(false)} title="Close">
            <X className="w-8 h-8" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Record Reading Modal ──────────────────────────────────────────────────────
interface ReadingModalProps {
  open: boolean
  onClose: () => void
  meters: any[]
  /** Pre-select and lock this meter (used by Quick Reading Dashboard + barcode scan). */
  initialMeterId?: number | string
  /** Prefill "Previous" from the last known reading, instead of leaving it at 0. */
  initialPreviousReading?: number
  /** Hide the meter dropdown and show the meter as a fixed, locked value. */
  lockMeterSelect?: boolean
  /** Called after a successful save with the meter id — used to advance the queue. */
  onSaved?: (meterId: number) => void
}

export function ReadingModal({
  open, onClose, meters,
  initialMeterId, initialPreviousReading, lockMeterSelect, onSaved,
}: ReadingModalProps) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, watch } = useForm({
    defaultValues: {
      meter: initialMeterId ?? '',
      previous_reading: initialPreviousReading ?? 0,
      current_reading: 0,
      reading_date: new Date().toISOString().slice(0, 10),
      notes: '',
    },
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const prev  = watch('previous_reading') || 0
  const curr  = watch('current_reading')  || 0
  const usage = Math.max(0, Number(curr) - Number(prev))

  // Reset the form whenever the modal (re)opens — matters because this
  // component stays mounted between opens (Modal only hides its own output),
  // so stale values from the previous meter would otherwise linger.
  useEffect(() => {
    if (open) {
      reset({
        meter: initialMeterId ?? '',
        previous_reading: initialPreviousReading ?? 0,
        current_reading: 0,
        reading_date: new Date().toISOString().slice(0, 10),
        notes: '',
      })
      setPhoto(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMeterId, initialPreviousReading])

  const save = useMutation({
    mutationFn: (data: any) => {
      const fd = new FormData()
      Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, String(v)) })
      if (photo) fd.append('reading_photo', photo)
      return metersAPI.createReading(fd)
    },
    onSuccess: (_res, variables: any) => {
      qc.invalidateQueries({ queryKey: ['meter-readings'] })
      toast.success('Meter reading recorded')
      onSaved?.(Number(variables.meter))
      onClose(); reset(); setPhoto(null)
    },
  })

  const selectedMeter = meters?.find((m: any) => String(m.id) === String(initialMeterId))

  return (
    <Modal open={open} onClose={onClose} title="Record Meter Reading" size="lg">
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left */}
          <div className="space-y-4">
            <div>
              <label className="label">Meter *</label>
              {lockMeterSelect ? (
                <>
                  <div className="input flex items-center justify-between gap-2 bg-surface-50 text-surface-600">
                    <span className="truncate">
                      {selectedMeter?.meter_no || '—'}
                      {selectedMeter?.allottee_name ? ` — ${selectedMeter.allottee_name}` : ''}
                    </span>
                    <Lock className="w-3.5 h-3.5 text-surface-300 shrink-0" />
                  </div>
                  {/* Kept registered so the locked value is still submitted */}
                  <select {...register('meter', { required: true })} className="hidden" defaultValue={initialMeterId}>
                    <option value={initialMeterId}>{initialMeterId}</option>
                  </select>
                </>
              ) : (
                <select {...register('meter', { required: true })} className="input">
                  <option value="">— Select meter —</option>
                  {meters?.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.meter_no} — {m.building_name}
                      {m.allottee_name ? ` (${m.allottee_name})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Previous (m³)</label>
                <input
                  {...register('previous_reading', { min: 0 })}
                  type="number" step="0.01" className="input"
                  readOnly={lockMeterSelect}
                  title={lockMeterSelect ? 'Auto-filled from the last recorded reading' : undefined}
                />
              </div>
              <div>
                <label className="label">Current (m³) *</label>
                <input
                  {...register('current_reading', { required: true, min: 0 })}
                  type="number" step="0.01" className="input" autoFocus
                />
              </div>
            </div>

            {/* Live usage display */}
            <div className={`rounded-xl px-4 py-3 flex justify-between items-center text-sm transition-colors ${
              usage > 0 ? 'bg-brand-50 border border-brand-100' : 'bg-surface-50 border border-surface-100'
            }`}>
              <span className="text-surface-500">Usage</span>
              <span className={`text-xl font-bold font-mono ${usage > 0 ? 'text-brand-700' : 'text-surface-400'}`}>
                {usage.toFixed(2)} <span className="text-sm font-normal">m³</span>
              </span>
            </div>

            <div>
              <label className="label">Reading Date *</label>
              <input {...register('reading_date', { required: true })} type="date" className="input" />
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea {...register('notes')} className="input" rows={2} placeholder="Any observations…" />
            </div>
          </div>

          {/* Right — photo */}
          <div>
            <PhotoCapture value={photo} onChange={setPhoto} />
            <p className="text-xs text-surface-400 mt-2">
              Point camera at the meter display and tap capture. Photo is stored with the reading for audit.
            </p>
          </div>
        </div>

        <div className="flex-col-reverse sm:flex-row flex gap-3 justify-end pt-2 border-t border-surface-100">
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => { onClose(); reset(); setPhoto(null) }}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Record Reading'}
          </button>
        </div>
      </form>
    </Modal>
  )
}