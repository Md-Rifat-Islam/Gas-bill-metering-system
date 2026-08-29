import { useEffect } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { authAPI } from "@/api/client";

// Staff app
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import ProjectsPage from "@/pages/projects/ProjectsPage";
import BuildingsPage from "@/pages/buildings/BuildingsPage";
import UnitsPage from "@/pages/units/UnitsPage";
import MetersPage from "@/pages/meters/MetersPage";
import BillingPage from "@/pages/billing/BillingPage";
import BillDetailPage from "@/pages/billing/BillDetailPage";
import PaymentsPage from "@/pages/payments/PaymentsPage";
import PendingPaymentsPage from '@/pages/payments/PendingPaymentsPage'
import ReportsPage from "@/pages/reports/ReportsPage";
import StaffPage from "@/pages/settings/StaffPage";
import RolesPage from "@/pages/settings/RolesPage";
import QuickReadingPage from "@/pages/meters/QuickReadingPage";
import PaymentChannelSettingsPage from '@/pages/settings/PaymentChannelSettingsPage'
import AuditLogsPage from '@/pages/audit/AuditLogsPage'

// Customer portal
import PortalLayout from "@/components/layout/PortalLayout";
import PortalLoginPage from "@/pages/portal/PortalLoginPage";
import PortalDashboardPage from "@/pages/portal/PortalDashboardPage";
import PortalBillsPage from "@/pages/portal/PortalBillsPage";
import PortalBillDetailPage from "@/pages/portal/PortalBillDetailPage";
import PortalPaymentPage from "@/pages/portal/PortalPaymentPage";
import PortalPaymentsPage from "@/pages/portal/PortalPaymentsPage";
import PortalProfilePage from "@/pages/portal/PortalProfilePage";
import PortalUnitSelectPage from "@/pages/portal/PortalUnitSelectPage";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/staff/login" replace />;
}

function PortalPrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useCustomerAuthStore();
  return isAuthenticated ? (
    <>{children}</>
  ) : (
    <Navigate to="/portal/login" replace />
  );
}

// Root ("/") is the site's public default now — sends a visitor straight
// into the customer portal, skipping an extra hop through /portal/login
// when they're not yet signed in. Staff have their own explicit entry at
// /staff/login (see below) instead of sharing the root.
function RootEntry() {
  const { isAuthenticated } = useCustomerAuthStore();
  return (
    <Navigate to={isAuthenticated ? "/portal/dashboard" : "/portal/login"} replace />
  );
}

export default function App() {
    const { isAuthenticated, setUser, clearAuth } = useAuthStore();

    // Roles/permissions can change server-side (e.g. Super Admin edits a staff
    // member's role) but the persisted `user` in localStorage doesn't know
    // that. Refetch the authoritative record on every app load/reload so
    // usePermissions() and the sidebar always reflect current access.
    useEffect(() => {
      if (isAuthenticated) {
        authAPI.me()
          .then((res) => setUser(res.data))
          .catch(() => clearAuth());
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  return (
    <Routes>
      {/* ── Site root — customer-facing by default ───────────────────────── */}
      <Route path="/" element={<RootEntry />} />

      {/* ── Staff app — now lives under /staff ───────────────────────────── */}
      <Route path="/staff/login" element={<LoginPage />} />
      <Route
        path="/staff"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/staff/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="buildings" element={<BuildingsPage />} />
        <Route path="units" element={<UnitsPage />} />
        <Route path="meters" element={<MetersPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="billing/:id" element={<BillDetailPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings/staff" element={<StaffPage />} />
        <Route path="settings/roles" element={<RolesPage />} />
        <Route path="meters/quick-reading" element={<QuickReadingPage />} />
        <Route path="payments/pending" element={<PendingPaymentsPage />} />
        <Route path="settings/payment-channels" element={<PaymentChannelSettingsPage />} />
        {/* Audit Logs — Super Admin only, enforced both here (AccessDenied
            inside the page via can.viewAuditLogs) and on the backend
            (AuditLogPermission, hard-locked, not override-able). Grouped
            under /settings/ to match Roles & RBAC, which is the same
            Super-Admin-only tier. */}
        <Route path="settings/audit" element={<AuditLogsPage />} />
      </Route>

      {/* ── Legacy staff bookmarks ────────────────────────────────────────
          The staff app used to live at these exact paths (root-level, no
          /staff prefix). Production staff almost certainly have these
          bookmarked or saved as browser autofill, so redirect each old
          path to its new /staff/... home instead of just 404-ing them. */}
      <Route path="/login" element={<Navigate to="/staff/login" replace />} />
      <Route path="/dashboard" element={<Navigate to="/staff/dashboard" replace />} />
      <Route path="/projects" element={<Navigate to="/staff/projects" replace />} />
      <Route path="/buildings" element={<Navigate to="/staff/buildings" replace />} />
      <Route path="/units" element={<Navigate to="/staff/units" replace />} />
      <Route path="/meters" element={<Navigate to="/staff/meters" replace />} />
      <Route path="/meters/quick-reading" element={<Navigate to="/staff/meters/quick-reading" replace />} />
      <Route path="/billing" element={<Navigate to="/staff/billing" replace />} />
      <Route path="/billing/:id" element={<LegacyBillingRedirect />} />
      <Route path="/payments" element={<Navigate to="/staff/payments" replace />} />
      <Route path="/payments/pending" element={<Navigate to="/staff/payments/pending" replace />} />
      <Route path="/reports" element={<Navigate to="/staff/reports" replace />} />
      <Route path="/settings/staff" element={<Navigate to="/staff/settings/staff" replace />} />
      <Route path="/settings/roles" element={<Navigate to="/staff/settings/roles" replace />} />
      <Route path="/settings/payment-channels" element={<Navigate to="/staff/settings/payment-channels" replace />} />
      <Route path="/settings/audit" element={<Navigate to="/staff/settings/audit" replace />} />

      {/* ── Customer portal ───────────────────────────────────────────────── */}
      <Route path="/portal/login" element={<PortalLoginPage />} />
      {/*
        Sibling route, NOT nested inside PortalLayout below — this page runs
        before a unit is chosen, so it must not render through PortalLayout's
        <Outlet/> (which would show bill/payment nav for a unit that hasn't
        been selected yet). Still wrapped in PortalPrivateRoute so a logged-out
        visitor can't hit it directly.
      */}
      <Route
        path="/portal/select-unit"
        element={
          <PortalPrivateRoute>
            <PortalUnitSelectPage />
          </PortalPrivateRoute>
        }
      />
      <Route
        path="/portal"
        element={
          <PortalPrivateRoute>
            <PortalLayout />
          </PortalPrivateRoute>
        }
      >
        <Route index element={<Navigate to="/portal/dashboard" replace />} />
        <Route path="dashboard" element={<PortalDashboardPage />} />
        <Route path="bills" element={<PortalBillsPage />} />
        <Route path="bills/:id" element={<PortalBillDetailPage />} />
        <Route path="payment" element={<PortalPaymentPage />} />
        <Route path="payments" element={<PortalPaymentsPage />} />
        <Route path="profile" element={<PortalProfilePage />} />
      </Route>

      {/* ── Fallback ──────────────────────────────────────────────────────── 
          Unknown paths land on the public customer entry, not the old staff
          dashboard — the site's default audience is now customers. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// A bare "/billing/:id" redirect can't reference the dynamic :id via a
// plain `to="..."` string, so it needs its own tiny component to read the
// param and forward it into the new /staff/billing/:id location.
function LegacyBillingRedirect() {
  const { id } = useParams();
  return <Navigate to={`/staff/billing/${id}`} replace />;
}