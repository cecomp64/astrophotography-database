/**
 * IndexedDB persistence layer for storing the SQLite database binary
 * and sync metadata.
 */
import { openDB, DBSchema, IDBPDatabase } from 'idb'

interface AstroDBSchema extends DBSchema {
  database: {
    key: 'main'
    value: {
      key: 'main'
      data: ArrayBuffer
      version: string
      checksum: string
      syncedAt: string
      serverUrl: string
    }
  }
  settings: {
    key: string
    value: {
      key: string
      value: unknown
    }
  }
}

const DB_NAME = 'astrodb-pwa'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<AstroDBSchema>> | null = null

function getDb(): Promise<IDBPDatabase<AstroDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<AstroDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Store for the SQLite database binary
        if (!db.objectStoreNames.contains('database')) {
          db.createObjectStore('database', { keyPath: 'key' })
        }
        // Store for settings (server URL, etc.)
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

export interface SyncMetadata {
  version: string
  checksum: string
  syncedAt: string
  serverUrl: string
}

/**
 * Save the SQLite database binary to IndexedDB
 */
export async function saveDatabase(
  data: ArrayBuffer,
  metadata: SyncMetadata
): Promise<void> {
  const db = await getDb()
  await db.put('database', {
    key: 'main',
    data,
    ...metadata,
  })
}

/**
 * Load the SQLite database binary from IndexedDB
 */
export async function loadDatabase(): Promise<{
  data: ArrayBuffer
  metadata: SyncMetadata
} | null> {
  const db = await getDb()
  const record = await db.get('database', 'main')
  if (!record) return null

  return {
    data: record.data,
    metadata: {
      version: record.version,
      checksum: record.checksum,
      syncedAt: record.syncedAt,
      serverUrl: record.serverUrl,
    },
  }
}

/**
 * Get sync metadata without loading the full database
 */
export async function getSyncMetadata(): Promise<SyncMetadata | null> {
  const db = await getDb()
  const record = await db.get('database', 'main')
  if (!record) return null

  return {
    version: record.version,
    checksum: record.checksum,
    syncedAt: record.syncedAt,
    serverUrl: record.serverUrl,
  }
}

/**
 * Check if we have a database stored
 */
export async function hasDatabase(): Promise<boolean> {
  const db = await getDb()
  const record = await db.get('database', 'main')
  return !!record
}

/**
 * Clear the stored database
 */
export async function clearDatabase(): Promise<void> {
  const db = await getDb()
  await db.delete('database', 'main')
}

/**
 * Save a setting
 */
export async function saveSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  await db.put('settings', { key, value })
}

/**
 * Load a setting
 */
export async function loadSetting<T>(key: string): Promise<T | null> {
  const db = await getDb()
  const record = await db.get('settings', key)
  return record ? (record.value as T) : null
}

/**
 * Get the stored server URL
 */
export async function getServerUrl(): Promise<string | null> {
  return loadSetting<string>('serverUrl')
}

/**
 * Save the server URL
 */
export async function setServerUrl(url: string): Promise<void> {
  return saveSetting('serverUrl', url)
}
