import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Building,
  Home,
  FileText,
  CreditCard,
  BarChart3,
  LogOut,
  User,
  Menu,
  X,
  Flame,
  Users,
  Layers,
  Gauge,
  ShieldCheck,
  Clock,
  Wallet,
} from "lucide-react";
import { cn } from "@/utils/helpers";
import { useAuthStore } from "@/store/authStore";
import { usePermissions } from "@/hooks/usePermissions";
import { authAPI, paymentsAPI } from "@/api/client";
import { PageLoader } from "@/components/ui";
import toast from "react-hot-toast";

const ROLE_COLOR: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  admin: "bg-blue-100 text-blue-700",
  billing_staff: "bg-amber-100 text-amber-700",
  accountant: "bg-emerald-100 text-emerald-700",
  viewer: "bg-gray-100 text-gray-500",
};

export default function AppLayout() {
  // `open` = desktop/tablet expanded-vs-icon-rail state (md and up)
  const [open, setOpen] = useState(true);
  // `mobileOpen` = mobile off-canvas drawer state (below md)
  const [mobileOpen, setMobileOpen] = useState(false);

  const { user, clearAuth, refresh_token } = useAuthStore();
  const { can, isLoading } = usePermissions();
  const navigate = useNavigate();

  // Single source of truth — matches backend PaymentWritePermission exactly,
  // instead of duplicating the role-string comparison here separately.
  const canApprovePayments = can.approvePayments;

  const { data: pendingData } = useQuery({
    queryKey: ["payments-pending-count"],
    queryFn: () => paymentsAPI.pending().then((r) => r.data),
    enabled: canApprovePayments,
    refetchInterval: 60_000,
  });

  const pendingCount = pendingData?.count ?? pendingData?.results?.length ?? 0;

  if (isLoading) return <PageLoader />;

  const handleLogout = async () => {
    try {
      if (refresh_token) await authAPI.logout(refresh_token);
    } catch {}
    clearAuth();
    navigate("/login");
    toast.success("Logged out");
  };

  // Close the mobile drawer whenever a nav link is tapped
  const handleNavClick = () => setMobileOpen(false);

  // Build nav items filtered by permission
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard", show: can.viewDashboard },
    { icon: Layers, label: "Projects", path: "/projects", show: can.viewProjects },
    { icon: Building, label: "Buildings", path: "/buildings", show: can.viewBuildings },
    { icon: Home, label: "Units", path: "/units", show: can.viewBuildings },
    { icon: Gauge, label: "Meters", path: "/meters", show: can.viewMeters },
    { icon: Flame, label: "Quick Reading", path: "/meters/quick-reading", show: can.recordReading },
    { icon: FileText, label: "Billing", path: "/billing", show: can.viewBills },
    { icon: CreditCard, label: "Payments", path: "/payments", show: can.viewPayments },
    {
      icon: Clock,
      label: "Pending Approvals",
      path: "/payments/pending",
      show: canApprovePayments,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    { icon: BarChart3, label: "Reports", path: "/reports", show: can.viewReports },
  ].filter((i) => i.show);

  const settingsItems = [
    { icon: Users, label: "Staff Users", path: "/settings/staff", show: can.manageUsers },
    { icon: ShieldCheck, label: "Roles & RBAC", path: "/settings/roles", show: can.manageRBAC },
    { icon: Wallet, label: "Payment Channels", path: "/settings/payment-channels", show: can.viewSystemSettings },
  ].filter((i) => i.show);

  const roleName = user?.role?.role_name ?? "";

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50">
      {/* ── Mobile backdrop ── */}
      <div
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 bg-black/40 z-40 transition-opacity duration-200 md:hidden",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        aria-hidden="true"
      />

      {/* ── Sidebar ──
          Mobile (<md):  fixed off-canvas drawer, slides in/out via translate-x
          Tablet/Desktop (>=md): static in-flow sidebar, width toggles via `open`
      */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-surface-100",
          "transition-all duration-200 shrink-0 w-64",
          "md:static md:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0",
          open ? "md:w-64" : "md:w-[72px]"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-surface-100 shrink-0">
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <img
              src="/branding/deco-logo.png"
              alt="DECO Limited"
              className="w-full h-full object-contain"
            />
          </div>

          {(open || mobileOpen) && (
            <div className="animate-fadeIn flex-1 min-w-0 md:hidden md:flex-none md:min-w-0" style={{ display: undefined }}>
              {/* shown on mobile always (drawer is full-width), and on md+ only when `open` */}
            </div>
          )}

          {/* Simplify: show text label when either mobile drawer is the active view, or desktop/tablet is expanded */}
          <div className={cn("animate-fadeIn min-w-0", !open && "md:hidden")}>
            <div className="text-base font-bold text-surface-900 leading-none truncate">
              DECO
            </div>
            <div className="text-[11px] text-surface-400 mt-0.5 truncate">
              Utility Billing
            </div>
          </div>

          {/* Mobile-only close (X) button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="btn-ghost btn-sm !p-1.5 ml-auto md:hidden"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {navItems.map(({ icon: Icon, label, path, badge }) => (
            <NavLink
              key={path}
              to={path}
              onClick={handleNavClick}
              title={!open ? label : undefined}
              className={({ isActive }) =>
                cn("sidebar-link relative", isActive && "active")
              }
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {/* Label always visible on mobile drawer; on md+ only when expanded */}
              <span className={cn("animate-fadeIn truncate flex-1", !open && "md:hidden")}>
                {label}
              </span>
              {badge !== undefined && (
                <span
                  className={cn(
                    "bg-danger-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0",
                    !open && "md:absolute md:top-1 md:right-1"
                  )}
                >
                  {badge}
                </span>
              )}
            </NavLink>
          ))}

          {settingsItems.length > 0 && (
            <div className="pt-4">
              <div className={cn("px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-surface-400", !open && "md:hidden")}>
                Settings
              </div>
              {settingsItems.map(({ icon: Icon, label, path }) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={handleNavClick}
                  title={!open ? label : undefined}
                  className={({ isActive }) =>
                    cn("sidebar-link", isActive && "active")
                  }
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span className={cn("animate-fadeIn truncate", !open && "md:hidden")}>
                    {label}
                  </span>
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        {/* User footer */}
        <div className="border-t border-surface-100 p-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-brand-600" />
            </div>
            <div className={cn("flex-1 min-w-0 animate-fadeIn", !open && "md:hidden")}>
              <div className="text-sm font-semibold text-surface-800 truncate">
                {user?.name}
              </div>
              <span
                className={cn(
                  "badge text-[10px] mt-0.5 capitalize",
                  ROLE_COLOR[roleName] ?? "badge-gray",
                )}
              >
                {roleName.replace("_", " ")}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className={cn("btn-ghost btn-sm !p-1.5 shrink-0", !open && "md:hidden")}
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="h-16 bg-white border-b border-surface-100 flex items-center gap-4 px-6 shrink-0">
          {/* Mobile hamburger — opens the drawer */}
          <button
            onClick={() => setMobileOpen(true)}
            className="btn-ghost btn-sm !p-2 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Desktop/tablet collapse toggle */}
          <button
            onClick={() => setOpen(!open)}
            className="hidden md:inline-flex btn-ghost btn-sm !p-2"
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          <div className="flex-1" />
          <div className="text-sm text-surface-400">
            {new Date().toLocaleDateString("en-BD", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto animate-fadeIn">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}