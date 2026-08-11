import { useQuery } from "@tanstack/react-query";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { buildingsAPI, projectsAPI } from "@/api/client";

export type AmountOperator = "" | "gt" | "lt";

export interface BillingFilterState {
  search: string;
  status: string;
  projectId: string;
  buildingId: string;
  month: string; // "YYYY-MM"
  amountOp: AmountOperator;
  amountValue: string;
}

export const EMPTY_BILLING_FILTERS: BillingFilterState = {
  search: "",
  status: "",
  projectId: "",
  buildingId: "",
  month: "",
  amountOp: "",
  amountValue: "",
};

interface BillingFiltersProps {
  filters: BillingFilterState;
  onChange: (next: BillingFilterState) => void;
}

function hasActiveFilters(f: BillingFilterState) {
  return Boolean(
    f.search ||
      f.status ||
      f.projectId ||
      f.buildingId ||
      f.month ||
      (f.amountOp && f.amountValue),
  );
}

export function BillingFilters({ filters, onChange }: BillingFiltersProps) {
  const set = <K extends keyof BillingFilterState>(
    key: K,
    value: BillingFilterState[K],
  ) => onChange({ ...filters, [key]: value });

  const { data: projects } = useQuery({
    queryKey: ["projects-all"],
    queryFn: () =>
      projectsAPI
        .list({ page_size: 100 })
        .then((r) => r.data.results || r.data),
  });
  const { data: buildings } = useQuery({
    queryKey: ["buildings-by-project", filters.projectId],
    queryFn: () =>
      buildingsAPI
        .list({ project: filters.projectId, page_size: 100 })
        .then((r) => r.data.results || r.data),
    enabled: !!filters.projectId,
  });

  return (
    <div className="space-y-3 mb-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:flex-wrap">
        <div className="relative flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            className="input pl-9 w-full"
            placeholder="Search bill no., unit, allottee…"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>

        <select
          className="input w-full sm:w-auto sm:max-w-[140px]"
          value={filters.status}
          aria-label="Filter bills by status"
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="">All Status</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partial">Partial</option>
          <option value="Paid">Paid</option>
        </select>

        <select
          className="input w-full sm:w-auto sm:max-w-[160px]"
          value={filters.projectId}
          aria-label="Filter bills by project"
          onChange={(e) => {
            set("projectId", e.target.value);
            set("buildingId", "");
          }}
        >
          <option value="">All Projects</option>
          {projects?.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          className="input w-full sm:w-auto sm:max-w-[160px]"
          value={filters.buildingId}
          aria-label="Filter bills by building"
          disabled={!filters.projectId}
          onChange={(e) => set("buildingId", e.target.value)}
        >
          <option value="">All Buildings</option>
          {buildings?.map((b: any) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <input
          type="month"
          className="input w-full sm:w-auto sm:max-w-[160px]"
          aria-label="Filter bills by billing month"
          value={filters.month}
          onChange={(e) => set("month", e.target.value)}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-surface-500 uppercase tracking-wider">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Amount
        </div>
        <select
          className="input w-full sm:w-auto sm:max-w-[130px]"
          aria-label="Amount comparison"
          value={filters.amountOp}
          onChange={(e) => set("amountOp", e.target.value as AmountOperator)}
        >
          <option value="">Any</option>
          <option value="gt">Greater than (&gt;)</option>
          <option value="lt">Less than (&lt;)</option>
        </select>
        <input
          type="number"
          step="0.01"
          className="input w-full sm:w-auto sm:max-w-[140px]"
          placeholder="Amount (৳)"
          value={filters.amountValue}
          disabled={!filters.amountOp}
          onChange={(e) => set("amountValue", e.target.value)}
        />

        {hasActiveFilters(filters) && (
          <button
            type="button"
            className="btn-ghost btn-sm text-surface-500 self-start sm:self-auto"
            onClick={() => onChange(EMPTY_BILLING_FILTERS)}
          >
            <X className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}