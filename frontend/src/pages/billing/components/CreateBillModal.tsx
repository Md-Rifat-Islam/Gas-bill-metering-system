import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Info, Gauge } from "lucide-react";
import { billingAPI, buildingsAPI, projectsAPI, unitsAPI } from "@/api/client";
import { Modal } from "@/components/ui";
import { formatCurrency, formatDate } from "@/utils/helpers";
import { computeUsage, computeBillTotal } from "@/utils/billingCalculations";
import toast from "react-hot-toast";

interface CreateBillModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateBillModal({ open, onClose }: CreateBillModalProps) {
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

  const { usageM3, usageKg, billableUsage } = computeUsage(
    prevReading,
    currReading,
    conversionFactor,
  );
  const baseAmount = billableUsage * Number(unitPrice);
  const total = computeBillTotal({
    billableUsage,
    unitPrice,
    serviceCharge,
    extraCharge,
    discount,
    lateFee,
  });

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

  // The most recent MeterReading recorded for this unit's meter (via the
  // Quick Reading Dashboard / Record Reading flow) — carries its own
  // previous_reading / current_reading / reading_date, distinct from this
  // bill's own Previous/Current Reading fields below. Shown so staff can
  // see exactly which recorded reading the bill is being seeded from,
  // rather than a number just silently appearing in the field.
  const { data: latestReading, isFetching: loadingLatestReading } = useQuery({
    queryKey: ["latest-reading", unitId],
    queryFn: () => billingAPI.latestReading(unitId).then((r) => r.data),
    enabled: !!unitId,
  });

  useEffect(() => {
    if (!latestReading) return;
    // THE FIX: this used to read `latestReading.current_reading` into
    // previous_reading — copying the wrong field of the response. The
    // backend's LatestUnitReadingView (and BulkCreateBillsView, which does
    // this same mapping server-side) returns the latest MeterReading's own
    // previous_reading and current_reading as two distinct values; both
    // belong on this bill directly, not cross-mapped.
    setValue("previous_reading", Number(latestReading.previous_reading ?? 0));
    setValue("current_reading", Number(latestReading.current_reading ?? 0));
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <div className="bg-brand-50 rounded-xl p-3 text-sm flex flex-wrap gap-x-4 gap-y-1">
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

            {/* Last recorded meter reading — makes visible exactly what
                the Previous Reading field below is being auto-filled
                from, instead of a number just silently appearing there. */}
            {unitId && (
              <div className="flex items-start gap-3 bg-brand-50 border border-brand-100 rounded-xl p-3 text-sm">
                <Gauge className="w-4 h-4 mt-0.5 shrink-0 text-brand-500" />
                {loadingLatestReading ? (
                  <span className="text-surface-500 text-xs">
                    Loading last recorded meter reading…
                  </span>
                ) : latestReading ? (
                  <div className="flex-1">
                    <div className="text-xs text-surface-500 mb-1">
                      Last Recorded Meter Reading
                      {latestReading.reading_date && (
                        <> · {formatDate(latestReading.reading_date)}</>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-surface-500 text-xs">Previous</span>
                      <span className="font-mono font-semibold">
                        {Number(latestReading.previous_reading ?? 0).toFixed(2)} m³
                      </span>
                      <span className="text-surface-300">→</span>
                      <span className="text-surface-500 text-xs">Taken</span>
                      <span className="font-mono font-bold text-brand-700">
                        {Number(latestReading.current_reading ?? 0).toFixed(2)} m³
                      </span>
                    </div>
                    <p className="text-[11px] text-surface-400 mt-1">
                      This bill's Previous and Current Reading below are auto-filled from the reading taken above — edit Current Reading if you've taken a newer one that isn't recorded yet.
                    </p>
                  </div>
                ) : (
                  <span className="text-surface-500 text-xs">
                    No meter reading has been recorded for this unit yet — enter Previous and Current Reading manually below.
                  </span>
                )}
              </div>
            )}

            <div>
              <label className="label">Billing Month</label>
              <input
                {...register("billing_month", { required: true })}
                type="month"
                className="input w-full sm:max-w-[200px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Previous Reading (m³)</label>
                <input
                  {...register("previous_reading", { required: true, min: 0 })}
                  type="number"
                  step="0.01"
                  className="input bg-surface-50"
                  readOnly={!!latestReading}
                  title={
                    latestReading
                      ? "Auto-filled from the last recorded meter reading — cannot be edited"
                      : "No reading on file for this unit yet — enter the starting value"
                  }
                />
                <p className="text-xs text-surface-500 mt-1">
                  {latestReading
                    ? "Auto-filled from latest meter reading"
                    : "No prior reading found — enter manually"}
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
                {latestReading && Number(latestReading.current_reading) > 0 && (
                  <p className="text-xs text-surface-500 mt-1">
                    Auto-filled from latest meter reading — edit if a newer reading has been taken
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fadeIn">
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
                  <div className="sm:col-span-3">
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
            <div className="bg-surface-50 rounded-2xl p-5 lg:sticky lg:top-0">
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

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end mt-6 pt-4 border-t border-surface-100">
          <button type="button" className="btn-secondary w-full sm:w-auto justify-center" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary w-full sm:w-auto justify-center"
            disabled={save.isPending}
          >
            {save.isPending ? "Creating Bill…" : "Create Bill"}
          </button>
        </div>
      </form>
    </Modal>
  );
}