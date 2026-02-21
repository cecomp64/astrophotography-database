/**
 * IndexedDB persistence layer for storing the SQLite database binary,
 * showcase images, and sync metadata.
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
  showcaseImages: {
    key: number // object_id
    value: {
      objectId: number
      blob: Blob
      checksum: string
      sizeBytes: number
      syncedAt: string
    }
  }
}

const DB_NAME = 'astrodb-pwa'
const DB_VERSION = 2

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
        // Store for showcase images (added in v2)
        if (!db.objectStoreNames.contains('showcaseImages')) {
          db.createObjectStore('showcaseImages', { keyPath: 'objectId' })
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

// ============================================================================
// Showcase Image Storage
// ============================================================================

export interface ShowcaseImageRecord {
  objectId: number
  blob: Blob
  checksum: string
  sizeBytes: number
  syncedAt: string
}

/**
 * Save a showcase image to IndexedDB
 */
export async function saveShowcaseImage(
  objectId: number,
  blob: Blob,
  checksum: string
): Promise<void> {
  const db = await getDb()
  await db.put('showcaseImages', {
    objectId,
    blob,
    checksum,
    sizeBytes: blob.size,
    syncedAt: new Date().toISOString(),
  })
}

/**
 * Get a showcase image by object ID
 */
export async function getShowcaseImage(
  objectId: number
): Promise<ShowcaseImageRecord | null> {
  const db = await getDb()
  const record = await db.get('showcaseImages', objectId)
  return record || null
}

/**
 * Get all stored showcase image metadata (without blobs)
 */
export async function getShowcaseImageChecksums(): Promise<
  Map<number, string>
> {
  const db = await getDb()
  const records = await db.getAll('showcaseImages')
  const checksums = new Map<number, string>()
  for (const record of records) {
    checksums.set(record.objectId, record.checksum)
  }
  return checksums
}

/**
 * Get total size of stored showcase images in bytes
 */
export async function getShowcaseImagesTotalSize(): Promise<number> {
  const db = await getDb()
  const records = await db.getAll('showcaseImages')
  return records.reduce((sum, record) => sum + record.sizeBytes, 0)
}

/**
 * Get count of stored showcase images
 */
export async function getShowcaseImagesCount(): Promise<number> {
  const db = await getDb()
  return await db.count('showcaseImages')
}

/**
 * Delete a showcase image
 */
export async function deleteShowcaseImage(objectId: number): Promise<void> {
  const db = await getDb()
  await db.delete('showcaseImages', objectId)
}

/**
 * Clear all showcase images
 */
export async function clearShowcaseImages(): Promise<void> {
  const db = await getDb()
  await db.clear('showcaseImages')
}
