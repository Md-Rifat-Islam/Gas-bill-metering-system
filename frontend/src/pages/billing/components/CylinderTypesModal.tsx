import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectStatusAPI } from "@/api/projectStatusClient";
import { Modal } from "@/components/ui";
import toast from "react-hot-toast";

export interface CylinderType {
  id: number;
  name: string;
  weight_kg: string;
  is_active: boolean;
}

export function useCylinderTypes(enabled = true) {
  return useQuery<CylinderType[]>({
    queryKey: ["cylinder-types"],
    queryFn: () =>
      projectStatusAPI.cylinderTypes().then((r) => r.data.results || r.data),
    enabled,
  });
}

/**
 * Small create form, used both here and inside the supply modal so a new
 * cylinder size can be added without leaving what you are doing.
 */
export function CylinderTypeForm({
  onCreated,
}: {
  onCreated?: (type: CylinderType) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");

  const create = useMutation({
    mutationFn: () =>
      projectStatusAPI.createCylinderType({
        name: name.trim() || undefined,
        weight_kg: weight,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["cylinder-types"] });
      toast.success("Cylinder type added");
      setName("");
      setWeight("");
      onCreated?.(res.data);
    },
  });

  const valid = Number(weight) > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_auto] gap-3 items-end">
      <div>
        <label className="label">
          Name{" "}
          <span className="text-surface-400 font-normal text-xs">(optional)</span>
        </label>
        <input
          className="input"
          placeholder="e.g. 12 kg cylinder"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Weight (kg) *</label>
        <input
          type="number"
          min="0"
          step="0.01"
          className="input"
          placeholder="12"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="btn-primary justify-center"
        disabled={!valid || create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

export function CylinderTypesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: types = [], isLoading } = useCylinderTypes(open);

  const toggle = useMutation({
    mutationFn: (t: CylinderType) =>
      projectStatusAPI.updateCylinderType(t.id, { is_active: !t.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cylinder-types"] }),
  });

  return (
    <Modal open={open} onClose={onClose} title="Cylinder Types" size="lg">
      <div className="space-y-5">
        <p className="text-sm text-surface-500">
          Cylinder sizes you can give to a project. The weight is multiplied by
          the quantity supplied to get the total kg given. A type that has
          already been used can be deactivated but not deleted.
        </p>

        <CylinderTypeForm />

        <div className="table-wrapper !shadow-none">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="text-right">Weight</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="text-center text-surface-400 py-6">
                    Loading…
                  </td>
                </tr>
              ) : types.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-surface-400 py-6">
                    No cylinder types yet — add the first one above.
                  </td>
                </tr>
              ) : (
                types.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium text-surface-800">{t.name}</td>
                    <td className="text-right font-mono">
                      {Number(t.weight_kg).toLocaleString("en-BD")} kg
                    </td>
                    <td>
                      <span className={t.is_active ? "badge-green" : "badge-gray"}>
                        {t.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        className="btn-ghost btn-sm"
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate(t)}
                      >
                        {t.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-2 border-t border-surface-100">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}