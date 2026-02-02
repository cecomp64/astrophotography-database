/**
 * Offline database wrapper using sql.js (SQLite compiled to WebAssembly).
 * Provides a query interface compatible with the existing API types.
 */
import type { Database, SqlJsStatic, BindParams } from 'sql.js'

let SQL: SqlJsStatic | null = null
let db: Database | null = null

// Declare the global initSqlJs function that will be loaded from CDN
declare global {
  interface Window {
    initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>
  }
}

/**
 * Load sql.js from CDN by injecting a script tag
 */
function loadSqlJsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if ('initSqlJs' in window) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://sql.js.org/dist/sql-wasm.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load sql.js from CDN'))
    document.head.appendChild(script)
  })
}

/**
 * Initialize sql.js WASM module
 */
async function initSql(): Promise<SqlJsStatic> {
  if (SQL) return SQL

  // Load sql.js from CDN
  await loadSqlJsScript()

  const initFn = window.initSqlJs
  if (typeof initFn !== 'function') {
    throw new Error('sql.js failed to load - initSqlJs not found on window')
  }

  SQL = await initFn({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
  })

  return SQL
}

/**
 * Load a database from an ArrayBuffer
 */
export async function loadDatabaseFromBuffer(buffer: ArrayBuffer): Promise<void> {
  const sql = await initSql()

  // Close existing database if any
  if (db) {
    db.close()
  }

  // Create database from buffer
  db = new sql.Database(new Uint8Array(buffer))
}

/**
 * Check if database is loaded
 */
export function isDatabaseLoaded(): boolean {
  return db !== null
}

/**
 * Close the database
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/**
 * Execute a query and return results as array of objects
 */
export function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T[] {
  if (!db) {
    throw new Error('Database not loaded')
  }

  try {
    const stmt = db.prepare(sql)
    stmt.bind(params as BindParams)

    const results: T[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject() as T
      results.push(row)
    }
    stmt.free()

    return results
  } catch (error) {
    console.error('Query error:', sql, error)
    throw error
  }
}

/**
 * Execute a query and return first result or null
 */
export function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T | null {
  const results = query<T>(sql, params)
  return results.length > 0 ? results[0] : null
}

/**
 * Execute a query and return scalar value
 */
export function queryScalar<T = number>(
  sql: string,
  params: unknown[] = []
): T | null {
  if (!db) {
    throw new Error('Database not loaded')
  }

  try {
    const stmt = db.prepare(sql)
    stmt.bind(params as BindParams)

    if (stmt.step()) {
      const row = stmt.get()
      stmt.free()
      return row[0] as T
    }

    stmt.free()
    return null
  } catch (error) {
    console.error('Query error:', sql, error)
    throw error
  }
}

// Type definitions for database rows (matching the API types)
export interface DbObject {
  id: number
  primary_name: string
  ra: number | null
  dec: number | null
  object_type: string | null
  magnitude: number | null
  size_major: number | null
  size_minor: number | null
  constellation: string | null
  created_at: string
  updated_at: string
}

export interface DbObjectAlias {
  id: number
  object_id: number
  alias_name: string
  catalog: string | null
  created_at: string
}

export interface DbImage {
  id: number
  file_path: string
  file_name: string
  directory_path: string
  date_taken: string | null
  exposure_time: number | null
  filter_name: string | null
  telescope: string | null
  camera: string | null
  gain: number | null
  iso: number | null
  binning: string | null
  ra: number | null
  dec: number | null
  pixel_size_x: number | null
  pixel_size_y: number | null
  image_width: number | null
  image_height: number | null
  focal_length: number | null
  fov_width: number | null
  fov_height: number | null
  object_id: number | null
  fits_header: string | null
  created_at: string
  updated_at: string
}

export interface DbImageObject {
  image_id: number
  object_id: number
  association_type: string
  angular_distance: number | null
}

export interface DbProject {
  id: number
  name: string
  description: string | null
  status: string
  priority: number
  created_at: string
  updated_at: string
}

export interface DbProjectTarget {
  id: number
  project_id: number
  object_id: number
  is_primary: number // SQLite boolean
  exposure_goals: string | null // JSON string
  notes: string | null
  created_at: string
}

export interface DbProjectImage {
  id: number
  project_id: number
  image_id: number
  added_manually: number // SQLite boolean
}
