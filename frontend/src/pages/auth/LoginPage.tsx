import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Flame, Eye, EyeOff, Loader2 } from 'lucide-react'
import { authAPI } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'

interface LoginForm {
  email: string
  password: string
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>()

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    try {
      const res = await authAPI.login(data.email, data.password)
      setAuth(res.data.user, res.data.access, res.data.refresh)
      toast.success(`Welcome back, ${res.data.user.name}!`)
      navigate('/dashboard')
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — branding */}
      <div className="hidden lg:flex lg:flex-col lg:w-[480px] bg-brand-950 text-white p-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] rounded-full bg-brand-700/20 blur-3xl" />
          <div className="absolute bottom-[-20%] right-[-20%] w-[400px] h-[400px] rounded-full bg-brand-500/20 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold">GasBill</span>
          </div>

          <div className="mt-auto">
            <h1 className="text-4xl font-bold leading-tight mb-4">
              Utility Billing<br />Made Simple
            </h1>
            <p className="text-brand-300 text-lg leading-relaxed">
              Manage gas billing for all your projects, buildings, and units from a single
              powerful dashboard.
            </p>

            <div className="mt-12 grid grid-cols-2 gap-4">
              {[
                ['Multi-project',  'Manage multiple housing projects'],
                ['Real-time',      'Instant billing calculations'],
                ['bKash / SSL',    'Integrated payment gateways'],
                ['Audit Trail',    'Full change history'],
              ].map(([title, desc]) => (
                <div key={title} className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="text-sm font-semibold mb-1">{title}</div>
                  <div className="text-xs text-brand-300">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-surface-50">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="lg:hidden flex items-center gap-2 mb-6">
              <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
                <Flame className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-surface-900">GasBill</span>
            </div>
            <h2 className="text-2xl font-bold text-surface-900">Sign in</h2>
            <p className="text-surface-500 mt-1 text-sm">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">Email address</label>
              <input
                {...register('email', { required: 'Email is required' })}
                type="email"
                className={`input ${errors.email ? 'input-error' : ''}`}
                placeholder="admin@gasbill.com"
                autoFocus
              />
              {errors.email && (
                <p className="text-xs text-danger-600 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  {...register('password', { required: 'Password is required' })}
                  type={showPassword ? 'text' : 'password'}
                  className={`input pr-10 ${errors.password ? 'input-error' : ''}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-danger-600 mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full btn-lg mt-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="text-xs text-surface-400 text-center mt-8">
            GasBill Utility Billing System v1.0
          </p>
        </div>
      </div>
    </div>
  )
}
