import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Plus, Gauge, Search, BookOpen, Eye, X,
  Calendar, CalendarDays, Filter, LayoutGrid,
} from 'lucide-react'
import { metersAPI, unitsAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState, Pagination } from '@/components/ui'
import { ReadingModal } from '@/components/meters/ReadingModal'
import { formatDate } from '@/utils/helpers'
import toast from 'react-hot-toast'

// ── Date range filter bar ─────────────────────────────────────────────────────
type DateMode = 'all' | 'month' | 'week' | 'custom'

interface DateFilter {
  mode: DateMode
  year: number
  month: number   // 1-12
  week: number
  from: string
  to: string
}

function getThisWeek() {
  const now  = new Date()
  const day  = now.getDay()
  const mon  = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  const sun  = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt  = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(mon), to: fmt(sun) }
}

function DateFilterBar({ value, onChange }: { value: DateFilter; onChange: (v: DateFilter) => void }) {
  const now   = new Date()
  const MODES: { key: DateMode; label: string; icon: any }[] = [
    { key: 'all',    label: 'All Time',    icon: Filter },
    { key: 'month',  label: 'By Month',    icon: Calendar },
    { key: 'week',   label: 'This Week',   icon: CalendarDays },
    { key: 'custom', label: 'Custom Range',icon: Calendar },
  ]

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-white rounded-2xl border border-surface-100 shadow-card">
      {/* Mode selector */}
      <div className="flex gap-1 bg-surface-100 rounded-xl p-1">
        {MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onChange({ ...value, mode: key })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              value.mode === key
                ? 'bg-white shadow-sm text-surface-900'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Month picker */}
      {value.mode === 'month' && (
        <div className="flex items-center gap-2">
          <select
            value={value.month}
            aria-label="Select month"
            onChange={e => onChange({ ...value, month: Number(e.target.value) })}
            className="input !py-1.5 !text-sm max-w-[130px]"
          >
            {['January','February','March','April','May','June',
              'July','August','September','October','November','December'
            ].map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={value.year}
            aria-label="Select year"
            onChange={e => onChange({ ...value, year: Number(e.target.value) })}
            className="input !py-1.5 !text-sm max-w-[100px]"
          >
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Custom range */}
      {value.mode === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.from}
            title="From Date"
            onChange={e => onChange({ ...value, from: e.target.value })}
            className="input !py-1.5 !text-sm max-w-[150px]"
          />
          <span className="text-surface-400 text-sm">to</span>
          <input
            type="date"
            value={value.to}
            title="To Date"
            onChange={e => onChange({ ...value, to: e.target.value })}
            className="input !py-1.5 !text-sm max-w-[150px]"
          />
        </div>
      )}

      {value.mode === 'week' && (
        <div className="text-sm text-surface-500 font-medium">
          {getThisWeek().from} → {getThisWeek().to}
        </div>
      )}
    </div>
  )
}

// ── Assign Meter Modal ────────────────────────────────────────────────────────
function MeterModal({ open, onClose, units }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm()
  const save = useMutation({
    mutationFn: (data: any) => metersAPI.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meters'] }); toast.success('Meter assigned'); onClose(); reset() },
  })
  return (
    <Modal open={open} onClose={onClose} title="Assign Meter to Unit" size="sm">
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div>
          <label className="label">Unit *</label>
          <select {...register('unit_id', { required: true })} className="input">
            <option value="">— Select unit —</option>
            {units?.map((u: any) => (
              <option key={u.id} value={u.id}>
                {u.building_name} › F{u.floor_no}-{u.unit_no}
                {u.allottee?.name ? ` (${u.allottee.name})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Meter No. *</label>
          <input {...register('meter_no', { required: true })} className="input" placeholder="MTR-00001" />
        </div>
        <div>
          <label className="label">Barcode / QR <span className="text-surface-400 font-normal text-xs">(optional)</span></label>
          <input {...register('barcode')} className="input" placeholder="Scan or type barcode payload" />
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

// ── Photo thumbnail in table ──────────────────────────────────────────────────
function PhotoThumb({ url }: { url: string | null }) {
  const [show, setShow] = useState(false)
  if (!url) return <span className="text-surface-300 text-xs">—</span>
  return (
    <>
      <button onClick={() => setShow(true)} className="group relative">
        <img src={url} alt="meter" className="w-10 h-10 rounded-lg object-cover border border-surface-200 group-hover:ring-2 ring-brand-400 transition-all" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg flex items-center justify-center transition-all">
          <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
      {show && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <img src={url} alt="Meter reading" className="max-w-full max-h-full rounded-xl object-contain" />
          <button className="absolute top-4 right-4 text-white" onClick={() => setShow(false)} title="Close">
            <X className="w-8 h-8" />
          </button>
        </div>
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MetersPage() {
  const navigate = useNavigate()
  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(1)
  const [meterModal,  setMeterModal]  = useState(false)
  const [readingModal,setReadingModal]= useState(false)
  const [tab,         setTab]         = useState<'meters' | 'readings'>('meters')

  const now = new Date()
  const [dateFilter, setDateFilter] = useState<DateFilter>({
    mode:  'month',
    year:  now.getFullYear(),
    month: now.getMonth() + 1,
    week:  0,
    from:  '',
    to:    '',
  })

  // Build query params from date filter
  const readingParams = (): Record<string, string | number> => {
    const p: Record<string, string | number> = { page }
    switch (dateFilter.mode) {
      case 'month':
        p.month = dateFilter.month
        p.year  = dateFilter.year
        break
      case 'week': {
        const w = getThisWeek()
        p.date_from = w.from
        p.date_to   = w.to
        break
      }
      case 'custom':
        if (dateFilter.from) p.date_from = dateFilter.from
        if (dateFilter.to)   p.date_to   = dateFilter.to
        break
    }
    return p
  }

  const { data: metersData, isLoading: loadingMeters } = useQuery({
    queryKey: ['meters', search, page],
    queryFn: () => metersAPI.list({ search, page }).then(r => r.data),
    enabled: tab === 'meters',
  })
  const { data: readingsData, isLoading: loadingReadings } = useQuery({
    queryKey: ['meter-readings', dateFilter, page],
    queryFn: () => metersAPI.readings(readingParams()).then(r => r.data),
    enabled: tab === 'readings',
  })
  const { data: units } = useQuery({
    queryKey: ['units-all'],
    queryFn: () => unitsAPI.list({ status: 'Active', page_size: 500 }).then(r => {
      const raw = r.data; return Array.isArray(raw) ? raw : (raw.results ?? [])
    }),
  })

  const meters   = metersData?.results   ?? []
  const readings = readingsData?.results ?? []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Meters</h1>
          <p className="page-subtitle">Meter assignments and readings</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-primary" onClick={() => navigate('/meters/quick-reading')}>
            <LayoutGrid className="w-4 h-4" /> Quick Reading Dashboard
          </button>
          <button className="btn-secondary" onClick={() => setReadingModal(true)}>
            <BookOpen className="w-4 h-4" /> Record Reading
          </button>
          <button className="btn-secondary" onClick={() => setMeterModal(true)}>
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
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              tab === t ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            {t === 'meters' ? 'Meters' : 'Readings'}
          </button>
        ))}
      </div>

      {/* ── Meters tab ── */}
      {tab === 'meters' && (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input className="input pl-9" placeholder="Search meter no., barcode, unit, allottee…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          {loadingMeters ? <PageLoader /> : (
            <>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Meter No.</th>
                      <th>Barcode</th>
                      <th>Type</th>
                      <th>Unit</th>
                      <th>Floor</th>
                      <th>Building</th>
                      <th>Allottee</th>
                      <th>Assigned On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meters.length === 0 ? (
                      <tr><td colSpan={8}><EmptyState icon={Gauge} title="No meters assigned" /></td></tr>
                    ) : meters.map((m: any) => (
                      <tr key={m.id}>
                        <td><span className="font-mono font-semibold text-brand-700">{m.meter_no}</span></td>
                        <td className="font-mono text-xs text-surface-500">{m.barcode || '—'}</td>
                        <td className="text-surface-500 text-sm">{m.meter_type}</td>
                        <td className="font-medium">{m.unit_no}</td>
                        <td className="text-center text-surface-500">{m.floor_no}</td>
                        <td className="text-surface-500">{m.building_name}</td>
                        <td className="text-surface-600">{m.allottee_name || '—'}</td>
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

      {/* ── Readings tab ── */}
      {tab === 'readings' && (
        <>
          <DateFilterBar value={dateFilter} onChange={f => { setDateFilter(f); setPage(1) }} />
          {loadingReadings ? <PageLoader /> : (
            <>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Photo</th>
                      <th>Date</th>
                      <th>Meter No.</th>
                      <th>Unit / Allottee</th>
                      <th>Building</th>
                      <th className="text-right">Previous</th>
                      <th className="text-right">Current</th>
                      <th className="text-right">Usage (m³)</th>
                      <th>Recorded By</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.length === 0 ? (
                      <tr><td colSpan={10}>
                        <EmptyState
                          icon={BookOpen}
                          title="No readings found"
                          description="No readings match the selected date range"
                        />
                      </td></tr>
                    ) : readings.map((r: any) => (
                      <tr key={r.id}>
                        <td><PhotoThumb url={r.reading_photo_url} /></td>
                        <td className="text-surface-600 text-sm font-medium">{formatDate(r.reading_date)}</td>
                        <td><span className="font-mono text-xs font-semibold">{r.meter_no}</span></td>
                        <td>
                          <div className="font-medium text-surface-800">{r.unit_no}</div>
                          <div className="text-xs text-surface-400">{r.allottee_name || '—'}</div>
                        </td>
                        <td className="text-surface-500 text-sm">{r.building_name}</td>
                        <td className="font-mono text-right text-surface-500">{r.previous_reading}</td>
                        <td className="font-mono text-right text-surface-700">{r.current_reading}</td>
                        <td className="text-right">
                          <span className="font-mono font-bold text-brand-600">{r.usage}</span>
                        </td>
                        <td className="text-surface-500 text-sm">{r.recorded_by_name || '—'}</td>
                        <td className="text-surface-400 text-sm max-w-xs truncate">{r.notes || '—'}</td>
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

      <MeterModal  open={meterModal}   onClose={() => setMeterModal(false)}   units={units} />
      <ReadingModal open={readingModal} onClose={() => setReadingModal(false)} meters={meters} />
    </div>
  )
}