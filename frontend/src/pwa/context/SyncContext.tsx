/**
 * React context for managing database sync operations.
 * Handles fetching the database and showcase images from the desktop app and storing them locally.
 */
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import {
  saveDatabase,
  getSyncMetadata,
  clearDatabase,
  getServerUrl,
  setServerUrl as persistServerUrl,
  SyncMetadata,
  saveShowcaseImage,
  getShowcaseImageChecksums,
  getShowcaseImagesTotalSize,
  getShowcaseImagesCount,
  clearShowcaseImages,
} from '../db/persistence'
import { loadDatabaseFromBuffer, validateDatabase } from '../db/offline-db'
import { useOfflineDb } from './OfflineDbContext'
import { storeLocation, ObserverLocation } from '../services/astronomy'

// Maximum total size for cached showcase images (50 MB default)
const SHOWCASE_CACHE_MAX_BYTES = 50 * 1024 * 1024

export type SyncStatus = 'idle' | 'checking' | 'downloading' | 'loading' | 'syncing_images' | 'success' | 'error' | 'cert_error'

interface ExportMetadata {
  version: string
  size_bytes: number
  checksum: string
  last_modified: string
  row_counts: Record<string, number>
}

interface ShowcaseExportItem {
  object_id: number
  checksum: string
  size_bytes: number
  source_type: string
}

interface ShowcasesExportMetadata {
  total_count: number
  total_size_bytes: number
  showcases: ShowcaseExportItem[]
}

interface ImageSyncStats {
  totalCount: number
  syncedCount: number
  totalSizeBytes: number
  syncedSizeBytes: number
  skippedDueToLimit: number
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
  /** Image sync statistics */
  imageStats: ImageSyncStats | null
}

const SyncContext = createContext<SyncContextValue | null>(null)

/**
 * Sync showcase images from the server.
 * Downloads images that are new or changed, respecting the size cap.
 */
async function syncShowcaseImages(
  serverUrl: string,
  setProgress: (progress: number) => void,
  setImageStats: (stats: ImageSyncStats) => void
): Promise<void> {
  console.log('[SyncContext] Starting showcase image sync')

  // Get list of available showcases from server
  const response = await fetch(`${serverUrl}/api/export/showcases`)
  if (!response.ok) {
    throw new Error(`Failed to fetch showcase list: ${response.status}`)
  }

  const metadata: ShowcasesExportMetadata = await response.json()
  console.log('[SyncContext] Server has', metadata.total_count, 'showcases, total size:', metadata.total_size_bytes)

  if (metadata.total_count === 0) {
    setImageStats({
      totalCount: 0,
      syncedCount: 0,
      totalSizeBytes: 0,
      syncedSizeBytes: 0,
      skippedDueToLimit: 0,
    })
    return
  }

  // Get locally cached checksums
  const localChecksums = await getShowcaseImageChecksums()
  const currentCacheSize = await getShowcaseImagesTotalSize()

  // Determine which images need to be downloaded
  const toDownload: ShowcaseExportItem[] = []
  let downloadSize = 0

  for (const showcase of metadata.showcases) {
    const localChecksum = localChecksums.get(showcase.object_id)
    if (localChecksum !== showcase.checksum) {
      toDownload.push(showcase)
      downloadSize += showcase.size_bytes
    }
  }

  console.log('[SyncContext] Need to download', toDownload.length, 'images, total size:', downloadSize)

  // Sort by size (smallest first) to maximize number of images within limit
  toDownload.sort((a, b) => a.size_bytes - b.size_bytes)

  // Download images, respecting size cap
  let syncedCount = localChecksums.size - toDownload.length // Already synced
  let syncedSizeBytes = currentCacheSize
  let skippedDueToLimit = 0
  let downloadedCount = 0

  for (const showcase of toDownload) {
    // Check if adding this image would exceed the limit
    if (syncedSizeBytes + showcase.size_bytes > SHOWCASE_CACHE_MAX_BYTES) {
      console.log('[SyncContext] Skipping showcase', showcase.object_id, '- would exceed cache limit')
      skippedDueToLimit++
      continue
    }

    try {
      const imgResponse = await fetch(`${serverUrl}/api/export/showcases/${showcase.object_id}`)
      if (!imgResponse.ok) {
        console.warn('[SyncContext] Failed to download showcase', showcase.object_id)
        continue
      }

      const blob = await imgResponse.blob()
      await saveShowcaseImage(showcase.object_id, blob, showcase.checksum)

      syncedCount++
      syncedSizeBytes += blob.size
      downloadedCount++

      // Update progress
      const progressPct = Math.round((downloadedCount / toDownload.length) * 100)
      setProgress(progressPct)
    } catch (err) {
      console.warn('[SyncContext] Error downloading showcase', showcase.object_id, err)
    }
  }

  const stats: ImageSyncStats = {
    totalCount: metadata.total_count,
    syncedCount,
    totalSizeBytes: metadata.total_size_bytes,
    syncedSizeBytes,
    skippedDueToLimit,
  }

  setImageStats(stats)
  console.log('[SyncContext] Showcase sync complete:', stats)
}

interface SyncProviderProps {
  children: ReactNode
}

export function SyncProvider({ children }: SyncProviderProps) {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [serverUrl, setServerUrlState] = useState('')
  const [lastSync, setLastSync] = useState<SyncMetadata | null>(null)
  const [imageStats, setImageStats] = useState<ImageSyncStats | null>(null)
  const { reload: reloadDb, clear: clearDb } = useOfflineDb()

  // Load persisted server URL and image stats on mount
  useEffect(() => {
    getServerUrl().then((url) => {
      if (url) setServerUrlState(url)
    })
    getSyncMetadata().then((meta) => {
      if (meta) setLastSync(meta)
    })
    // Load cached image stats
    Promise.all([getShowcaseImagesCount(), getShowcaseImagesTotalSize()]).then(
      ([count, size]) => {
        if (count > 0) {
          setImageStats({
            totalCount: count,
            syncedCount: count,
            totalSizeBytes: size,
            syncedSizeBytes: size,
            skippedDueToLimit: 0,
          })
        }
      }
    )
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

      // Fetch and store observer location for offline altitude calculations
      try {
        const configResponse = await fetch(`${syncUrl}/api/config/locations/active`)
        if (configResponse.ok) {
          const locationData = await configResponse.json()
          if (locationData && locationData.latitude && locationData.longitude && locationData.timezone) {
            const observerLocation: ObserverLocation = {
              latitude: locationData.latitude,
              longitude: locationData.longitude,
              timezone: locationData.timezone,
            }
            storeLocation(observerLocation)
            console.log('[SyncContext] Stored observer location:', observerLocation)
          }
        }
      } catch (locErr) {
        // Location sync is optional - don't fail the whole sync
        console.warn('[SyncContext] Failed to sync observer location:', locErr)
      }

      // Sync showcase images
      try {
        setStatus('syncing_images')
        setProgress(0)
        await syncShowcaseImages(syncUrl, setProgress, setImageStats)
      } catch (imgErr) {
        // Image sync is optional - don't fail the whole sync
        console.warn('[SyncContext] Failed to sync showcase images:', imgErr)
      }

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
    await clearShowcaseImages()
    clearDb()
    setLastSync(null)
    setImageStats(null)
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
        imageStats,
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
  imageStats: null,
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext)
  // Return default value if not in PWA mode (no provider)
  if (!context) {
    return defaultValue
  }
  return context
}
