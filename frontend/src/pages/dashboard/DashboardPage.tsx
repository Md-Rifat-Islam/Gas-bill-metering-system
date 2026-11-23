import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'
import {
  Layers, Building, Home, FileText, TrendingUp, AlertCircle, Wallet, Percent,
  Clock, Gauge, ArrowRight,
} from 'lucide-react'
import { reportsAPI, paymentsAPI } from '@/api/client'
import { insightsAPI } from '@/api/insightsClient'
import { usePermissions } from '@/hooks/usePermissions'
import { StatCard, PageLoader, EmptyState } from '@/components/ui'
import { formatCurrency, formatMonth, formatDate } from '@/utils/helpers'
import {
  CHART, tooltipStyle, formatTaka, compactTaka, pct, shortMonth, rateTone, relChange,
  SectionCard, LockedCard, Segmented, MetricCard, Delta, ProgressRow,
} from '@/components/dashboard/widgets'

const AGING_COLORS = [CHART.muted, CHART.warning, CHART.danger, '#b91c1c']

export default function DashboardPage() {
  const { can, isLoading: permsLoading } = usePermissions()
  const [range, setRange] = useState<3 | 6 | 12>(6)

  const { data: dash, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsAPI.dashboard().then(r => r.data),
  })

  // One request for everything beyond the basic counts. The backend leaves
  // out revenue figures for roles without financial-report access, so there
  // is nothing here that can 403.
  const { data: ins, isLoading: insLoading } = useQuery({
    queryKey: ['dashboard-insights'],
    queryFn: () => insightsAPI.dashboard().then(r => r.data),
  })

  // Same key and function as the sidebar badge, so this shares its cache.
  const { data: pendingData } = useQuery({
    queryKey: ['payments-pending-count'],
    queryFn: () => paymentsAPI.pending().then(r => r.data),
    enabled: !!can.approvePayments,
    refetchInterval: 60_000,
  })
  const pendingCount = pendingData?.count ?? pendingData?.results?.length ?? 0

  if (isLoading || permsLoading || insLoading) return <PageLoader />

  const fin = ins?.financial?.has_bills ? ins.financial : null
  const hasFinancialAccess = ins?.financial !== null && ins?.financial !== undefined
  const reading = ins?.reading

  const cycle = fin?.cycle
  const prev = fin?.previous
  const cycleBilled = Number(cycle?.billed || 0)
  const cycleCollected = Number(cycle?.collected || 0)
  const cycleRate = pct(cycleCollected, cycleBilled)
  const prevRate = prev ? pct(Number(prev.collected), Number(prev.billed)) : null

  const trend = (fin?.trend || []).slice(-range).map((m: any) => ({
    month: shortMonth(m.month),
    billed: Number(m.billed),
    collected: Number(m.collected),
  }))

  const statusRows = [
    { label: 'Paid',    key: 'Paid',    value: dash?.paid_bills    || 0, dot: 'bg-success-500', badge: 'badge-green'  },
    { label: 'Partial', key: 'Partial', value: dash?.partial_bills || 0, dot: 'bg-warning-500', badge: 'badge-yellow' },
    { label: 'Unpaid',  key: 'Unpaid',  value: dash?.unpaid_bills  || 0, dot: 'bg-danger-500',  badge: 'badge-red'    },
  ]
  const statusTotal = statusRows.reduce((s, r) => s + r.value, 0)
  const dueByStatus: Record<string, number> = {}
  ;(fin?.by_status || []).forEach((s: any) => { dueByStatus[s.status] = Number(s.due) })

  const aging = (fin?.aging || []).map((a: any) => ({ ...a, due: Number(a.due) }))
  const agingHasData = aging.some((a: any) => a.due > 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your utility billing system</p>
        </div>
        {fin && (
          <span className="badge-blue hidden sm:inline-flex">
            Latest billing cycle: {formatMonth(fin.latest_month)}
          </span>
        )}
      </div>

      {can.approvePayments && pendingCount > 0 && (
        <div className="card !p-4 mb-6 flex items-center gap-4 !bg-warning-50">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-warning-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-surface-800">
              {pendingCount} payment{pendingCount === 1 ? '' : 's'} waiting for approval
            </div>
            <div className="text-xs text-surface-500">
              Customer-submitted payments stay pending until reviewed.
            </div>
          </div>
          <Link to="/staff/payments/pending" className="btn-primary btn-sm shrink-0">
            Review
          </Link>
        </div>
      )}

      {/* Counts — visible to every role */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Projects"     value={dash?.projects    || 0} icon={Layers}   color="bg-brand-50" />
        <StatCard label="Buildings"    value={dash?.buildings   || 0} icon={Building} color="bg-purple-50" />
        <StatCard label="Active Units" value={dash?.units       || 0} icon={Home}     color="bg-emerald-50" />
        <StatCard label="Total Bills"  value={dash?.total_bills || 0} icon={FileText} color="bg-amber-50" />
      </div>

      {/* Money for the latest billing cycle */}
      {!hasFinancialAccess ? (
        <LockedCard label="Revenue and outstanding-due totals" className="mb-6" />
      ) : fin ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            label="Billed"
            value={formatTaka(cycleBilled)}
            sub={`${cycle?.bills ?? 0} bills · ${formatMonth(fin.latest_month)}`}
            icon={FileText}
            color="bg-brand-50"
            footer={<Delta value={relChange(cycleBilled, prev ? Number(prev.billed) : undefined)} />}
          />
          <MetricCard
            label="Collected"
            value={formatTaka(cycleCollected)}
            sub={`of ${formatTaka(cycleBilled)} billed`}
            icon={TrendingUp}
            color="bg-success-50"
            footer={<Delta value={relChange(cycleCollected, prev ? Number(prev.collected) : undefined)} />}
          />
          <MetricCard
            label="Collection rate"
            value={`${cycleRate.toFixed(1)}%`}
            sub={formatMonth(fin.latest_month)}
            icon={Percent}
            color="bg-warning-50"
            footer={
              <Delta
                value={prevRate === null ? null : cycleRate - prevRate}
                unit=" pts"
              />
            }
          />
          <MetricCard
            label="Total outstanding"
            value={formatTaka(fin.totals.due)}
            sub={`${fin.totals.due_bills} bills with dues · all months`}
            icon={AlertCircle}
            color="bg-danger-50"
            footer={
              <div className="text-xs text-surface-400">
                Revenue collected to date{' '}
                <span className="font-semibold text-surface-600">{formatTaka(fin.totals.revenue)}</span>
              </div>
            }
          />
        </div>
      ) : (
        <div className="card mb-6">
          <EmptyState icon={FileText} title="No bills yet" description="Billing figures appear once the first bills are created." />
        </div>
      )}

      {/* Trend + bill status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {hasFinancialAccess && fin ? (
          <SectionCard
            title="Billed vs Collected"
            subtitle="By billing month"
            className="lg:col-span-2"
            action={
              <Segmented
                value={range}
                onChange={setRange}
                options={[
                  { value: 3, label: '3M' },
                  { value: 6, label: '6M' },
                  { value: 12, label: '12M' },
                ]}
              />
            }
          >
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="colorBilled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART.brand} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={CHART.brand} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART.success} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={CHART.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={compactTaka} />
                  <Tooltip formatter={(v: any) => formatCurrency(v)} contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="billed" name="Billed"
                    stroke={CHART.brand} fill="url(#colorBilled)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="collected" name="Collected"
                    stroke={CHART.success} fill="url(#colorCollected)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-surface-400 text-sm">
                No billing data yet
              </div>
            )}
          </SectionCard>
        ) : (
          <LockedCard label="The revenue trend" className="lg:col-span-2" />
        )}

        <SectionCard title="Bill status" subtitle={`${statusTotal} bills in total`}>
          {statusTotal > 0 ? (
            <>
              <div className="flex h-3 rounded-full overflow-hidden bg-surface-100 mb-5">
                {statusRows.map(s => (
                  <div
                    key={s.key}
                    className={s.dot}
                    style={{ width: `${pct(s.value, statusTotal)}%` }}
                    title={`${s.label}: ${s.value}`}
                  />
                ))}
              </div>
              <div className="space-y-3">
                {statusRows.map(s => (
                  <div key={s.key} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                      <span className="text-sm text-surface-600">{s.label}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-surface-900">{s.value}</div>
                      {fin && s.key !== 'Paid' && (
                        <div className="text-xs text-surface-400">{formatTaka(dueByStatus[s.key] || 0)} due</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center text-surface-400 text-sm">No bills yet</div>
          )}
        </SectionCard>
      </div>

      {/* Operations: meter readings, collection by project, aging */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <SectionCard
          title="Meter readings"
          subtitle={reading ? formatMonth(reading.month) : undefined}
          action={
            can.recordReading ? (
              <Link to="/staff/meters/quick-reading" className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
                Quick Reading <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : undefined
          }
        >
          {reading && reading.total > 0 ? (
            <div className="space-y-5">
              <div>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <span className="text-3xl font-bold text-surface-900">{reading.read}</span>
                    <span className="text-sm text-surface-400"> / {reading.total} meters read</span>
                  </div>
                  <div className="text-sm font-semibold text-surface-600">
                    {pct(reading.read, reading.total).toFixed(0)}%
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-surface-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-300"
                    style={{ width: `${pct(reading.read, reading.total)}%` }}
                  />
                </div>
              </div>
              <div className="space-y-4 max-h-56 overflow-y-auto pr-1">
                {reading.projects.map((p: any) => (
                  <ProgressRow
                    key={p.project_id}
                    label={p.name}
                    percent={pct(p.read, p.total)}
                    right={`${p.read} / ${p.total}`}
                    tone={p.read >= p.total ? 'success' : 'brand'}
                  />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon={Gauge} title="No active meters" description="Assign meters to units to track readings here." />
          )}
        </SectionCard>

        {hasFinancialAccess && fin ? (
          <>
            <SectionCard title="Collection by project" subtitle={formatMonth(fin.latest_month)}>
              {fin.by_project.filter((p: any) => Number(p.cycle_billed) > 0).length > 0 ? (
                <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                  {fin.by_project
                    .filter((p: any) => Number(p.cycle_billed) > 0)
                    .map((p: any) => {
                      const billed = Number(p.cycle_billed)
                      const collected = Number(p.cycle_collected)
                      const rate = pct(collected, billed)
                      return (
                        <ProgressRow
                          key={p.project_id}
                          label={p.name}
                          percent={rate}
                          tone={rateTone(rate)}
                          right={
                            <>
                              <span className="font-semibold text-surface-700">{rate.toFixed(0)}%</span>
                              {' · '}
                              {compactTaka(collected)} / {compactTaka(billed)}
                            </>
                          }
                        />
                      )
                    })}
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-surface-400 text-sm">
                  No bills in this cycle
                </div>
              )}
            </SectionCard>

            <SectionCard title="Dues by age" subtitle="Unpaid amount by how old the bill month is">
              {agingHasData ? (
                <ResponsiveContainer width="100%" height={220}>
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
          </>
        ) : (
          <LockedCard label="Collection and dues breakdowns" className="lg:col-span-2" />
        )}
      </div>

      {/* Highest dues + recent payments */}
      {hasFinancialAccess && fin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SectionCard
            title="Highest outstanding units"
            subtitle="Total unpaid across all months"
            className="lg:col-span-2"
            action={
              can.viewReports ? (
                <Link to="/staff/reports" className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
                  Full report <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : undefined
            }
          >
            {fin.top_due_units.length > 0 ? (
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
                    {fin.top_due_units.map((u: any) => (
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
            ) : (
              <div className="h-32 flex items-center justify-center text-success-600 text-sm font-semibold">
                No outstanding dues
              </div>
            )}
          </SectionCard>

          <SectionCard title="Recent payments" subtitle="Latest approved">
            {fin.recent_payments.length > 0 ? (
              <div className="divide-y divide-surface-100 -my-2">
                {fin.recent_payments.map((p: any) => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-surface-800 truncate">
                        {p.building_name} · {p.unit_no}
                      </div>
                      <div className="text-xs text-surface-400 flex items-center gap-1.5 mt-0.5">
                        <Wallet className="w-3 h-3" />
                        {p.method} · {formatDate(p.date)}
                      </div>
                    </div>
                    <div className="font-mono text-sm font-bold text-success-600 shrink-0">
                      {formatCurrency(p.amount)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-surface-400 text-sm">
                No payments yet
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  )
}