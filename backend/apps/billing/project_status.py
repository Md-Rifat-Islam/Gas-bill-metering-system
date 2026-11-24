import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Download,
  CalendarClock,
  Package,
  Gauge,
  Flame,
  Wallet,
  AlertCircle,
  FileText,
  ArrowLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import { reportsAPI } from "@/api/client";
import { projectStatusAPI } from "@/api/projectStatusClient";
import { usePermissions } from "@/hooks/usePermissions";
import { usePersistedState } from "@/hooks";
import { PageLoader, EmptyState } from "@/components/ui";
import { formatMonth } from "@/utils/helpers";
import {
  formatTaka,
  pct,
  rateTone,
  SectionCard,
  MetricCard,
  ProgressRow,
} from "@/components/dashboard/widgets";

import {
  BillingFilters,
  EMPTY_BILLING_FILTERS,
  type BillingFilterState,
} from "./components/BillingFilters";
import { ExportBillsModal, type ExportFormat } from "./components/ExportBillsModal";
import { MoveBillingMonthModal } from "./components/MoveBillingMonthModal";
import { CylinderTypesModal } from "./components/CylinderTypesModal";
import { CylinderSupplyModal } from "./components/CylinderSupplyModal";
import { buildBillingParams, buildExportParams } from "./billingParams";

const num = (v: any, digits = 2) =>
  Number(v || 0).toLocaleString("en-BD", { maximumFractionDigits: digits });

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ProjectStatusPage() {
  const { can } = usePermissions();

  // Same filter component and state shape as the Billing page, kept under
  // its own sessionStorage key so the two pages don't overwrite each other.
  const [filters, setFilters] = usePersistedState<BillingFilterState>(
    "projectstatus:filters",
    EMPTY_BILLING_FILTERS,
  );

  const [exportModal, setExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [moveMonthModal, setMoveMonthModal] = useState(false);
  const [typesModal, setTypesModal] = useState(false);
  const [supplyProject, setSupplyProject] = useState<{ id: number; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["project-status", filters],
    queryFn: () =>
      projectStatusAPI.status(buildBillingParams(filters)).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const handleExport = async (columns: string[], format: ExportFormat) => {
    setExporting(true);
    try {
      // Exactly what the filters above select, same as the Billing page.
      await reportsAPI.exportBills(buildExportParams(filters), { columns, format });
      setExportModal(false);
    } catch {
      toast.error("Could not export bills");
    } finally {
      setExporting(false);
    }
  };

  const totals = data?.totals;
  const projects: any[] = data?.projects || [];
  const comparable: boolean = !!data?.comparable;
  const totalRate = totals ? pct(Number(totals.paid), Number(totals.billed)) : 0;
  const supplyMonthLabel = data?.supply_month ? formatMonth(data.supply_month) : "all months";

  return (
    <div>
      <div className="page-header flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div>
          <Link
            to="/staff/billing"
            className="inline-flex items-center gap-1 text-xs font-semibold text-surface-400 hover:text-surface-600 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Billing
          </Link>
          <h1 className="page-title">Project Status</h1>
          <p className="page-subtitle">
            Gas usage, collection and cylinder supply by project
          </p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full lg:w-auto">
          <button
            className="btn-secondary w-full sm:w-auto justify-center"
            onClick={() => setExportModal(true)}
            title="Export the bills behind these numbers to Excel or PDF"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          {/* Backend allows Super Admin only; Admin sees it (same flag as
              before) and gets a clear 403 message. */}
          {can.editBillSpreadsheet && (
            <button
              className="btn-secondary w-full sm:w-auto justify-center"
              onClick={() => setMoveMonthModal(true)}
              title="Fix bills created under the wrong billing month (Super Admin)"
            >
              <CalendarClock className="w-4 h-4" /> Move Month
            </button>
          )}
          <button
            className="btn-secondary w-full sm:w-auto justify-center"
            onClick={() => setTypesModal(true)}
            title="Create and manage cylinder sizes"
          >
            <Package className="w-4 h-4" /> Cylinder Types
          </button>
        </div>
      </div>

      <BillingFilters filters={filters} onChange={setFilters} />

      {isLoading || !data ? (
        <PageLoader />
      ) : (
        <>
          {/* Totals for everything the filters select */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
            <MetricCard
              label="Usage (m³)"
              value={`${num(totals.usage_m3)} m³`}
              sub={`${totals.bills} bills · ${totals.units} units`}
              icon={Gauge}
              color="bg-brand-50"
            />
            <MetricCard
              label="Usage (kg)"
              value={`${num(totals.usage_kg)} kg`}
              sub={`${totals.kg_bills} bills priced per kg`}
              icon={Flame}
              color="bg-warning-50"
            />
            <MetricCard
              label="Paid"
              value={formatTaka(totals.paid)}
              sub={`${totalRate.toFixed(1)}% of ${formatTaka(totals.billed)} billed`}
              icon={Wallet}
              color="bg-success-50"
            />
            <MetricCard
              label="Unpaid"
              value={formatTaka(totals.due)}
              sub={`${totals.unpaid_bills} unpaid · ${totals.partial_bills} partial`}
              icon={AlertCircle}
              color="bg-danger-50"
            />
            <MetricCard
              label="Cylinders given"
              value={num(totals.cylinder_count, 0)}
              sub={`${num(totals.cylinder_kg)} kg · ${supplyMonthLabel}`}
              icon={Package}
              color="bg-purple-50"
            />
          </div>

          {projects.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={FileText}
                title="No projects found"
                description="Projects appear here once they are created and active."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {projects.map((p) => {
                const rate = pct(Number(p.paid), Number(p.billed));
                const cyl = p.cylinders;
                const supplied = Number(cyl.weight_kg);
                const billedKg = Number(p.usage_kg);
                const showCompare = comparable && cyl.count > 0 && billedKg > 0;
                const diff = supplied - billedKg;

                return (
                  <SectionCard
                    key={p.project_id}
                    title={p.name}
                    subtitle={`${p.bills} bills · ${p.units} units`}
                    action={
                      <button
                        className="btn-secondary btn-sm shrink-0"
                        onClick={() => setSupplyProject({ id: p.project_id, name: p.name })}
                      >
                        <Package className="w-3.5 h-3.5" /> Cylinders
                      </button>
                    }
                  >
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className="bg-surface-50 rounded-xl p-3">
                        <div className="text-xs text-surface-500">Usage (m³)</div>
                        <div className="text-lg font-bold text-surface-900 mt-0.5">
                          {num(p.usage_m3)}
                        </div>
                      </div>
                      <div className="bg-surface-50 rounded-xl p-3">
                        <div className="text-xs text-surface-500">Usage (kg)</div>
                        <div className="text-lg font-bold text-surface-900 mt-0.5">
                          {num(p.usage_kg)}
                        </div>
                        {p.kg_bills > 0 && (
                          <div className="text-[11px] text-surface-400">
                            {p.kg_bills} bills priced per kg
                          </div>
                        )}
                      </div>
                    </div>

                    <ProgressRow
                      label="Collected"
                      percent={rate}
                      tone={p.bills > 0 ? rateTone(rate) : "brand"}
                      right={`${rate.toFixed(0)}% of ${formatTaka(p.billed)}`}
                    />
                    <div className="grid grid-cols-2 gap-3 mt-3 mb-4">
                      <div>
                        <div className="text-xs text-surface-500">Paid</div>
                        <div className="text-sm font-bold text-success-600">{formatTaka(p.paid)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-surface-500">Unpaid</div>
                        <div className="text-sm font-bold text-danger-600">{formatTaka(p.due)}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-5">
                      <span className="badge-green">{p.paid_bills} paid</span>
                      <span className="badge-yellow">{p.partial_bills} partial</span>
                      <span className="badge-red">{p.unpaid_bills} unpaid</span>
                    </div>

                    <div className="border-t border-surface-100 pt-4">
                      <div className="flex items-baseline justify-between mb-2">
                        <div className="text-sm font-semibold text-surface-700">
                          Cylinders given
                          <span className="text-xs font-normal text-surface-400 ml-2">
                            {supplyMonthLabel}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-surface-900">
                          {num(cyl.count, 0)} · {num(cyl.weight_kg)} kg
                        </div>
                      </div>
                      {cyl.lines.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {cyl.lines.map((l: any) => (
                            <span key={l.cylinder_type_id} className="badge-gray">
                              {l.quantity} × {l.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-surface-400">
                          No cylinders recorded
                          {data.supply_month ? " for this month" : ""}.
                        </div>
                      )}
                      {showCompare && (
                        <div className="mt-3 text-xs bg-surface-50 rounded-xl p-3 text-surface-600">
                          Supplied <strong>{num(supplied)} kg</strong> · billed{" "}
                          <strong>{num(billedKg)} kg</strong> ·{" "}
                          {diff >= 0 ? "not billed" : "billed above supply"}{" "}
                          <strong className={diff >= 0 ? "text-warning-600" : "text-danger-600"}>
                            {num(Math.abs(diff))} kg
                            {supplied > 0 && ` (${Math.abs((diff / supplied) * 100).toFixed(1)}%)`}
                          </strong>
                        </div>
                      )}
                    </div>
                  </SectionCard>
                );
              })}
            </div>
          )}
        </>
      )}

      <ExportBillsModal
        open={exportModal}
        onClose={() => setExportModal(false)}
        exporting={exporting}
        onExport={handleExport}
      />
      <MoveBillingMonthModal
        open={moveMonthModal}
        onClose={() => setMoveMonthModal(false)}
      />
      <CylinderTypesModal open={typesModal} onClose={() => setTypesModal(false)} />
      <CylinderSupplyModal
        open={!!supplyProject}
        onClose={() => setSupplyProject(null)}
        project={supplyProject}
        defaultMonth={filters.month || currentMonth()}
        canEdit={!!can.createBill}
      />
    </div>
  );
}