import { useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, BarChart,
} from 'recharts'
import {
  FileText, TrendingUp, AlertCircle, Gauge, Download, Search,
} from 'lucide-react'
import { projectsAPI, reportsAPI } from '@/api/client'
import { insightsAPI } from '@/api/insightsClient'
import { PageLoader, StatusBadge, Pagination, EmptyState } from '@/components/ui'
import { formatCurrency, formatMonth } from '@/utils/helpers'
import {
  CHART, tooltipStyle, formatTaka, compactTaka, pct, shortMonth, rateTone,
  SectionCard, LockedCard, Segmented, MetricCard, ProgressRow,
} from '@/components/dashboard/widgets'

const COLORS = ['#0062f5', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
const AGING_COLORS = [CHART.muted, CHART.warning, CHART.danger, '#b91c1c']
const PAGE_SIZE = 20

function ageInMonths(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()))
}

function ageBadge(months: number) {
  if (months <= 1) return 'badge-gray'
  if (months === 2) return 'badge-yellow'
  return 'badge-red'
}

function csvCell(v: any) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function ReportsPage() {
  const [months, setMonths] = useState<3 | 6 | 12 | 24>(12)
  const [projectId, setProjectId] = useState('')
  const [groupBy, setGroupBy] = useState<'project' | 'building'>('project')
  const [sortBy, setSortBy] = useState<'billed' | 'due' | 'rate'>('billed')

  // Outstanding-bills table state (filtering / sorting happens in the browser)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'Unpaid' | 'Partial'>('')
  const [orderBy, setOrderBy] = useState<'oldest' | 'due'>('oldest')
  const [page, setPage] = useState(1)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => projectsAPI.list({ page_size: 100 }).then(r => r.data.results || r.data),
  })

  const { data: ins, isLoading } = useQuery({
    queryKey: ['report-insights', months, projectId],
    queryFn: () =>
      insightsAPI.reports({ months, project: projectId || undefined }).then(r => r.data),
    // Keep the old numbers on screen while a new period/project loads, so the
    // filters above don't disappear and the page doesn't flash a spinner.
    placeholderData: keepPreviousData,
  })

  const { data: unpaid = [], isLoading: loadingUnpaid } = useQuery({
    queryKey: ['unpaid-bills'],
    queryFn: () => reportsAPI.unpaidBills().then(r => r.data),
  })

  const selectedProjectName = useMemo(
    () => projects.find((p: any) => String(p.id) === projectId)?.name as string | undefined,
    [projects, projectId],
  )

  // Outstanding table: project filter, search, status, sort
  const filteredUnpaid = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = unpaid.filter((b: any) => {
      if (selectedProjectName && b['project__name'] !== selectedProjectName) return false
      if (statusFilter && b.status !== statusFilter) return false
      if (!q) return true
      return [
        b.bill_number, b['unit__unit_no'], b['unit__allottee__name'],
        b['unit__mobile_number'], b['building__name'],
      ].some(v => String(v ?? '').toLowerCase().includes(q))
    })
    rows.sort((a: any, b: any) =>
      orderBy === 'due'
        ? Number(b.due_amount) - Number(a.due_amount)
        : String(a.billing_month).localeCompare(String(b.billing_month)),
    )
    return rows
  }, [unpaid, selectedProjectName, statusFilter, search, orderBy])

  const projectScopedUnpaid = useMemo(
    () => unpaid.filter((b: any) => !selectedProjectName || b['project__name'] === selectedProjectName),
    [unpaid, selectedProjectName],
  )
  const unpaidCount = projectScopedUnpaid.filter((b: any) => b.status === 'Unpaid').length
  const partialCount = projectScopedUnpaid.filter((b: any) => b.status === 'Partial').length
  const pageRows = filteredUnpaid.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const exportCsv = () => {
    const header = [
      'Bill No', 'Month', 'Unit', 'Allottee', 'Mobile', 'Building', 'Project',
      'Total', 'Paid', 'Due', 'Status',
    ]
    const lines = filteredUnpaid.map((b: any) => [
      b.bill_number, formatMonth(b.billing_month), b['unit__unit_no'],
      b['unit__allottee__name'], b['unit__mobile_number'], b['building__name'],
      b['project__name'], b.total_amount, b.paid_amount, b.due_amount, b.status,
    ])
    // BOM so Excel reads Bangla names correctly.
    const csv = '\uFEFF' + [header, ...lines].map(r => r.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'outstanding_bills.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <PageLoader />

  const canFinancial = !!ins?.can_financial
  const hasBills = !!ins?.has_bills
  const totals = ins?.totals
  const outstanding = ins?.outstanding

  const trend = (ins?.trend || []).map((m: any) => {
    const billed = Number(m.billed)
    const collected = Number(m.collected)
    return {
      month: shortMonth(m.month),
      billed,
      collected,
      due: Number(m.due),
      rate: Number(pct(collected, billed).toFixed(1)),
    }
  })

  const periodRate = totals ? pct(Number(totals.collected), Number(totals.billed)) : 0
  const avgBill = totals && totals.bills > 0 ? Number(totals.billed) / totals.bills : 0

  const breakdownRows = (groupBy === 'project' ? ins?.by_project : ins?.by_building) || []
  const sortedBreakdown = [...breakdownRows]
    .map((r: any) => ({
      ...r,
      billedN: Number(r.billed),
      collectedN: Number(r.collected),
      dueN: Number(r.due),
      rate: pct(Number(r.collected), Number(r.billed)),
    }))
    .sort((a: any, b: any) =>
      sortBy === 'due' ? b.dueN - a.dueN : sortBy === 'rate' ? a.rate - b.rate : b.billedN - a.billedN,
    )
    .slice(0, 12)

  const aging = (ins?.aging || []).map((a: any) => ({ ...a, due: Number(a.due) }))
  const agingHasData = aging.some((a: any) => a.due > 0)
  const payMethods = ins?.payment_methods || []

  return (
    <div>
      <div className="page-header flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">
            {hasBills && ins?.period
              ? `${formatMonth(ins.period.from)} – ${formatMonth(ins.period.to)}`
              : 'Revenue analytics and outstanding dues'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <select
            className="input sm:w-56"
            value={projectId}
            onChange={e => { setProjectId(e.target.value); setPage(1) }}
            aria-label="Project"
          >
            <option value="">All projects</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Segmented
            value={months}
            onChange={setMonths}
            options={[
              { value: 3, label: '3M' },
              { value: 6, label: '6M' },
              { value: 12, label: '12M' },
              { value: 24, label: '24M' },
            ]}
          />
        </div>
      </div>

      {!hasBills ? (
        <div className="card mb-6">
          <EmptyState icon={FileText} title="No bills found" description="Try another project, or create bills first." />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {canFinancial && totals ? (
              <>
                <MetricCard
                  label="Billed"
                  value={formatTaka(totals.billed)}
                  sub={`${totals.bills} bills in period`}
                  icon={FileText}
                  color="bg-brand-50"
                />
                <MetricCard
                  label="Collected"
                  value={formatTaka(totals.collected)}
                  sub={`${periodRate.toFixed(1)}% collection rate`}
                  icon={TrendingUp}
                  color="bg-success-50"
                />
              </>
            ) : (
              <LockedCard label="Billed and collected totals" className="sm:col-span-2" />
            )}
            <MetricCard
              label="Outstanding now"
              value={formatTaka(outstanding?.due || 0)}
              sub={`${outstanding?.bills ?? 0} bills · ${outstanding?.units ?? 0} units`}
              icon={AlertCircle}
              color="bg-danger-50"
            />
            {canFinancial && totals ? (
              <MetricCard
                label="Gas usage"
                value={`${Math.round(Number(totals.usage)).toLocaleString('en-BD')} m³`}
                sub={`Average bill ${formatTaka(avgBill)}`}
                icon={Gauge}
                color="bg-warning-50"
              />
            ) : (
              <MetricCard
                label="Oldest unpaid month"
                value={outstanding?.oldest_month ? formatMonth(outstanding.oldest_month) : '—'}
                sub="Across all projects in view"
                icon={Gauge}
                color="bg-warning-50"
              />
            )}
          </div>

          {/* Monthly trend */}
          {canFinancial ? (
            <SectionCard
              title="Monthly billing and collection"
              subtitle="Bars are amounts, the line is the share of billed money collected"
              className="mb-6"
            >
              {trend.length === 0 ? (
                <div className="h-60 flex items-center justify-center text-surface-400 text-sm">No data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={trend} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis yAxisId="amt" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={compactTaka} />
                    <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }}
                      tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      formatter={(v: any, name: any) =>
                        name === 'Collection rate' ? `${Number(v).toFixed(1)}%` : formatCurrency(v)
                      }
                      contentStyle={tooltipStyle}
                    />
                    <Legend />
                    <Bar yAxisId="amt" dataKey="billed" name="Billed" fill={CHART.brand} radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="amt" dataKey="collected" name="Collected" fill={CHART.success} radius={[4, 4, 0, 0]} />
                    <Line yAxisId="rate" type="monotone" dataKey="rate" name="Collection rate"
                      stroke={CHART.warning} strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          ) : (
            <LockedCard label="Monthly revenue" className="mb-6" />
          )}

          {/* Breakdown + payment methods */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {canFinancial ? (
              <>
                <SectionCard
                  title={groupBy === 'project' ? 'Collection by project' : 'Collection by building'}
                  subtitle="Selected period"
                  className="lg:col-span-2"
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Segmented
                        value={groupBy}
                        onChange={setGroupBy}
                        options={[
                          { value: 'project', label: 'Project' },
                          { value: 'building', label: 'Building' },
                        ]}
                      />
                      <Segmented
                        value={sortBy}
                        onChange={setSortBy}
                        options={[
                          { value: 'billed', label: 'Billed' },
                          { value: 'due', label: 'Due' },
                          { value: 'rate', label: 'Lowest rate' },
                        ]}
                      />
                    </div>
                  }
                >
                  {sortedBreakdown.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-surface-400 text-sm">No data yet</div>
                  ) : (
                    <div className="space-y-4">
                      {sortedBreakdown.map((r: any) => (
                        <ProgressRow
                          key={r.id}
                          label={r.name}
                          sublabel={groupBy === 'building' ? r.project_name : `${r.bills} bills`}
                          percent={r.rate}
                          tone={rateTone(r.rate)}
                          right={
                            <>
                              <span className="font-semibold text-surface-700">{r.rate.toFixed(0)}%</span>
                              {' · '}
                              {compactTaka(r.collectedN)} of {compactTaka(r.billedN)}
                              {r.dueN > 0 && (
                                <span className="text-danger-600 font-semibold"> · {compactTaka(r.dueN)} due</span>
                              )}
                            </>
                          }
                        />
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Payment methods" subtitle="Approved payments for these bills">
                  {payMethods.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-surface-400 text-sm">No data yet</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={payMethods} dataKey="total_amount" nameKey="payment_method"
                            cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3}>
                            {payMethods.map((_: any, i: number) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any) => formatCurrency(v)} contentStyle={tooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 mt-2">
                        {payMethods.map((m: any, i: number) => (
                          <div key={m.payment_method} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                              <span className="text-surface-600">{m.payment_method}</span>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-surface-800 text-xs">{formatCurrency(m.total_amount)}</div>
                              <div className="text-surface-400 text-xs">{m.count} txns</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </SectionCard>
              </>
            ) : (
              <LockedCard label="Revenue by project and payment-method breakdown" className="lg:col-span-3" />
            )}
          </div>

          {/* Aging + top due units */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <SectionCard title="Dues by age" subtitle="Unpaid amount by bill month, all time">
              {agingHasData ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={aging} barSize={36}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={compactTaka} />
                    <Tooltip
                      formatter={(v: any, _n: any, item: any) => [
                        `${formatCurrency(v)} · ${item?.payload?.bills ?? 0} bills`,
                        'Due',
                      ]}
                      contentStyle={tooltipStyle}
                    />
                    <Bar dataKey="due" radius={[6, 6, 0, 0]}>
                      {aging.map((_: any, i: number) => (
                        <Cell key={i} fill={AGING_COLORS[i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-success-600 text-sm font-semibold">
                  No outstanding dues
                </div>
              )}
            </SectionCard>

            <SectionCard title="Units with the highest dues" subtitle="Total unpaid across all months" className="lg:col-span-2">
              {(ins?.top_due_units || []).length === 0 ? (
                <div className="h-40 flex items-center justify-center text-success-600 text-sm font-semibold">
                  No outstanding dues
                </div>
              ) : (
                <div className="table-wrapper !shadow-none !border-0 -mx-1">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Unit / Allottee</th>
                        <th>Building</th>
                        <th>Bills</th>
                        <th>Oldest</th>
                        <th className="text-right">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ins.top_due_units.map((u: any) => (
                        <tr key={u.unit_id}>
                          <td>
                            <div className="font-medium text-surface-800">{u.unit_no}</div>
                            <div className="text-xs text-surface-400">{u.allottee_name || '—'}</div>
                          </td>
                          <td className="text-sm text-surface-600">
                            {u.building_name}
                            <div className="text-xs text-surface-400">{u.project_name}</div>
                          </td>
                          <td className="text-sm text-surface-600">{u.bills}</td>
                          <td className="text-sm text-surface-500">{formatMonth(u.oldest_month)}</td>
                          <td className="text-right font-mono font-bold text-danger-600">{formatCurrency(u.due)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}

      {/* Outstanding bills — every Reports-viewing role, not financial-locked */}
      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="text-base font-semibold text-surface-800">Outstanding Bills</div>
            <span className="badge-red">{filteredUnpaid.length} bills</span>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <Segmented
              value={statusFilter}
              onChange={v => { setStatusFilter(v); setPage(1) }}
              options={[
                { value: '', label: `All (${projectScopedUnpaid.length})` },
                { value: 'Unpaid', label: `Unpaid (${unpaidCount})` },
                { value: 'Partial', label: `Partial (${partialCount})` },
              ]}
            />
            <Segmented
              value={orderBy}
              onChange={v => { setOrderBy(v); setPage(1) }}
              options={[
                { value: 'oldest', label: 'Oldest first' },
                { value: 'due', label: 'Highest due' },
              ]}
            />
            <div className="relative">
              <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="input !pl-9 sm:w-60"
                placeholder="Search bill, unit, name, mobile"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            <button
              className="btn-secondary justify-center"
              onClick={exportCsv}
              disabled={filteredUnpaid.length === 0}
              title="Download the filtered list as CSV"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>

        {loadingUnpaid ? <PageLoader /> : filteredUnpaid.length === 0 ? (
          <div className="py-8 text-center text-success-600 font-semibold">
            {unpaid.length === 0 ? 'No outstanding bills' : 'No bills match these filters'}
          </div>
        ) : (
          <>
            <div className="table-wrapper !shadow-none !border-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Bill No.</th>
                    <th>Month</th>
                    <th>Unit / Allottee</th>
                    <th>Building</th>
                    <th>Total</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((b: any) => {
                    const age = ageInMonths(b.billing_month)
                    return (
                      <tr key={b.id}>
                        <td className="font-mono text-xs font-semibold text-brand-700">{b.bill_number}</td>
                        <td className="text-sm text-surface-500">
                          {formatMonth(b.billing_month)}
                          <div>
                            <span className={`badge mt-1 ${ageBadge(age)}`}>
                              {age <= 1 ? 'Current' : `${age} mo old`}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div>{b['unit__unit_no']}</div>
                          <div className="text-xs text-surface-400">{b['unit__allottee__name'] || '—'}</div>
                        </td>
                        <td className="text-sm text-surface-600">
                          {b['building__name']}
                          <div className="text-xs text-surface-400">{b['project__name']}</div>
                        </td>
                        <td className="font-mono">{formatCurrency(b.total_amount)}</td>
                        <td className="font-mono font-bold text-danger-600">{formatCurrency(b.due_amount)}</td>
                        <td><StatusBadge status={b.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} count={filteredUnpaid.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}