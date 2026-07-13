import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import {
  Eye,
  EyeOff,
  Loader2,
  Users,
  ArrowRight,
  Gauge,
  ShieldCheck,
  Wallet,
  History,
} from "lucide-react";
import { authAPI } from "@/api/client";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";

interface LoginForm {
  email: string;
  password: string;
}

const FEATURES = [
  {
    icon: Gauge,
    title: "Multi-project",
    desc: "Manage every project, building & unit from one place",
  },
  {
    icon: Wallet,
    title: "Real-time",
    desc: "Instant, accurate billing calculations",
  },
  {
    icon: ShieldCheck,
    title: "bKash / SSL",
    desc: "Secure, integrated payment gateways",
  },
  {
    icon: History,
    title: "Audit Trail",
    desc: "Complete, tamper-proof change history",
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const res = await authAPI.login(data.email, data.password);
      setAuth(res.data.user, res.data.access, res.data.refresh);
      toast.success(`Welcome back, ${res.data.user.name}!`);
      navigate("/dashboard");
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-surface-50">
      {/* ── Left — branding ─────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:flex-col lg:w-[480px] relative overflow-hidden text-white p-12"
        style={{
          background: "#111827",
        }}
      >
        {/* Colored ambient glow */}
        <div className="absolute inset-0">
          <div
            className="absolute top-0 left-0 w-96 h-96 rounded-full blur-[120px]"
            style={{ background: "#0A8A43", opacity: 0.35 }}
          />

          <div
            className="absolute top-20 right-0 w-80 h-80 rounded-full blur-[120px]"
            style={{ background: "#E31B23", opacity: 0.25 }}
          />

          <div
            className="absolute bottom-0 left-20 w-80 h-80 rounded-full blur-[120px]"
            style={{ background: "#3F3A8C", opacity: 0.35 }}
          />

          <div
            className="absolute bottom-0 right-0 w-72 h-72 rounded-full blur-[120px]"
            style={{ background: "#F28C28", opacity: 0.3 }}
          />
        </div>

        {/* Grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative z-10 flex flex-col h-full">
          {/* Logo */}
          <div className="inline-flex w-fit bg-white rounded-2xl px-2 py-2 shadow-2xl shadow-black/30">
            <img
              src="/branding/deco-logo.png"
              alt="DECO Limited"
              className="h-9 w-auto object-contain"
            />
          </div>

          <div className="mt-auto">
            <span
              className="inline-block text-[11px] font-semibold tracking-[0.2em] uppercase mb-3"
              style={{ color: "#F28C28" }}
            >
              Utility Billing Platform
            </span>

            <h1 className="text-4xl font-bold leading-[1.15] mb-4 tracking-tight">
              Gas billing,
              <br />
              <span style={{ color: "#F28C28" }}>made effortless.</span>
            </h1>

            <p className="text-white/75 text-base leading-relaxed max-w-[360px]">
              One dashboard to meter, bill, and collect — across every project,
              building, and resident.
            </p>

            {/* <div className="mt-10 grid grid-cols-2 gap-3">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="bg-white/[0.06] rounded-2xl p-4 border border-white/10 backdrop-blur-sm hover:bg-white/[0.09] transition-colors"
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5"
              style={{
                background: 'rgba(242,140,40,0.15)',
              }}
            >
              <Icon
                className="w-4 h-4"
                style={{ color: '#F28C28' }}
              />
            </div>

            <div className="text-sm font-semibold mb-0.5">
              {title}
            </div>

            <div className="text-xs text-white/60 leading-snug">
              {desc}
            </div>
          </div>
        ))}
      </div> */}
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
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center mb-8">
            <div className="bg-white rounded-2xl px-5 py-3 shadow-card border border-surface-100">
              <img
                src="/branding/deco-logo.png"
                alt="DECO Limited"
                className="h-8 w-auto object-contain"
              />
            </div>
          </div>

          <div className="mb-8">
            <span className="inline-block text-[11px] font-semibold tracking-[0.2em] uppercase text-brand-500 mb-2">
              Staff Sign In
            </span>
            <h2 className="text-2xl font-bold text-surface-900">
              Welcome back
            </h2>
            <p className="text-surface-500 mt-1 text-sm">
              Sign in to access the billing dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">Email address</label>
              <input
                {...register("email", { required: "Email is required" })}
                type="email"
                className={`input ${errors.email ? "input-error" : ""}`}
                placeholder="admin@deco.com"
                autoFocus
              />
              {errors.email && (
                <p className="text-xs text-danger-600 mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  {...register("password", {
                    required: "Password is required",
                  })}
                  type={showPassword ? "text" : "password"}
                  className={`input pr-10 ${errors.password ? "input-error" : ""}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-danger-600 mt-1">
                  {errors.password.message}
                </p>
              )}
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
                  Sign in{" "}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-surface-200" />
            <span className="text-xs text-surface-400 font-medium">or</span>
            <div className="flex-1 h-px bg-surface-200" />
          </div>

          {/* Customer Portal entry */}
          <button
            type="button"
            onClick={() => navigate("/portal/login")}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white border border-surface-200 hover:border-brand-300 hover:shadow-card transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0 group-hover:bg-brand-100 transition-colors">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-semibold text-surface-800">
                Resident Portal
              </div>
              <div className="text-xs text-surface-400">
                View your bills &amp; make payments
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-surface-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
          </button>

          <p className="text-xs text-surface-400 text-center mt-8">
            DECO Utility Billing System v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
