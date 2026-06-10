import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/auth/LoginPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import ProjectsPage from '@/pages/projects/ProjectsPage'
import BuildingsPage from '@/pages/buildings/BuildingsPage'
import UnitsPage from '@/pages/units/UnitsPage'
import MetersPage from '@/pages/meters/MetersPage'
import BillingPage from '@/pages/billing/BillingPage'
import BillDetailPage from '@/pages/billing/BillDetailPage'
import PaymentsPage from '@/pages/payments/PaymentsPage'
import ReportsPage from '@/pages/reports/ReportsPage'
import StaffPage from '@/pages/settings/StaffPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
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
        <Route path="dashboard"      element={<DashboardPage />} />
        <Route path="projects"       element={<ProjectsPage />} />
        <Route path="buildings"      element={<BuildingsPage />} />
        <Route path="units"          element={<UnitsPage />} />
        <Route path="meters"         element={<MetersPage />} />
        <Route path="billing"        element={<BillingPage />} />
        <Route path="billing/:id"    element={<BillDetailPage />} />
        <Route path="payments"       element={<PaymentsPage />} />
        <Route path="reports"        element={<ReportsPage />} />
        <Route path="settings/staff" element={<StaffPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
