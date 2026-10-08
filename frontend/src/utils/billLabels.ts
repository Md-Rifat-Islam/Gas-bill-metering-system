// Single source of truth for every label/wording shown on a bill, so the
// staff Bill Detail page, the customer-portal Bill Detail page (and the
// invoice PDF, which should mirror these strings) can never drift apart.
// Change a word here and it changes everywhere.
import type { Bill } from '@/types'
import { formatCurrency } from '@/utils/helpers'

export const BILL_LABELS = {
  // Sections
  unitDetails: 'Unit Details',
  meterReadings: 'Meter Readings',
  charges: 'Bill Summary',
  paymentHistory: 'Payment History',

  // Unit details
  project: 'Project',
  building: 'Building',
  unit: 'Unit',
  allottee: 'Allottee',
  mobile: 'Mobile',

  // Meter readings
  previous: 'Previous',
  consumed: 'Consumed',
  current: 'Current',
  conversionRatio: 'Conversion Ratio',
  finalUsage: 'Final Usage (Billed)',

  // Charges
  baseAmount: 'Base Amount',
  unitPrice: 'Unit Price',
  serviceCharge: 'Service Charge',
  extraCharge: 'Extra Charge',
  lateFee: 'Late Fee',
  discount: 'Discount',
  total: 'Total',
  paid: 'Paid',
  due: 'Due',
  percentageCharge: (rate: number) => `bKash Charge (${rate}%)`,

  // Top-of-page amount card (portal)
  totalAmount: 'Total Amount',
  amountDue: 'Amount Due',

  // Misc
  adjustment: 'Adjustment',
  noPayments: 'No payments recorded yet',
  invoice: 'Invoice',
  makePayment: 'Make Payment',
} as const

/** True when the bill is charged per kg (conversion ratio present). */
export function isKgBilled(bill: Pick<Bill, 'conversion_factor' | 'total_usage_kg'>): boolean {
  return Boolean(bill.conversion_factor && bill.total_usage_kg)
}

/** 'kg' or 'm³' — the unit the unit price is quoted in. */
export function billedUnit(bill: Pick<Bill, 'conversion_factor' | 'total_usage_kg'>): 'kg' | 'm³' {
  return isKgBilled(bill) ? 'kg' : 'm³'
}

export type ChargeTone = 'normal' | 'muted' | 'warn' | 'success'

export interface ChargeRowData {
  key: string
  label: string
  value: string
  tone: ChargeTone
}

/**
 * Ordered list of charge lines for a bill. Optional lines (percentage,
 * extra, late fee, discount) only appear when non-zero. Both pages — and
 * the invoice — should render from this so rows/order/wording match.
 */
export function buildChargeRows(bill: Bill): ChargeRowData[] {
  const rows: ChargeRowData[] = [
    { key: 'base', label: BILL_LABELS.baseAmount, value: formatCurrency(bill.base_amount), tone: 'normal' },
    {
      key: 'unit_price',
      label: BILL_LABELS.unitPrice,
      value: `${formatCurrency(bill.unit_price)}/${billedUnit(bill)}`,
      tone: 'muted',
    },
    { key: 'service', label: BILL_LABELS.serviceCharge, value: `+ ${formatCurrency(bill.service_charge)}`, tone: 'normal' },
  ]

  if (Number(bill.percentage_amount) > 0) {
    rows.push({
      key: 'percentage',
      label: BILL_LABELS.percentageCharge(Number(bill.percentage_rate)),
      value: `+ ${formatCurrency(bill.percentage_amount)}`,
      tone: 'normal',
    })
  }
  if (Number(bill.extra_charge) > 0) {
    rows.push({ key: 'extra', label: BILL_LABELS.extraCharge, value: `+ ${formatCurrency(bill.extra_charge)}`, tone: 'normal' })
  }
  if (Number(bill.late_fee) > 0) {
    rows.push({ key: 'late', label: BILL_LABELS.lateFee, value: `+ ${formatCurrency(bill.late_fee)}`, tone: 'warn' })
  }
  if (Number(bill.discount) > 0) {
    rows.push({ key: 'discount', label: BILL_LABELS.discount, value: `− ${formatCurrency(bill.discount)}`, tone: 'success' })
  }
  return rows
}