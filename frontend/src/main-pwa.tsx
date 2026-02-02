import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { OfflineDbProvider } from './pwa/context/OfflineDbContext'
import { SyncProvider } from './pwa/context/SyncContext'
import App from './App'
import './index.css'

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        console.log('SW registered:', registration)
      })
      .catch((error) => {
        console.log('SW registration failed:', error)
      })
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 60, // 1 hour - data is local, less need for refetching
      retry: 0, // No retries for offline queries
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <OfflineDbProvider>
        <SyncProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </SyncProvider>
      </OfflineDbProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
