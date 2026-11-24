import api from './client'

// Project Status page: per-project summary, cylinder types and monthly
// cylinder supply. Kept out of client.ts so that file does not need to change.
export const projectStatusAPI = {
  status: (params?: Record<string, any>) =>
    api.get('/billing/project-status/', { params }),

  cylinderTypes: () => api.get('/billing/cylinder-types/'),
  createCylinderType: (data: { name?: string; weight_kg: string | number }) =>
    api.post('/billing/cylinder-types/', data),
  updateCylinderType: (id: number, data: { name?: string; weight_kg?: string | number; is_active?: boolean }) =>
    api.patch(`/billing/cylinder-types/${id}/`, data),

  getSupply: (project: number | string, month: string) =>
    api.get('/billing/cylinder-supply/', { params: { project, month } }),
  saveSupply: (data: {
    project_id: number | string
    month: string
    lines: { cylinder_type_id: number; quantity: number }[]
  }) => api.put('/billing/cylinder-supply/', data),
}