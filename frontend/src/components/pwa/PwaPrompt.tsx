import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, WifiOff } from 'lucide-react'

/**
 * Two small, non-blocking banners:
 *  - "New version available" once a fresh build has been downloaded.
 *  - "You're offline" while there's no connection (live data needs internet).
 * Registers the service worker as a side effect.
 */
export default function PwaPrompt() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version hourly while the app stays open.
      if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000)
    },
  })

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return (
    <>
      {offline && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 rounded-xl bg-surface-900 text-white text-sm px-4 py-2.5 shadow-lg max-w-[92vw]"
        >
          <WifiOff className="w-4 h-4 shrink-0" />
          You're offline — bills, payments and readings need an internet connection.
        </div>
      )}

      {needRefresh && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 rounded-xl bg-white border border-surface-200 shadow-lg px-4 py-3 text-sm max-w-[92vw]"
        >
          <RefreshCw className="w-4 h-4 text-brand-600 shrink-0" />
          <span className="text-surface-700">A new version is available.</span>
          <button className="btn-primary btn-sm" onClick={() => updateServiceWorker(true)}>
            Reload
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setNeedRefresh(false)}>
            Later
          </button>
        </div>
      )}
    </>
  )
}