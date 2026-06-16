import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { reportsAPI } from '@/api/client'
import { usePermissions } from '@/hooks/usePermissions'
import { PageLoader, StatusBadge } from '@/components/ui'
import { formatCurrency, formatMonth } from '@/utils/helpers'

const COLORS = ['#0062f5', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export default function ReportsPage() {
  const { data: monthly = [], isLoading: loadingMonthly } = useQuery({
    queryKey: ['monthly-revenue'],
    queryFn: () => reportsAPI.monthlyRevenue().then(r => r.data),
  })
  const { data: projectRevenue = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['project-revenue'],
    queryFn: () => reportsAPI.projectRevenue().then(r => r.data),
  })
  const { data: unpaid = [], isLoading: loadingUnpaid } = useQuery({
    queryKey: ['unpaid-bills'],
    queryFn: () => reportsAPI.unpaidBills().then(r => r.data),
  })
  const { can } = usePermissions()
  const { data: payMethods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => reportsAPI.paymentMethods().then(r => r.data),
  })

  const chartData = [...monthly].reverse().map((m: any) => ({
    month: formatMonth(m.month).replace(' 20', " '"),
    billed:    Number(m.total_billed),
    collected: Number(m.total_collected),
    due:       Number(m.total_due),
  }))

  const projectData = projectRevenue.map((p: any) => ({
    name:      p['project__name'],
    billed:    Number(p.total_billed),
    collected: Number(p.total_collected),
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Revenue analytics and outstanding dues</p>
        </div>
      </div>

      {/* Monthly Revenue */}
      <div className="card mb-6">
        <div className="text-base font-semibold text-surface-800 mb-6">Monthly Revenue — Last 12 Months</div>
        {loadingMonthly ? <PageLoader /> : chartData.length === 0 ? (
          <div className="h-60 flex items-center justify-center text-surface-400 text-sm">No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                tickFormatter={v => `৳${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="billed"    name="Billed"    fill="#0062f5" radius={[4,4,0,0]} />
              <Bar dataKey="collected" name="Collected" fill="#22c55e" radius={[4,4,0,0]} />
              <Bar dataKey="due"       name="Due"       fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Project revenue + Payment methods */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="card lg:col-span-2">
          <div className="text-base font-semibold text-surface-800 mb-6">Revenue by Project</div>
          {loadingProjects ? <PageLoader /> : projectData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-surface-400 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={projectData} layout="vertical" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false}
                  tickFormatter={v => `৳${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} width={120} />
                <Tooltip formatter={(v: any) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="billed"    name="Billed"    fill="#0062f5" radius={[0,4,4,0]} />
                <Bar dataKey="collected" name="Collected" fill="#22c55e" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <div className="text-base font-semibold text-surface-800 mb-6">Payment Methods</div>
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
                  <Tooltip formatter={(v: any) => formatCurrency(v)} />
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
        </div>
      </div>

      {/* Unpaid bills */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-base font-semibold text-surface-800">Outstanding Bills</div>
          <span className="badge-red">{unpaid.length} bills</span>
        </div>
        {loadingUnpaid ? <PageLoader /> : unpaid.length === 0 ? (
          <div className="py-8 text-center text-success-600 font-semibold">
            🎉 No outstanding bills!
          </div>
        ) : (
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
                {unpaid.map((b: any) => (
                  <tr key={b.id}>
                    <td className="font-mono text-xs font-semibold text-brand-700">{b.bill_number}</td>
                    <td className="text-sm text-surface-500">{formatMonth(b.billing_month)}</td>
                    <td>
                      <div>{b['unit__unit_no']}</div>
                      <div className="text-xs text-surface-400">{b['unit__allottee__name'] || '—'}</div>
                    </td>
                    <td className="text-sm text-surface-600">{b['building__name']}</td>
                    <td className="font-mono">{formatCurrency(b.total_amount)}</td>
                    <td className="font-mono font-bold text-danger-600">{formatCurrency(b.due_amount)}</td>
                    <td><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}