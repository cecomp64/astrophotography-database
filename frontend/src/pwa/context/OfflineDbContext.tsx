/**
 * React context providing access to the offline database.
 * Manages database initialization and loading state.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { loadDatabase, hasDatabase, SyncMetadata } from '../db/persistence'
import { loadDatabaseFromBuffer, closeDatabase } from '../db/offline-db'

interface OfflineDbContextValue {
  /** Whether the database is currently loaded and ready for queries */
  isReady: boolean
  /** Whether we're currently loading the database */
  isLoading: boolean
  /** Any error that occurred during loading */
  error: string | null
  /** Sync metadata if database is loaded */
  syncMetadata: SyncMetadata | null
  /** Reload the database from IndexedDB */
  reload: () => Promise<void>
  /** Clear the database */
  clear: () => void
}

const OfflineDbContext = createContext<OfflineDbContextValue | null>(null)

interface OfflineDbProviderProps {
  children: ReactNode
}

export function OfflineDbProvider({ children }: OfflineDbProviderProps) {
  const [isReady, setIsReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncMetadata, setSyncMetadata] = useState<SyncMetadata | null>(null)

  const loadDb = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Check if we have a database stored
      const hasDb = await hasDatabase()

      if (!hasDb) {
        // No database yet, that's OK - user needs to sync
        setIsReady(false)
        setIsLoading(false)
        return
      }

      // Load the database from IndexedDB
      const result = await loadDatabase()

      if (!result) {
        setIsReady(false)
        setIsLoading(false)
        return
      }

      // Load into sql.js
      await loadDatabaseFromBuffer(result.data)

      setSyncMetadata(result.metadata)
      setIsReady(true)
    } catch (err) {
      console.error('Failed to load offline database:', err)
      setError(err instanceof Error ? err.message : 'Failed to load database')
      setIsReady(false)
    } finally {
      setIsLoading(false)
    }
  }

  const clear = () => {
    closeDatabase()
    setIsReady(false)
    setSyncMetadata(null)
  }

  useEffect(() => {
    loadDb()

    // Cleanup on unmount
    return () => {
      closeDatabase()
    }
  }, [])

  return (
    <OfflineDbContext.Provider
      value={{
        isReady,
        isLoading,
        error,
        syncMetadata,
        reload: loadDb,
        clear,
      }}
    >
      {children}
    </OfflineDbContext.Provider>
  )
}

// Default value for non-PWA mode (when provider is not present)
const defaultValue: OfflineDbContextValue = {
  isReady: true, // In desktop mode, we're always "ready" (using online API)
  isLoading: false,
  error: null,
  syncMetadata: null,
  reload: async () => {},
  clear: () => {},
}

export function useOfflineDb(): OfflineDbContextValue {
  const context = useContext(OfflineDbContext)
  // Return default value if not in PWA mode (no provider)
  if (!context) {
    return defaultValue
  }
  return context
}
