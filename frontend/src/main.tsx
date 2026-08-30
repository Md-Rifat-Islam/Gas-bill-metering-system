import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster, ToastBar, toast } from 'react-hot-toast'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-center"
          // Sits below a phone's status bar / notch instead of tucked into
          // the very top-right corner, and gives it breathing room from
          // any fixed app header.
          containerStyle={{ top: 'max(16px, env(safe-area-inset-top))' }}
          toastOptions={{
            duration: 4000,
            error: {
              // Errors get a bit longer to actually read before they
              // auto-dismiss, since they're often longer messages.
              duration: 5000,
            },
            style: {
              borderRadius: '12px',
              fontFamily: 'Sora, sans-serif',
              fontSize: '14px',
              maxWidth: '92vw',
            },
          }}
        >
          {(t) => (
            <ToastBar toast={t}>
              {({ icon, message }) => (
                // THE FIX: react-hot-toast has no built-in tap-to-dismiss —
                // a toast just sits there for its full duration with no way
                // to get rid of it, which is what made this painful on
                // mobile. Wrapping the toast body in an onClick that calls
                // toast.dismiss(t.id) is the standard fix react-hot-toast
                // itself documents for this. Every toast in the app renders
                // through this one <Toaster>, so this applies everywhere —
                // no need to touch individual toast.error()/toast.success()
                // call sites.
                <div
                  onClick={() => toast.dismiss(t.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  {icon}
                  {message}
                </div>
              )}
            </ToastBar>
          )}
        </Toaster>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)