import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Building2, ChevronRight, Loader2 } from "lucide-react";
import { portalAPI } from "@/api/portalClient";
import { useCustomerAuthStore, type PortalUnit } from "@/store/customerAuthStore";

export default function PortalUnitSelectPage() {
  const navigate = useNavigate();
  const { customer, setSelectedUnit } = useCustomerAuthStore();

  const { data: units, isLoading } = useQuery({
    queryKey: ["portal-units"],
    queryFn: () => portalAPI.myUnits().then((r) => r.data as PortalUnit[]),
  });

  const handleSelect = (unit: PortalUnit) => {
    setSelectedUnit(unit);
    navigate("/portal/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="inline-flex w-fit bg-white rounded-2xl px-2 py-2 shadow-2xl shadow-black/30 mb-4">
            <img
              src="/branding/deco-logo.png"
              alt="DECO Limited"
              className="h-9 w-auto object-contain"
            />
          </div>
          <h2 className="font-semibold text-surface-900 text-lg">Choose a flat</h2>
          <p className="text-xs text-surface-400 mt-1 text-center">
            {customer?.mobile} has more than one unit registered — pick which
            one to view.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
          </div>
        ) : !units || units.length === 0 ? (
          <div className="card text-center text-sm text-surface-500 py-8">
            No units are registered to this account yet. Contact your
            building management office.
          </div>
        ) : (
          <div className="space-y-2">
            {units.map((unit) => (
              <button
                key={unit.id}
                onClick={() => handleSelect(unit)}
                className="w-full card flex items-center gap-3 !py-3.5 !px-4 text-left hover:border-brand-300 hover:shadow-card-hover transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-surface-800">
                    Unit {unit.unit_no} · Floor {unit.floor_no}
                  </div>
                  <div className="text-xs text-surface-400 truncate">
                    {unit.building_name} · {unit.project_name}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-surface-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}