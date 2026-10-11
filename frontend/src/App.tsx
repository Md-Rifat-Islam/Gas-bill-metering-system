import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { authAPI } from "@/api/client";
import { PageLoader } from "@/components/ui";

// ── Eagerly loaded: shell + the first screen most visitors see ───────────────
// The site root sends visitors to the customer portal login, so that page
// (and the two layouts) stay in the main bundle. Everything else is split
// into its own chunk and only downloaded when the route is opened — before,
// all ~25 pages (incl. charts and the barcode scanner) were downloaded and
// parsed before the login screen could appear.
import AppLayout from "@/components/layout/AppLayout";
import PortalLayout from "@/components/layout/PortalLayout";
import PortalLoginPage from "@/pages/portal/PortalLoginPage";

// Staff app
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const ProjectsPage = lazy(() => import("@/pages/projects/ProjectsPage"));
const BuildingsPage = lazy(() => import("@/pages/buildings/BuildingsPage"));
const UnitsPage = lazy(() => import("@/pages/units/UnitsPage"));
const MetersPage = lazy(() => import("@/pages/meters/MetersPage"));
const BillingPage = lazy(() => import("@/pages/billing/BillingPage"));
const BillDetailPage = lazy(() => import("@/pages/billing/BillDetailPage"));
const PaymentsPage = lazy(() => import("@/pages/payments/PaymentsPage"));
const PendingPaymentsPage = lazy(() => import("@/pages/payments/PendingPaymentsPage"));
const ReportsPage = lazy(() => import("@/pages/reports/ReportsPage"));
const StaffPage = lazy(() => import("@/pages/settings/StaffPage"));
const RolesPage = lazy(() => import("@/pages/settings/RolesPage"));
const QuickReadingPage = lazy(() => import("@/pages/meters/QuickReadingPage"));
const PaymentChannelSettingsPage = lazy(() => import("@/pages/settings/PaymentChannelSettingsPage"));
const AuditLogsPage = lazy(() => import("@/pages/audit/AuditLogsPage"));
const BackupsPage = lazy(() => import("@/pages/settings/BackupsPage"));
const MessagingPage = lazy(() => import("@/pages/messaging/MessagingPage"));

// Customer portal
const PortalDashboardPage = lazy(() => import("@/pages/portal/PortalDashboardPage"));
const PortalBillsPage = lazy(() => import("@/pages/portal/PortalBillsPage"));
const PortalBillDetailPage = lazy(() => import("@/pages/portal/PortalBillDetailPage"));
const PortalPaymentPage = lazy(() => import("@/pages/portal/PortalPaymentPage"));
const PortalPaymentsPage = lazy(() => import("@/pages/portal/PortalPaymentsPage"));
const PortalProfilePage = lazy(() => import("@/pages/portal/PortalProfilePage"));
const PortalUnitSelectPage = lazy(() => import("@/pages/portal/PortalUnitSelectPage"));
const PortalBkashResultPage = lazy(() => import("@/pages/portal/PortalBkashResultPage"));

// Each lazy page gets its own Suspense boundary, so inside a layout only the
// content area shows the loader while a chunk downloads — the sidebar/header
// stay put instead of the whole screen being replaced.
const page = (el: ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

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
      <Route path="/staff/login" element={page(<LoginPage />)} />
      <Route
        path="/staff"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/staff/dashboard" replace />} />
        <Route path="dashboard" element={page(<DashboardPage />)} />
        <Route path="projects" element={page(<ProjectsPage />)} />
        <Route path="buildings" element={page(<BuildingsPage />)} />
        <Route path="units" element={page(<UnitsPage />)} />
        <Route path="meters" element={page(<MetersPage />)} />
        <Route path="billing" element={page(<BillingPage />)} />
        <Route path="billing/:id" element={page(<BillDetailPage />)} />
        <Route path="payments" element={page(<PaymentsPage />)} />
        <Route path="reports" element={page(<ReportsPage />)} />
        <Route path="settings/staff" element={page(<StaffPage />)} />
        <Route path="settings/roles" element={page(<RolesPage />)} />
        <Route path="meters/quick-reading" element={page(<QuickReadingPage />)} />
        <Route path="payments/pending" element={page(<PendingPaymentsPage />)} />
        <Route path="settings/payment-channels" element={page(<PaymentChannelSettingsPage />)} />
        {/* Messaging (SMS) — access is enforced on the backend by
            MessagingPermission; the page shows AccessDenied without view rights. */}
        <Route path="messaging" element={page(<MessagingPage />)} />
        {/* Audit Logs — Super Admin only, enforced both here (AccessDenied
            inside the page via can.viewAuditLogs) and on the backend
            (AuditLogPermission, hard-locked, not override-able). Grouped
            under /settings/ to match Roles & RBAC, which is the same
            Super-Admin-only tier. */}
        <Route path="settings/audit" element={page(<AuditLogsPage />)} />
        {/* Backups — Super Admin only, enforced backend-side (same
            role check pattern as Audit Logs / bill deletion). Grouped
            under /settings/ alongside Roles, Audit, and Payment Channels. */}
        <Route path="settings/backups" element={page(<BackupsPage />)} />
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
      {/* The bKash checkout flow redirects the customer's browser to this page
          after the payment has been verified server-side. This page reads the
          result from the query string and shows a success/failure/cancelled
          message, but it never talks to bKash itself. */}
      <Route
        path="/portal/payments/bkash-result"
        element={page(<PortalBkashResultPage />)}
      />
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
            {page(<PortalUnitSelectPage />)}
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
        <Route path="dashboard" element={page(<PortalDashboardPage />)} />
        <Route path="bills" element={page(<PortalBillsPage />)} />
        <Route path="bills/:id" element={page(<PortalBillDetailPage />)} />
        <Route path="payment" element={page(<PortalPaymentPage />)} />
        <Route path="payments" element={page(<PortalPaymentsPage />)} />
        <Route path="profile" element={page(<PortalProfilePage />)} />
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