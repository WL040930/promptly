import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import './style.css'
import App from './App.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { AIStreamProvider } from './context/AIStreamContext.jsx'
import { BrowserNotificationProvider } from './context/BrowserNotificationContext.jsx'
import { registerNotificationServiceWorker } from './utils/browserNotifications.js'

// Register the notification service worker early so it's active by the time
// the user sends a test notification or an AI turn completes.
registerNotificationServiceWorker()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 5, // 5 seconds
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <AIStreamProvider>
                    <BrowserNotificationProvider>
                        <App />
                    </BrowserNotificationProvider>
                </AIStreamProvider>
            </ToastProvider>
            {import.meta.env.VITE_SHOW_DEVTOOLS === 'true' && <ReactQueryDevtools initialIsOpen={false} />}
        </QueryClientProvider>
    </React.StrictMode>
)
