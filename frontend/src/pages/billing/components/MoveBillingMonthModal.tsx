import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingAPI, buildingsAPI, projectsAPI } from "@/api/client";
import { Modal } from "@/components/ui";
import toast from "react-hot-toast";

interface MoveBillingMonthModalProps {
    open: boolean;
    onClose: () => void;
}

// Local-time "YYYY-MM" (toISOString would use UTC and can be a month off
// in the first hours of the 1st in Bangladesh time).
function monthString(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function defaultMonths() {
    const now = new Date();
    return {
        from: monthString(now),
        to: monthString(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    };
}

export function MoveBillingMonthModal({
    open,
    onClose,
}: MoveBillingMonthModalProps) {
    const qc = useQueryClient();
    const initial = defaultMonths();
    const [projectId, setProjectId] = useState("");
    const [buildingId, setBuildingId] = useState("");
    const [fromMonth, setFromMonth] = useState(initial.from);
    const [toMonth, setToMonth] = useState(initial.to);
    const [preview, setPreview] = useState<any | null>(null);
    const [done, setDone] = useState<any | null>(null);
    const [confirmed, setConfirmed] = useState(false);

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

    // Any change to the inputs invalidates the preview — the operator must
    // always confirm exactly what was previewed.
    const resetResults = () => {
        setPreview(null);
        setDone(null);
        setConfirmed(false);
    };

    const run = useMutation({
        mutationFn: (dryRun: boolean) =>
            billingAPI.moveMonth({
                project_id: projectId,
                building_id: buildingId || null,
                from_month: fromMonth,
                to_month: toMonth,
                dry_run: dryRun,
                expected_count: dryRun ? undefined : preview?.movable_count,
            }),
        onSuccess: (res, dryRun) => {
            if (dryRun) {
                setPreview(res.data);
                setConfirmed(false);
            } else {
                setDone(res.data);
                setPreview(null);
                qc.invalidateQueries({ queryKey: ["bills"] });
                qc.invalidateQueries({ queryKey: ["meters"] });
                toast.success(`${res.data.moved_count} bill(s) moved`);
            }
        },
    });

    const handleClose = () => {
        onClose();
        const d = defaultMonths();
        setProjectId("");
        setBuildingId("");
        setFromMonth(d.from);
        setToMonth(d.to);
        resetResults();
    };

    const withPayments = preview
        ? preview.movable.filter((m: any) => Number(m.paid_amount) > 0).length
        : 0;
    const withWarnings = preview
        ? preview.movable.filter((m: any) => m.warnings?.length > 0).length
        : 0;

    const inputsValid =
        !!projectId && !!fromMonth && !!toMonth && fromMonth !== toMonth;

    return (
        <Modal
            open={open}
            onClose={handleClose}
            title="Move Billing Month"
            size="lg"
        >
            <div className="space-y-4">
                <p className="text-sm text-surface-500">
                    Fixes bills created under the wrong month (for example October
                    readings that were billed as November). Bills are moved to the
                    correct month together with the meter reading they were built from.
                    Amounts, payments and bill numbers do not change, and no SMS is sent.
                    Units that already have a bill in the correct month are skipped.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="move-month-project" className="label">
                            Project *
                        </label>
                        <select
                            id="move-month-project"
                            className="input"
                            value={projectId}
                            onChange={(e) => {
                                setProjectId(e.target.value);
                                setBuildingId("");
                                resetResults();
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
                        <label htmlFor="move-month-building" className="label">
                            Building{" "}
                            <span className="text-surface-400 font-normal text-xs">
                                (optional)
                            </span>
                        </label>
                        <select
                            id="move-month-building"
                            className="input"
                            value={buildingId}
                            onChange={(e) => {
                                setBuildingId(e.target.value);
                                resetResults();
                            }}
                            disabled={!projectId}
                        >
                            <option value="">All buildings in project</option>
                            {buildings?.map((b: any) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label">Wrong month (move FROM) *</label>
                        <input
                            type="month"
                            className="input"
                            value={fromMonth}
                            onChange={(e) => {
                                setFromMonth(e.target.value);
                                resetResults();
                            }}
                        />
                    </div>
                    <div>
                        <label className="label">Correct month (move TO) *</label>
                        <input
                            type="month"
                            className="input"
                            value={toMonth}
                            onChange={(e) => {
                                setToMonth(e.target.value);
                                resetResults();
                            }}
                        />
                    </div>
                </div>

                {fromMonth && toMonth && fromMonth === toMonth && (
                    <p className="text-xs text-danger-600">
                        The two months must be different.
                    </p>
                )}

                {preview && (
                    <div className="space-y-3 animate-fadeIn">
                        <div className="bg-warning-50 rounded-xl p-3 text-sm text-warning-700">
                            <strong>{preview.movable_count}</strong> bill
                            {preview.movable_count === 1 ? "" : "s"} will move from{" "}
                            <strong>{preview.from_month}</strong> to{" "}
                            <strong>{preview.to_month}</strong>.
                            {withPayments > 0 && (
                                <div className="text-xs mt-1">
                                    {withPayments} of them already have payments — the payments
                                    stay attached to the bill.
                                </div>
                            )}
                            {withWarnings > 0 && (
                                <div className="text-xs mt-1">
                                    {withWarnings} have a note to review (shown in the list).
                                </div>
                            )}
                        </div>

                        {preview.movable_count > 0 && (
                            <div className="rounded-xl border border-surface-100">
                                <div className="max-h-64 overflow-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-surface-50 text-surface-500 sticky top-0">
                                            <tr>
                                                <th className="text-left px-3 py-2">Building</th>
                                                <th className="text-left px-3 py-2">Unit</th>
                                                <th className="text-left px-3 py-2">Bill #</th>
                                                <th className="text-right px-3 py-2">Total</th>
                                                <th className="text-right px-3 py-2">Paid</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.movable.map((m: any) => (
                                                <tr key={m.bill_id} className="border-t border-surface-100">
                                                    <td className="px-3 py-1.5">{m.building_name}</td>
                                                    <td className="px-3 py-1.5">{m.unit_no}</td>
                                                    <td className="px-3 py-1.5">
                                                        {m.bill_number}
                                                        {m.warnings?.map((w: string, i: number) => (
                                                            <div key={i} className="text-warning-600">
                                                                ⚠ {w}
                                                            </div>
                                                        ))}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right">
                                                        {m.total_amount}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right">
                                                        {m.paid_amount}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {preview.skipped_count > 0 && (
                            <div className="bg-surface-50 rounded-xl p-3 text-sm">
                                <div className="font-semibold text-surface-600 mb-1.5">
                                    Will be skipped ({preview.skipped_count})
                                </div>
                                <ul className="text-xs text-surface-400 space-y-0.5 max-h-32 overflow-y-auto">
                                    {preview.skipped.map((s: any) => (
                                        <li key={s.bill_id}>
                                            {s.building_name} / {s.unit_no} — {s.reason}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {preview.movable_count > 0 && (
                            <label className="flex items-start gap-2 text-sm text-surface-600">
                                <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={confirmed}
                                    onChange={(e) => setConfirmed(e.target.checked)}
                                />
                                <span>
                                    I checked the list above. Move these {preview.movable_count}{" "}
                                    bills to {preview.to_month}.
                                </span>
                            </label>
                        )}
                    </div>
                )}

                {done && (
                    <div className="space-y-3 animate-fadeIn">
                        <div className="bg-success-50 rounded-xl p-3 text-sm text-success-700">
                            <strong>{done.moved_count}</strong> bill
                            {done.moved_count === 1 ? "" : "s"} moved from{" "}
                            {done.from_month} to {done.to_month}.
                            {done.skipped_count > 0 &&
                                ` ${done.skipped_count} skipped (already billed in ${done.to_month}).`}
                        </div>
                    </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2 border-t border-surface-100">
                    <button
                        className="btn-secondary w-full sm:w-auto justify-center"
                        onClick={handleClose}
                    >
                        Close
                    </button>
                    <button
                        className="btn-secondary w-full sm:w-auto justify-center"
                        disabled={!inputsValid || run.isPending}
                        onClick={() => run.mutate(true)}
                    >
                        {run.isPending && run.variables === true ? "Checking…" : "Preview"}
                    </button>
                    <button
                        className="btn-primary w-full sm:w-auto justify-center"
                        disabled={
                            !preview ||
                            preview.movable_count === 0 ||
                            !confirmed ||
                            run.isPending
                        }
                        onClick={() => run.mutate(false)}
                    >
                        {run.isPending && run.variables === false
                            ? "Moving…"
                            : preview?.movable_count
                                ? `Move ${preview.movable_count} Bills`
                                : "Move Bills"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}