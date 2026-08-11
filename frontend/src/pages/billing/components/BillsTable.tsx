import { useNavigate } from "react-router-dom";
import { FileText, Eye, CreditCard } from "lucide-react";
import { EmptyState, Pagination, StatusBadge } from "@/components/ui";
import { formatCurrency } from "@/utils/helpers";

interface BillsTableProps {
  bills: any[];
  page: number;
  count: number;
  onPageChange: (page: number) => void;
  canRecordPayment: boolean;
  onPay: (bill: any) => void;
}

export function BillsTable({
  bills,
  page,
  count,
  onPageChange,
  canRecordPayment,
  onPay,
}: BillsTableProps) {
  const navigate = useNavigate();

  return (
    <>
      {/* Horizontal scroll on narrow viewports instead of squashing columns */}
      <div className="table-wrapper overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="table min-w-[980px] sm:min-w-0">
          <thead>
            <tr>
              <th>Bill No.</th>
              <th>Month</th>
              <th>Unit / Allottee</th>
              <th>Building / Project</th>
              <th>Usage</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Due</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <EmptyState
                    icon={FileText}
                    title="No bills found"
                    description="Create a bill to get started"
                  />
                </td>
              </tr>
            ) : (
              bills.map((b: any) => (
                <tr key={b.id}>
                  <td>
                    <span className="font-mono text-xs font-semibold text-brand-700">
                      {b.bill_number}
                    </span>
                  </td>
                  <td className="text-surface-600 text-sm">
                    {b.billing_month_display}
                  </td>
                  <td>
                    <div className="font-medium text-surface-800">
                      {b.unit_no}
                    </div>
                    <div className="text-xs text-surface-400">
                      {b.allottee_name || "—"}
                    </div>
                  </td>
                  <td>
                    <div className="text-sm text-surface-600">
                      {b.building_name}
                    </div>
                    <div className="text-xs text-surface-400">
                      {b.project_name}
                    </div>
                  </td>
                  <td className="font-mono text-sm text-center">
                    {b.total_usage_kg
                      ? `${b.total_usage_kg} kg`
                      : `${b.total_usage_m3} m³`}
                  </td>
                  <td className="font-mono font-semibold">
                    {formatCurrency(b.total_amount)}
                  </td>
                  <td className="font-mono text-success-600">
                    {formatCurrency(b.paid_amount)}
                  </td>
                  <td className="font-mono text-danger-600 font-semibold">
                    {formatCurrency(b.due_amount)}
                  </td>
                  <td>
                    <StatusBadge status={b.status} />
                  </td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      {canRecordPayment &&
                        (b.status === "Unpaid" || b.status === "Partial") && (
                          <button
                            className="btn-ghost btn-sm text-success-600 hover:bg-success-50"
                            onClick={() => onPay(b)}
                            title="Pay this bill"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                        )}
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => navigate(`/billing/${b.id}`)}
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} count={count} onChange={onPageChange} />
    </>
  );
}