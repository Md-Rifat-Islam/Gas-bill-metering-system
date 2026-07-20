import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Gauge, BookOpen, Eye, X,
  Calendar, CalendarDays, Filter, LayoutGrid,
} from 'lucide-react'
import { metersAPI } from '@/api/client'
import { PageLoader, EmptyState, Pagination } from '@/components/ui'
import { ReadingModal } from '@/components/meters/ReadingModal'
import { formatDate } from '@/utils/helpers'

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
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-6 p-3 sm:p-4 bg-white rounded-2xl border border-surface-100 shadow-card">
      {/* Mode selector — horizontally scrollable on narrow screens instead of wrapping/crushing */}
      <div className="flex gap-1 bg-surface-100 rounded-xl p-1 overflow-x-auto max-w-full">
        {MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onChange({ ...value, mode: key })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
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
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={value.month}
            aria-label="Select month"
            onChange={e => onChange({ ...value, month: Number(e.target.value) })}
            className="input !py-1.5 !text-sm w-full sm:w-auto sm:max-w-[130px]"
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
            className="input !py-1.5 !text-sm w-full sm:w-auto sm:max-w-[100px]"
          >
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Custom range */}
      {value.mode === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={value.from}
            title="From Date"
            onChange={e => onChange({ ...value, from: e.target.value })}
            className="input !py-1.5 !text-sm w-full sm:w-auto sm:max-w-[150px]"
          />
          <span className="text-surface-400 text-sm hidden sm:inline">to</span>
          <input
            type="date"
            value={value.to}
            title="To Date"
            onChange={e => onChange({ ...value, to: e.target.value })}
            className="input !py-1.5 !text-sm w-full sm:w-auto sm:max-w-[150px]"
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
// NOTE: This page previously had a "Meters" tab (list + Assign Meter) that
// duplicated meter assignment against the Units page — a unit's meter
// could be set independently in two disconnected places, which caused a
// unique-constraint error when a meter was assigned to a unit that already
// had one from the other tab. Meter assignment now lives solely on the
// Units page (one meter icon per row, handles both assign and edit). This
// page is meter READING history + recording only.
export default function MetersPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  const [readingModal, setReadingModal] = useState(false)

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

  const { data: readingsData, isLoading: loadingReadings } = useQuery({
    queryKey: ['meter-readings', dateFilter, page],
    queryFn: () => metersAPI.readings(readingParams()).then(r => r.data),
  })

  // Record Reading needs a meter list to pick from — fetched here since
  // this page's own "Meters" tab (which used to provide this) is gone.
  const { data: metersData } = useQuery({
    queryKey: ['meters-all-for-reading'],
    queryFn: () => metersAPI.list({ page_size: 500 }).then(r => r.data),
  })

  const meters   = metersData?.results   ?? []
  const readings = readingsData?.results ?? []

  return (
    <div>
      <div className="page-header flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <h1 className="page-title">Meter Readings</h1>
          <p className="page-subtitle">
            Reading history — assign or edit a unit's meter from the{' '}
            <button className="underline text-brand-600 hover:text-brand-700" onClick={() => navigate('/units')}>
              Units page
            </button>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button className="btn-primary w-full sm:w-auto justify-center" onClick={() => navigate('/meters/quick-reading')}>
            <LayoutGrid className="w-4 h-4" /> Quick Reading Dashboard
          </button>
          <button className="btn-secondary w-full sm:w-auto justify-center" onClick={() => setReadingModal(true)}>
            <BookOpen className="w-4 h-4" /> Record Reading
          </button>
        </div>
      </div>

      <DateFilterBar value={dateFilter} onChange={f => { setDateFilter(f); setPage(1) }} />
      {loadingReadings ? <PageLoader /> : (
        <>
          {/* Horizontal scroll on narrow viewports — table keeps its columns
              instead of squashing them unreadably; user swipes to see more. */}
          <div className="table-wrapper overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="table min-w-[900px] sm:min-w-0">
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

      <ReadingModal open={readingModal} onClose={() => setReadingModal(false)} meters={meters} />
    </div>
  )
}