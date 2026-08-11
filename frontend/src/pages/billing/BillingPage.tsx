import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Table2, List, Download, Loader2, Layers } from "lucide-react";
import { billingAPI, reportsAPI } from "@/api/client";
import { PageLoader } from "@/components/ui";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { usePermissions } from "@/hooks/usePermissions";
import toast from "react-hot-toast";

import { CreateBillModal } from "./components/CreateBillModal";
import { BulkCreateBillModal } from "./components/BulkCreateBillModal";
import { SpreadsheetBillingTable } from "./components/SpreadsheetBillingTable";
import { BillsTable } from "./components/BillsTable";
import {
  BillingFilters,
  EMPTY_BILLING_FILTERS,
  type BillingFilterState,
} from "./components/BillingFilters";

// Translates our filter state into the query params the backend billing
// list endpoint expects. Keep this in one place so the list query and the
// Excel export stay in sync.
function buildBillingParams(filters: BillingFilterState) {
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
// otherwise the same params. Keep this in sync with buildBillingParams
// rather than adding a third param scheme.
function buildExportParams(filters: BillingFilterState) {
  const { billing_month, ...rest } = buildBillingParams(filters);
  return {
    ...rest,
    month: filters.month || undefined,
  };
}

export default function BillingPage() {
  const { can } = usePermissions();
  const [filters, setFilters] = useState<BillingFilterState>(
    EMPTY_BILLING_FILTERS,
  );
  const [page, setPage] = useState(1);
  const [createModal, setCreateModal] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);
  const [view, setView] = useState<"table" | "spreadsheet">("table");
  const [exporting, setExporting] = useState(false);
  const [payTarget, setPayTarget] = useState<any | null>(null);

  const handleFiltersChange = (next: BillingFilterState) => {
    setFilters(next);
    setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["bills", filters, page],
    queryFn: () =>
      billingAPI
        .list({ ...buildBillingParams(filters), page })
        .then((r) => r.data),
  });

  const bills = data?.results || [];

  const handleExport = async () => {
    setExporting(true);
    try {
      // Exports exactly what's currently filtered on this page — same
      // params the list query itself is using.
      await reportsAPI.exportBillsExcel(buildExportParams(filters));
    } catch {
      toast.error("Could not export bills");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="page-header flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">
            Create and manage gas bills for all units
          </p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full lg:w-auto">
          {can.editBillSpreadsheet && (
            <div className="flex gap-1 bg-surface-100 rounded-xl p-1 self-start">
              <button
                onClick={() => setView("table")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  view === "table"
                    ? "bg-white shadow-sm text-surface-900"
                    : "text-surface-500"
                }`}
              >
                <List className="w-3.5 h-3.5" /> Table
              </button>
              <button
                onClick={() => setView("spreadsheet")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  view === "spreadsheet"
                    ? "bg-white shadow-sm text-surface-900"
                    : "text-surface-500"
                }`}
              >
                <Table2 className="w-3.5 h-3.5" /> Spreadsheet
              </button>
            </div>
          )}
          <button
            className="btn-secondary w-full sm:w-auto justify-center"
            onClick={handleExport}
            disabled={exporting}
            title="Export current view to Excel"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Export Excel
          </button>
          {can.createBill && (
            <button
              className="btn-secondary w-full sm:w-auto justify-center"
              onClick={() => setBulkModal(true)}
              title="Create bills for multiple units at once"
            >
              <Layers className="w-4 h-4" /> Bulk Create
            </button>
          )}
          {can.createBill && (
            <button
              className="btn-primary w-full sm:w-auto justify-center"
              onClick={() => setCreateModal(true)}
            >
              <Plus className="w-4 h-4" /> Create Bill
            </button>
          )}
        </div>
      </div>

      <BillingFilters filters={filters} onChange={handleFiltersChange} />

      {isLoading ? (
        <PageLoader />
      ) : view === "spreadsheet" && can.editBillSpreadsheet ? (
        <SpreadsheetBillingTable bills={bills} />
      ) : (
        <BillsTable
          bills={bills}
          page={page}
          count={data?.count || 0}
          onPageChange={setPage}
          canRecordPayment={can.recordPayment}
          onPay={setPayTarget}
        />
      )}

      <CreateBillModal
        open={createModal}
        onClose={() => setCreateModal(false)}
      />
      <BulkCreateBillModal
        open={bulkModal}
        onClose={() => setBulkModal(false)}
      />
      <PaymentModal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        bill={payTarget}
      />
    </div>
  );
}