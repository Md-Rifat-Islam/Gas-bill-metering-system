import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | string) {
  return `৳ ${Number(amount).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`
}

export function formatDate(date: string | Date) {
  return format(new Date(date), 'dd MMM yyyy')
}

export function formatMonth(date: string | Date) {
  return format(new Date(date), 'MMMM yyyy')
}

export function getBillStatusBadge(status: string) {
  switch (status) {
    case 'Paid':    return 'badge-green'
    case 'Partial': return 'badge-yellow'
    case 'Unpaid':  return 'badge-red'
    default:        return 'badge-gray'
  }
}

export function getFirstDayOfMonth(date?: Date) {
  const d = date || new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function paginationRange(total: number, page: number, size = 20) {
  const pages = Math.ceil(total / size)
  return { pages, from: (page - 1) * size + 1, to: Math.min(page * size, total) }
}
