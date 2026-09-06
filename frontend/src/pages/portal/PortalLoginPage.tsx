import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, ArrowLeft, ArrowRight, Briefcase,
} from 'lucide-react'
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
    <div className="min-h-screen flex bg-surface-50">
      {/* ── Left — branding (identical treatment to staff LoginPage) ───────── */}
      <div
        className="hidden lg:flex lg:flex-col lg:w-[480px] relative overflow-hidden text-white p-12"
        style={{ background: '#111827' }}
      >
        {/* Colored ambient glow */}
        <div className="absolute inset-0">
          <div
            className="absolute top-0 left-0 w-96 h-96 rounded-full blur-[120px]"
            style={{ background: '#0A8A43', opacity: 0.35 }}
          />
          <div
            className="absolute top-20 right-0 w-80 h-80 rounded-full blur-[120px]"
            style={{ background: '#E31B23', opacity: 0.25 }}
          />
          <div
            className="absolute bottom-0 left-20 w-80 h-80 rounded-full blur-[120px]"
            style={{ background: '#3F3A8C', opacity: 0.35 }}
          />
          <div
            className="absolute bottom-0 right-0 w-72 h-72 rounded-full blur-[120px]"
            style={{ background: '#F28C28', opacity: 0.3 }}
          />
        </div>

        {/* Grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10 flex flex-col h-full">
          {/* Logo — DECO + DTEL side by side, one row */}
          <div className="inline-flex w-fit items-center gap-3 bg-white rounded-2xl px-4 py-2 shadow-2xl shadow-black/30">
            <img
              src="/branding/deco-logo.png"
              alt="DECO Limited"
              className="h-9 w-auto object-contain"
            />
            <div className="w-px h-7 bg-surface-200" />
            <img
              src="/branding/dtel-logo.jpeg"
              alt="DTEL"
              className="h-9 w-auto object-contain"
            />
          </div>

          <div className="mt-auto">
            <span
              className="inline-block text-[11px] font-semibold tracking-[0.2em] uppercase mb-3"
              style={{ color: '#F28C28' }}
            >
              Resident Portal
            </span>

            <h1 className="text-4xl font-bold leading-[1.15] mb-4 tracking-tight">
              Your bills,
              <br />
              <span style={{ color: '#F28C28' }}>always at hand.</span>
            </h1>

            <p className="text-white/75 text-base leading-relaxed max-w-[360px]">
              Check your gas usage, view bills, and pay online — anytime,
              from anywhere.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-4">
              {[2, 3, 4, 5].map((num) => (
                <div
                  key={num}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm hover:scale-[1.02] transition-all duration-300"
                >
                  <img
                    src={`/branding/${num}.png`}
                    alt={`Feature ${num}`}
                    className="w-full h-36 object-cover"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-10 text-xs text-white/50">
            © {new Date().getFullYear()} DECO Limited — For Better Future
          </div>
        </div>
      </div>

      {/* ── Right — form ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo — DECO + DTEL, same row */}
          <div className="lg:hidden flex items-center justify-center mb-8">
            <div className="flex items-center gap-3 bg-white rounded-2xl px-5 py-3 shadow-card border border-surface-100">
              <img
                src="/branding/deco-logo.png"
                alt="DECO Limited"
                className="h-8 w-auto object-contain"
              />
              <div className="w-px h-6 bg-surface-200" />
              <img
                src="/branding/dtel-logo.jpeg"
                alt="DTEL"
                className="h-8 w-auto object-contain"
              />
            </div>
          </div>

          {mode === 'password' && (
            <>
              <div className="mb-8">
                <span className="inline-block text-[11px] font-semibold tracking-[0.2em] uppercase text-brand-500 mb-2">
                  Resident Sign In
                </span>
                <h2 className="text-2xl font-bold text-surface-900">Welcome back</h2>
                <p className="text-surface-500 mt-1 text-sm">
                  New here? Get your credentials from DECO admins.
                </p>
              </div>

              <form onSubmit={loginWithPassword} className="space-y-5">
                <div>
                  <label className="label" htmlFor="portal-mobile">Mobile Number</label>
                  <input
                    id="portal-mobile"
                    type="tel"
                    inputMode="numeric"
                    className="input"
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
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full btn-lg mt-2 group"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
                    </>
                  ) : (
                    <>
                      Sign in{' '}
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
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
            </>
          )}

          {mode === 'otp-mobile' && (
            <>
              <button
                type="button"
                onClick={switchToPassword}
                className="text-xs text-surface-400 flex items-center gap-1 hover:text-surface-600 mb-6"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to password sign in
              </button>
              <div className="mb-8">
                <span className="inline-block text-[11px] font-semibold tracking-[0.2em] uppercase text-brand-500 mb-2">
                  Sign In With OTP
                </span>
                <h2 className="text-2xl font-bold text-surface-900">Verify it's you</h2>
                <p className="text-surface-500 mt-1 text-sm">
                  We'll send a one-time code to your mobile number
                </p>
              </div>

              <form onSubmit={requestOTP} className="space-y-5">
                <div>
                  <label className="label" htmlFor="portal-otp-mobile">Mobile Number</label>
                  <input
                    id="portal-otp-mobile"
                    type="tel"
                    inputMode="numeric"
                    className="input"
                    placeholder="01XXXXXXXXX"
                    value={mobile}
                    onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full btn-lg mt-2 group"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Sending…
                    </>
                  ) : (
                    <>
                      Send OTP{' '}
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {mode === 'otp-code' && (
            <>
              <button
                type="button"
                onClick={() => setMode('otp-mobile')}
                className="text-xs text-surface-400 flex items-center gap-1 hover:text-surface-600 mb-6"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Change number
              </button>
              <div className="mb-8">
                <span className="inline-block text-[11px] font-semibold tracking-[0.2em] uppercase text-brand-500 mb-2">
                  Verification
                </span>
                <h2 className="text-2xl font-bold text-surface-900">Enter your code</h2>
                <p className="text-surface-500 mt-1 text-sm">
                  Sent to <span className="font-mono font-medium text-surface-700">{mobile}</span>
                </p>
              </div>

              {debugOtp && (
                <div className="bg-warning-50 text-warning-700 text-xs rounded-lg px-3 py-2 text-center mb-4">
                  Dev mode — OTP: <span className="font-mono font-bold">{debugOtp}</span>
                </div>
              )}

              <form onSubmit={verifyOTP} className="space-y-5">
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
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full btn-lg mt-2 group"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
                    </>
                  ) : (
                    <>
                      Verify &amp; Sign In{' '}
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
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
            </>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-surface-200" />
            <span className="text-xs text-surface-400 font-medium">or</span>
            <div className="flex-1 h-px bg-surface-200" />
          </div>

          {/* Staff entry — same card-button treatment as the staff login
              page's "Resident Portal" cross-link, just pointed the other
              way. */}
          <button
            type="button"
            onClick={() => navigate('/staff/login')}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white border border-surface-200 hover:border-brand-300 hover:shadow-card transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0 group-hover:bg-brand-100 transition-colors">
              <Briefcase className="w-5 h-5" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-semibold text-surface-800">Staff Sign In</div>
              <div className="text-xs text-surface-400">Access the billing dashboard</div>
            </div>
            <ArrowRight className="w-4 h-4 text-surface-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
          </button>

          <p className="text-xs text-surface-400 text-center mt-8">
            Having trouble? Contact your building management office.
          </p>
        </div>
      </div>
    </div>
  )
}