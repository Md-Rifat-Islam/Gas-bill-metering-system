import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import {
  Layers, Building, Home, FileText, TrendingUp, AlertCircle, CheckCircle2, Clock
} from 'lucide-react'
import { reportsAPI } from '@/api/client'
import { StatCard, PageLoader } from '@/components/ui'
import { formatCurrency, formatMonth } from '@/utils/helpers'

const COLORS = ['#0062f5', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

export default function DashboardPage() {
  const { data: dash, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsAPI.dashboard().then(r => r.data),
  })
  const { data: monthly = [] } = useQuery({
    queryKey: ['monthly-revenue'],
    queryFn: () => reportsAPI.monthlyRevenue().then(r => r.data),
  })
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => reportsAPI.paymentMethods().then(r => r.data),
  })

  if (isLoading) return <PageLoader />

  const chartData = [...monthly].reverse().map((m: any) => ({
    month: formatMonth(m.month),
    billed: Number(m.total_billed),
    collected: Number(m.total_collected),
    due: Number(m.total_due),
  }))

  const statusData = [
    { name: 'Paid',    value: dash?.paid_bills    || 0 },
    { name: 'Partial', value: dash?.partial_bills || 0 },
    { name: 'Unpaid',  value: dash?.unpaid_bills  || 0 },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your utility billing system</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Projects"      value={dash?.projects   || 0} icon={Layers}       color="bg-brand-50" />
        <StatCard label="Buildings"     value={dash?.buildings  || 0} icon={Building}     color="bg-purple-50" />
        <StatCard label="Active Units"  value={dash?.units      || 0} icon={Home}         color="bg-emerald-50" />
        <StatCard label="Total Bills"   value={dash?.total_bills|| 0} icon={FileText}     color="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Total Revenue Collected"
          value={formatCurrency(dash?.total_revenue || 0)}
          icon={TrendingUp}
          color="bg-success-50"
        />
        <StatCard
          label="Total Outstanding Due"
          value={formatCurrency(dash?.total_due || 0)}
          icon={AlertCircle}
          color="bg-danger-50"
        />
        <div className="card">
          <div className="text-sm font-medium text-surface-500 mb-3">Bill Status</div>
          <div className="flex gap-4">
            {[
              { label: 'Paid',    value: dash?.paid_bills    || 0, cls: 'badge-green'  },
              { label: 'Partial', value: dash?.partial_bills || 0, cls: 'badge-yellow' },
              { label: 'Unpaid',  value: dash?.unpaid_bills  || 0, cls: 'badge-red'    },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center flex-1 bg-surface-50 rounded-xl py-3">
                <div className="text-xl font-bold text-surface-900">{s.value}</div>
                <span className={`badge mt-1 ${s.cls}`}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue trend */}
        <div className="card lg:col-span-2">
          <div className="text-base font-semibold text-surface-800 mb-6">Monthly Revenue Trend</div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorBilled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0062f5" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0062f5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `৳${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatCurrency(v)} />
                <Area type="monotone" dataKey="billed" name="Billed"
                  stroke="#0062f5" fill="url(#colorBilled)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="collected" name="Collected"
                  stroke="#22c55e" fill="url(#colorCollected)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-surface-400 text-sm">
              No billing data yet
            </div>
          )}
        </div>

        {/* Payment methods */}
        <div className="card">
          <div className="text-base font-semibold text-surface-800 mb-6">Payment Methods</div>
          {paymentMethods.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={paymentMethods} dataKey="total_amount" nameKey="payment_method"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {paymentMethods.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {paymentMethods.map((m: any, i: number) => (
                  <div key={m.payment_method} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-surface-600">{m.payment_method}</span>
                    </div>
                    <span className="font-semibold text-surface-800">{m.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center text-surface-400 text-sm">
              No payment data yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
