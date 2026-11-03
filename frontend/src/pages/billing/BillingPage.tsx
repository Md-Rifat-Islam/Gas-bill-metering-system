import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Table2, List, Download, Layers } from "lucide-react";
import { billingAPI, reportsAPI } from "@/api/client";
import { PageLoader } from "@/components/ui";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { usePermissions } from "@/hooks/usePermissions";
import { usePersistedState } from "@/hooks";
import toast from "react-hot-toast";

import { CreateBillModal } from "./components/CreateBillModal";
import { BulkCreateBillModal } from "./components/BulkCreateBillModal";
import { SpreadsheetBillingTable } from "./components/SpreadsheetBillingTable";
import { BillsTable } from "./components/BillsTable";
import { ExportBillsModal, type ExportFormat } from "./components/ExportBillsModal";
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

  // Persisted in sessionStorage so the search, filters, page number and
  // table/spreadsheet view survive opening a bill's detail page or switching
  // to another sidebar menu and coming back.
  const [filters, setFilters] = usePersistedState<BillingFilterState>(
    "billing:filters",
    EMPTY_BILLING_FILTERS,
  );
  const [page, setPage] = usePersistedState<number>("billing:page", 1);
  const [view, setView] = usePersistedState<"table" | "spreadsheet">(
    "billing:view",
    "table",
  );

  // Modals / transient UI stay in plain local state on purpose.
  const [createModal, setCreateModal] = useState(false);
  const [bulkModal, setBulkModal] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [payTarget, setPayTarget] = useState<any | null>(null);

  const handleFiltersChange = (next: BillingFilterState) => {
    setFilters(next);
    setPage(1);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["bills", filters, page],
    queryFn: () =>
      billingAPI
        .list({ ...buildBillingParams(filters), page })
        .then((r) => r.data),
  });

  // A restored page number can be past the end if bills were deleted since
  // (the backend answers with an error for an out-of-range page). Fall back
  // to the first page instead of leaving the table broken.
  useEffect(() => {
    if (isError && page > 1) setPage(1);
  }, [isError, page, setPage]);

  const bills = data?.results || [];

  const handleExport = async (columns: string[], format: ExportFormat) => {
    setExporting(true);
    try {
      // Exports exactly what's currently filtered on this page — same
      // params the list query itself is using — limited to the columns
      // and file format picked in the Export modal.
      await reportsAPI.exportBills(buildExportParams(filters), {
        columns,
        format,
      });
      setExportModal(false);
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
            onClick={() => setExportModal(true)}
            title="Export current view to Excel or PDF"
          >
            <Download className="w-4 h-4" />
            Export
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
      <ExportBillsModal
        open={exportModal}
        onClose={() => setExportModal(false)}
        exporting={exporting}
        onExport={handleExport}
      />
      <PaymentModal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        bill={payTarget}
      />
    </div>
  );
}