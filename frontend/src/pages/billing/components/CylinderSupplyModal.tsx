import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { projectStatusAPI } from "@/api/projectStatusClient";
import { Modal } from "@/components/ui";
import toast from "react-hot-toast";
import { CylinderTypeForm, useCylinderTypes } from "./CylinderTypesModal";

interface Line {
  key: number;
  typeId: string;
  qty: string;
}

interface CylinderSupplyModalProps {
  open: boolean;
  onClose: () => void;
  project: { id: number; name: string } | null;
  defaultMonth: string; // YYYY-MM
  canEdit: boolean;
}

let lineKey = 0;
const newLine = (typeId = "", qty = ""): Line => ({ key: ++lineKey, typeId, qty });

export function CylinderSupplyModal({
  open,
  onClose,
  project,
  defaultMonth,
  canEdit,
}: CylinderSupplyModalProps) {
  const qc = useQueryClient();
  const [month, setMonth] = useState(defaultMonth);
  const [lines, setLines] = useState<Line[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // Start from the page's month each time the modal opens for a project.
  useEffect(() => {
    if (open) {
      setMonth(defaultMonth);
      setShowCreate(false);
    }
  }, [open, project?.id, defaultMonth]);

  const { data: types = [] } = useCylinderTypes(open);
  const typeById = useMemo(() => new Map(types.map((t) => [String(t.id), t])), [types]);

  const { data: saved, isFetching } = useQuery({
    queryKey: ["cylinder-supply", project?.id, month],
    queryFn: () => projectStatusAPI.getSupply(project!.id, month).then((r) => r.data),
    enabled: open && !!project && !!month,
  });

  // Load the saved lines for this project + month into the editable rows.
  useEffect(() => {
    if (!saved) return;
    setLines(
      saved.lines.length > 0
        ? saved.lines.map((l: any) => newLine(String(l.cylinder_type_id), String(l.quantity)))
        : [newLine()],
    );
  }, [saved]);

  const save = useMutation({
    mutationFn: () =>
      projectStatusAPI.saveSupply({
        project_id: project!.id,
        month,
        lines: lines
          .filter((l) => l.typeId)
          .map((l) => ({
            cylinder_type_id: Number(l.typeId),
            quantity: Math.max(0, Math.floor(Number(l.qty) || 0)),
          })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-status"] });
      qc.invalidateQueries({ queryKey: ["cylinder-supply", project?.id] });
      toast.success("Cylinders saved");
      onClose();
    },
  });

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const usedTypeIds = new Set(lines.map((l) => l.typeId).filter(Boolean));
  const hasDuplicate = lines.filter((l) => l.typeId).length !== usedTypeIds.size;

  const totals = lines.reduce(
    (acc, l) => {
      const t = typeById.get(l.typeId);
      const q = Math.max(0, Math.floor(Number(l.qty) || 0));
      if (t) {
        acc.count += q;
        acc.kg += q * Number(t.weight_kg);
      }
      return acc;
    },
    { count: 0, kg: 0 },
  );

  // Inactive types stay selectable only on lines that already use them.
  const selectable = (currentTypeId: string) =>
    types.filter((t) => t.is_active || String(t.id) === currentTypeId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? `Cylinders — ${project.name}` : "Cylinders"}
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-surface-500">
          How many cylinders were given to this project in the chosen month.
          Saving replaces what was recorded for that month.
        </p>

        <div className="max-w-xs">
          <label className="label">Month *</label>
          <input
            type="month"
            className="input"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[1fr_8rem_7rem_2.5rem] gap-3 text-xs font-semibold uppercase tracking-wider text-surface-500 px-1">
            <span>Cylinder</span>
            <span>Quantity</span>
            <span className="text-right">Weight</span>
            <span />
          </div>

          {lines.map((l) => {
            const t = typeById.get(l.typeId);
            const lineKg = t ? Math.max(0, Math.floor(Number(l.qty) || 0)) * Number(t.weight_kg) : 0;
            return (
              <div
                key={l.key}
                className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_7rem_2.5rem] gap-3 items-center"
              >
                <select
                  className="input"
                  value={l.typeId}
                  disabled={!canEdit}
                  onChange={(e) => update(l.key, { typeId: e.target.value })}
                  aria-label="Cylinder type"
                >
                  <option value="">— Select cylinder —</option>
                  {selectable(l.typeId).map((ty) => (
                    <option key={ty.id} value={ty.id}>
                      {ty.name} — {Number(ty.weight_kg).toLocaleString("en-BD")} kg
                      {ty.is_active ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input"
                  placeholder="0"
                  value={l.qty}
                  disabled={!canEdit}
                  onChange={(e) => update(l.key, { qty: e.target.value })}
                  aria-label="Quantity"
                />
                <div className="text-sm font-mono text-surface-600 sm:text-right">
                  {lineKg > 0 ? `${lineKg.toLocaleString("en-BD")} kg` : "—"}
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn-ghost btn-sm !p-2 justify-self-end"
                    onClick={() =>
                      setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine()]))
                    }
                    aria-label="Remove line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}

          {canEdit && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setLines((ls) => [...ls, newLine()])}
              >
                <Plus className="w-3.5 h-3.5" /> Add line
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setShowCreate((v) => !v)}
              >
                {showCreate ? "Hide new cylinder form" : "Create a new cylinder type"}
              </button>
            </div>
          )}
        </div>

        {showCreate && canEdit && (
          <div className="bg-surface-50 rounded-xl p-4">
            <CylinderTypeForm
              onCreated={(t) => {
                // Drop the new type straight into the first empty line.
                setLines((ls) => {
                  const empty = ls.find((x) => !x.typeId);
                  return empty
                    ? ls.map((x) => (x.key === empty.key ? { ...x, typeId: String(t.id) } : x))
                    : [...ls, newLine(String(t.id))];
                });
                setShowCreate(false);
              }}
            />
          </div>
        )}

        {hasDuplicate && (
          <p className="text-xs text-danger-600">
            The same cylinder type is selected on more than one line — combine them into one.
          </p>
        )}

        <div className="bg-surface-50 rounded-xl p-3 flex items-center justify-between text-sm">
          <span className="text-surface-500">Total given this month</span>
          <span className="font-semibold text-surface-900">
            {totals.count.toLocaleString("en-BD")} cylinders ·{" "}
            {totals.kg.toLocaleString("en-BD")} kg
          </span>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2 border-t border-surface-100">
          <button className="btn-secondary w-full sm:w-auto justify-center" onClick={onClose}>
            {canEdit ? "Cancel" : "Close"}
          </button>
          {canEdit && (
            <button
              className="btn-primary w-full sm:w-auto justify-center"
              disabled={!project || !month || hasDuplicate || isFetching || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}