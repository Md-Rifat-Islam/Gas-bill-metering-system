import { useQuery } from '@tanstack/react-query'
import { Search, ShieldCheck, Building2 } from 'lucide-react'
import { portalAPI } from '@/api/portalClient'
import { PageLoader, StatusBadge, EmptyState, Pagination } from '@/components/ui'
import { formatCurrency } from '@/utils/helpers'
import { useDebounce, usePersistedState } from '@/hooks'

interface ManagedProject {
  id: number
  name: string
  manager_unit_no: string
  manager_unit_building: string
}

type BillStatus = 'Paid' | 'Partial' | 'Unpaid'
const STATUS_CHIPS: { value: BillStatus; label: string; countKey: string; active: string }[] = [
  { value: 'Paid',    label: 'Paid',    countKey: 'paid_count',    active: 'bg-success-500 text-white border-success-500' },
  { value: 'Partial', label: 'Partial', countKey: 'partial_count', active: 'bg-warning-500 text-white border-warning-500' },
  { value: 'Unpaid',  label: 'Unpaid',  countKey: 'unpaid_count',  active: 'bg-danger-500 text-white border-danger-500' },
]

function ProgressBar({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent))
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-100 overflow-hidden">
      <div className="h-full rounded-full bg-success-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function PortalProjectPage() {
  // Filters are remembered for the session so they survive opening a bill
  // elsewhere in the portal and coming back.
  const [projectId, setProjectId] = usePersistedState<string>('portal-project:project', '')
  const [month, setMonth] = usePersistedState<string>('portal-project:month', '')
  const [status, setStatus] = usePersistedState<string>('portal-project:status', '')
  const [buildingId, setBuildingId] = usePersistedState<string>('portal-project:building', '')
  const [search, setSearch] = usePersistedState<string>('portal-project:search', '')
  const [page, setPage] = usePersistedState<number>('portal-project:page', 1)
  const debouncedSearch = useDebounce(search)

  // Same key as PortalLayout's check, so this is one shared request.
  const { data: access, isLoading: accessLoading } = useQuery({
    queryKey: ['portal-manager-access'],
    queryFn: () => portalAPI.managerAccess().then(r => r.data),
    staleTime: 5 * 60_000,
  })

  const projects: ManagedProject[] = access?.projects ?? []
  // A remembered project that this account no longer manages falls back to the first.
  const project = projects.find(p => String(p.id) === projectId) ?? projects[0]
  const activeProjectId = project?.id

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['portal-manager-overview', activeProjectId, month],
    queryFn: () =>
      portalAPI.managerOverview({ project: activeProjectId, month: month || undefined }).then(r => r.data),
    enabled: !!activeProjectId,
    placeholderData: (prev: any) => prev,
  })

  const selectedMonth: string = overview?.month ?? ''

  const { data: billsData, isLoading: billsLoading } = useQuery({
    queryKey: ['portal-manager-bills', activeProjectId, selectedMonth, status, buildingId, debouncedSearch, page],
    queryFn: () =>
      portalAPI.managerBills({
        project: activeProjectId,
        month: selectedMonth,
        status: status || undefined,
        building: buildingId || undefined,
        search: debouncedSearch || undefined,
        page,
      }).then(r => r.data),
    enabled: !!activeProjectId && !!selectedMonth,
    placeholderData: (prev: any) => prev,
  })

  if (accessLoading) return <PageLoader />

  if (!access?.is_manager) {
    return (
      <div className="card text-center py-10">
        <ShieldCheck className="w-8 h-8 text-surface-300 mx-auto mb-3" />
        <div className="text-sm font-semibold text-surface-700">Not available</div>
        <div className="text-xs text-surface-400 mt-1">
          This section is only for a project's manager unit.
        </div>
      </div>
    )
  }

  const summary = overview?.summary
  const byBuilding: any[] = overview?.by_building ?? []
  const months: { value: string; label: string }[] = overview?.months ?? []
  const bills: any[] = billsData?.results ?? []
  const notBilled = summary ? Math.max(0, summary.active_units - summary.billed_units) : 0

  const changeProject = (value: string) => {
    setProjectId(value); setMonth(''); setStatus(''); setBuildingId(''); setSearch(''); setPage(1)
  }
  const changeMonth = (value: string) => { setMonth(value); setPage(1) }
  const toggleStatus = (value: string) => { setStatus(status === value ? '' : value); setPage(1) }
  const changeBuilding = (value: string) => { setBuildingId(value); setPage(1) }
  const changeSearch = (value: string) => { setSearch(value); setPage(1) }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-surface-900">{project?.name}</h1>
          <p className="text-sm text-surface-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Bill status for the whole project · managed from unit {project?.manager_unit_no}
          </p>
        </div>
        <div className="flex gap-2">
          {projects.length > 1 && (
            <select
              className="input !w-auto"
              value={project?.id ?? ''}
              onChange={e => changeProject(e.target.value)}
              aria-label="Project"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {months.length > 0 && (
            <select
              className="input !w-auto"
              value={selectedMonth}
              onChange={e => changeMonth(e.target.value)}
              aria-label="Billing month"
            >
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {overviewLoading && !overview ? <PageLoader /> : !selectedMonth ? (
        <EmptyState icon={Building2} title="No bills yet" description="Bills for this project will appear here once they are created" />
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card">
              <div className="text-xs text-surface-400">Total Billed</div>
              <div className="text-lg font-bold text-surface-900 mt-0.5">{formatCurrency(summary?.total_billed ?? 0)}</div>
            </div>
            <div className="card">
              <div className="text-xs text-surface-400">Collected</div>
              <div className="text-lg font-bold text-success-600 mt-0.5">{formatCurrency(summary?.total_paid ?? 0)}</div>
            </div>
            <div className="card">
              <div className="text-xs text-surface-400">Due</div>
              <div className="text-lg font-bold text-danger-600 mt-0.5">{formatCurrency(summary?.total_due ?? 0)}</div>
            </div>
            <div className="card">
              <div className="text-xs text-surface-400">Collection Rate</div>
              <div className="text-lg font-bold text-surface-900 mt-0.5">{summary?.collection_rate ?? 0}%</div>
              <div className="mt-2"><ProgressBar percent={summary?.collection_rate ?? 0} /></div>
            </div>
          </div>

          {/* Status chips — also act as the status filter for the list below */}
          <div>
            <div className="flex flex-wrap gap-2">
              {STATUS_CHIPS.map(chip => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => toggleStatus(chip.value)}
                  aria-pressed={status === chip.value}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    status === chip.value
                      ? chip.active
                      : 'bg-white text-surface-600 border-surface-200 hover:border-surface-300'
                  }`}
                >
                  {chip.label} ({summary?.[chip.countKey] ?? 0})
                </button>
              ))}
            </div>
            {notBilled > 0 && (
              <p className="text-xs text-surface-400 mt-2">
                {notBilled} active unit{notBilled === 1 ? '' : 's'} not billed for this month.
              </p>
            )}
          </div>

          {/* By building */}
          {byBuilding.length > 0 && (
            <div className="card !p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-100 text-sm font-semibold text-surface-800">By building</div>
              <div className="divide-y divide-surface-50">
                {byBuilding.map(b => {
                  const rate = b.total_billed > 0 ? (b.total_paid / b.total_billed) * 100 : 0
                  return (
                    <div key={b.building_id} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 items-center">
                      <div>
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="text-sm font-medium text-surface-800">{b.building_name}</div>
                          <div className="text-xs text-surface-400 shrink-0">
                            {b.paid_count} paid · {b.partial_count} partial · {b.unpaid_count} unpaid
                          </div>
                        </div>
                        <div className="mt-1.5"><ProgressBar percent={rate} /></div>
                      </div>
                      <div className="text-xs text-surface-500 sm:text-right">
                        Due <span className="font-mono font-semibold text-danger-600">{formatCurrency(b.total_due)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bills list */}
          <div>
            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  className="input pl-9 w-full"
                  placeholder="Search unit or bill no.…"
                  value={search}
                  onChange={e => changeSearch(e.target.value)}
                  aria-label="Search units or bills"
                />
              </div>
              <select
                className="input sm:!w-auto"
                value={buildingId}
                onChange={e => changeBuilding(e.target.value)}
                aria-label="Filter by building"
              >
                <option value="">All Buildings</option>
                {byBuilding.map(b => <option key={b.building_id} value={b.building_id}>{b.building_name}</option>)}
              </select>
            </div>

            {billsLoading && !billsData ? <PageLoader /> : bills.length === 0 ? (
              <EmptyState icon={Building2} title="No bills match" description="Try a different status, building or search" />
            ) : (
              <>
                {/* Wide screens: table */}
                <div className="hidden md:block table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Building</th>
                        <th>Bill No.</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Due</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map(b => (
                        <tr key={b.id}>
                          <td className="font-medium text-surface-800">Floor {b.floor_no} — {b.unit_no}</td>
                          <td className="text-surface-600 text-sm">{b.building_name}</td>
                          <td><span className="font-mono text-xs text-surface-500">{b.bill_number}</span></td>
                          <td className="font-mono">{formatCurrency(b.total_amount)}</td>
                          <td className="font-mono text-success-600">{formatCurrency(b.paid_amount)}</td>
                          <td className="font-mono text-danger-600 font-semibold">{formatCurrency(b.due_amount)}</td>
                          <td><StatusBadge status={b.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Phones: cards */}
                <div className="md:hidden space-y-2">
                  {bills.map(b => (
                    <div key={b.id} className="card !py-3 !px-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-surface-800">Floor {b.floor_no} — {b.unit_no}</div>
                          <div className="text-xs text-surface-400">{b.building_name}</div>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-surface-500">
                        <span>Total <span className="font-mono text-surface-700">{formatCurrency(b.total_amount)}</span></span>
                        <span>Due <span className="font-mono font-semibold text-danger-600">{formatCurrency(b.due_amount)}</span></span>
                      </div>
                    </div>
                  ))}
                </div>

                <Pagination page={page} count={billsData?.count || 0} onChange={setPage} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}