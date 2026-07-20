import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { X, AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui'

const SCANNER_ELEMENT_ID = 'barcode-scanner-region'

interface BarcodeScannerProps {
  open: boolean
  onClose: () => void
  onDetected: (code: string) => void
}

export function BarcodeScanner({ open, onClose, onDetected }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const stop = () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (scanner) {
      scanner.stop().then(() => scanner.clear()).catch(() => { /* already stopped */ })
    }
  }

  useEffect(() => {
    if (!open) return
    setError(null)
    setStarting(true)

    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 350, height: 350 } },
        (decodedText: string) => {
          onDetected(decodedText)
          stop()
        },
        () => { /* per-frame decode miss — expected while aiming, ignore */ }
      )
      .then(() => setStarting(false))
      .catch((err: unknown) => {
        setStarting(false)
        const msg = String(err).toLowerCase()
        if (msg.includes('permission') || msg.includes('notallowed')) {
          setError('Camera permission denied. Please allow camera access and try again.')
        } else if (msg.includes('notfound') || msg.includes('no camera') || msg.includes('devicesnotfound')) {
          setError('No camera was found on this device.')
        } else {
          setError('Unable to start the scanner. Please try again.')
        }
      })

    return () => { stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleClose = () => {
    stop()
    onClose()
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={handleClose} title="Scan Meter Barcode" size="md">
      <div className="space-y-6">
        <div
          id={SCANNER_ELEMENT_ID}
          className="w-full rounded-xl overflow-hidden bg-surface-900 aspect-square flex items-center justify-center"
        >
          {starting && <span className="text-surface-300 text-sm">Starting camera…</span>}
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-danger-600 bg-danger-50 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-xs text-surface-400 text-center">
          Point the camera at the meter's barcode or QR code.
        </p>

        <button type="button" className="btn-secondary w-full" onClick={handleClose}>
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
    </Modal>
  )
}