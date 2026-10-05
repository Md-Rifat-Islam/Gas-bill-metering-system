// Shared calculation logic for bill previews.
// Mirrors Bill.calculate() on the backend: bill on KG when a conversion
// factor is present, otherwise on m³ — so any preview built from these
// helpers matches what the server will actually charge.

export interface UsageResult {
  usageM3: number;
  usageKg: number | null;
  billableUsage: number;
}

export function computeUsage(
  previousReading: number,
  currentReading: number,
  conversionFactor?: number | string | null,
): UsageResult {
  const usageM3 = Math.max(0, Number(currentReading) - Number(previousReading));
  const factor = conversionFactor ? Number(conversionFactor) : null;
  const preciseKg = factor ? usageM3 * factor : null;
  // const usageKg = preciseKg !== null ? Math.round(preciseKg * 100) / 100 : null; // for display
  const usageKg = factor ? usageM3 * factor : null;   // no rounding — full precision
  return { usageM3, usageKg, billableUsage: preciseKg ?? usageM3 };               // ← unrounded for billing math
}

/**
 * Percentage charge, in money: `rate` percent of the base amount
 * (usage × unit price). Mirrors the backend: base is rounded to 2 places
 * first, then the percentage is rounded to 2 places.
 */
export function computePercentageAmount(
  billableUsage: number,
  unitPrice: number | string,
  percentageRate: number | string = 0,
): number {
  const base = Math.round(billableUsage * Number(unitPrice || 0) * 100) / 100;
  return Math.round(base * Number(percentageRate || 0)) / 100;
}

export function computeBillTotal({
  billableUsage,
  unitPrice,
  serviceCharge = 0,
  percentageRate = 0,
  extraCharge = 0,
  discount = 0,
  lateFee = 0,
}: {
  billableUsage: number;
  unitPrice: number;
  serviceCharge?: number;
  percentageRate?: number | string;
  extraCharge?: number;
  discount?: number;
  lateFee?: number;
}): number {
  const base = billableUsage * Number(unitPrice || 0);
  const percentageAmount = computePercentageAmount(billableUsage, unitPrice, percentageRate);
  return (
    base +
    Number(serviceCharge || 0) +
    percentageAmount +
    Number(extraCharge || 0) +
    Number(lateFee || 0) -
    Number(discount || 0)
  );
}