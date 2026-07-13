import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, Crown, Briefcase, Receipt, Calculator, Lock } from 'lucide-react'
import { authAPI } from '@/api/client'
import { PageLoader, AccessDenied } from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'

const ROLE_META: Record<string, { label: string; icon: any; color: string; desc: string }> = {
  super_admin: {
    label: 'Super Admin', icon: Crown, color: 'bg-purple-100 text-purple-700 border-purple-200',
    desc: 'Full system access. Can manage staff, roles, projects, billing, payments, and view all audit logs.',
  },
  admin: {
    label: 'Admin', icon: Briefcase, color: 'bg-blue-100 text-blue-700 border-blue-200',
    desc: 'Manages staff users (create/edit/activate). Other access is granted by Super Admin on request.',
  },
  billing_staff: {
    label: 'Billing Officer', icon: Receipt, color: 'bg-amber-100 text-amber-700 border-amber-200',
    desc: 'Creates and edits bills, records meter readings, applies adjustments with a reason.',
  },
  accountant: {
    label: 'Accountant', icon: Calculator, color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    desc: 'Records and verifies payments, views all financial reports and revenue analytics.',
  },
  viewer: {
    label: 'Viewer', icon: Lock, color: 'bg-gray-100 text-gray-600 border-gray-200',
    desc: 'Read-only access to permitted modules. No create, edit, or delete actions.',
  },
}

const ROLE_ORDER = ['super_admin', 'admin', 'billing_staff', 'accountant', 'viewer']

export default function RolesPage() {
  const { can } = usePermissions()
  if (!can.manageRBAC) return <AccessDenied />

  const { data: staff = [], isLoading: loadingStaff } = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await authAPI.staff()
      const raw = res.data
      return Array.isArray(raw) ? raw : (raw.results ?? [])
    },
  })

  // Fetched live from the backend — built by calling the actual permission
  // classes per role rather than a hand-maintained constant, so this can
  // never silently drift out of sync with real enforcement again.
  const { data: matrixData, isLoading: loadingMatrix, isError: matrixError } = useQuery({
    queryKey: ['role-permission-matrix'],
    queryFn: () => authAPI.rolePermissionMatrix().then(r => r.data),
  })

  const countFor = (roleName: string) =>
    staff.filter((s: any) => s.role?.role_name === roleName).length

  const isLoading = loadingStaff || loadingMatrix

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Roles &amp; RBAC</h1>
          <p className="page-subtitle">Role definitions and permission matrix (Super Admin only)</p>
        </div>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          {/* Role cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {ROLE_ORDER.map(roleName => {
              const meta = ROLE_META[roleName]
              const Icon = meta.icon
              return (
                <div key={roleName} className={`card border ${meta.color.split(' ')[2] ?? 'border-surface-100'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${meta.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="font-semibold text-surface-900">{meta.label}</div>
                  <div className="text-2xl font-bold text-surface-900 mt-1">
                    {countFor(roleName)}
                    <span className="text-xs font-normal text-surface-400 ml-1">
                      {countFor(roleName) === 1 ? 'user' : 'users'}
                    </span>
                  </div>
                  <p className="text-xs text-surface-400 mt-2 leading-relaxed">{meta.desc}</p>
                </div>
              )
            })}
          </div>

          {/* Permission matrix */}
          <div className="card !p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-500" />
              <span className="font-semibold text-surface-800">Permission Matrix</span>
              <span className="text-xs text-surface-400 font-normal ml-1">(live from backend)</span>
            </div>

            {matrixError ? (
              <div className="p-6 text-sm text-danger-600">
                Could not load the live permission matrix. Confirm{' '}
                <code className="font-mono text-xs bg-surface-50 px-1 py-0.5 rounded">
                  GET /auth/roles/permission-matrix/
                </code>{' '}
                is registered and reachable.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="min-w-[180px]">Module</th>
                        {ROLE_ORDER.map(r => (
                          <th key={r} className="text-center">{ROLE_META[r].label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixData?.rows?.map((row: any) => (
                        <tr key={row.key}>
                          <td className="font-medium text-surface-700">{row.label}</td>
                          {row.values.map((allowed: boolean, i: number) => (
                            <td key={i} className="text-center">
                              {allowed ? (
                                <span className="inline-flex w-6 h-6 rounded-full bg-success-50 text-success-600 items-center justify-center text-xs font-bold">✓</span>
                              ) : (
                                <span className="inline-flex w-6 h-6 rounded-full bg-surface-50 text-surface-300 items-center justify-center text-xs">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-3 bg-surface-50 text-xs text-surface-400 border-t border-surface-100 space-y-1">
                  <p>
                    A checkmark means the role has at least read access to that module, computed live
                    from the actual backend permission classes — not a separately maintained list, so
                    this table can't go stale the way a hardcoded one can.
                  </p>
                  <p>
                    Roles are fixed by system design. To grant a user additional access beyond their role,
                    a Super Admin can change their assigned role under <span className="font-medium text-surface-600">Staff Users</span>.
                  </p>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}