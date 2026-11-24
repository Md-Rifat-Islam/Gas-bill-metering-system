import type { BillingFilterState } from "./components/BillingFilters";

// Translates the Billing filter state into the query params the backend
// billing list endpoint expects. Shared by the Billing page and the Project
// Status page so both always filter (and export) the same way.
export function buildBillingParams(filters: BillingFilterState) {
  const amountParam =
    filters.amountOp && filters.amountValue
      ? filters.amountOp === "gt"
        ? { min_amount: filters.amountValue }
        : { max_amount: filters.amountValue }
      : {};

  return {
    search: filters.search || undefined,
    status: filters.status || undefined,
    project: filters.projectId || undefined,
    building: filters.buildingId || undefined,
    billing_month: filters.month
      ? filters.month.length === 7
        ? filters.month + "-01"
        : filters.month
      : undefined,
    ...amountParam,
  };
}

// ExportBillsExcelView doesn't share BillListCreateView's filterset — it
// takes billing_month as "month=YYYY-MM" instead of an exact date, and
// otherwise the same params.
export function buildExportParams(filters: BillingFilterState) {
  const { billing_month, ...rest } = buildBillingParams(filters);
  return {
    ...rest,
    month: filters.month || undefined,
  };
}