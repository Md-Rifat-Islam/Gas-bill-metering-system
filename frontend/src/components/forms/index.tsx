import React from 'react'
import { cn } from '@/utils/helpers'

// ── FormField ─────────────────────────────────────────────────────────────────
interface FormFieldProps {
  label: string
  error?: string
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}

export function FormField({ label, error, required, hint, children, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="label">
        {label}
        {required && <span className="text-danger-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-surface-400">{hint}</p>}
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </div>
  )
}

// ── TextInput ─────────────────────────────────────────────────────────────────
interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  leftIcon?: React.ReactNode
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ error, leftIcon, className, ...props }, ref) => (
    <div className="relative">
      {leftIcon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none">
          {leftIcon}
        </div>
      )}
      <input
        ref={ref}
        className={cn(
          'input',
          leftIcon && 'pl-9',
          error && 'input-error',
          className
        )}
        {...props}
      />
    </div>
  )
)
TextInput.displayName = 'TextInput'

// ── SelectInput ───────────────────────────────────────────────────────────────
interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
  options: { value: string | number; label: string }[]
  placeholder?: string
}

export const SelectInput = React.forwardRef<HTMLSelectElement, SelectInputProps>(
  ({ error, options, placeholder, className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn('input', error && 'input-error', className)}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
)
SelectInput.displayName = 'SelectInput'

// ── TextArea ──────────────────────────────────────────────────────────────────
interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ error, className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn('input resize-none', error && 'input-error', className)}
      {...props}
    />
  )
)
TextArea.displayName = 'TextArea'

// ── CurrencyInput ─────────────────────────────────────────────────────────────
interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: boolean
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ error, className, ...props }, ref) => (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm font-medium pointer-events-none">
        ৳
      </span>
      <input
        ref={ref}
        type="number"
        step="0.01"
        min="0"
        className={cn('input pl-7', error && 'input-error', className)}
        {...props}
      />
    </div>
  )
)
CurrencyInput.displayName = 'CurrencyInput'

// ── SearchInput ───────────────────────────────────────────────────────────────
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-9"
      />
    </div>
  )
}
