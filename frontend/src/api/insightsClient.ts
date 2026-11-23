import api from './client'

// Aggregated data for the Dashboard and Reports pages. Lives in its own file
// so client.ts does not need to change; it reuses the same axios instance
// (token handling, refresh and error toasts included).
export const insightsAPI = {
  dashboard: () => api.get('/reports/insights/dashboard/'),
  reports: (params?: { months?: number; project?: string | number }) =>
    api.get('/reports/insights/reports/', { params }),
}