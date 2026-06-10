import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Gauge, Search, BookOpen } from 'lucide-react'
import { metersAPI, unitsAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState, Pagination } from '@/components/ui'
import { formatDate } from '@/utils/helpers'
import toast from 'react-hot-toast'

function MeterModal({ open, onClose, units }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm()
  const save = useMutation({
    mutationFn: (data: any) => metersAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meters'] })
      toast.success('Meter assigned')
      onClose(); reset()
    },
  })
  return (
    <Modal open={open} onClose={onClose} title="Assign Meter" size="sm">
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div>
          <label className="label">Unit *</label>
          <select {...register('unit_id', { required: true })} className="input">
            <option value="">— Select unit —</option>
            {units?.map((u: any) => (
              <option key={u.id} value={u.id}>
                {u.building_name} › F{u.floor_no}-{u.unit_no} {u.allottee?.name ? `(${u.allottee.name})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Meter No. *</label>
          <input {...register('meter_no', { required: true })} className="input" placeholder="MTR-00001" />
        </div>
        <div>
          <label className="label">Meter Type</label>
          <input {...register('meter_type')} className="input" placeholder="Standard" defaultValue="Standard" />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Assign Meter'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ReadingModal({ open, onClose, meters }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, watch } = useForm({
    defaultValues: { previous_reading: 0, current_reading: 0, reading_date: new Date().toISOString().slice(0, 10) }
  })
  const prev = watch('previous_reading') || 0
  const curr = watch('current_reading') || 0
  const usage = Math.max(0, Number(curr) - Number(prev))

  const save = useMutation({
    mutationFn: (data: any) => metersAPI.createReading(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meter-readings'] })
      toast.success('Reading recorded')
      onClose(); reset()
    },
  })
  return (
    <Modal open={open} onClose={onClose} title="Record Meter Reading" size="sm">
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div>
          <label className="label">Meter *</label>
          <select {...register('meter', { required: true })} className="input">
            <option value="">— Select meter —</option>
            {meters?.map((m: any) => (
              <option key={m.id} value={m.id}>{m.meter_no} — {m.building_name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Previous Reading</label>
            <input {...register('previous_reading', { min: 0 })} type="number" step="0.01" className="input" />
          </div>
          <div>
            <label className="label">Current Reading *</label>
            <input {...register('current_reading', { required: true, min: 0 })} type="number" step="0.01" className="input" />
          </div>
        </div>
        {usage > 0 && (
          <div className="bg-brand-50 rounded-xl px-4 py-2.5 text-sm flex justify-between">
            <span className="text-surface-500">Usage</span>
            <span className="font-bold text-brand-700">{usage.toFixed(2)} m³</span>
          </div>
        )}
        <div>
          <label className="label">Reading Date</label>
          <input {...register('reading_date', { required: true })} type="date" className="input" />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea {...register('notes')} className="input" rows={2} />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Record Reading'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function MetersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [meterModal, setMeterModal] = useState(false)
  const [readingModal, setReadingModal] = useState(false)
  const [tab, setTab] = useState<'meters' | 'readings'>('meters')

  const { data: metersData, isLoading: loadingMeters } = useQuery({
    queryKey: ['meters', search, page],
    queryFn: () => metersAPI.list({ search, page }).then(r => r.data),
    enabled: tab === 'meters',
  })
  const { data: readingsData, isLoading: loadingReadings } = useQuery({
    queryKey: ['meter-readings', page],
    queryFn: () => metersAPI.readings({ page }).then(r => r.data),
    enabled: tab === 'readings',
  })
  const { data: units } = useQuery({
    queryKey: ['units-all'],
    queryFn: () => unitsAPI.list({ status: 'Active', page_size: 500 }).then(r => r.data.results || r.data),
  })

  const meters = metersData?.results || []
  const readings = readingsData?.results || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Meters</h1>
          <p className="page-subtitle">Manage meter assignments and readings</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => setReadingModal(true)}>
            <BookOpen className="w-4 h-4" /> Record Reading
          </button>
          <button className="btn-primary" onClick={() => setMeterModal(true)}>
            <Plus className="w-4 h-4" /> Assign Meter
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-100 rounded-xl p-1 w-fit mb-6">
        {(['meters', 'readings'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              tab === t ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'meters' && (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input className="input pl-9" placeholder="Search meter no…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          {loadingMeters ? <PageLoader /> : (
            <>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Meter No.</th>
                      <th>Type</th>
                      <th>Unit</th>
                      <th>Building</th>
                      <th>Assigned On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meters.length === 0 ? (
                      <tr><td colSpan={5}><EmptyState icon={Gauge} title="No meters assigned" /></td></tr>
                    ) : meters.map((m: any) => (
                      <tr key={m.id}>
                        <td><span className="font-mono font-semibold text-brand-700">{m.meter_no}</span></td>
                        <td className="text-surface-500">{m.meter_type}</td>
                        <td className="font-medium">{m.unit_no}</td>
                        <td className="text-surface-500">{m.building_name}</td>
                        <td className="text-surface-400 text-sm">{formatDate(m.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} count={metersData?.count || 0} onChange={setPage} />
            </>
          )}
        </>
      )}

      {tab === 'readings' && (
        <>
          {loadingReadings ? <PageLoader /> : (
            <>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Meter No.</th>
                      <th>Previous</th>
                      <th>Current</th>
                      <th>Usage (m³)</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.length === 0 ? (
                      <tr><td colSpan={6}><EmptyState icon={BookOpen} title="No readings recorded" /></td></tr>
                    ) : readings.map((r: any) => (
                      <tr key={r.id}>
                        <td className="text-surface-600 text-sm">{formatDate(r.reading_date)}</td>
                        <td><span className="font-mono text-xs">{r.meter_no}</span></td>
                        <td className="font-mono text-right">{r.previous_reading}</td>
                        <td className="font-mono text-right">{r.current_reading}</td>
                        <td className="font-mono font-bold text-brand-600 text-right">{r.usage}</td>
                        <td className="text-surface-400 text-sm">{r.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} count={readingsData?.count || 0} onChange={setPage} />
            </>
          )}
        </>
      )}

      <MeterModal open={meterModal} onClose={() => setMeterModal(false)} units={units} />
      <ReadingModal open={readingModal} onClose={() => setReadingModal(false)} meters={meters} />
    </div>
  )
}
