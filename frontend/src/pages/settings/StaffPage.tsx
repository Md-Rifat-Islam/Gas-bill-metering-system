import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Pencil, Users, ShieldCheck, AlertCircle } from 'lucide-react'
import { authAPI } from '@/api/client'
import { usePermissions } from '@/hooks/usePermissions'
import { AccessDenied } from '@/components/ui'
import { Modal, PageLoader, EmptyState } from '@/components/ui'
import toast from 'react-hot-toast'

/* ── helpers ─────────────────────────────────────────────────────────────── */
const ROLE_BADGE: Record<string, string> = {
  super_admin:   'bg-purple-100 text-purple-700',
  admin:         'bg-blue-100 text-blue-700',
  billing_staff: 'bg-amber-100 text-amber-700',
  accountant:    'bg-emerald-100 text-emerald-700',
  viewer:        'bg-gray-100 text-gray-600',
}

/* ── StaffModal ──────────────────────────────────────────────────────────── */
function StaffModal({ open, onClose, editItem, roles }: {
  open: boolean
  onClose: () => void
  editItem?: any
  roles: any[]
}) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: editItem
      ? { name: editItem.name, email: editItem.email, mobile: editItem.mobile || '',
          role_id: editItem.role?.id || '', is_active: editItem.is_active, password: '' }
      : { name: '', email: '', mobile: '', role_id: '', is_active: true, password: '' },
  })

  const save = useMutation({
    mutationFn: (data: any) => {
      const payload: any = {
        name:      data.name,
        email:     data.email,
        mobile:    data.mobile || null,
        role_id:   data.role_id || null,
        is_active: data.is_active,
      }
      if (data.password) payload.password = data.password
      return editItem
        ? authAPI.updateStaff(editItem.id, payload)
        : authAPI.createStaff(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] })
      toast.success(editItem ? 'Staff member updated' : 'Staff member created')
      onClose()
      reset()
    },
    onError: () => {
      // error toast handled by axios interceptor
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={editItem ? 'Edit Staff Member' : 'Add Staff Member'}>
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Full Name <span className="text-danger-500">*</span></label>
            <input
              {...register('name', { required: 'Name is required' })}
              className={`input ${errors.name ? 'input-error' : ''}`}
              placeholder="John Doe"
            />
            {errors.name && <p className="text-xs text-danger-600 mt-1">{errors.name.message as string}</p>}
          </div>
          <div>
            <label className="label">Email <span className="text-danger-500">*</span></label>
            <input
              {...register('email', { required: 'Email is required' })}
              type="email"
              className={`input ${errors.email ? 'input-error' : ''}`}
              placeholder="john@example.com"
            />
            {errors.email && <p className="text-xs text-danger-600 mt-1">{errors.email.message as string}</p>}
          </div>
          <div>
            <label className="label">Mobile</label>
            <input {...register('mobile')} className="input" placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <label className="label">Role <span className="text-danger-500">*</span></label>
            <select
              {...register('role_id', { required: 'Role is required' })}
              className={`input ${errors.role_id ? 'input-error' : ''}`}
            >
              <option value="">— Select role —</option>
              {roles.map((r: any) => (
                <option key={r.id} value={r.id}>{r.role_name.replace('_', ' ')}</option>
              ))}
            </select>
            {errors.role_id && <p className="text-xs text-danger-600 mt-1">{errors.role_id.message as string}</p>}
          </div>
          <div className="col-span-2">
            <label className="label">
              {editItem ? 'New Password' : 'Password'}{' '}
              {!editItem && <span className="text-danger-500">*</span>}
              {editItem && <span className="text-surface-400 font-normal">(leave blank to keep current)</span>}
            </label>
            <input
              {...register('password', { required: !editItem ? 'Password is required' : false, minLength: { value: 6, message: 'Min 6 characters' } })}
              type="password"
              className={`input ${errors.password ? 'input-error' : ''}`}
              placeholder={editItem ? '••••••••' : 'Min 6 characters'}
            />
            {errors.password && <p className="text-xs text-danger-600 mt-1">{errors.password.message as string}</p>}
          </div>
        </div>

        {editItem && (
          <div className="flex items-center gap-2 pt-1">
            <input {...register('is_active')} type="checkbox" id="is_active_chk" className="w-4 h-4 rounded" />
            <label htmlFor="is_active_chk" className="text-sm font-medium text-surface-700 cursor-pointer">
              Account is active
            </label>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2 border-t border-surface-100">
          <button type="button" className="btn-secondary" onClick={() => { onClose(); reset() }}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editItem ? 'Update Staff' : 'Create Staff'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ── StaffPage ───────────────────────────────────────────────────────────── */
export default function StaffPage() {
  const { can } = usePermissions()
  if (!can.manageUsers) return <AccessDenied />

  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false })

  const {
    data: staff = [],
    isLoading: loadingStaff,
    isError: staffError,
  } = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await authAPI.staff()
      // handle both paginated {results:[]} and plain []
      const raw = res.data
      return Array.isArray(raw) ? raw : (raw.results ?? [])
    },
  })

  const {
    data: roles = [],
    isLoading: loadingRoles,
    isError: rolesError,
  } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await authAPI.roles()
      const raw = res.data
      return Array.isArray(raw) ? raw : (raw.results ?? [])
    },
  })

  const isError = staffError || rolesError

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Users</h1>
          <p className="page-subtitle">Manage staff accounts and role permissions</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true })}>
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      {/* Error state */}
      {isError && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-danger-50 border border-danger-200 rounded-xl text-danger-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <span className="font-semibold">Could not load data.</span>
            {' '}Make sure the backend is running and you are logged in.
          </div>
        </div>
      )}

      {/* Role summary pills */}
      {roles.length > 0 && (
        <div className="flex gap-3 mb-6 flex-wrap">
          {roles.map((r: any) => {
            const count = staff.filter((s: any) => s.role?.role_name === r.role_name).length
            return (
              <div
                key={r.id}
                className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-surface-100 shadow-card text-sm"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-brand-500" />
                <span className="font-medium text-surface-700 capitalize">
                  {r.role_name.replace('_', ' ')}
                </span>
                <span className="text-surface-400 text-xs">{count} {count === 1 ? 'user' : 'users'}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Table */}
      {loadingStaff || loadingRoles ? (
        <PageLoader />
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={Users}
                      title="No staff users yet"
                      description="Add your first staff member to get started"
                      action={
                        <button className="btn-primary btn-sm" onClick={() => setModal({ open: true })}>
                          <Plus className="w-3.5 h-3.5" /> Add Staff
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                staff.map((s: any) => (
                  <tr key={s.id}>
                    <td className="font-semibold text-surface-900">{s.name}</td>
                    <td className="text-surface-600">{s.email}</td>
                    <td className="font-mono text-sm text-surface-500">{s.mobile || '—'}</td>
                    <td>
                      {s.role ? (
                        <span className={`badge capitalize ${ROLE_BADGE[s.role.role_name] ?? 'badge-gray'}`}>
                          {s.role.role_name.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="text-surface-400 text-xs">No role</span>
                      )}
                    </td>
                    <td>
                      <span className={s.is_active ? 'badge-green' : 'badge-red'}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-surface-400 text-sm">
                      {new Date(s.created_at).toLocaleDateString('en-BD')}
                    </td>
                    <td>
                      <button
                        className="btn-ghost btn-sm"
                        title="Edit"
                        onClick={() => setModal({ open: true, item: s })}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <StaffModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        editItem={modal.item}
        roles={roles}
      />
    </div>
  )
}