/**
 * Component shown when no database is synced in PWA mode.
 * Prompts the user to sync their database.
 */
import { useOfflineDb } from '../context/OfflineDbContext'
import SyncSettings from './SyncSettings'

export default function SyncPrompt() {
  const { isLoading } = useOfflineDb()

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
        <p className="text-gray-400">Loading database...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-space-700 rounded-full mb-4">
          <svg
            className="w-8 h-8 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Welcome to AstroDB</h1>
        <p className="text-gray-400">
          Sync your astrophotography database from your desktop app to browse
          offline on this device.
        </p>
      </div>

      <SyncSettings />

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Once synced, you can browse your objects, images, and projects even
          without an internet connection.
        </p>
      </div>
    </div>
  )
}
