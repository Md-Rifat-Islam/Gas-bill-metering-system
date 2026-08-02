import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, ShieldCheck, Lock, Loader2, ArrowLeft } from 'lucide-react'
import { portalAuthAPI } from '@/api/portalClient'
import { useCustomerAuthStore } from '@/store/customerAuthStore'
import toast from 'react-hot-toast'

type Mode = 'password' | 'otp-mobile' | 'otp-code'

export default function PortalLoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useCustomerAuthStore()

  const [mode, setMode] = useState<Mode>('password')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [debugOtp, setDebugOtp] = useState<string | null>(null)

  const validMobile = (m: string) => /^01[3-9]\d{8}$/.test(m)

  /* ── Password login (primary) ───────────────────────────────────────── */
  const loginWithPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validMobile(mobile)) {
      toast.error('Enter a valid Bangladeshi mobile number (e.g. 01712345678)')
      return
    }
    if (!password) {
      toast.error('Enter your password')
      return
    }
    setLoading(true)
    try {
      const res = await portalAuthAPI.loginWithPassword(mobile, password)
      setAuth(res.data.customer, res.data.access, res.data.refresh)
      toast.success(`Welcome${res.data.customer.name ? ', ' + res.data.customer.name : ''}!`)
      navigate('/portal/dashboard')
    } catch (err: any) {
      toast.error(err.response?.data?.non_field_errors?.[0] || err.response?.data?.detail || 'Invalid mobile number or password')
    } finally {
      setLoading(false)
    }
  }

  /* ── OTP login (fallback) ───────────────────────────────────────────── */
  const requestOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validMobile(mobile)) {
      toast.error('Enter a valid Bangladeshi mobile number (e.g. 01712345678)')
      return
    }
    setLoading(true)
    try {
      const res = await portalAuthAPI.requestOTP(mobile)
      toast.success('OTP sent to your mobile')
      if (res.data?.debug_otp) setDebugOtp(res.data.debug_otp)
      setMode('otp-code')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const verifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length !== 6) {
      toast.error('Enter the 6-digit OTP')
      return
    }
    setLoading(true)
    try {
      const res = await portalAuthAPI.verifyOTP(mobile, otp)
      setAuth(res.data.customer, res.data.access, res.data.refresh)
      toast.success(`Welcome${res.data.customer.name ? ', ' + res.data.customer.name : ''}!`)
      navigate('/portal/dashboard')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid or expired OTP')
    } finally {
      setLoading(false)
    }
  }

  const switchToOtp = () => {
    setMode('otp-mobile')
    setPassword('')
    setDebugOtp(null)
  }

  const switchToPassword = () => {
    setMode('password')
    setOtp('')
    setDebugOtp(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="inline-flex w-fit bg-white rounded-2xl px-2 py-2 shadow-2xl shadow-black/30">
            <img
              src="/branding/deco-logo.png"
              alt="DECO Limited"
              className="h-9 w-auto object-contain"
            />
          </div>
          <p className="text-sm text-surface-400 mt-1">Resident Portal</p>
        </div>

        <div className="card">
          {mode === 'password' && (
            <form onSubmit={loginWithPassword} className="space-y-4">
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-6 h-6 text-brand-500" />
                </div>
                <h2 className="font-semibold text-surface-900">Sign in</h2>
                <p className="text-xs text-surface-400 mt-1">
                  New here? Your password is your mobile number, until you change it.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="portal-mobile">Mobile Number</label>
                <input
                  id="portal-mobile"
                  type="tel"
                  inputMode="numeric"
                  className="input text-center font-mono text-lg tracking-wider"
                  placeholder="01XXXXXXXXX"
                  value={mobile}
                  onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  autoFocus
                />
              </div>
              <div>
                <label className="label" htmlFor="portal-password">Password</label>
                <input
                  id="portal-password"
                  type="password"
                  className="input"
                  placeholder="Your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary w-full btn-lg" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={switchToOtp}
                className="text-xs text-brand-600 hover:underline w-full text-center"
                disabled={loading}
              >
                Forgot your password? Sign in with OTP instead
              </button>
            </form>
          )}

          {mode === 'otp-mobile' && (
            <form onSubmit={requestOTP} className="space-y-4">
              <button
                type="button"
                onClick={switchToPassword}
                className="text-xs text-surface-400 flex items-center gap-1 hover:text-surface-600"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to password sign in
              </button>
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-3">
                  <Phone className="w-6 h-6 text-brand-500" />
                </div>
                <h2 className="font-semibold text-surface-900">Sign in with OTP</h2>
                <p className="text-xs text-surface-400 mt-1">
                  We'll send a one-time code to verify it's you
                </p>
              </div>
              <div>
                <label className="label" htmlFor="portal-otp-mobile">Mobile Number</label>
                <input
                  id="portal-otp-mobile"
                  type="tel"
                  inputMode="numeric"
                  className="input text-center font-mono text-lg tracking-wider"
                  placeholder="01XXXXXXXXX"
                  value={mobile}
                  onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-primary w-full btn-lg" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send OTP'}
              </button>
            </form>
          )}

          {mode === 'otp-code' && (
            <form onSubmit={verifyOTP} className="space-y-4">
              <button
                type="button"
                onClick={() => setMode('otp-mobile')}
                className="text-xs text-surface-400 flex items-center gap-1 hover:text-surface-600"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Change number
              </button>
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck className="w-6 h-6 text-brand-500" />
                </div>
                <h2 className="font-semibold text-surface-900">Enter verification code</h2>
                <p className="text-xs text-surface-400 mt-1">
                  Sent to <span className="font-mono font-medium text-surface-600">{mobile}</span>
                </p>
              </div>
              {debugOtp && (
                <div className="bg-warning-50 text-warning-700 text-xs rounded-lg px-3 py-2 text-center">
                  Dev mode — OTP: <span className="font-mono font-bold">{debugOtp}</span>
                </div>
              )}
              <div>
                <label className="label" htmlFor="portal-otp-code">6-digit OTP</label>
                <input
                  id="portal-otp-code"
                  type="text"
                  inputMode="numeric"
                  className="input text-center font-mono text-2xl tracking-[0.5em]"
                  placeholder="------"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-primary w-full btn-lg" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Sign In'}
              </button>
              <button
                type="button"
                onClick={requestOTP as any}
                className="text-xs text-brand-600 hover:underline w-full text-center"
                disabled={loading}
              >
                Resend OTP
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-surface-400 text-center mt-6">
          Having trouble? Contact your building management office.
        </p>
      </div>
    </div>
  )
}