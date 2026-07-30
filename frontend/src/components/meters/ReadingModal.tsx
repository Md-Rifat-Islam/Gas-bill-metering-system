import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Camera, X, Upload, ZoomIn, Lock } from 'lucide-react'
import { metersAPI } from '@/api/client'
import { Modal } from '@/components/ui'
import toast from 'react-hot-toast'

// ── Photo capture component ───────────────────────────────────────────────────
export function PhotoCapture({ value, onChange, error }: {
  value: File | null
  onChange: (file: File | null) => void
  /** Show the required-field error state (red border + message) — true when
   *  the form was submitted with no photo attached. */
  error?: boolean
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
      <label className="label">
        Meter Photo <span className="text-danger-500">*</span>
      </label>

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
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center bg-surface-50 ${
            error ? 'border-danger-300' : 'border-surface-200'
          }`}
        >
          <Camera className={`w-8 h-8 mx-auto mb-2 ${error ? 'text-danger-400' : 'text-surface-300'}`} />
          <p className={`text-sm mb-4 ${error ? 'text-danger-500' : 'text-surface-400'}`}>
            Take a photo or upload from gallery
          </p>
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
          {error && (
            <p className="text-xs text-danger-500 mt-3">A meter photo is required before saving.</p>
          )}
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
  /**
   * Projects list, used to drive the Project -> Building -> Meter cascade
   * shown when `lockMeterSelect` is false (the regular Meters page's Record
   * Reading flow). Not needed / ignored when locked (Quick Reading already
   * hands over a single specific meter).
   */
  projects?: any[]
  /** Buildings list (each expected to carry `project_id`) for the same cascade. */
  buildings?: any[]
}

export function ReadingModal({
  open, onClose, meters,
  initialMeterId, initialPreviousReading, lockMeterSelect, onSaved,
  projects, buildings,
}: ReadingModalProps) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      meter: initialMeterId ?? '',
      previous_reading: initialPreviousReading ?? 0,
      current_reading: 0,
      reading_date: new Date().toISOString().slice(0, 10),
      notes: '',
    },
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState(false)
  // True once a selected meter/unit resolves to an actual recorded previous
  // reading — locks the Previous field so it can't be hand-edited. Stays
  // false for a meter/unit with no reading history yet, so the first-ever
  // reading can still be entered manually.
  const [previousReadingLocked, setPreviousReadingLocked] = useState(false)
  const prev  = watch('previous_reading') || 0
  const curr  = watch('current_reading')  || 0
  const usage = Math.max(0, Number(curr) - Number(prev))

  // Project -> Building -> Unit/Meter cascade, only relevant when the meter
  // select isn't locked. With hundreds/thousands of meters, a single flat
  // <select> was unusable — narrow it down the same way the Units page
  // narrows Building by Project first.
  //
  // Unit and Meter are 1:1 (a Meter has at most one Unit, per the
  // OneToOneField constraint elsewhere in this app), so instead of two
  // separate selectors that both have to be kept in sync, there's a single
  // combined "Unit / Meter" dropdown — picking one row resolves both.
  const [projectId, setProjectId]   = useState('')
  const [buildingId, setBuildingId] = useState('')

  const filteredBuildings = (buildings ?? []).filter(
    (b: any) => !projectId || String(b.project_id) === String(projectId)
  )

  // Meters for the combined Unit/Meter dropdown, scoped to the selected
  // building. Previously this filtered the flat `meters` prop (sourced from
  // metersAPI.list()) client-side by `building_id` — but that endpoint
  // doesn't serialize building_id/unit_id/unit_no/previous_reading per
  // meter, so every meter silently vanished the moment a building was
  // picked (same write_only-field pattern seen on UnitSerializer /
  // PaymentSerializer). quickDashboard() was built specifically to expose
  // those joined fields, so fetch straight from it once a building is
  // chosen instead of relying on the `meters` prop for the unlocked flow.
  const { data: buildingMetersData, isFetching: loadingBuildingMeters } = useQuery({
    queryKey: ['meters-quick-dashboard-for-reading', buildingId],
    queryFn: () => metersAPI.quickDashboard({ building_id: buildingId }).then(r => r.data),
    enabled: !lockMeterSelect && !!buildingId,
  })
  // NOTE: adjust `.results` below to match the actual response shape —
  // some endpoints in this app paginate (`{ results: [...] }`), others
  // return a plain array. Check the Network tab response for
  // /meters/quick-dashboard/?building_id=... to confirm.
  const filteredMeters: any[] = buildingMetersData?.results ?? buildingMetersData ?? []

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
      setPhotoError(false)
      setPreviousReadingLocked(!!lockMeterSelect)
      if (!lockMeterSelect) {
        setProjectId('')
        setBuildingId('')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMeterId, initialPreviousReading])

  const handleProjectChange = (value: string) => {
    setProjectId(value)
    setBuildingId('')
    setValue('meter', '')
    setValue('previous_reading', 0)
    setPreviousReadingLocked(false)
  }

  const handleBuildingChange = (value: string) => {
    setBuildingId(value)
    setValue('meter', '')
    setValue('previous_reading', 0)
    setPreviousReadingLocked(false)
  }

  // When a specific meter (i.e. a specific unit) is picked from the combined
  // dropdown, auto-fill Previous from that meter's last known reading
  // instead of leaving it at 0 / whatever the last selection left behind.
  // If the meter genuinely has no reading history yet (a brand-new
  // meter/unit), leave Previous editable so the first reading can be typed
  // in manually rather than locking it at a possibly-wrong 0.
  // NOTE: assumes `previous_reading` (falling back to `last_reading`) is the
  // field name on the meter object — adjust to match the actual API field.
  const handleMeterChange = (meterId: string) => {
    const m = filteredMeters.find((x: any) => String(x.id) === String(meterId))
    const rawPrev = m?.previous_reading ?? m?.last_reading
    const hasPrev = rawPrev !== undefined && rawPrev !== null
    setValue('previous_reading', Number(hasPrev ? rawPrev : 0))
    setPreviousReadingLocked(hasPrev)
  }

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
      onClose(); reset(); setPhoto(null); setPhotoError(false)
    },
  })

  const onSubmit = (d: any) => {
    if (!photo) {
      setPhotoError(true)
      toast.error('Please capture or upload a meter photo before saving')
      return
    }
    save.mutate(d)
  }

  const selectedMeter = meters?.find((m: any) => String(m.id) === String(initialMeterId))

  return (
    <Modal open={open} onClose={onClose} title="Record Meter Reading" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left */}
          <div className="space-y-4">
            {lockMeterSelect ? (
              <div>
                <label className="label">Meter *</label>
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
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="reading-project">Project</label>
                    <select
                      id="reading-project"
                      className="input"
                      value={projectId}
                      onChange={e => handleProjectChange(e.target.value)}
                    >
                      <option value="">— Select project —</option>
                      {projects?.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="reading-building">Building</label>
                    <select
                      id="reading-building"
                      className="input"
                      value={buildingId}
                      onChange={e => handleBuildingChange(e.target.value)}
                      disabled={!projectId}
                    >
                      <option value="">{projectId ? '— Select building —' : '— Select project first —'}</option>
                      {filteredBuildings.map((b: any) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Combined Unit / Meter selector — Unit and Meter are 1:1,
                    so there's no reason to make the person pick both in
                    separate dropdowns that then have to be kept in sync. */}
                <div>
                  <label className="label" htmlFor="reading-meter">Unit / Meter *</label>
                  <select
                    id="reading-meter"
                    className="input"
                    disabled={!buildingId || loadingBuildingMeters}
                    {...register('meter', {
                      required: true,
                      onChange: e => handleMeterChange(e.target.value),
                    })}
                  >
                    <option value="">
                      {!buildingId
                        ? '— Select building first —'
                        : loadingBuildingMeters
                        ? 'Loading meters…'
                        : filteredMeters.length === 0
                        ? '— No meters found for this building —'
                        : '— Select unit / meter —'}
                    </option>
                    {filteredMeters.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.unit_no ?? '—'} — {m.meter_no}
                        {m.allottee_name ? ` (${m.allottee_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Previous Reading (m³)</label>
                <input
                  {...register('previous_reading', { min: 0 })}
                  type="number" step="0.01" className="input"
                  readOnly={lockMeterSelect || previousReadingLocked}
                  title={
                    lockMeterSelect || previousReadingLocked
                      ? 'Auto-filled from the last recorded reading — cannot be edited'
                      : 'No previous reading on file for this unit/meter yet — enter the starting value'
                  }
                />
              </div>
              <div>
                <label className="label">Current Reading (m³) *</label>
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
            <PhotoCapture value={photo} onChange={setPhoto} error={photoError && !photo} />
            <p className="text-xs text-surface-400 mt-2">
              Point camera at the meter display and tap capture. Photo is stored with the reading for audit.
            </p>
          </div>
        </div>

        <div className="flex-col-reverse sm:flex-row flex gap-3 justify-end pt-2 border-t border-surface-100">
          <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => { onClose(); reset(); setPhoto(null); setPhotoError(false) }}>
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