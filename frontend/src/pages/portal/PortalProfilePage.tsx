import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { User, Phone, Mail, LogOut, Save, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { portalAPI, portalAuthAPI } from '@/api/portalClient'
import { PageLoader } from '@/components/ui'
import { useCustomerAuthStore } from '@/store/customerAuthStore'
import toast from 'react-hot-toast'

interface ProfileForm {
  name: string
  email: string
}

/* ── Change Password card — OTP-gated self-service flow ─────────────────── */
function ChangePasswordCard() {
  const [step, setStep] = useState<'idle' | 'otp-sent'>('idle')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [debugOtp, setDebugOtp] = useState<string | null>(null)

  const requestOtp = useMutation({
    mutationFn: () => portalAuthAPI.requestPasswordChangeOTP(),
    onSuccess: (res) => {
      toast.success('OTP sent to your registered mobile number')
      if (res.data?.debug_otp) setDebugOtp(res.data.debug_otp)
      setStep('otp-sent')
    },
    onError: () => toast.error('Could not send OTP. Please try again.'),
  })

  const changePassword = useMutation({
    mutationFn: () => portalAuthAPI.changePassword(otp, newPassword),
    onSuccess: () => {
      toast.success('Password updated successfully')
      setStep('idle')
      setOtp('')
      setNewPassword('')
      setConfirmPassword('')
      setDebugOtp(null)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.otp_code?.[0] || err.response?.data?.detail || 'Could not update password')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length !== 6) {
      toast.error('Enter the 6-digit OTP')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    changePassword.mutate()
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-brand-500" />
        <div className="text-sm font-semibold text-surface-800">Change Password</div>
      </div>

      {step === 'idle' ? (
        <>
          <p className="text-xs text-surface-400">
            We'll send a one-time code to your registered mobile number to confirm it's you.
          </p>
          <button
            type="button"
            className="btn-secondary w-full justify-center"
            onClick={() => requestOtp.mutate()}
            disabled={requestOtp.isPending}
          >
            {requestOtp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Send OTP
          </button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {debugOtp && (
            <div className="bg-warning-50 text-warning-700 text-xs rounded-lg px-3 py-2 text-center">
              Dev mode — OTP: <span className="font-mono font-bold">{debugOtp}</span>
            </div>
          )}
          <div>
            <label className="label">6-digit OTP</label>
            <input
              type="text"
              inputMode="numeric"
              className="input text-center font-mono text-xl tracking-[0.4em]"
              placeholder="------"
              maxLength={6}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
            />
          </div>
          <div>
            <label className="label">New Password</label>
            <input
              type="password"
              className="input"
              placeholder="Min 6 characters"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input
              type="password"
              className="input"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-secondary flex-1 justify-center"
              onClick={() => { setStep('idle'); setOtp(''); setNewPassword(''); setConfirmPassword(''); setDebugOtp(null) }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1 justify-center"
              disabled={changePassword.isPending}
            >
              {changePassword.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Password'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => requestOtp.mutate()}
            className="text-xs text-brand-600 hover:underline w-full text-center"
            disabled={requestOtp.isPending}
          >
            Resend OTP
          </button>
        </form>
      )}
    </div>
  )
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

      <ChangePasswordCard />

      {/* Logout */}
      <button onClick={handleLogout} className="btn-secondary w-full text-danger-600 border-danger-200 hover:bg-danger-50">
        <LogOut className="w-4 h-4" /> Sign Out
      </button>
    </div>
  )
}