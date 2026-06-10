import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Pencil, Users, ShieldCheck } from 'lucide-react'
import { authAPI } from '@/api/client'
import { Modal, PageLoader, EmptyState } from '@/components/ui'
import toast from 'react-hot-toast'

function StaffModal({ open, onClose, editItem, roles }: any) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm({
    defaultValues: editItem ? { ...editItem, role_id: editItem.role?.id, password: '' } : {}
  })
  const save = useMutation({
    mutationFn: (data: any) => {
      const payload = { ...data }
      if (!payload.password) delete payload.password
      return editItem ? authAPI.updateStaff(editItem.id, payload) : authAPI.createStaff(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] })
      toast.success(editItem ? 'Staff updated' : 'Staff created')
      onClose(); reset()
    },
  })
  return (
    <Modal open={open} onClose={onClose} title={editItem ? 'Edit Staff' : 'Add Staff'}>
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Full Name *</label>
            <input {...register('name', { required: true })} className="input" placeholder="John Doe" />
          </div>
          <div>
            <label className="label">Email *</label>
            <input {...register('email', { required: true })} type="email" className="input" placeholder="john@example.com" />
          </div>
          <div>
            <label className="label">Mobile</label>
            <input {...register('mobile')} className="input" placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <label className="label">Role *</label>
            <select {...register('role_id', { required: true })} className="input">
              <option value="">— Select role —</option>
              {roles?.map((r: any) => (
                <option key={r.id} value={r.id}>{r.role_name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">{editItem ? 'New Password (leave blank to keep)' : 'Password *'}</label>
            <input
              {...register('password', { required: !editItem })}
              type="password"
              className="input"
              placeholder={editItem ? '••••••••' : 'Min 8 characters'}
            />
          </div>
        </div>
        {editItem && (
          <div className="flex items-center gap-2">
            <input {...register('is_active')} type="checkbox" id="is_active" />
            <label htmlFor="is_active" className="text-sm font-medium text-surface-700 cursor-pointer">Active</label>
          </div>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editItem ? 'Update Staff' : 'Create Staff'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const ROLE_BADGE: Record<string, string> = {
  super_admin:   'bg-purple-100 text-purple-700',
  admin:         'bg-brand-100 text-brand-700',
  billing_staff: 'bg-amber-100 text-amber-700',
  accountant:    'bg-emerald-100 text-emerald-700',
  viewer:        'bg-surface-100 text-surface-500',
}

export default function StaffPage() {
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false })
  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => authAPI.staff().then(r => r.data.results || r.data),
  })
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => authAPI.roles().then(r => r.data),
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Users</h1>
          <p className="page-subtitle">Manage staff accounts and role permissions</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true })}>
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      {/* Role pills */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {roles.map((r: any) => (
          <div key={r.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-surface-100 shadow-card text-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-500" />
            <span className="font-medium text-surface-700">{r.role_name}</span>
            <span className="text-surface-400 text-xs">
              {staff.filter((s: any) => s.role?.role_name === r.role_name).length} users
            </span>
          </div>
        ))}
      </div>

      {isLoading ? <PageLoader /> : (
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
                <tr><td colSpan={7}>
                  <EmptyState icon={Users} title="No staff users" description="Add your first staff member" />
                </td></tr>
              ) : staff.map((s: any) => (
                <tr key={s.id}>
                  <td className="font-semibold text-surface-900">{s.name}</td>
                  <td className="text-surface-600">{s.email}</td>
                  <td className="font-mono text-sm">{s.mobile || '—'}</td>
                  <td>
                    {s.role ? (
                      <span className={`badge ${ROLE_BADGE[s.role.role_name] || 'badge-gray'}`}>
                        {s.role.role_name}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={s.is_active ? 'badge-green' : 'badge-red'}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-surface-400 text-sm">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setModal({ open: true, item: s })}
                      aria-label={`Edit ${s.name}`}
                      title={`Edit ${s.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
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
