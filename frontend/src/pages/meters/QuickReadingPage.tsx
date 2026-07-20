import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ScanLine, Filter as FilterIcon, ArrowLeft, ArrowRight, Gauge } from 'lucide-react'
import { projectsAPI, buildingsAPI, metersAPI } from '@/api/client'
import { PageLoader, EmptyState, AccessDenied } from '@/components/ui'
import { SearchInput } from '@/components/forms'
import { MeterCard } from '@/components/meters/MeterCard'
import { ReadingModal } from '@/components/meters/ReadingModal'
import { BarcodeScanner } from '@/components/meters/BarcodeScanner'
import { usePermissions } from '@/hooks/usePermissions'
import type { MeterCardData, Project, Building } from '@/types'
import toast from 'react-hot-toast'

const STATUS_FILTERS = ['All', 'Pending', 'Completed', 'Problem', 'Inactive'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

export default function QuickReadingPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()

  const [projectId,  setProjectId]  = useState<string>('')
  const [buildingId, setBuildingId] = useState<string>('')
  const [search,     setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Pending')
  const [sortBy, setSortBy] = useState<'unit' | 'status'>('unit')

  const [activeCard, setActiveCard] = useState<MeterCardData | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [focusedId, setFocusedId] = useState<number | null>(null)

  const { data: projects } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => projectsAPI.list({ page_size: 500 }).then(r => {
      const raw = r.data; return Array.isArray(raw) ? raw : (raw.results ?? [])
    }),
    enabled: can.recordReading,
  })

  const { data: allBuildings } = useQuery({
    queryKey: ['buildings-all'],
    queryFn: () => buildingsAPI.list({ page_size: 500 }).then(r => {
      const raw = r.data; return Array.isArray(raw) ? raw : (raw.results ?? [])
    }),
    enabled: can.recordReading,
  })

  const buildings = useMemo(
    () => (allBuildings ?? []).filter((b: Building) => !projectId || String(b.project_id) === projectId),
    [allBuildings, projectId]
  )

  // Reset building when project changes
  useEffect(() => { setBuildingId('') }, [projectId])

  const dashboardQueryKey = ['meters-quick-dashboard', projectId, buildingId]

  const { data: cardsData, isLoading } = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: () => metersAPI.quickDashboard({
      project_id: projectId || undefined,
      building_id: buildingId || undefined,
    }).then(r => r.data),
    enabled: Boolean(buildingId) && can.recordReading,
  })

  const allCards: MeterCardData[] = cardsData?.results ?? []

  const filteredCards = useMemo(() => {
    let list = allCards
    if (statusFilter !== 'All') {
      list = list.filter(c => c.reading_status === statusFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.meter_no.toLowerCase().includes(q) ||
        c.unit_no.toLowerCase().includes(q) ||
        (c.allottee_name || '').toLowerCase().includes(q) ||
        (c.allottee_mobile || '').toLowerCase().includes(q)
      )
    }
    const sorted = [...list]
    if (sortBy === 'unit') {
      sorted.sort((a, b) => a.floor_no - b.floor_no || a.unit_no.localeCompare(b.unit_no))
    } else {
      sorted.sort((a, b) => a.reading_status.localeCompare(b.reading_status))
    }
    return sorted
  }, [allCards, statusFilter, search, sortBy])

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: allCards.length, Pending: 0, Completed: 0, Problem: 0, Inactive: 0 }
    allCards.forEach(card => { c[card.reading_status] = (c[card.reading_status] || 0) + 1 })
    return c
  }, [allCards])

  const pendingQueue = useMemo(
    () => filteredCards.filter(c => c.reading_status === 'Pending' || c.reading_status === 'Problem'),
    [filteredCards]
  )

  const patchCard = useCallback((meterId: number, patch: Partial<MeterCardData>) => {
    qc.setQueryData(dashboardQueryKey, (old: any) => {
      if (!old) return old
      return {
        ...old,
        results: old.results.map((c: MeterCardData) => c.id === meterId ? { ...c, ...patch } : c),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, projectId, buildingId])

  const handleSaved = useCallback((meterId: number) => {
    // Optimistic local patch so the card flips to Completed instantly,
    // then a background refetch reconciles with the server.
    patchCard(meterId, { reading_status: 'Completed' })
    qc.invalidateQueries({ queryKey: dashboardQueryKey })
    qc.invalidateQueries({ queryKey: ['meter-readings'] })

    const remaining = pendingQueue.filter(c => c.id !== meterId)
    if (remaining.length > 0) {
      setActiveCard(remaining[0])
      setFocusedId(remaining[0].id)
    } else {
      setActiveCard(null)
      toast.success('All pending readings in this view are complete 🎉')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patchCard, pendingQueue, qc, projectId, buildingId])

  const handleBarcodeDetected = async (code: string) => {
    setScannerOpen(false)
    try {
      const { data } = await metersAPI.lookupBarcode(code)
      if (data.warnings?.length) {
        data.warnings.forEach((w: string) => toast(w, { icon: '⚠️' }))
      }
      setActiveCard(data)
      setFocusedId(data.id)
    } catch {
      // errors are surfaced via the global axios interceptor toast
    }
  }

  const goToIndex = (delta: number) => {
    if (pendingQueue.length === 0) return
    const currentIdx = pendingQueue.findIndex(c => c.id === focusedId)
    const nextIdx = ((currentIdx === -1 ? 0 : currentIdx) + delta + pendingQueue.length) % pendingQueue.length
    setFocusedId(pendingQueue[nextIdx].id)
  }

  // Guard placed after all hooks (Rules of Hooks) — previously this page had
  // no permission check at all, relying only on the sidebar hiding the link
  // (which a direct URL visit bypasses entirely).
  if (!can.recordReading) return <AccessDenied />

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Quick Reading Dashboard</h1>
          <p className="page-subtitle">Select a project and building to load meters for reading</p>
        </div>
        <button className="btn-primary w-full md:w-auto flex items-center justify-center gap-2" onClick={() => setScannerOpen(true)}>
          <ScanLine className="w-4 h-4" /> Scan Barcode
        </button>
      </div>

      {/* Project / Building selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6 p-4 bg-white rounded-2xl border border-surface-100 shadow-card">
        <div className="w-full">
          <label className="label" htmlFor="project-select">Project</label>
          <select id="project-select" className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">— Select project —</option>
            {(projects ?? []).map((p: Project) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="w-full">
          <label className="label" htmlFor="building-select">Building</label>
          <select
            id="building-select"
            className="input"
            value={buildingId}
            onChange={e => setBuildingId(e.target.value)}
            disabled={!projectId}
          >
            <option value="">— Select building —</option>
            {buildings.map((b: Building) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="w-full">
          <label className="label">Search</label>
          <SearchInput value={search} onChange={setSearch} placeholder="Meter, unit, customer, mobile…" />
        </div>
        <div className="w-full">
          <label htmlFor="sort-select" className="label">Sort</label>
          <select id="sort-select" className="input" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
            <option value="unit">Floor / Unit</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {!buildingId ? (
        <EmptyState
          icon={Gauge}
          title="Select a project and building"
          description="Meters for the selected building will appear here as cards"
        />
      ) : isLoading ? (
        <PageLoader />
      ) : (
        <>
          {/* Status legend / filter chips */}
          <div className="flex flex-col gap-4 mb-5 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-2 md:flex-wrap md:overflow-visible">
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  statusFilter === s
                    ? 'bg-surface-900 text-white border-surface-900'
                    : 'bg-white text-surface-500 border-surface-200 hover:border-surface-300'
                }`}
              >
                {s} ({counts[s] ?? 0})
              </button>
            ))}
            </div>

            <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
              <button className="btn-secondary btn-sm" onClick={() => goToIndex(-1)} title="Previous pending meter">
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-surface-400">
                {pendingQueue.length} pending in view
              </span>
              <button className="btn-secondary btn-sm" onClick={() => goToIndex(1)} title="Next pending meter">
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {filteredCards.length === 0 ? (
            <EmptyState icon={FilterIcon} title="No meters match this filter" />
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {filteredCards.map(card => (
                <MeterCard
                  key={card.id}
                  data={card}
                  focused={focusedId === card.id}
                  onOpen={(c) => { setActiveCard(c); setFocusedId(c.id) }}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ReadingModal
        open={Boolean(activeCard)}
        onClose={() => setActiveCard(null)}
        meters={activeCard ? [{
          id: activeCard.id,
          meter_no: activeCard.meter_no,
          building_name: activeCard.building_name,
          allottee_name: activeCard.allottee_name,
        }] : []}
        initialMeterId={activeCard?.id}
        initialPreviousReading={activeCard ? Number(activeCard.previous_reading) : 0}
        lockMeterSelect
        onSaved={handleSaved}
      />

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />
    </div>
  )
}