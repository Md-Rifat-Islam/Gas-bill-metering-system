import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Plus, Search, FileText, Eye, Table2, List, Save, Info, Download, Loader2, CreditCard, Layers} from "lucide-react";
import { billingAPI, buildingsAPI, projectsAPI, unitsAPI, reportsAPI } from "@/api/client";
import { Modal, PageLoader, EmptyState, Pagination, StatusBadge,} from "@/components/ui";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { formatCurrency } from "@/utils/helpers";
import { usePermissions } from "@/hooks/usePermissions";
import toast from "react-hot-toast";

// ── Create Bill Modal ─────────────────────────────────────────────────────────
function CreateBillModal({ open, onClose }: any) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, reset } = useForm({
    defaultValues: {
      project_id: "",
      building_id: "",
      unit_id: "",
      billing_month: new Date().toISOString().slice(0, 7),
      previous_reading: 0,
      current_reading: 0,
      unit_price: 0,
      service_charge: 0,
      conversion_factor: "" as number | "",
      extra_charge: 0,
      discount: 0,
      late_fee: 0,
      is_adjusted: false,
      adjustment_reason: "",
    },
  });

  const projectId = watch("project_id");
  const buildingId = watch("building_id");
  const prevReading = watch("previous_reading") || 0;
  const currReading = watch("current_reading") || 0;
  const unitPrice = watch("unit_price") || 0;
  const serviceCharge = watch("service_charge") || 0;
  const extraCharge = watch("extra_charge") || 0;
  const discount = watch("discount") || 0;
  const lateFee = watch("late_fee") || 0;
  const isAdjusted = watch("is_adjusted");
  const conversionFactor = watch("conversion_factor");

  const usageM3 = Math.max(0, Number(currReading) - Number(prevReading));
  // Mirrors Bill.calculate() on the backend: bill on KG when a conversion
  // factor is present, otherwise on m³ — so this preview matches what the
  // server will actually charge.
  const usageKg = conversionFactor
    ? Math.round(usageM3 * Number(conversionFactor) * 100) / 100
    : null;
  const billableUsage = usageKg ?? usageM3;
  const baseAmount = billableUsage * Number(unitPrice);
  const total =
    baseAmount +
    Number(serviceCharge) +
    Number(extraCharge) +
    Number(lateFee) -
    Number(discount);

  const { data: projects } = useQuery({
    queryKey: ["projects-all"],
    queryFn: () =>
      projectsAPI
        .list({ page_size: 100 })
        .then((r) => r.data.results || r.data),
    enabled: open,
  });
  const { data: buildings } = useQuery({
    queryKey: ["buildings-by-project", projectId],
    queryFn: () =>
      buildingsAPI
        .list({ project: projectId, page_size: 100 })
        .then((r) => r.data.results || r.data),
    enabled: !!projectId,
  });
  const { data: units } = useQuery({
    queryKey: ["units-by-building", buildingId],
    queryFn: () =>
      unitsAPI
        .list({ building: buildingId, status: "Active", page_size: 200 })
        .then((r) => r.data.results || r.data),
    enabled: !!buildingId,
  });

  const selectedUnit = units?.find(
    (u: any) => String(u.id) === String(watch("unit_id")),
  );
  const unitId = watch("unit_id");

  const { data: latestReading } = useQuery({
    queryKey: ["latest-reading", unitId],
    queryFn: () => billingAPI.latestReading(unitId).then((r) => r.data),
    enabled: !!unitId,
  });

  useEffect(() => {
    if (!latestReading) return;

    setValue("previous_reading", Number(latestReading.current_reading || 0));
  }, [latestReading, setValue]);

  const selectedProject = projects?.find(
    (p: any) => String(p.id) === String(projectId),
  );

  // Automatic Billing Based on Project Package: when a project is picked,
  // pull its default package's rate (and conversion factor, if the package
  // is kg-based) plus the project's service charge — no manual lookup needed.
  const handleProjectChange = (id: string) => {
    setValue("project_id", id);
    setValue("building_id", "");
    setValue("unit_id", "");

    const proj = projects?.find((p: any) => String(p.id) === id);
    const pkg = proj?.default_package;
    setValue(
      "service_charge",
      proj?.service_charge ? Number(proj.service_charge) : 0,
    );
    if (pkg) {
      setValue("unit_price", Number(pkg.per_unit_cost));
      setValue(
        "conversion_factor",
        pkg.unit_type === "kg" && pkg.conversion_factor
          ? Number(pkg.conversion_factor)
          : "",
      );
    } else {
      setValue("unit_price", 0);
      setValue("conversion_factor", "");
    }
  };

  const save = useMutation({
    mutationFn: (data: any) => billingAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      toast.success("Bill created successfully");
      onClose();
      reset();
    },
  });

  const onSubmit = (data: any) => {
    const payload: any = {
      unit_id: data.unit_id,
      building_id: data.building_id,
      project_id: data.project_id,
      billing_month:
        data.billing_month.length === 7
          ? data.billing_month + "-01"
          : data.billing_month,
      previous_reading: data.previous_reading,
      current_reading: data.current_reading,
      unit_price: data.unit_price,
      service_charge: data.service_charge,
      extra_charge: data.extra_charge,
      discount: data.discount,
      late_fee: data.late_fee,
      is_adjusted: data.is_adjusted,
      adjustment_reason: data.adjustment_reason,
    };
    if (data.conversion_factor)
      payload.conversion_factor = data.conversion_factor;
    save.mutate(payload);
  };

  return (
    <Modal open={open} onClose={onClose} title="Create New Bill" size="xl">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-3 gap-8">
          {/* Left column */}
          <div className="col-span-2 space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Project *</label>
                <select
                  {...register("project_id", { required: true })}
                  className="input"
                  onChange={(e) => handleProjectChange(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {projects?.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Building *</label>
                <select
                  {...register("building_id", { required: true })}
                  className="input"
                  onChange={(e) => {
                    setValue("building_id", e.target.value);
                    setValue("unit_id", "");
                  }}
                  disabled={!projectId}
                >
                  <option value="">— Select —</option>
                  {buildings?.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Unit *</label>
                <select
                  {...register("unit_id", { required: true })}
                  className="input"
                  disabled={!buildingId}
                >
                  <option value="">— Select —</option>
                  {units?.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      F{u.floor_no}-{u.unit_no}{" "}
                      {u.allottee?.name ? `(${u.allottee.name})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedUnit && (
              <div className="bg-brand-50 rounded-xl p-3 text-sm flex gap-4">
                <span className="text-surface-500">Allottee:</span>
                <span className="font-semibold">
                  {selectedUnit.allottee?.name || "—"}
                </span>
                <span className="text-surface-500">Mobile:</span>
                <span className="font-semibold">
                  {selectedUnit.mobile_number || "—"}
                </span>
                <span className="text-surface-500">Meter:</span>
                <span className="font-mono font-semibold">
                  {selectedUnit.meter_no || "—"}
                </span>
              </div>
            )}

            {selectedProject?.default_package && (
              <div className="flex items-start gap-2 bg-surface-50 border border-surface-100 rounded-xl p-3 text-xs text-surface-500">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-brand-500" />
                <span>
                  Auto-filled from{" "}
                  <span className="font-semibold text-surface-700">
                    {selectedProject.default_package.name}
                  </span>{" "}
                  —{" "}
                  {formatCurrency(
                    selectedProject.default_package.per_unit_cost,
                  )}
                  /{selectedProject.default_package.unit_type}
                  {selectedProject.default_package.unit_type === "kg" &&
                    selectedProject.default_package.conversion_factor && (
                      <>
                        {" "}
                        · conversion{" "}
                        {selectedProject.default_package.conversion_factor}{" "}
                        kg/m³
                      </>
                    )}
                  . Adjust below if this bill needs a different rate.
                </span>
              </div>
            )}

            <div>
              <label className="label">Billing Month</label>
              <input
                {...register("billing_month", { required: true })}
                type="month"
                className="input max-w-[200px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Previous Reading (m³)</label>
                <input
                  {...register("previous_reading", { required: true, min: 0 })}
                  type="number"
                  step="0.01"
                  className="input bg-surface-50 readOnly"
                />
                <p className="text-xs text-surface-500 mt-1">
                  Auto-filled from latest meter reading
                </p>
              </div>
              <div>
                <label className="label">Current Reading (m³)</label>
                <input
                  {...register("current_reading", { required: true, min: 0 })}
                  type="number"
                  step="0.01"
                  className="input"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Unit Price *</label>
                <input
                  {...register("unit_price", { required: true, min: 0 })}
                  type="number"
                  step="0.01"
                  className="input"
                />
                <p className="text-[11px] text-surface-400 mt-1">
                  per {conversionFactor ? "kg" : "m³"}
                </p>
              </div>
              <div>
                <label className="label">Service Charge (৳)</label>
                <input
                  {...register("service_charge", { min: 0 })}
                  type="number"
                  step="0.01"
                  className="input"
                />
              </div>
              <div>
                <label className="label">
                  Conversion Ratio{" "}
                  <span className="text-surface-400 font-normal text-xs">
                    (kg/m³)
                  </span>
                </label>
                <input
                  {...register("conversion_factor", { min: 0 })}
                  type="number"
                  step="0.0001"
                  className="input"
                  placeholder="Leave blank to bill on m³"
                />
              </div>
            </div>

            {/* Adjustment section */}
            <div className="border border-surface-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  {...register("is_adjusted")}
                  type="checkbox"
                  id="is_adjusted"
                  className="rounded"
                />
                <label
                  htmlFor="is_adjusted"
                  className="text-sm font-medium text-surface-700 cursor-pointer"
                >
                  Apply Adjustments
                </label>
              </div>
              {isAdjusted && (
                <div className="grid grid-cols-3 gap-4 animate-fadeIn">
                  <div>
                    <label className="label">Extra Charge (৳)</label>
                    <input
                      {...register("extra_charge", { min: 0 })}
                      type="number"
                      step="0.01"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Discount (৳)</label>
                    <input
                      {...register("discount", { min: 0 })}
                      type="number"
                      step="0.01"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Late Fee (৳)</label>
                    <input
                      {...register("late_fee", { min: 0 })}
                      type="number"
                      step="0.01"
                      className="input"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="label">Adjustment Reason *</label>
                    <input
                      {...register("adjustment_reason")}
                      className="input"
                      placeholder="Reason for adjustment"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right — Bill summary */}
          <div>
            <div className="bg-surface-50 rounded-2xl p-5 sticky top-0">
              <div className="text-sm font-bold text-surface-700 mb-4 uppercase tracking-wider">
                Bill Summary
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-surface-500">Consumed (m³)</span>
                  <span className="font-semibold">{usageM3.toFixed(2)} m³</span>
                </div>
                {usageKg !== null && (
                  <div className="flex justify-between">
                    <span className="text-surface-500">Final Usage (KG)</span>
                    <span className="font-semibold text-brand-700">
                      {usageKg.toFixed(2)} kg
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-surface-500">Unit Price</span>
                  <span>
                    {formatCurrency(unitPrice)} /{" "}
                    {usageKg !== null ? "kg" : "m³"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-surface-200 pt-2">
                  <span className="text-surface-600 font-medium">
                    Base Amount
                  </span>
                  <span className="font-bold">
                    {formatCurrency(baseAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-surface-500">
                  <span>Service Charge</span>
                  <span>+ {formatCurrency(serviceCharge)}</span>
                </div>
                {Number(extraCharge) > 0 && (
                  <div className="flex justify-between text-surface-500">
                    <span>Extra Charge</span>
                    <span>+ {formatCurrency(extraCharge)}</span>
                  </div>
                )}
                {Number(lateFee) > 0 && (
                  <div className="flex justify-between text-warning-600">
                    <span>Late Fee</span>
                    <span>+ {formatCurrency(lateFee)}</span>
                  </div>
                )}
                {Number(discount) > 0 && (
                  <div className="flex justify-between text-success-600">
                    <span>Discount</span>
                    <span>− {formatCurrency(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t-2 border-surface-900 pt-3 mt-1">
                  <span className="font-bold text-surface-900 text-base">
                    Total
                  </span>
                  <span className="font-bold text-brand-600 text-xl">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-surface-100">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={save.isPending}
          >
            {save.isPending ? "Creating Bill…" : "Create Bill"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Bulk Create Bill Modal ────────────────────────────────────────────────────
function BulkCreateBillModal({ open, onClose }: any) {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [result, setResult] = useState<any | null>(null);

  const { data: projects } = useQuery({
    queryKey: ["projects-all"],
    queryFn: () =>
      projectsAPI
        .list({ page_size: 100 })
        .then((r) => r.data.results || r.data),
    enabled: open,
  });
  const { data: buildings } = useQuery({
    queryKey: ["buildings-by-project", projectId],
    queryFn: () =>
      buildingsAPI
        .list({ project: projectId, page_size: 100 })
        .then((r) => r.data.results || r.data),
    enabled: !!projectId,
  });

  const bulkCreate = useMutation({
    mutationFn: () =>
      billingAPI.bulkCreate({ building_id: buildingId, billing_month: month }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      setResult(res.data);
      if (res.data.created_count > 0) {
        toast.success(`${res.data.created_count} bill(s) created`);
      } else {
        toast("No new bills were created — see details below", { icon: "ℹ️" });
      }
    },
  });

  const handleClose = () => {
    onClose();
    setResult(null);
    setProjectId("");
    setBuildingId("");
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Bulk Create Bills"
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-surface-500">
          Creates a bill for every active unit in the selected building that
          already has a meter reading recorded for the chosen month — no
          re-typing readings here. Units without a reading yet are skipped;
          record their reading first via the Quick Reading Dashboard.
        </p>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="bulk-create-project" className="label">
              Project *
            </label>
            <select
              id="bulk-create-project"
              className="input"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setBuildingId("");
                setResult(null);
              }}
            >
              <option value="">— Select —</option>
              {projects?.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bulk-create-building" className="label">
              Building *
            </label>
            <select
              id="bulk-create-building"
              className="input"
              value={buildingId}
              onChange={(e) => {
                setBuildingId(e.target.value);
                setResult(null);
              }}
              disabled={!projectId}
            >
              <option value="">— Select —</option>
              {buildings?.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Billing Month *</label>
            <input
              type="month"
              className="input"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setResult(null);
              }}
            />
          </div>
        </div>

        {result && (
          <div className="space-y-3 animate-fadeIn">
            <div className="bg-success-50 rounded-xl p-3 text-sm text-success-700">
              <strong>{result.created_count}</strong> bill
              {result.created_count === 1 ? "" : "s"} created successfully.
            </div>

            {result.skipped_already_billed?.length > 0 && (
              <div className="bg-surface-50 rounded-xl p-3 text-sm">
                <div className="font-semibold text-surface-600 mb-1.5">
                  Already billed this month (
                  {result.skipped_already_billed.length})
                </div>
                <ul className="text-xs text-surface-400 space-y-0.5 max-h-32 overflow-y-auto">
                  {result.skipped_already_billed.map((s: any, i: number) => (
                    <li key={i}>{s.unit_no}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.skipped_no_reading?.length > 0 && (
              <div className="bg-warning-50 rounded-xl p-3 text-sm">
                <div className="font-semibold text-warning-700 mb-1.5">
                  Needs a meter reading first (
                  {result.skipped_no_reading.length})
                </div>
                <ul className="text-xs text-warning-600 space-y-0.5 max-h-32 overflow-y-auto">
                  {result.skipped_no_reading.map((s: any, i: number) => (
                    <li key={i}>
                      {s.unit_no} — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2 border-t border-surface-100">
          <button className="btn-secondary" onClick={handleClose}>
            Close
          </button>
          <button
            className="btn-primary"
            disabled={!buildingId || bulkCreate.isPending}
            onClick={() => bulkCreate.mutate()}
          >
            {bulkCreate.isPending ? "Creating…" : "Create Bills"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Spreadsheet editable cell ─────────────────────────────────────────────────
const EDITABLE_FIELDS = ["previous_reading", "current_reading", "unit_price", "service_charge", "extra_charge", "discount", "late_fee",] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

function computePreviewTotal(
  bill: any,
  edits: Partial<Record<EditableField, number>>,
) {
  const get = (f: EditableField) =>
    edits[f] !== undefined ? edits[f]! : Number(bill[f] || 0);
  const prev = get("previous_reading");
  const curr = get("current_reading");
  const usageM3 = Math.max(0, curr - prev);
  const conversionFactor = bill.conversion_factor
    ? Number(bill.conversion_factor)
    : null;
  const billable = conversionFactor ? usageM3 * conversionFactor : usageM3;
  const base = billable * get("unit_price");
  const total =
    base +
    get("service_charge") +
    get("extra_charge") +
    get("late_fee") -
    get("discount");
  return { usageM3, base, total };
}

function SpreadsheetCell({ bill, field, edits, onChange, }: {
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

function SpreadsheetBillingTable({ bills }: { bills: any[] }) {
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
    <div className="table-wrapper">
      <table className="table">
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [createModal, setCreateModal] = useState(false);
  const [view, setView] = useState<"table" | "spreadsheet">("table");
  const [exporting, setExporting] = useState(false);
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [bulkModal, setBulkModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["bills", search, statusFilter, page],
    queryFn: () =>
      billingAPI
        .list({
          search,
          status: statusFilter || undefined,
          page,
        })
        .then((r) => r.data),
  });

  const bills = data?.results || [];

  const handleExport = async () => {
    setExporting(true);
    try {
      // Exports exactly what's currently filtered on this page — same
      // search/status params the list query itself is using.
      await reportsAPI.exportBillsExcel({
        search: search || undefined,
        status: statusFilter || undefined,
      });
    } catch {
      toast.error("Could not export bills");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">
            Create and manage gas bills for all units
          </p>
        </div>
        <div className="flex gap-3">
          {can.editBillSpreadsheet && (
            <div className="flex gap-1 bg-surface-100 rounded-xl p-1">
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
            className="btn-secondary"
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
              className="btn-secondary"
              onClick={() => setBulkModal(true)}
              title="Create bills for multiple units at once"
            >
              <Layers className="w-4 h-4" /> Bulk Create
            </button>
          )}
          {can.createBill && (
            <button
              className="btn-primary"
              onClick={() => setCreateModal(true)}
            >
              <Plus className="w-4 h-4" /> Create Bill
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            className="input pl-9"
            placeholder="Search bill no., unit, allottee…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="input max-w-[140px]"
          value={statusFilter}
          aria-label="Filter bills by status"
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Status</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partial">Partial</option>
          <option value="Paid">Paid</option>
        </select>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : view === "spreadsheet" && can.editBillSpreadsheet ? (
        <>
          <SpreadsheetBillingTable bills={bills} />
          <Pagination page={page} count={data?.count || 0} onChange={setPage} />
        </>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="table">
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
                          {can.recordPayment &&
                            (b.status === "Unpaid" ||
                              b.status === "Partial") && (
                              <button
                                className="btn-ghost btn-sm text-success-600 hover:bg-success-50"
                                onClick={() => setPayTarget(b)}
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
          <Pagination page={page} count={data?.count || 0} onChange={setPage} />
        </>
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
