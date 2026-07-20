import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Plus, Pencil, Trash2, Users, ShieldCheck, AlertCircle, Eye, EyeOff,
} from 'lucide-react'
import { authAPI } from '@/api/client'
import { usePermissions } from '@/hooks/usePermissions'
import { useConfirm } from '@/hooks'
import { AccessDenied, Modal, PageLoader, EmptyState, ConfirmDialog } from '@/components/ui'
import toast from 'react-hot-toast'

/* ── helpers ─────────────────────────────────────────────────────────────── */
const ROLE_BADGE: Record<string, string> = {
  super_admin:   'bg-purple-100 text-purple-700',
  admin:         'bg-blue-100 text-blue-700',
  billing_staff: 'bg-amber-100 text-amber-700',
  accountant:    'bg-emerald-100 text-emerald-700',
  viewer:        'bg-gray-100 text-gray-600',
}

const PERMISSION_MODULES: { value: string; label: string }[] = [
  { value: 'projects',  label: 'Projects' },
  { value: 'buildings', label: 'Buildings' },
  { value: 'units',     label: 'Units' },
  { value: 'meters',    label: 'Meters' },
  { value: 'quick_reading', label: 'Quick Reading' },   
  { value: 'billing',   label: 'Billing' },
  { value: 'payments',  label: 'Payments' },
  { value: 'reports',   label: 'Reports' },
  { value: 'staff',     label: 'Staff Management' },
  { value: 'audit',     label: 'Audit Logs' },
]

interface StaffFormValues {
  name: string
  email: string
  mobile: string
  role_id: string | number
  is_active: boolean
  password: string
  notes: string
}

const TABS = ['basic', 'contact', 'permissions', 'additional'] as const
type Tab = typeof TABS[number]
const TAB_LABEL: Record<Tab, string> = {
  basic: 'Basic Information',
  contact: 'Contact Information',
  permissions: 'Role & Permission',
  additional: 'Additional Details',
}

/* ── Permission matrix sub-form (Role & Permission tab) ─────────────────── */
function PermissionMatrix({userId, disabled, editItem,}: {
  userId: number | null
  disabled: boolean
  editItem: any
}) {
  const qc = useQueryClient()
  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: () => authAPI.getUserPermissions(userId as number).then(r => r.data),
    enabled: !!userId,
  })

  const [rows, setRows] = useState<Record<string, { can_view: boolean; can_edit: boolean; can_delete: boolean }>>({})

  useEffect(() => {
    if (!editItem) return

    const next: typeof rows = {}

    for (const m of PERMISSION_MODULES) {
      const existing = overrides.find((o: any) => o.module === m.value)

      if (existing) {
        next[m.value] = {
          can_view: existing.can_view,
          can_edit: existing.can_edit,
          can_delete: existing.can_delete,
        }
      } else {
        // use role defaults from backend
        next[m.value] = {
          can_view: editItem.role_permissions?.[m.value]?.can_view ?? false,
          can_edit: editItem.role_permissions?.[m.value]?.can_edit ?? false,
          can_delete: editItem.role_permissions?.[m.value]?.can_delete ?? false,
        }
      }
    }

    setRows(next)
  }, [overrides, editItem])

  const save = useMutation({
    mutationFn: () => {
      const payload = PERMISSION_MODULES.map(m => ({ module: m.value, ...rows[m.value] }))
      return authAPI.setUserPermissions(userId as number, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-permissions', userId] })
      toast.success('Permissions updated')
    },
  })

  if (!userId) {
    return (
      <p className="text-sm text-surface-400 py-6 text-center">
        Save the user first, then come back to this tab to set granular module permissions.
      </p>
    )
  }
  if (isLoading) return <PageLoader />

  const toggle = (module: string, field: 'can_view' | 'can_edit' | 'can_delete') => {
    setRows(prev => ({
      ...prev,
      [module]: { ...prev[module], [field]: !prev[module][field] },
    }))
  }

  return (
    <div>
      <div className="flex items-start gap-2 mb-4 p-3 bg-warning-50 border border-warning-200 rounded-xl text-warning-700 text-xs">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>Mostly not enforced yet.</strong> Access is primarily determined by this user's{' '}
          <span className="font-medium">Role</span>. The one exception: the <strong>Payments → View</strong>{' '}
          checkbox below is live — checking it grants this user Payments visibility even if their role
          wouldn't normally allow it. All other checkboxes on this tab are saved but not yet enforced.
        </span>
      </div>
      <p className="text-xs text-surface-400 mb-4">
        Override what this user can do per module. Unchecked "View" hides the module entirely from their sidebar.
      </p>
      {/* Scrolls horizontally on narrow screens instead of squashing the 4 columns */}
      <div className="table-wrapper !shadow-none overflow-x-auto">
        <table className="table min-w-[420px]">
          <thead>
            <tr>
              <th>Module</th>
              <th className="text-center">View</th>
              <th className="text-center">Edit</th>
              <th className="text-center">Delete</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULES.map(m => (
              <tr key={m.value}>
                <td className="font-medium text-surface-700">{m.label}</td>
                {(['can_view', 'can_edit', 'can_delete'] as const).map(field => (
                  <td key={field} className="text-center">
                    <input
                      type="checkbox"
                      checked={rows[m.value]?.[field] ?? false}
                      onChange={() => toggle(m.value, field)}
                      disabled={disabled}
                      aria-label={`${m.label} - ${field.replace('can_', '')}`}
                      title={`${m.label}: ${field.replace('can_', '')}`}
                      className="w-4 h-4 rounded disabled:opacity-40"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div className="flex justify-end mt-4">
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            aria-label="Save permission changes"
            title="Save permission changes"
          >
            {save.isPending ? 'Saving…' : 'Save Permissions'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── StaffModal — tabbed edit/create form ────────────────────────────────── */
function StaffModal({ open, onClose, editItem, roles, canManageThis }: {
  open: boolean
  onClose: () => void
  editItem?: any
  roles: any[]
  canManageThis: boolean
}) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('basic')
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<StaffFormValues>({
    defaultValues: {
      name: '', email: '', mobile: '', role_id: '', is_active: true, password: '', notes: '',
    },
  })

  // THE FIX: react-hook-form's `defaultValues` only applies on first mount.
  // Since this StaffModal component instance is reused for every row (only
  // `editItem` changes when you click a different row's Edit button), we
  // must explicitly re-populate the form with `reset()` whenever the modal
  // opens or the target user changes — otherwise every tab shows blank
  // fields for any user opened after the first one.
  useEffect(() => {
    if (open) {
      setTab('basic')
      setShowPassword(false)
      if (editItem) {
        reset({
          name: editItem.name ?? '',
          email: editItem.email ?? '',
          mobile: editItem.mobile ?? '',
          role_id: editItem.role?.id ?? '',
          is_active: editItem.is_active ?? true,
          password: '',
          notes: editItem.notes ?? '',
        })
      } else {
        reset({ name: '', email: '', mobile: '', role_id: '', is_active: true, password: '', notes: '' })
      }
    }
  }, [open, editItem, reset])

  const save = useMutation({
    mutationFn: (data: StaffFormValues) => {
      const payload: any = {
        name: data.name,
        email: data.email,
        mobile: data.mobile || null,
        role_id: data.role_id || null,
        is_active: data.is_active,
        notes: data.notes || '',
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
    },
    onError: (err: any) => {
    toast.error(err?.response?.data?.detail || 'Failed to save staff member')
    },
  })

  const readOnly = !!editItem && !canManageThis

  return (
    <Modal open={open} onClose={onClose} title={editItem ? 'Edit Staff Member' : 'Add Staff Member'} size="lg">
      {readOnly && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-warning-50 border border-warning-200 rounded-xl text-warning-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          You can view this account but cannot edit it (outside your management hierarchy).
        </div>
      )}

      {/* Tabs — already horizontally scrollable, keep as-is */}
      <div className="flex gap-1 bg-surface-100 rounded-xl p-1 mb-5 overflow-x-auto" role="tablist">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t ? 'true' : 'false'}
            title={TAB_LABEL[t]}
            onClick={() => setTab(t)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              tab === t ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(d => save.mutate(d))}>
        {/* ── Basic Information ── */}
        <div className={tab === 'basic' ? 'block' : 'hidden'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="staff-name">Full Name <span className="text-danger-500">*</span></label>
              <input
                id="staff-name"
                {...register('name', { required: 'Name is required' })}
                disabled={readOnly}
                className={`input ${errors.name ? 'input-error' : ''}`}
                placeholder="John Doe"
                aria-label="Full name"
                title="Full name"
              />
              {errors.name && <p className="text-xs text-danger-600 mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label" htmlFor="staff-role">Role <span className="text-danger-500">*</span></label>
              <select
                id="staff-role"
                {...register('role_id', { required: 'Role is required' })}
                disabled={readOnly}
                className={`input ${errors.role_id ? 'input-error' : ''}`}
                aria-label="Role"
                title="Role"
              >
                <option value="">— Select role —</option>
                {roles.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.role_name.replace('_', ' ')}</option>
                ))}
              </select>
              {errors.role_id && <p className="text-xs text-danger-600 mt-1">{errors.role_id.message}</p>}
            </div>
            <div className="sm:col-span-2 flex items-center gap-2 pt-1">
              <input
                {...register('is_active')}
                type="checkbox"
                id="is_active_chk"
                disabled={readOnly}
                className="w-4 h-4 rounded"
                aria-label="Account is active"
                title="Account is active"
              />
              <label htmlFor="is_active_chk" className="text-sm font-medium text-surface-700 cursor-pointer">
                Account is active
              </label>
            </div>
          </div>
        </div>

        {/* ── Contact Information ── */}
        <div className={tab === 'contact' ? 'block' : 'hidden'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="staff-email">Email <span className="text-danger-500">*</span></label>
              <input
                id="staff-email"
                {...register('email', { required: 'Email is required' })}
                type="email"
                disabled={readOnly}
                className={`input ${errors.email ? 'input-error' : ''}`}
                placeholder="john@example.com"
                aria-label="Email address"
                title="Email address"
              />
              {errors.email && <p className="text-xs text-danger-600 mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label" htmlFor="staff-mobile">Mobile</label>
              <input
                id="staff-mobile"
                {...register('mobile')}
                disabled={readOnly}
                className="input"
                placeholder="01XXXXXXXXX"
                aria-label="Mobile number"
                title="Mobile number"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="staff-password">
                {editItem ? 'New Password' : 'Password'}{' '}
                {!editItem && <span className="text-danger-500">*</span>}
                {editItem && <span className="text-surface-400 font-normal">(leave blank to keep current)</span>}
              </label>
              <div className="relative">
                <input
                  id="staff-password"
                  {...register('password', {
                    required: !editItem ? 'Password is required' : false,
                    minLength: { value: 6, message: 'Min 6 characters' },
                  })}
                  type={showPassword ? 'text' : 'password'}
                  disabled={readOnly}
                  className={`input pr-10 ${errors.password ? 'input-error' : ''}`}
                  placeholder={editItem ? '••••••••' : 'Min 6 characters'}
                  aria-label="Password"
                  title="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-danger-600 mt-1">{errors.password.message}</p>}
            </div>
          </div>
        </div>

        {/* ── Role & Permission ── */}
        <div className={tab === 'permissions' ? 'block' : 'hidden'}>
          <PermissionMatrix userId={editItem?.id ?? null} disabled={readOnly} editItem={editItem}/>
        </div>

        {/* ── Additional Details ── */}
        <div className={tab === 'additional' ? 'block' : 'hidden'}>
          <label className="label" htmlFor="staff-notes">Notes</label>
          <textarea
            id="staff-notes"
            {...register('notes')}
            disabled={readOnly}
            className="input"
            rows={5}
            placeholder="Any additional information about this staff member…"
            aria-label="Additional notes"
            title="Additional notes"
          />
          {editItem && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-surface-50 rounded-xl p-3">
                <div className="text-xs text-surface-400">Created By</div>
                <div className="font-medium text-surface-700">{editItem.created_by_name || '—'}</div>
              </div>
              <div className="bg-surface-50 rounded-xl p-3">
                <div className="text-xs text-surface-400">Created On</div>
                <div className="font-medium text-surface-700">
                  {editItem.created_at ? new Date(editItem.created_at).toLocaleDateString() : '—'}
                </div>
              </div>
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-5 mt-5 border-t border-surface-100">
            <button
              type="button"
              className="btn-secondary w-full sm:w-auto justify-center"
              onClick={onClose}
              aria-label="Cancel"
              title="Cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary w-full sm:w-auto justify-center"
              disabled={save.isPending}
              aria-label={editItem ? 'Update staff member' : 'Create staff member'}
              title={editItem ? 'Update staff member' : 'Create staff member'}
            >
              {save.isPending ? 'Saving…' : editItem ? 'Update Staff' : 'Create Staff'}
            </button>
          </div>
        )}
      </form>
    </Modal>
  )
}

/* ── StaffPage ───────────────────────────────────────────────────────────── */
export default function StaffPage() {
  const { can } = usePermissions()
  const [modal, setModal] = useState<{ open: boolean; item?: any }>({ open: false })
  const { confirmState, confirm, handleClose } = useConfirm()
  const qc = useQueryClient()

  const {
    data: staff = [],
    isLoading: loadingStaff,
    isError: staffError,
  } = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await authAPI.staff()
      const raw = res.data
      return Array.isArray(raw) ? raw : (raw.results ?? [])
    },
    enabled: can.manageUsers,
  })

  const {
    data: roles = [],
    isLoading: loadingRoles,
    isError: rolesError,
  } = useQuery({
    queryKey: ['roles-dropdown'],
    queryFn: async () => {
      const res = await authAPI.rolesDropdown()
      const raw = res.data
      return Array.isArray(raw) ? raw : (raw.results ?? [])
    },
    enabled: can.manageUsers,
  })

  const deleteStaff = useMutation({
    mutationFn: (id: number) => authAPI.deleteStaff(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] })
      toast.success('Staff member deleted')
    },
  })

  const handleDelete = async (s: any) => {
    const ok = await confirm(
      'Delete staff member',
      `Are you sure you want to delete "${s.name}"? This action cannot be undone.`
    )
    if (ok) deleteStaff.mutate(s.id)
  }

  // Hooks rule: never return before all hooks above have run.
  if (!can.manageUsers) return <AccessDenied />

  const isError = staffError || rolesError

  return (
    <div>
      <div className="page-header flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div>
          <h1 className="page-title">Staff Users</h1>
          <p className="page-subtitle">Manage staff accounts and role permissions</p>
        </div>
        <button
          className="btn-primary w-full sm:w-auto justify-center"
          onClick={() => setModal({ open: true })}
          aria-label="Add new staff member"
          title="Add new staff member"
        >
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      {isError && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-danger-50 border border-danger-200 rounded-xl text-danger-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <span className="font-semibold">Could not load data.</span>
            {' '}Make sure the backend is running and you are logged in.
          </div>
        </div>
      )}

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

      {loadingStaff || loadingRoles ? (
        <PageLoader />
      ) : (
        // Horizontal scroll on narrow viewports — 8 columns won't fit a phone
        // screen, so let the table keep its layout and scroll instead.
        <div className="table-wrapper overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="table min-w-[820px] sm:min-w-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Created By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={Users}
                      title="No staff users yet"
                      description="Add your first staff member to get started"
                      action={
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => setModal({ open: true })}
                          aria-label="Add staff"
                          title="Add staff"
                        >
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
                    <td className="text-surface-400 text-sm">{s.created_by_name || '—'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn-ghost btn-sm"
                          title={s.can_manage ? 'Edit staff member' : 'View staff member (read-only)'}
                          aria-label={s.can_manage ? `Edit ${s.name}` : `View ${s.name}`}
                          onClick={() => setModal({ open: true, item: s })}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {s.can_manage && can.deleteStaff && (
                          <button
                            className="btn-ghost btn-sm text-danger-500 hover:bg-danger-50"
                            title={`Delete ${s.name}`}
                            aria-label={`Delete ${s.name}`}
                            onClick={() => handleDelete(s)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
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
        canManageThis={modal.item ? !!modal.item.can_manage : true}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        danger
        onClose={() => handleClose(false)}
        onConfirm={() => handleClose(true)}
      />
    </div>
  )
}