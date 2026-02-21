/**
 * Sync settings component for PWA.
 * Allows users to configure server URL and trigger sync.
 */
import { useState, useEffect, useRef } from 'react'
import { useSync } from '../context/SyncContext'
import { useOfflineDb } from '../context/OfflineDbContext'

export default function SyncSettings() {
  const {
    status,
    progress,
    error,
    serverUrl,
    setServerUrl,
    sync,
    clearLocal,
    imageStats,
  } = useSync()
  const { isReady, syncMetadata } = useOfflineDb()
  const [inputUrl, setInputUrl] = useState(serverUrl)
  const hasInitialized = useRef(false)

  // Update input when serverUrl is loaded from persistence (only on initial load)
  useEffect(() => {
    if (serverUrl && !hasInitialized.current) {
      setInputUrl(serverUrl)
      hasInitialized.current = true
    }
  }, [serverUrl])

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputUrl(e.target.value)
  }

  const handleUrlBlur = () => {
    setServerUrl(inputUrl)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setServerUrl(inputUrl)
    }
  }

  const handleSync = async () => {
    console.log('[SyncSettings] handleSync called, inputUrl:', inputUrl)

    // Normalize URL like SyncContext does - use HTTPS by default
    let normalizedUrl = inputUrl.trim()
    if (normalizedUrl && !normalizedUrl.startsWith('http')) {
      normalizedUrl = `https://${normalizedUrl}`
    }
    // Upgrade http to https
    if (normalizedUrl.startsWith('http://')) {
      normalizedUrl = normalizedUrl.replace('http://', 'https://')
    }
    normalizedUrl = normalizedUrl.replace(/\/$/, '')

    console.log('[SyncSettings] normalizedUrl:', normalizedUrl)

    // Save URL and sync with it directly (avoid race condition)
    await setServerUrl(inputUrl)
    console.log('[SyncSettings] calling sync()...')
    const result = await sync(normalizedUrl)
    console.log('[SyncSettings] sync result:', result)
  }

  const handleClear = async () => {
    if (confirm('Clear local database? You will need to sync again.')) {
      await clearLocal()
    }
  }

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString()
  }

  const isLoading = status === 'checking' || status === 'downloading' || status === 'loading' || status === 'syncing_images'

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6">
      {/* Server URL Input */}
      <div>
        <label
          htmlFor="server-url"
          className="block text-sm font-medium text-gray-300 mb-2"
        >
          Desktop App URL
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            id="server-url"
            value={inputUrl}
            onChange={handleUrlChange}
            onBlur={handleUrlBlur}
            onKeyDown={handleKeyDown}
            placeholder="e.g., 192.168.1.100:8833"
            className="flex-1 bg-space-700 border border-space-600 rounded-lg px-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            onClick={handleSync}
            disabled={isLoading || !inputUrl}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Syncing...' : 'Sync'}
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Enter the IP address and port of your desktop app (usually port 8833)
        </p>
      </div>

      {/* Progress Bar */}
      {status === 'downloading' && (
        <div>
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>Downloading database...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-space-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading database...</span>
        </div>
      )}

      {status === 'syncing_images' && (
        <div>
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>Syncing showcase images...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-space-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Certificate Error - Special handling with link */}
      {status === 'cert_error' && serverUrl && (
        <div className="p-4 bg-yellow-900/50 border border-yellow-700 rounded-lg space-y-3">
          <p className="text-yellow-200">
            {error}
          </p>
          <a
            href={`${serverUrl}/api/health`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            Open Health Check to Accept Certificate →
          </a>
          <p className="text-sm text-yellow-300/70">
            After accepting the certificate in your browser, come back here and tap Sync again.
          </p>
        </div>
      )}

      {/* Error Message (non-cert errors) */}
      {error && status === 'error' && (
        <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Success Message */}
      {status === 'success' && (
        <div className="p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-200">
          Database synced successfully!
        </div>
      )}

      {/* Sync Status */}
      <div className="bg-space-700 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Sync Status</h3>
        {isReady && syncMetadata ? (
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-gray-500">Status</dt>
              <dd className="text-green-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full" />
                Synced
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Last Synced</dt>
              <dd className="text-gray-300">{formatDate(syncMetadata.syncedAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Server</dt>
              <dd className="text-gray-300 truncate max-w-[200px]">
                {syncMetadata.serverUrl}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Version</dt>
              <dd className="text-gray-400 text-xs font-mono">
                {syncMetadata.checksum.slice(0, 8)}
              </dd>
            </div>
            {imageStats && (
              <>
                <div className="border-t border-space-600 my-2" />
                <div className="flex justify-between">
                  <dt className="text-gray-500">Images Cached</dt>
                  <dd className="text-gray-300">
                    {imageStats.syncedCount} / {imageStats.totalCount}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Cache Size</dt>
                  <dd className="text-gray-300">
                    {formatBytes(imageStats.syncedSizeBytes)}
                  </dd>
                </div>
                {imageStats.skippedDueToLimit > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Skipped (limit)</dt>
                    <dd className="text-yellow-400">
                      {imageStats.skippedDueToLimit}
                    </dd>
                  </div>
                )}
              </>
            )}
          </dl>
        ) : (
          <p className="text-gray-500">
            No database synced yet. Enter your desktop app URL above and click Sync.
          </p>
        )}
      </div>

      {/* Clear Button */}
      {isReady && (
        <button
          onClick={handleClear}
          className="w-full px-4 py-2 bg-red-900/50 text-red-200 rounded-lg hover:bg-red-900/70 transition-colors"
        >
          Clear Local Database
        </button>
      )}

      {/* Help Text */}
      <div className="text-sm text-gray-500 space-y-2">
        <p>
          <strong>How to find your desktop app URL:</strong>
        </p>
        <ol className="list-decimal list-inside space-y-1 ml-2">
          <li>Open the Astrophotography Database app on your computer</li>
          <li>Make sure both devices are on the same network (WiFi or Tailscale)</li>
          <li>Find your computer&apos;s IP address (e.g., 192.168.1.x or Tailscale IP)</li>
          <li>Enter the IP with port 8833 (e.g., 192.168.1.100:8833)</li>
          <li>On first sync, you&apos;ll need to accept the self-signed certificate</li>
        </ol>
      </div>
    </div>
  )
}
