/**
 * Offline API client that mirrors src/api/client.ts but queries the local sql.js database.
 * Uses the same TypeScript types for compatibility.
 */
import {
  AstroObject,
  Image,
  ImageObjectAssociation,
  ImageStats,
  ImageGroup,
  ImageGroupsResponse,
  SubExposureStats,
  Project,
  ProjectDetail,
  ProjectTarget,
  ProjectImage,
  CatalogueObject,
  CatalogueObjectsResponse,
  CatalogueAlias,
  WellPlacedObject,
  WellPlacedObjectsResponse,
  WellPlacedProject,
  WellPlacedProjectsResponse,
  VisibilityInfo,
} from '../../api/client'
import {
  calculateBatchVisibility,
  calculateVisibilityScore,
  getStoredLocation,
} from '../services/astronomy'
import {
  query,
  queryOne,
  queryScalar,
  DbObject,
  DbObjectAlias,
  DbImage,
  DbImageObject,
  DbProject,
  DbProjectTarget,
  DbProjectImage,
} from '../db/offline-db'

// Helper to convert DB rows to API types
function mapObject(obj: DbObject, aliases: DbObjectAlias[]): AstroObject {
  return {
    ...obj,
    aliases: aliases.map((a) => ({
      id: a.id,
      object_id: a.object_id,
      alias_name: a.alias_name,
      catalog: a.catalog,
      created_at: a.created_at,
    })),
  }
}

function mapImage(img: DbImage, associations?: DbImageObject[]): Image {
  let objectName: string | null = null
  if (img.object_id) {
    const obj = queryOne<DbObject>(
      'SELECT primary_name FROM objects WHERE id = ?',
      [img.object_id]
    )
    objectName = obj?.primary_name ?? null
  }

  return {
    ...img,
    object_name: objectName,
    fits_header: img.fits_header ? JSON.parse(img.fits_header) : null,
    objects: associations?.map((a) => {
      const obj = queryOne<DbObject>(
        'SELECT primary_name FROM objects WHERE id = ?',
        [a.object_id]
      )
      return {
        object_id: a.object_id,
        object_name: obj?.primary_name ?? null,
        association_type: a.association_type,
        angular_distance: a.angular_distance,
      } as ImageObjectAssociation
    }),
  }
}

// Objects API
export const offlineObjectsApi = {
  list: async (params?: {
    skip?: number
    limit?: number
    object_type?: string
    constellation?: string
    primary_only?: boolean
  }): Promise<AstroObject[]> => {
    const skip = params?.skip ?? 0
    const limit = params?.limit ?? 100
    const primaryOnly = params?.primary_only ?? true

    // Only return objects that have images associated with them
    // If primary_only is true, only include objects that are the primary target of at least one image
    let sql: string
    const sqlParams: unknown[] = []

    if (primaryOnly) {
      // Objects that are the primary target of at least one image
      sql = `
        SELECT DISTINCT o.*, COUNT(DISTINCT i.id) as image_count
        FROM objects o
        INNER JOIN images i ON i.object_id = o.id
        WHERE 1=1
      `
    } else {
      // Objects that appear in any image (primary or in_fov)
      sql = `
        SELECT DISTINCT o.*, COUNT(DISTINCT io.image_id) as image_count
        FROM objects o
        INNER JOIN image_objects io ON io.object_id = o.id
        WHERE 1=1
      `
    }

    if (params?.object_type) {
      sql += ' AND o.object_type = ?'
      sqlParams.push(params.object_type)
    }
    if (params?.constellation) {
      sql += ' AND o.constellation = ?'
      sqlParams.push(params.constellation)
    }

    sql += ' GROUP BY o.id ORDER BY o.primary_name LIMIT ? OFFSET ?'
    sqlParams.push(limit, skip)

    const objects = query<DbObject & { image_count: number }>(sql, sqlParams)

    return objects.map((obj) => {
      const aliases = query<DbObjectAlias>(
        'SELECT * FROM object_aliases WHERE object_id = ?',
        [obj.id]
      )
      const mapped = mapObject(obj, aliases)
      mapped.image_count = obj.image_count
      return mapped
    })
  },

  get: async (id: number): Promise<AstroObject> => {
    const obj = queryOne<DbObject>('SELECT * FROM objects WHERE id = ?', [id])
    if (!obj) throw new Error('Object not found')

    const aliases = query<DbObjectAlias>(
      'SELECT * FROM object_aliases WHERE object_id = ?',
      [id]
    )
    return mapObject(obj, aliases)
  },

  search: async (searchQuery: string, limit = 20): Promise<AstroObject[]> => {
    const pattern = `%${searchQuery}%`

    // Search in primary_name and aliases
    const sql = `
      SELECT DISTINCT o.* FROM objects o
      LEFT JOIN object_aliases a ON o.id = a.object_id
      WHERE o.primary_name LIKE ? OR a.alias_name LIKE ?
      ORDER BY o.primary_name
      LIMIT ?
    `
    const objects = query<DbObject>(sql, [pattern, pattern, limit])

    return objects.map((obj) => {
      const aliases = query<DbObjectAlias>(
        'SELECT * FROM object_aliases WHERE object_id = ?',
        [obj.id]
      )
      return mapObject(obj, aliases)
    })
  },
}

// Images API
export const offlineImagesApi = {
  list: async (params?: {
    skip?: number
    limit?: number
    object_id?: number
    filter_name?: string
    telescope?: string
    camera?: string
    date_from?: string
    date_to?: string
    sort_by?: 'date_taken' | 'exposure_time' | 'filter_name'
    sort_order?: 'asc' | 'desc'
  }): Promise<Image[]> => {
    const skip = params?.skip ?? 0
    const limit = params?.limit ?? 100

    let sql = 'SELECT * FROM images WHERE 1=1'
    const sqlParams: unknown[] = []

    if (params?.object_id) {
      sql += ' AND object_id = ?'
      sqlParams.push(params.object_id)
    }
    if (params?.filter_name) {
      sql += ' AND filter_name = ?'
      sqlParams.push(params.filter_name)
    }
    if (params?.telescope) {
      sql += ' AND telescope = ?'
      sqlParams.push(params.telescope)
    }
    if (params?.camera) {
      sql += ' AND camera = ?'
      sqlParams.push(params.camera)
    }
    if (params?.date_from) {
      sql += ' AND date_taken >= ?'
      sqlParams.push(params.date_from)
    }
    if (params?.date_to) {
      sql += ' AND date_taken <= ?'
      sqlParams.push(params.date_to)
    }

    const sortBy = params?.sort_by ?? 'date_taken'
    const sortOrder = params?.sort_order ?? 'desc'
    sql += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`
    sqlParams.push(limit, skip)

    const images = query<DbImage>(sql, sqlParams)

    return images.map((img) => {
      const associations = query<DbImageObject>(
        'SELECT * FROM image_objects WHERE image_id = ?',
        [img.id]
      )
      return mapImage(img, associations)
    })
  },

  get: async (id: number): Promise<Image> => {
    const img = queryOne<DbImage>('SELECT * FROM images WHERE id = ?', [id])
    if (!img) throw new Error('Image not found')

    const associations = query<DbImageObject>(
      'SELECT * FROM image_objects WHERE image_id = ?',
      [id]
    )
    return mapImage(img, associations)
  },

  getStats: async (): Promise<ImageStats> => {
    const totalImages = queryScalar<number>('SELECT COUNT(*) FROM images') ?? 0
    const totalObjects = queryScalar<number>('SELECT COUNT(*) FROM objects') ?? 0
    const objectsImaged =
      queryScalar<number>(
        'SELECT COUNT(DISTINCT object_id) FROM images WHERE object_id IS NOT NULL'
      ) ?? 0
    const totalExposure =
      queryScalar<number>('SELECT SUM(exposure_time) FROM images') ?? 0

    // By filter
    const filterRows = query<{ filter_name: string; count: number }>(
      "SELECT filter_name, COUNT(*) as count FROM images WHERE filter_name IS NOT NULL GROUP BY filter_name"
    )
    const byFilter: Record<string, number> = {}
    filterRows.forEach((row) => {
      byFilter[row.filter_name] = row.count
    })

    // By telescope
    const telescopeRows = query<{ telescope: string; count: number }>(
      "SELECT telescope, COUNT(*) as count FROM images WHERE telescope IS NOT NULL GROUP BY telescope"
    )
    const byTelescope: Record<string, number> = {}
    telescopeRows.forEach((row) => {
      byTelescope[row.telescope] = row.count
    })

    // Camera stats
    const cameraRows = query<{ camera: string; count: number }>(
      "SELECT camera, COUNT(*) as count FROM images WHERE camera IS NOT NULL GROUP BY camera"
    )
    const byCamera: Record<string, number> = {}
    cameraRows.forEach((row) => {
      byCamera[row.camera] = row.count
    })

    return {
      total_images: totalImages,
      total_objects: totalObjects,
      objects_imaged: objectsImaged,
      total_exposure_seconds: totalExposure,
      total_exposure_hours: totalExposure / 3600,
      by_filter: byFilter,
      by_telescope: byTelescope,
      by_camera: byCamera,
    }
  },

  getGrouped: async (params?: {
    skip?: number
    limit?: number
    telescope?: string
    camera?: string
    object_id?: number
  }): Promise<ImageGroupsResponse> => {
    let sql = `
      SELECT
        DATE(date_taken) as date,
        object_id as target_id,
        telescope,
        filter_name,
        exposure_time,
        COUNT(*) as frame_count,
        GROUP_CONCAT(id) as image_ids,
        GROUP_CONCAT(DISTINCT camera) as cameras
      FROM images
      WHERE date_taken IS NOT NULL
    `
    const sqlParams: unknown[] = []

    if (params?.telescope) {
      sql += ' AND telescope LIKE ?'
      sqlParams.push(`%${params.telescope}%`)
    }

    if (params?.camera) {
      sql += ' AND camera LIKE ?'
      sqlParams.push(`%${params.camera}%`)
    }

    if (params?.object_id) {
      sql += ' AND object_id = ?'
      sqlParams.push(params.object_id)
    }

    sql += ' GROUP BY DATE(date_taken), object_id, telescope, filter_name, exposure_time'
    sql += ' ORDER BY date DESC'

    const rows = query<{
      date: string
      target_id: number | null
      telescope: string | null
      filter_name: string | null
      exposure_time: number | null
      frame_count: number
      image_ids: string
      cameras: string
    }>(sql, sqlParams)

    // Group by date + target + telescope
    const groups: Map<string, ImageGroup> = new Map()

    for (const row of rows) {
      const key = `${row.date}-${row.target_id}-${row.telescope}`

      if (!groups.has(key)) {
        let targetName: string | null = null
        if (row.target_id) {
          const obj = queryOne<DbObject>(
            'SELECT primary_name FROM objects WHERE id = ?',
            [row.target_id]
          )
          targetName = obj?.primary_name ?? null
        }

        groups.set(key, {
          date: row.date,
          target_name: targetName,
          target_id: row.target_id,
          telescope: row.telescope,
          total_frames: 0,
          total_exposure_seconds: 0,
          subs: [],
          cameras: [],
          image_ids: [],
        })
      }

      const group = groups.get(key)!
      group.total_frames += row.frame_count
      group.total_exposure_seconds +=
        (row.exposure_time ?? 0) * row.frame_count

      group.subs.push({
        filter_name: row.filter_name,
        exposure_time: row.exposure_time ?? 0,
        count: row.frame_count,
        total_exposure: (row.exposure_time ?? 0) * row.frame_count,
      } as SubExposureStats)

      // Parse cameras and image_ids
      if (row.cameras) {
        const cams = row.cameras.split(',').filter(Boolean)
        cams.forEach((c) => {
          if (!group.cameras.includes(c)) group.cameras.push(c)
        })
      }
      if (row.image_ids) {
        const ids = row.image_ids.split(',').map(Number)
        group.image_ids.push(...ids)
      }
    }

    const allGroups = Array.from(groups.values())
    const skip = params?.skip ?? 0
    const limit = params?.limit ?? 20
    const paginatedGroups = allGroups.slice(skip, skip + limit)

    return {
      total: allGroups.length,
      skip,
      limit,
      groups: paginatedGroups,
    }
  },

  getByIds: async (ids: number[]): Promise<Image[]> => {
    if (ids.length === 0) return []

    const placeholders = ids.map(() => '?').join(',')
    const images = query<DbImage>(
      `SELECT * FROM images WHERE id IN (${placeholders})`,
      ids
    )

    return images.map((img) => mapImage(img))
  },
}

// Projects API
export const offlineProjectsApi = {
  list: async (params?: {
    skip?: number
    limit?: number
    status?: string
  }): Promise<Project[]> => {
    const skip = params?.skip ?? 0
    const limit = params?.limit ?? 100

    let sql = 'SELECT * FROM projects WHERE 1=1'
    const sqlParams: unknown[] = []

    if (params?.status) {
      sql += ' AND status = ?'
      sqlParams.push(params.status)
    }

    sql += ' ORDER BY priority DESC, updated_at DESC LIMIT ? OFFSET ?'
    sqlParams.push(limit, skip)

    const projects = query<DbProject>(sql, sqlParams)

    return projects.map((p) => {
      const targetCount =
        queryScalar<number>(
          'SELECT COUNT(*) FROM project_targets WHERE project_id = ?',
          [p.id]
        ) ?? 0
      const imageCount =
        queryScalar<number>(
          'SELECT COUNT(*) FROM project_images WHERE project_id = ?',
          [p.id]
        ) ?? 0

      return {
        ...p,
        target_count: targetCount,
        image_count: imageCount,
        overall_progress: null, // Would need exposure goals calculation
      }
    })
  },

  get: async (id: number): Promise<ProjectDetail> => {
    const project = queryOne<DbProject>(
      'SELECT * FROM projects WHERE id = ?',
      [id]
    )
    if (!project) throw new Error('Project not found')

    // Get targets
    const dbTargets = query<DbProjectTarget>(
      'SELECT * FROM project_targets WHERE project_id = ?',
      [id]
    )

    const targets: ProjectTarget[] = dbTargets.map((t) => {
      const obj = queryOne<DbObject>('SELECT * FROM objects WHERE id = ?', [
        t.object_id,
      ])

      return {
        id: t.id,
        project_id: t.project_id,
        object_id: t.object_id,
        object_name: obj?.primary_name ?? null,
        object_type: obj?.object_type ?? null,
        ra: obj?.ra ?? null,
        dec: obj?.dec ?? null,
        constellation: obj?.constellation ?? null,
        is_primary: Boolean(t.is_primary),
        exposure_goals: t.exposure_goals ? JSON.parse(t.exposure_goals) : null,
        notes: t.notes,
        created_at: t.created_at,
        progress: null,
      }
    })

    // Get images
    const dbImages = query<DbProjectImage & { file_name?: string; filter_name?: string; exposure_time?: number; date_taken?: string }>(
      `SELECT pi.*, i.file_name, i.filter_name, i.exposure_time, i.date_taken
       FROM project_images pi
       LEFT JOIN images i ON pi.image_id = i.id
       WHERE pi.project_id = ?`,
      [id]
    )

    const images: ProjectImage[] = dbImages.map((i) => ({
      id: i.id,
      project_id: i.project_id,
      image_id: i.image_id,
      file_name: i.file_name ?? null,
      filter_name: i.filter_name ?? null,
      exposure_time: i.exposure_time ?? null,
      date_taken: i.date_taken ?? null,
      added_manually: Boolean(i.added_manually),
    }))

    return {
      ...project,
      target_count: targets.length,
      image_count: images.length,
      overall_progress: null,
      targets,
      images,
      progress: null,
    }
  },

  getWellPlaced: async (limit = 5): Promise<WellPlacedProjectsResponse> => {
    const location = getStoredLocation()
    if (!location) {
      return {
        location_configured: false,
        projects: [],
      }
    }

    // Get active projects (not completed/archived)
    const projects = query<DbProject>(
      "SELECT * FROM projects WHERE status IN ('planning', 'active', 'in_progress') ORDER BY priority DESC"
    )

    if (projects.length === 0) {
      return {
        location_configured: true,
        projects: [],
      }
    }

    // For each project, get the primary target
    const projectsWithTargets: Array<{
      project: DbProject
      target: DbProjectTarget
      object: DbObject
    }> = []

    for (const project of projects) {
      // Get primary target (or first target if none marked primary)
      const target = queryOne<DbProjectTarget>(
        `SELECT * FROM project_targets WHERE project_id = ? ORDER BY is_primary DESC LIMIT 1`,
        [project.id]
      )

      if (!target) continue

      const object = queryOne<DbObject>(
        'SELECT * FROM objects WHERE id = ?',
        [target.object_id]
      )

      if (!object || object.ra === null || object.dec === null) continue

      projectsWithTargets.push({ project, target, object })
    }

    // Calculate visibility for all primary targets
    const objectsForCalc = projectsWithTargets.map((p) => ({
      id: p.object.id,
      ra: p.object.ra,
      dec: p.object.dec,
    }))

    const visibilityResults = calculateBatchVisibility(objectsForCalc, location, 30)

    // Build well-placed projects list
    const wellPlacedProjects: WellPlacedProject[] = []

    for (const { project, object } of projectsWithTargets) {
      const visibility = visibilityResults[object.id]
      if (!visibility || !visibility.is_visible_tonight) continue

      // Calculate score (simplified - no progress, just visibility + priority)
      const visScore = calculateVisibilityScore(visibility)
      const score = visScore + (project.priority * 5) + 30 // Base score for urgency

      const fullVisibility: VisibilityInfo = {
        is_visible_tonight: visibility.is_visible_tonight,
        current_altitude: visibility.current_altitude,
        max_altitude: visibility.max_altitude,
        transit_time: visibility.transit_time,
        hours_above_min_altitude: visibility.hours_in_darkness,
        hours_in_darkness: visibility.hours_in_darkness,
        rise_time: null,
        set_time: null,
      }

      wellPlacedProjects.push({
        project_id: project.id,
        project_name: project.name,
        project_status: project.status,
        primary_target_name: object.primary_name,
        primary_target_id: object.id,
        visibility: fullVisibility,
        overall_progress: 0, // Not calculated in offline mode
        recommended_filter: null, // Would need progress calculation
        score,
      })
    }

    // Sort by score and limit
    wellPlacedProjects.sort((a, b) => b.score - a.score)
    const limitedProjects = wellPlacedProjects.slice(0, limit)

    return {
      location_configured: true,
      projects: limitedProjects,
    }
  },
}

// Catalogue API
export const offlineCatalogueApi = {
  list: async (params?: {
    skip?: number
    limit?: number
    catalog?: string
    object_type?: string
    constellation?: string
    min_magnitude?: number
    max_magnitude?: number
    min_size?: number
    max_size?: number
    search?: string
    sort_by?: 'primary_name' | 'magnitude' | 'size_major' | 'constellation' | 'object_type' | 'ra' | 'dec'
    sort_order?: 'asc' | 'desc'
  }): Promise<CatalogueObjectsResponse> => {
    const skip = params?.skip ?? 0
    const limit = params?.limit ?? 50
    const sortBy = params?.sort_by ?? 'primary_name'
    const sortOrder = params?.sort_order ?? 'asc'

    let countSql = 'SELECT COUNT(*) FROM objects WHERE 1=1'
    let sql = 'SELECT * FROM objects WHERE 1=1'
    const sqlParams: unknown[] = []
    const countParams: unknown[] = []

    // Build WHERE clauses
    const addCondition = (condition: string, value: unknown) => {
      sql += ` AND ${condition}`
      countSql += ` AND ${condition}`
      sqlParams.push(value)
      countParams.push(value)
    }

    if (params?.object_type) {
      addCondition('object_type = ?', params.object_type)
    }
    if (params?.constellation) {
      addCondition('constellation = ?', params.constellation)
    }
    if (params?.min_magnitude !== undefined) {
      addCondition('magnitude >= ?', params.min_magnitude)
    }
    if (params?.max_magnitude !== undefined) {
      addCondition('magnitude <= ?', params.max_magnitude)
    }
    if (params?.min_size !== undefined) {
      addCondition('size_major >= ?', params.min_size)
    }
    if (params?.max_size !== undefined) {
      addCondition('size_major <= ?', params.max_size)
    }
    if (params?.search) {
      const pattern = `%${params.search}%`
      sql += ' AND (primary_name LIKE ? OR id IN (SELECT object_id FROM object_aliases WHERE alias_name LIKE ?))'
      countSql += ' AND (primary_name LIKE ? OR id IN (SELECT object_id FROM object_aliases WHERE alias_name LIKE ?))'
      sqlParams.push(pattern, pattern)
      countParams.push(pattern, pattern)
    }
    if (params?.catalog) {
      sql += ' AND id IN (SELECT object_id FROM object_aliases WHERE catalog = ?)'
      countSql += ' AND id IN (SELECT object_id FROM object_aliases WHERE catalog = ?)'
      sqlParams.push(params.catalog)
      countParams.push(params.catalog)
    }

    const total = queryScalar<number>(countSql, countParams) ?? 0

    // Build ORDER BY clause with the sort parameters
    const validSortColumns = ['primary_name', 'magnitude', 'size_major', 'constellation', 'object_type', 'ra', 'dec']
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'primary_name'
    const sortDir = sortOrder === 'desc' ? 'DESC' : 'ASC'
    sql += ` ORDER BY ${sortColumn} ${sortDir} NULLS LAST LIMIT ? OFFSET ?`
    sqlParams.push(limit, skip)

    const objects = query<DbObject>(sql, sqlParams)

    const catalogueObjects: CatalogueObject[] = objects.map((obj) => {
      const aliases = query<DbObjectAlias>(
        'SELECT alias_name, catalog FROM object_aliases WHERE object_id = ?',
        [obj.id]
      )

      return {
        id: obj.id,
        primary_name: obj.primary_name,
        aliases: aliases.map((a) => ({
          name: a.alias_name,
          catalog: a.catalog,
        })) as CatalogueAlias[],
        ra: obj.ra,
        dec: obj.dec,
        object_type: obj.object_type,
        size_major: obj.size_major,
        size_minor: obj.size_minor,
        magnitude: obj.magnitude,
        constellation: obj.constellation,
      }
    })

    return {
      total,
      skip,
      limit,
      objects: catalogueObjects,
    }
  },

  get: async (id: number): Promise<CatalogueObject> => {
    const obj = queryOne<DbObject>('SELECT * FROM objects WHERE id = ?', [id])
    if (!obj) throw new Error('Object not found')

    const aliases = query<DbObjectAlias>(
      'SELECT alias_name, catalog FROM object_aliases WHERE object_id = ?',
      [id]
    )

    return {
      id: obj.id,
      primary_name: obj.primary_name,
      aliases: aliases.map((a) => ({
        name: a.alias_name,
        catalog: a.catalog,
      })) as CatalogueAlias[],
      ra: obj.ra,
      dec: obj.dec,
      object_type: obj.object_type,
      size_major: obj.size_major,
      size_minor: obj.size_minor,
      magnitude: obj.magnitude,
      constellation: obj.constellation,
    }
  },

  search: async (searchQuery: string, limit = 20): Promise<CatalogueObject[]> => {
    const pattern = `%${searchQuery}%`

    const sql = `
      SELECT DISTINCT o.* FROM objects o
      LEFT JOIN object_aliases a ON o.id = a.object_id
      WHERE o.primary_name LIKE ? OR a.alias_name LIKE ?
      ORDER BY o.primary_name
      LIMIT ?
    `
    const objects = query<DbObject>(sql, [pattern, pattern, limit])

    return objects.map((obj) => {
      const aliases = query<DbObjectAlias>(
        'SELECT alias_name, catalog FROM object_aliases WHERE object_id = ?',
        [obj.id]
      )

      return {
        id: obj.id,
        primary_name: obj.primary_name,
        aliases: aliases.map((a) => ({
          name: a.alias_name,
          catalog: a.catalog,
        })) as CatalogueAlias[],
        ra: obj.ra,
        dec: obj.dec,
        object_type: obj.object_type,
        size_major: obj.size_major,
        size_minor: obj.size_minor,
        magnitude: obj.magnitude,
        constellation: obj.constellation,
      }
    })
  },

  getTypes: async (): Promise<string[]> => {
    const rows = query<{ object_type: string }>(
      "SELECT DISTINCT object_type FROM objects WHERE object_type IS NOT NULL ORDER BY object_type"
    )
    return rows.map((r) => r.object_type)
  },

  getConstellations: async (): Promise<string[]> => {
    const rows = query<{ constellation: string }>(
      "SELECT DISTINCT constellation FROM objects WHERE constellation IS NOT NULL ORDER BY constellation"
    )
    return rows.map((r) => r.constellation)
  },

  getCatalogs: async (): Promise<Record<string, number>> => {
    const rows = query<{ catalog: string; count: number }>(
      "SELECT catalog, COUNT(*) as count FROM object_aliases WHERE catalog IS NOT NULL GROUP BY catalog"
    )
    const result: Record<string, number> = {}
    rows.forEach((r) => {
      result[r.catalog] = r.count
    })
    return result
  },

  getWellPlaced: async (params?: {
    skip?: number
    limit?: number
    min_altitude?: number
    catalog?: string
    object_type?: string
    constellation?: string
    min_magnitude?: number
    max_magnitude?: number
    min_size?: number
    max_size?: number
    search?: string
  }): Promise<WellPlacedObjectsResponse> => {
    const location = getStoredLocation()
    if (!location) {
      return {
        location_configured: false,
        total: 0,
        skip: 0,
        limit: 50,
        objects: [],
      }
    }

    const minAltitude = params?.min_altitude ?? 30

    // Pre-filter by declination: objects can only reach altitude A if 90 - |lat - dec| >= A
    // This means: dec >= lat - (90 - A) AND dec <= lat + (90 - A)
    const decRange = 90 - minAltitude
    const minDec = Math.max(-90, location.latitude - decRange)
    const maxDec = Math.min(90, location.latitude + decRange)

    // First, get all objects matching filters with declination pre-filter
    let sql = 'SELECT * FROM objects WHERE ra IS NOT NULL AND dec IS NOT NULL AND dec >= ? AND dec <= ?'
    const sqlParams: unknown[] = [minDec, maxDec]

    if (params?.object_type) {
      sql += ' AND object_type = ?'
      sqlParams.push(params.object_type)
    }
    if (params?.constellation) {
      sql += ' AND constellation = ?'
      sqlParams.push(params.constellation)
    }
    if (params?.min_magnitude !== undefined) {
      sql += ' AND magnitude >= ?'
      sqlParams.push(params.min_magnitude)
    }
    if (params?.max_magnitude !== undefined) {
      sql += ' AND magnitude <= ?'
      sqlParams.push(params.max_magnitude)
    }
    if (params?.min_size !== undefined) {
      sql += ' AND size_major >= ?'
      sqlParams.push(params.min_size)
    }
    if (params?.max_size !== undefined) {
      sql += ' AND size_major <= ?'
      sqlParams.push(params.max_size)
    }
    if (params?.search) {
      const pattern = `%${params.search}%`
      sql += ' AND (primary_name LIKE ? OR id IN (SELECT object_id FROM object_aliases WHERE alias_name LIKE ?))'
      sqlParams.push(pattern, pattern)
    }
    if (params?.catalog) {
      sql += ' AND id IN (SELECT object_id FROM object_aliases WHERE catalog = ?)'
      sqlParams.push(params.catalog)
    }

    const objects = query<DbObject>(sql, sqlParams)

    // Calculate visibility for all matching objects in batch
    const objectsForCalc = objects.map((obj) => ({
      id: obj.id,
      ra: obj.ra,
      dec: obj.dec,
    }))

    const visibilityResults = calculateBatchVisibility(objectsForCalc, location, minAltitude)

    // Filter to only visible objects and build response
    const wellPlacedObjects: WellPlacedObject[] = []

    for (const obj of objects) {
      const visibility = visibilityResults[obj.id]
      if (!visibility || !visibility.is_visible_tonight) continue

      const aliases = query<DbObjectAlias>(
        'SELECT * FROM object_aliases WHERE object_id = ?',
        [obj.id]
      )

      // Get image count for this object
      const imageCount = queryScalar<number>(
        'SELECT COUNT(*) FROM images WHERE object_id = ?',
        [obj.id]
      ) ?? 0

      const score = calculateVisibilityScore(visibility)

      // Convert our VisibilityInfo to the API's VisibilityInfo format
      const fullVisibility: VisibilityInfo = {
        is_visible_tonight: visibility.is_visible_tonight,
        current_altitude: visibility.current_altitude,
        max_altitude: visibility.max_altitude,
        transit_time: visibility.transit_time,
        hours_above_min_altitude: visibility.hours_in_darkness, // Approximate
        hours_in_darkness: visibility.hours_in_darkness,
        rise_time: null, // Not calculated in batch mode
        set_time: null,  // Not calculated in batch mode
      }

      wellPlacedObjects.push({
        id: obj.id,
        primary_name: obj.primary_name,
        object_type: obj.object_type,
        constellation: obj.constellation,
        magnitude: obj.magnitude,
        size_major: obj.size_major,
        size_minor: obj.size_minor,
        ra: obj.ra,
        dec: obj.dec,
        image_count: imageCount,
        visibility: fullVisibility,
        score,
        aliases: aliases.map((a) => ({
          id: a.id,
          object_id: a.object_id,
          alias_name: a.alias_name,
          catalog: a.catalog,
          created_at: a.created_at,
        })),
      })
    }

    // Sort by score (highest first)
    wellPlacedObjects.sort((a, b) => b.score - a.score)

    // Apply pagination
    const skip = params?.skip ?? 0
    const limit = params?.limit ?? 50
    const paginatedObjects = wellPlacedObjects.slice(skip, skip + limit)

    return {
      location_configured: true,
      total: wellPlacedObjects.length,
      skip,
      limit,
      objects: paginatedObjects,
    }
  },
}
