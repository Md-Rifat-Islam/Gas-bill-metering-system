import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
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

// Customer portal
import PortalLayout from "@/components/layout/PortalLayout";
import PortalLoginPage from "@/pages/portal/PortalLoginPage";
import PortalDashboardPage from "@/pages/portal/PortalDashboardPage";
import PortalBillsPage from "@/pages/portal/PortalBillsPage";
import PortalBillDetailPage from "@/pages/portal/PortalBillDetailPage";
import PortalPaymentPage from "@/pages/portal/PortalPaymentPage";
import PortalPaymentsPage from "@/pages/portal/PortalPaymentsPage";
import PortalProfilePage from "@/pages/portal/PortalProfilePage";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PortalPrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useCustomerAuthStore();
  return isAuthenticated ? (
    <>{children}</>
  ) : (
    <Navigate to="/portal/login" replace />
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
      {/* ── Staff app ─────────────────────────────────────────────────────── */}
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
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
        <Route path="/meters/quick-reading" element={<QuickReadingPage />} />
        <Route path="/payments/pending" element={<PendingPaymentsPage />} />
        <Route path="/settings/payment-channels" element={<PaymentChannelSettingsPage />} />
      </Route>

      {/* ── Customer portal ───────────────────────────────────────────────── */}
      <Route path="/portal/login" element={<PortalLoginPage />} />
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

      {/* ── Fallback ──────────────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}