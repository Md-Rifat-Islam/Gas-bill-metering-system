import { useState, useRef, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  User,
  LogOut,
  Bell,
  Receipt,
  Clock,
  CheckCheck,
  Building2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/utils/helpers";
import { useCustomerAuthStore, type PortalUnit } from "@/store/customerAuthStore";
import { portalAPI } from "@/api/portalClient";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Home", path: "/portal/dashboard" },
  { icon: FileText, label: "Bills", path: "/portal/bills" },
  { icon: CreditCard, label: "Payments", path: "/portal/payments" },
  { icon: User, label: "Profile", path: "/portal/profile" },
];

const NOTIFICATION_ICON: Record<string, any> = {
  bill_created: Receipt,
  reminder_5: Clock,
  reminder_10: Clock,
};

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["portal-notifications"],
    queryFn: async () => {
      const res = await portalAPI.notifications();
      const raw = res.data;
      return Array.isArray(raw) ? raw : (raw.results ?? []);
    },
    refetchInterval: 60_000,
  });
  const notifications = data ?? [];
  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  const markRead = useMutation({
    mutationFn: (id: number) => portalAPI.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => portalAPI.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal-notifications"] }),
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleClickNotification = (n: any) => {
    if (!n.is_read) markRead.mutate(n.id);
    setOpen(false);
    if (n.bill) navigate(`/portal/bills/${n.bill}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost btn-sm !p-2 relative"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-danger-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl shadow-card-hover border border-surface-100 z-30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
            <span className="text-sm font-semibold text-surface-800">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-brand-600 font-medium flex items-center gap-1 hover:text-brand-700"
                aria-label="Mark all as read"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-surface-400">
                No notifications yet
              </div>
            ) : (
              notifications.map((n: any) => {
                const Icon = NOTIFICATION_ICON[n.notification_type] ?? Bell;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClickNotification(n)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-surface-50 cursor-pointer hover:bg-surface-50 transition-colors",
                      !n.is_read && "bg-brand-50/40"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                        n.is_read ? "bg-surface-100 text-surface-400" : "bg-brand-100 text-brand-600"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-sm", !n.is_read ? "font-semibold text-surface-900" : "font-medium text-surface-600")}>
                        {n.title}
                      </div>
                      <div className="text-xs text-surface-400 mt-0.5 line-clamp-2">{n.message}</div>
                      <div className="text-[11px] text-surface-300 mt-1">{timeAgo(n.created_at)}</div>
                    </div>
                    {!n.is_read && <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Only rendered once we already know (from the units list) that this
// customer has more than one flat — a single-unit customer never sees
// this at all, so nothing changes for them.
function UnitSwitcher({ units }: { units: PortalUnit[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { selectedUnit, setSelectedUnit } = useCustomerAuthStore();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleSelect = (unit: PortalUnit) => {
    setSelectedUnit(unit);
    setOpen(false);
    // Every screen's data (dashboard totals, bill list, payment list) is
    // scoped by unit, so switching flats invalidates everything rather
    // than trying to enumerate each affected query key individually.
    qc.invalidateQueries();
  };

  if (!selectedUnit) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-semibold text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-lg px-2.5 py-1.5 transition-colors"
        title="Switch flat"
      >
        <Building2 className="w-3.5 h-3.5" />
        {selectedUnit.unit_no}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-card-hover border border-surface-100 z-30 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-surface-100 text-xs font-semibold text-surface-500 uppercase tracking-wider">
            Your units
          </div>
          {units.map((unit) => (
            <button
              key={unit.id}
              onClick={() => handleSelect(unit)}
              className={cn(
                "w-full text-left px-4 py-2.5 text-sm hover:bg-surface-50 transition-colors",
                unit.id === selectedUnit.id
                  ? "font-semibold text-brand-600 bg-brand-50/60"
                  : "text-surface-700"
              )}
            >
              <div>Unit {unit.unit_no} · Floor {unit.floor_no}</div>
              <div className="text-xs text-surface-400">{unit.building_name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PortalLayout() {
  const { customer, clearAuth, selectedUnit, setSelectedUnit } = useCustomerAuthStore();
  const navigate = useNavigate();

  const { data: units } = useQuery({
    queryKey: ["portal-units"],
    queryFn: () => portalAPI.myUnits().then((r) => r.data as PortalUnit[]),
    enabled: !!customer,
  });

  // Resolves unit selection on mount/whenever the units list loads:
  //   - exactly 1 unit  -> auto-select it silently (covers both a brand
  //     new single-flat customer, and anyone already logged in from
  //     before this feature shipped, whose persisted state has no
  //     selectedUnit yet)
  //   - more than 1 unit and none chosen yet -> send them to the picker
  //     instead of quietly showing merged, ambiguous data
  useEffect(() => {
    if (!units || selectedUnit) return;
    if (units.length === 1) {
      setSelectedUnit(units[0]);
    } else if (units.length > 1) {
      navigate("/portal/select-unit", { replace: true });
    }
  }, [units, selectedUnit, setSelectedUnit, navigate]);

  const handleLogout = () => {
    clearAuth();
    navigate("/portal/login");
  };

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-surface-100 px-4 h-16 flex items-center gap-3 sticky top-0 z-20">
        {/* Logo */}
        <div className="w-10 h-10 flex items-center justify-center shrink-0">
          <img
            src="/branding/deco-logo.png"
            alt="DECO Limited"
            className="w-full h-full object-contain"
          />
        </div>
        {/* Title */}
        <div className="flex-1">
          <div className="text-sm font-bold text-surface-900 leading-none">
            DECO
          </div>
          <div className="text-[11px] text-surface-400 mt-0.5">My Account</div>
        </div>
        {/* Unit switcher — only rendered once we know there's more than one */}
        {units && units.length > 1 && <UnitSwitcher units={units} />}
        {/* Customer Info */}
        {customer && (
          <div className="text-right">
            <div className="text-sm font-semibold text-surface-800">
              {customer.name || "Resident"}
            </div>
            <div className="text-[11px] text-surface-400 font-mono">
              {customer.mobile}
            </div>
          </div>
        )}
        {/* Notifications */}
        <NotificationBell />
        {/* Logout */}
        <button
          onClick={handleLogout}
          className="btn-ghost btn-sm !p-2 ml-1"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>
      {/* Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 pb-24">
        <Outlet />
      </main>
      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-surface-100 flex z-20">
        <div className="max-w-2xl w-full mx-auto flex">
          {NAV_ITEMS.map(({ icon: Icon, label, path }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                cn(
                  "flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
                  isActive ? "text-brand-600" : "text-surface-400",
                )
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}