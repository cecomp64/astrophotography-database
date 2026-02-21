/**
 * React context for managing database sync operations.
 * Handles fetching the database from the desktop app and storing it locally.
 */
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import {
  saveDatabase,
  getSyncMetadata,
  clearDatabase,
  getServerUrl,
  setServerUrl as persistServerUrl,
  SyncMetadata,
} from '../db/persistence'
import { loadDatabaseFromBuffer, validateDatabase } from '../db/offline-db'
import { useOfflineDb } from './OfflineDbContext'

export type SyncStatus = 'idle' | 'checking' | 'downloading' | 'loading' | 'success' | 'error' | 'cert_error'

interface ExportMetadata {
  version: string
  size_bytes: number
  checksum: string
  last_modified: string
  row_counts: Record<string, number>
}

interface SyncContextValue {
  /** Current sync status */
  status: SyncStatus
  /** Progress (0-100) during download */
  progress: number
  /** Error message if sync failed */
  error: string | null
  /** Server URL for syncing */
  serverUrl: string
  /** Set the server URL */
  setServerUrl: (url: string) => Promise<void>
  /** Check if server is reachable and get metadata */
  checkServer: () => Promise<ExportMetadata | null>
  /** Start syncing the database (optionally pass URL directly) */
  sync: (url?: string) => Promise<boolean>
  /** Clear local database */
  clearLocal: () => Promise<void>
  /** Last sync metadata */
  lastSync: SyncMetadata | null
}

const SyncContext = createContext<SyncContextValue | null>(null)

interface SyncProviderProps {
  children: ReactNode
}

export function SyncProvider({ children }: SyncProviderProps) {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [serverUrl, setServerUrlState] = useState('')
  const [lastSync, setLastSync] = useState<SyncMetadata | null>(null)
  const { reload: reloadDb, clear: clearDb } = useOfflineDb()

  // Load persisted server URL on mount
  useEffect(() => {
    getServerUrl().then((url) => {
      if (url) setServerUrlState(url)
    })
    getSyncMetadata().then((meta) => {
      if (meta) setLastSync(meta)
    })
  }, [])

  const setServerUrl = async (url: string) => {
    // Normalize URL - use HTTPS by default for self-signed cert
    let normalized = url.trim()
    if (normalized && !normalized.startsWith('http')) {
      normalized = `https://${normalized}`
    }
    // Upgrade http to https
    if (normalized.startsWith('http://')) {
      normalized = normalized.replace('http://', 'https://')
    }
    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '')

    setServerUrlState(normalized)
    await persistServerUrl(normalized)
  }

  const checkServer = useCallback(async (): Promise<ExportMetadata | null> => {
    if (!serverUrl) {
      setError('Please enter a server URL')
      return null
    }

    setStatus('checking')
    setError(null)

    try {
      const response = await fetch(`${serverUrl}/api/export/metadata`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`)
      }

      const metadata: ExportMetadata = await response.json()
      setStatus('idle')
      return metadata
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to server'
      setError(message)
      setStatus('error')
      return null
    }
  }, [serverUrl])

  const sync = useCallback(async (urlOverride?: string): Promise<boolean> => {
    console.log('[SyncContext] sync called, urlOverride:', urlOverride, 'serverUrl:', serverUrl)
    const syncUrl = urlOverride || serverUrl
    console.log('[SyncContext] using syncUrl:', syncUrl)

    if (!syncUrl) {
      console.log('[SyncContext] No URL, returning false')
      setError('Please enter a server URL')
      return false
    }

    setStatus('checking')
    setError(null)
    setProgress(0)

    try {
      // First check metadata
      console.log('[SyncContext] Fetching metadata from:', `${syncUrl}/api/export/metadata`)
      const metaResponse = await fetch(`${syncUrl}/api/export/metadata`)
      if (!metaResponse.ok) {
        throw new Error(`Server returned ${metaResponse.status}`)
      }
      const metadata: ExportMetadata = await metaResponse.json()

      // Download the database
      setStatus('downloading')

      const response = await fetch(`${syncUrl}/api/export/sqlite`)
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`)
      }

      const contentLength = response.headers.get('content-length')
      const totalBytes = contentLength ? parseInt(contentLength, 10) : metadata.size_bytes

      // Read the response as a stream to track progress
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to get response reader')
      }

      const chunks: Uint8Array[] = []
      let receivedBytes = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        receivedBytes += value.length

        if (totalBytes > 0) {
          setProgress(Math.round((receivedBytes / totalBytes) * 100))
        }
      }

      // Combine chunks
      const gzippedData = new Uint8Array(receivedBytes)
      let offset = 0
      for (const chunk of chunks) {
        gzippedData.set(chunk, offset)
        offset += chunk.length
      }

      // Decompress gzip data
      setStatus('loading')
      const decompressedStream = new Response(gzippedData).body?.pipeThrough(
        new DecompressionStream('gzip')
      )

      if (!decompressedStream) {
        throw new Error('Failed to decompress data')
      }

      const decompressedResponse = new Response(decompressedStream)
      const dbBuffer = await decompressedResponse.arrayBuffer()

      console.log('[SyncContext] Decompressed database size:', dbBuffer.byteLength, 'bytes')

      if (dbBuffer.byteLength === 0) {
        throw new Error('Decompressed database is empty - decompression may have failed')
      }

      // Load into sql.js
      await loadDatabaseFromBuffer(dbBuffer)

      // Validate the database has data
      const validation = validateDatabase()
      console.log('[SyncContext] Database validation:', validation)

      if (!validation.isValid) {
        throw new Error(`Database validation failed: ${validation.error}. Tables: ${JSON.stringify(validation.tables)}`)
      }

      // Save to IndexedDB
      const syncMetadata: SyncMetadata = {
        version: metadata.version,
        checksum: metadata.checksum,
        syncedAt: new Date().toISOString(),
        serverUrl: syncUrl,
      }

      await saveDatabase(dbBuffer, syncMetadata)
      setLastSync(syncMetadata)

      // Reload the database context
      await reloadDb()

      setStatus('success')
      setProgress(100)
      console.log('[SyncContext] Sync complete. Row counts:', validation.tables)
      return true
    } catch (err) {
      console.error('[SyncContext] Sync error:', err)
      const message = err instanceof Error ? err.message : 'Sync failed'

      // Detect certificate errors - these manifest as network failures
      // Common patterns: "Failed to fetch", "NetworkError", "Load failed", "SSL", "certificate"
      const isCertError =
        message.toLowerCase().includes('failed to fetch') ||
        message.toLowerCase().includes('networkerror') ||
        message.toLowerCase().includes('load failed') ||
        message.toLowerCase().includes('ssl') ||
        message.toLowerCase().includes('certificate') ||
        message.toLowerCase().includes('cert')

      if (isCertError) {
        setError(`Certificate not trusted. Please visit the link below to accept the certificate, then try syncing again.`)
        setStatus('cert_error')
      } else {
        setError(message)
        setStatus('error')
      }
      return false
    }
  }, [serverUrl, reloadDb])

  const clearLocal = useCallback(async () => {
    await clearDatabase()
    clearDb()
    setLastSync(null)
    setStatus('idle')
  }, [clearDb])

  return (
    <SyncContext.Provider
      value={{
        status,
        progress,
        error,
        serverUrl,
        setServerUrl,
        checkServer,
        sync,
        clearLocal,
        lastSync,
      }}
    >
      {children}
    </SyncContext.Provider>
  )
}

// Default value for non-PWA mode (when provider is not present)
const defaultValue: SyncContextValue = {
  status: 'idle',
  progress: 0,
  error: null,
  serverUrl: '',
  setServerUrl: async () => {},
  checkServer: async () => null,
  sync: async () => false,
  clearLocal: async () => {},
  lastSync: null,
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext)
  // Return default value if not in PWA mode (no provider)
  if (!context) {
    return defaultValue
  }
  return context
}
