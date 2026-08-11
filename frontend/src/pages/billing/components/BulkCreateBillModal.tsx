import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingAPI, buildingsAPI, projectsAPI } from "@/api/client";
import { Modal } from "@/components/ui";
import toast from "react-hot-toast";

interface BulkCreateBillModalProps {
  open: boolean;
  onClose: () => void;
}

export function BulkCreateBillModal({ open, onClose }: BulkCreateBillModalProps) {
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2 border-t border-surface-100">
          <button className="btn-secondary w-full sm:w-auto justify-center" onClick={handleClose}>
            Close
          </button>
          <button
            className="btn-primary w-full sm:w-auto justify-center"
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