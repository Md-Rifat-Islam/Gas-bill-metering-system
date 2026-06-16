import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { User, Phone, Mail, LogOut, Save, Loader2 } from 'lucide-react'
import { portalAPI } from '@/api/portalClient'
import { PageLoader } from '@/components/ui'
import { useCustomerAuthStore } from '@/store/customerAuthStore'
import toast from 'react-hot-toast'

interface ProfileForm {
  name: string
  email: string
}

export default function PortalProfilePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { clearAuth, setCustomer } = useCustomerAuthStore()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['portal-me'],
    queryFn: () => portalAPI.me().then(r => r.data),
  })

  const { register, handleSubmit, formState: { isDirty } } = useForm<ProfileForm>({
    values: profile ? { name: profile.name || '', email: profile.email || '' } : undefined,
  })

  const save = useMutation({
    mutationFn: (data: ProfileForm) => portalAPI.updateMe(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['portal-me'] })
      setCustomer(res.data)
      toast.success('Profile updated')
    },
  })

  const handleLogout = () => {
    clearAuth()
    navigate('/portal/login')
  }

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-surface-900">My Profile</h1>
        <p className="text-sm text-surface-400">View and update your account details</p>
      </div>

      {/* Avatar */}
      <div className="card flex flex-col items-center !py-6">
        <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center mb-3">
          <User className="w-8 h-8 text-brand-500" />
        </div>
        <div className="font-semibold text-surface-900">{profile?.name || 'Resident'}</div>
        <div className="text-xs text-surface-400 font-mono flex items-center gap-1 mt-1">
          <Phone className="w-3 h-3" /> {profile?.mobile}
        </div>
      </div>

      {/* Editable fields */}
      <form onSubmit={handleSubmit(d => save.mutate(d))} className="card space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input {...register('name')} className="input" placeholder="Your name" />
        </div>
        <div>
          <label className="label flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" /> Email
          </label>
          <input {...register('email')} type="email" className="input" placeholder="you@example.com" />
        </div>
        <div>
          <label className="label">Mobile Number</label>
          <input value={profile?.mobile || ''} disabled className="input bg-surface-50 text-surface-400 font-mono" aria-label="Mobile number" />
          <p className="text-xs text-surface-400 mt-1">Mobile number cannot be changed. Contact the office to update it.</p>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={!isDirty || save.isPending}>
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </form>

      {/* Logout */}
      <button onClick={handleLogout} className="btn-secondary w-full text-danger-600 border-danger-200 hover:bg-danger-50">
        <LogOut className="w-4 h-4" /> Sign Out
      </button>
    </div>
  )
}
