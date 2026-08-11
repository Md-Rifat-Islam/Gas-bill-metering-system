import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { billingAPI } from "@/api/client";
import { formatCurrency } from "@/utils/helpers";
import { computeUsage, computeBillTotal } from "@/utils/billingCalculations";
import toast from "react-hot-toast";

const EDITABLE_FIELDS = [
  "previous_reading",
  "current_reading",
  "unit_price",
  "service_charge",
  "extra_charge",
  "discount",
  "late_fee",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

function computePreviewTotal(
  bill: any,
  edits: Partial<Record<EditableField, number>>,
) {
  const get = (f: EditableField) =>
    edits[f] !== undefined ? edits[f]! : Number(bill[f] || 0);

  const { usageM3, billableUsage } = computeUsage(
    get("previous_reading"),
    get("current_reading"),
    bill.conversion_factor,
  );
  const total = computeBillTotal({
    billableUsage,
    unitPrice: get("unit_price"),
    serviceCharge: get("service_charge"),
    extraCharge: get("extra_charge"),
    discount: get("discount"),
    lateFee: get("late_fee"),
  });
  return { usageM3, total };
}

function SpreadsheetCell({
  bill,
  field,
  edits,
  onChange,
}: {
  bill: any;
  field: EditableField;
  edits: Partial<Record<EditableField, number>>;
  onChange: (field: EditableField, value: number) => void;
}) {
  const original = Number(bill[field] || 0);
  const current = edits[field] !== undefined ? edits[field]! : original;
  const dirty = edits[field] !== undefined && edits[field] !== original;

  return (
    <div className="flex flex-col">
      <input
        type="number"
        step="0.01"
        value={current}
        onChange={(e) => onChange(field, Number(e.target.value))}
        className={`input !py-1 !px-2 !text-sm font-mono ${dirty ? "!border-brand-400 !bg-brand-50" : ""}`}
      />
      {dirty && (
        <span className="text-[10px] text-surface-400 mt-0.5">
          was {original}
        </span>
      )}
    </div>
  );
}

export function SpreadsheetBillingTable({ bills }: { bills: any[] }) {
  const qc = useQueryClient();
  const [editsByBill, setEditsByBill] = useState<
    Record<number, Partial<Record<EditableField, number>>>
  >({});

  const save = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      billingAPI.quickEdit(id, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      setEditsByBill((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.success("Bill updated");
    },
  });

  const handleChange = (
    billId: number,
    field: EditableField,
    value: number,
  ) => {
    setEditsByBill((prev) => ({
      ...prev,
      [billId]: { ...prev[billId], [field]: value },
    }));
  };

  const handleSaveRow = (bill: any) => {
    const edits = editsByBill[bill.id];
    if (!edits || Object.keys(edits).length === 0) return;
    save.mutate({ id: bill.id, data: edits });
  };

  return (
    // Many editable columns won't fit a phone screen — scroll horizontally
    // instead of squashing the inputs unusably small.
    <div className="table-wrapper overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <table className="table min-w-[1100px] sm:min-w-0">
        <thead>
          <tr>
            <th>Bill No.</th>
            <th>Unit</th>
            <th className="text-right">Previous</th>
            <th className="text-right">Current</th>
            <th className="text-right">Unit Price</th>
            <th className="text-right">Service Charge</th>
            <th className="text-right">Extra</th>
            <th className="text-right">Discount</th>
            <th className="text-right">Late Fee</th>
            <th className="text-right">Preview Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bills.map((bill: any) => {
            const edits = editsByBill[bill.id] || {};
            const isDirty = Object.keys(edits).length > 0;
            const preview = computePreviewTotal(bill, edits);
            return (
              <tr key={bill.id} className={isDirty ? "bg-brand-50/40" : ""}>
                <td>
                  <span className="font-mono text-xs font-semibold text-brand-700">
                    {bill.bill_number}
                  </span>
                </td>
                <td className="text-sm">
                  <div className="font-medium text-surface-800">
                    {bill.unit_no}
                  </div>
                  <div className="text-xs text-surface-400">
                    {bill.allottee_name || "—"}
                  </div>
                </td>
                {EDITABLE_FIELDS.slice(0, 2).map((f) => (
                  <td key={f} className="min-w-[100px]">
                    <SpreadsheetCell
                      bill={bill}
                      field={f}
                      edits={edits}
                      onChange={(field, v) => handleChange(bill.id, field, v)}
                    />
                  </td>
                ))}
                {EDITABLE_FIELDS.slice(2).map((f) => (
                  <td key={f} className="min-w-[110px]">
                    <SpreadsheetCell
                      bill={bill}
                      field={f}
                      edits={edits}
                      onChange={(field, v) => handleChange(bill.id, field, v)}
                    />
                  </td>
                ))}
                <td className="text-right font-mono text-sm min-w-[140px]">
                  {isDirty ? (
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-surface-400 line-through">
                        {formatCurrency(bill.total_amount)}
                      </span>
                      <span className="font-bold text-brand-600">
                        {formatCurrency(preview.total)}
                      </span>
                      <span
                        className={`text-[10px] font-semibold ${
                          preview.total - Number(bill.total_amount) >= 0
                            ? "text-warning-600"
                            : "text-success-600"
                        }`}
                      >
                        {preview.total - Number(bill.total_amount) >= 0
                          ? "+"
                          : ""}
                        {formatCurrency(
                          preview.total - Number(bill.total_amount),
                        )}
                      </span>
                    </div>
                  ) : (
                    <span className="font-bold">
                      {formatCurrency(bill.total_amount)}
                    </span>
                  )}
                </td>
                <td>
                  {isDirty && (
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => handleSaveRow(bill)}
                      disabled={save.isPending}
                      title="Save this row"
                    >
                      <Save className="w-3.5 h-3.5" /> Save
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}