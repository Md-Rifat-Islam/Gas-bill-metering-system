import { Loader2, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Modal } from "@/components/ui";
import { usePersistedState } from "@/hooks";

export type ExportFormat = "xlsx" | "pdf";

// Keys MUST match BILL_EXPORT_COLUMNS in
// backend/apps/reports/exports/excel_exports.py (the backend answers 400 for
// an unknown key). Order here = order shown in the picker; the file itself
// always uses the backend's order.
export const BILL_EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: "sl", label: "SL" },
  { key: "bill_number", label: "Bill No." },
  { key: "billing_month", label: "Billing Month" },
  { key: "project", label: "Project" },
  { key: "building", label: "Building" },
  { key: "unit", label: "Unit" },
  { key: "floor", label: "Floor" },
  { key: "allottee", label: "Allottee" },
  { key: "meter_no", label: "Meter No." },
  { key: "previous_reading", label: "Prev. Reading" },
  { key: "current_reading", label: "Curr. Reading" },
  { key: "usage_m3", label: "Usage (m³)" },
  { key: "usage_kg", label: "Usage (Kg)" },
  { key: "unit_price", label: "Unit Price" },
  { key: "base_amount", label: "Base Amount" },
  { key: "service_charge", label: "Service Charge" },
  { key: "percentage_rate", label: "Percentage (%)" },
  { key: "percentage_amount", label: "Percentage Charge" },
  { key: "extra_charge", label: "Extra Charge" },
  { key: "discount", label: "Discount" },
  { key: "late_fee", label: "Late Fee" },
  { key: "total_amount", label: "Total Amount" },
  { key: "paid_amount", label: "Paid" },
  { key: "due_amount", label: "Due" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created" },
];

const ALL_KEYS = BILL_EXPORT_COLUMNS.map((c) => c.key);
// Above this many columns a PDF page gets very cramped (the backend switches
// to A3 and a smaller font), so we nudge the user toward fewer columns.
const PDF_CROWDED_AT = 14;

interface ExportBillsModalProps {
  open: boolean;
  onClose: () => void;
  exporting: boolean;
  onExport: (columns: string[], format: ExportFormat) => void;
}

export function ExportBillsModal({
  open,
  onClose,
  exporting,
  onExport,
}: ExportBillsModalProps) {
  // Remembered for the session so the same export can be repeated without
  // re-ticking everything.
  const [stored, setSelected] = usePersistedState<string[]>(
    "billing:export-columns",
    ALL_KEYS,
  );
  const [format, setFormat] = usePersistedState<ExportFormat>(
    "billing:export-format",
    "xlsx",
  );

  // Drop any stored key that no longer exists (e.g. a column was renamed).
  const selected = stored.filter((k) => ALL_KEYS.includes(k));
  const selectedSet = new Set(selected);

  const toggle = (key: string) =>
    setSelected(
      selectedSet.has(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key],
    );

  const crowded = format === "pdf" && selected.length > PDF_CROWDED_AT;

  return (
    <Modal open={open} onClose={onClose} title="Export Bills" size="lg">
      <div className="space-y-5">
        <p className="text-sm text-surface-500">
          Exports the bills matching the filters currently applied on this page.
          Choose the columns and the file format.
        </p>

        {/* Format */}
        <div>
          <div className="label">Format</div>
          <div className="flex gap-2">
            {(
              [
                { value: "xlsx", label: "Excel (.xlsx)", icon: FileSpreadsheet },
                { value: "pdf", label: "PDF", icon: FileText },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFormat(value)}
                aria-pressed={format === value}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border transition-all ${
                  format === value
                    ? "bg-surface-900 text-white border-surface-900"
                    : "bg-white text-surface-600 border-surface-200 hover:border-surface-300"
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Columns */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="label !mb-0">
              Columns{" "}
              <span className="text-surface-400 font-normal text-xs">
                ({selected.length} of {ALL_KEYS.length} selected)
              </span>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn-ghost btn-sm text-xs"
                onClick={() => setSelected(ALL_KEYS)}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm text-xs"
                onClick={() => setSelected([])}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 p-3 rounded-xl border border-surface-100 bg-surface-50 max-h-64 overflow-y-auto">
            {BILL_EXPORT_COLUMNS.map((c) => (
              <label
                key={c.key}
                className="flex items-center gap-2 text-sm text-surface-700 py-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="rounded border-surface-300"
                  checked={selectedSet.has(c.key)}
                  onChange={() => toggle(c.key)}
                />
                {c.label}
              </label>
            ))}
          </div>

          {selected.length === 0 && (
            <p className="text-xs text-danger-600 mt-1.5">
              Select at least one column to export.
            </p>
          )}
          {crowded && (
            <p className="text-xs text-warning-700 mt-1.5">
              {selected.length} columns will make the PDF text very small —
              consider choosing fewer columns, or use Excel.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2 border-t border-surface-100">
          <button
            className="btn-secondary w-full sm:w-auto justify-center"
            onClick={onClose}
            disabled={exporting}
          >
            Cancel
          </button>
          <button
            className="btn-primary w-full sm:w-auto justify-center"
            disabled={selected.length === 0 || exporting}
            onClick={() => onExport(selected, format)}
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Exporting…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" /> Export{" "}
                {format === "pdf" ? "PDF" : "Excel"}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}