import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8833/api'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  paramsSerializer: {
    indexes: null,  // Serialize arrays as ids=1&ids=2 (FastAPI format) instead of ids[0]=1&ids[1]=2
  },
})

// Types
export interface ObjectAlias {
  id: number
  object_id: number
  alias_name: string
  catalog: string | null
  created_at: string
}

export interface AstroObject {
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
  aliases: ObjectAlias[]
  image_count?: number
}

export interface ImageObjectAssociation {
  object_id: number
  object_name: string | null
  association_type: string
  angular_distance: number | null
}

export interface Image {
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
  // FOV fields
  ra: number | null
  dec: number | null
  pixel_size_x: number | null
  pixel_size_y: number | null
  image_width: number | null
  image_height: number | null
  focal_length: number | null
  fov_width: number | null
  fov_height: number | null
  // Legacy object reference
  object_id: number | null
  object_name: string | null
  fits_header: Record<string, unknown> | null
  created_at: string
  updated_at: string
  // Object associations
  objects?: ImageObjectAssociation[]
}

export interface ImageStats {
  total_images: number
  total_objects: number
  objects_imaged: number
  total_exposure_seconds: number
  total_exposure_hours: number
  by_filter: Record<string, number>
  by_telescope: Record<string, number>
}

export interface SubExposureStats {
  filter_name: string | null
  exposure_time: number  // individual sub in seconds
  count: number
  total_exposure: number
}

export interface ImageGroup {
  date: string
  target_name: string | null
  target_id: number | null
  telescope: string | null
  total_frames: number
  total_exposure_seconds: number
  subs: SubExposureStats[]
  cameras: string[]
  image_ids: number[]
}

export interface IndexResult {
  status: string
  indexed: number
  skipped: number
  errors: number
  directory?: string
  detect_fov_enabled?: boolean
}

// File browser types
export interface FileEntry {
  name: string
  type: 'file' | 'directory'
  path: string  // Container path (for API calls)
  display_path: string  // User-friendly path
  size: number | null
  modified: string | null
}

export interface RootEntry {
  name: string
  path: string
  display_path: string
  icon: string
}

export interface BrowseResponse {
  current_path: string
  current_display_path: string
  parent_path: string | null
  parent_display_path: string | null
  entries: FileEntry[]
  platform: string
}

export interface RootsResponse {
  roots: RootEntry[]
  platform: string
}

export interface CatalogueImportResult {
  imported: number
  skipped: number
  errors: number
}

export interface CatalogueDownloadResult {
  status: string
  catalogues: {
    openngc?: CatalogueImportResult
    ldn?: CatalogueImportResult
    lbn?: CatalogueImportResult
  }
  errors: string[]
  stats: CatalogueStats
}

export interface CatalogueStats {
  NGC: number
  IC: number
  Messier: number
  LDN: number
  LBN: number
  Common: number
  total_objects: number
  total_aliases: number
}

export interface CatalogueAlias {
  name: string
  catalog: string | null
}

export interface CatalogueObject {
  id: number
  primary_name: string
  aliases: CatalogueAlias[]
  ra: number | null
  dec: number | null
  object_type: string | null
  size_major: number | null
  size_minor: number | null
  magnitude: number | null
  constellation: string | null
}

export interface CatalogueObjectsResponse {
  total: number
  skip: number
  limit: number
  objects: CatalogueObject[]
}

export interface LocationConfig {
  latitude: number
  longitude: number
  elevation: number
}

export interface SavedLocation {
  id: string
  name: string
  latitude: number
  longitude: number
  elevation: number
  timezone: string
}

export interface SavedLocationCreate {
  name: string
  latitude: number
  longitude: number
  elevation: number
  timezone: string
}

export interface SavedLocationUpdate {
  name?: string
  latitude?: number
  longitude?: number
  elevation?: number
  timezone?: string
}

export interface LocationsConfig {
  locations: SavedLocation[]
  active_id: string | null
}

export interface TimezoneConfig {
  timezone: string
}

export interface TelescopiusApiKeyConfig {
  api_key: string
}

export interface AltitudeDataPoint {
  time: string
  altitude: number
  azimuth: number
}

export interface TwilightTimes {
  sunset: string | null
  civil_dusk: string | null
  nautical_dusk: string | null
  astronomical_dusk: string | null
  astronomical_dawn: string | null
  nautical_dawn: string | null
  civil_dawn: string | null
  sunrise: string | null
}

export interface AltitudeChartData {
  object_name: string
  date: string
  timezone: string
  location_configured: boolean
  data: AltitudeDataPoint[]
  transit_time: string | null
  transit_altitude: number | null
  rise_time: string | null
  set_time: string | null
  twilight: TwilightTimes | null
}

export interface Configuration {
  id: number
  key: string
  value: unknown
  description: string | null
  created_at: string
  updated_at: string
}

// Project types
export interface ProjectTarget {
  id: number
  project_id: number
  object_id: number
  object_name: string | null
  object_type: string | null
  ra: number | null
  dec: number | null
  constellation: string | null
  is_primary: boolean
  exposure_goals: Record<string, number> | null
  notes: string | null
  created_at: string
  progress: ProjectProgress | null
}

export interface ProjectImage {
  id: number
  project_id: number
  image_id: number
  file_name: string | null
  filter_name: string | null
  exposure_time: number | null
  date_taken: string | null
  added_manually: boolean
}

export interface ProjectProgress {
  exposure_goals: Record<string, number>
  actual_exposure: Record<string, number>
  progress_percent: Record<string, number>
  overall_progress: number
  total_frames: number
  total_exposure_seconds: number
}

export interface Project {
  id: number
  name: string
  description: string | null
  status: string
  priority: number
  created_at: string
  updated_at: string
  target_count: number
  image_count: number
  overall_progress: number | null
}

export interface ProjectDetail extends Project {
  targets: ProjectTarget[]
  images: ProjectImage[]
  progress: ProjectProgress | null
}

export interface ProjectCreate {
  name: string
  description?: string | null
  status?: string
  priority?: number
  target_object_ids?: number[]
}

export interface ProjectUpdate {
  name?: string
  description?: string | null
  status?: string
  priority?: number
}

export interface VisibilityInfo {
  is_visible_tonight: boolean
  current_altitude: number | null
  max_altitude: number | null
  transit_time: string | null
  hours_above_min_altitude: number | null
  hours_in_darkness: number | null
  rise_time: string | null
  set_time: string | null
}

export interface WellPlacedProject {
  project_id: number
  project_name: string
  project_status: string
  primary_target_name: string
  primary_target_id: number
  visibility: VisibilityInfo
  overall_progress: number
  recommended_filter: string | null
  score: number
}

export interface WellPlacedProjectsResponse {
  location_configured: boolean
  projects: WellPlacedProject[]
}

// API functions
export const objectsApi = {
  list: async (params?: { skip?: number; limit?: number; object_type?: string; constellation?: string; primary_only?: boolean }) => {
    const response = await apiClient.get<AstroObject[]>('/objects', { params })
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<AstroObject>(`/objects/${id}`)
    return response.data
  },

  search: async (query: string, limit = 20) => {
    const response = await apiClient.get<AstroObject[]>('/objects/search', { params: { q: query, limit } })
    return response.data
  },

  create: async (data: Partial<AstroObject>) => {
    const response = await apiClient.post<AstroObject>('/objects', data)
    return response.data
  },

  update: async (id: number, data: Partial<AstroObject>) => {
    const response = await apiClient.patch<AstroObject>(`/objects/${id}`, data)
    return response.data
  },

  delete: async (id: number) => {
    await apiClient.delete(`/objects/${id}`)
  },

  getAltitude: async (id: number, date?: string) => {
    const params = date ? { chart_date: date } : {}
    const response = await apiClient.get<AltitudeChartData>(`/objects/${id}/altitude`, { params })
    return response.data
  },
}

export const imagesApi = {
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
  }) => {
    const response = await apiClient.get<Image[]>('/images', { params })
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<Image>(`/images/${id}`)
    return response.data
  },

  getStats: async () => {
    const response = await apiClient.get<ImageStats>('/images/stats')
    return response.data
  },

  linkToObject: async (imageId: number, objectId: number) => {
    const response = await apiClient.post<Image>(`/images/${imageId}/link-object/${objectId}`)
    return response.data
  },

  getGrouped: async (params?: { telescope?: string }) => {
    const response = await apiClient.get<ImageGroup[]>('/images/grouped', { params })
    return response.data
  },

  getByIds: async (ids: number[]) => {
    const response = await apiClient.get<Image[]>('/images', {
      params: { ids, limit: ids.length }
    })
    return response.data
  },
}

export const filesApi = {
  getRoots: async () => {
    const response = await apiClient.get<RootsResponse>('/files/roots')
    return response.data
  },

  browse: async (path?: string, displayPath?: string) => {
    const params: Record<string, string> = {}
    if (path) params.path = path
    if (displayPath) params.display_path = displayPath
    const response = await apiClient.get<BrowseResponse>('/files/browse', { params })
    return response.data
  },
}

export const indexerApi = {
  indexDirectory: async (directory: string, recursive = true, detectFov = true) => {
    const response = await apiClient.post<IndexResult>('/indexer/directory', { directory, recursive }, {
      params: { detect_fov: detectFov }
    })
    return response.data
  },

  indexFile: async (filePath: string, detectFov = true) => {
    const response = await apiClient.post('/indexer/file', { file_path: filePath }, {
      params: { detect_fov: detectFov }
    })
    return response.data
  },

  reindex: async () => {
    const response = await apiClient.post('/indexer/reindex')
    return response.data
  },

  downloadCatalogues: async (catalogues: string[] = ['openngc', 'ldn', 'lbn']) => {
    const response = await apiClient.post<CatalogueDownloadResult>('/indexer/download-catalogues', null, {
      params: { catalogs: catalogues }
    })
    return response.data
  },

  getCatalogueStats: async () => {
    const response = await apiClient.get<CatalogueStats>('/indexer/catalogue-stats')
    return response.data
  },

  detectFovObjects: async (imageIds?: number[], onlyMissing = true) => {
    const response = await apiClient.post('/indexer/detect-fov-objects', null, {
      params: { image_ids: imageIds, only_missing: onlyMissing }
    })
    return response.data
  },
}

export const catalogueApi = {
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
  }) => {
    const response = await apiClient.get<CatalogueObjectsResponse>('/catalogue/objects', { params })
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<CatalogueObject>(`/catalogue/objects/${id}`)
    return response.data
  },

  search: async (query: string, limit = 20) => {
    const response = await apiClient.get<CatalogueObject[]>('/catalogue/search', { params: { q: query, limit } })
    return response.data
  },

  getTypes: async () => {
    const response = await apiClient.get<string[]>('/catalogue/types')
    return response.data
  },

  getConstellations: async () => {
    const response = await apiClient.get<string[]>('/catalogue/constellations')
    return response.data
  },

  getCatalogs: async () => {
    const response = await apiClient.get<Record<string, number>>('/catalogue/catalogs')
    return response.data
  },
}

export const configApi = {
  list: async () => {
    const response = await apiClient.get<Configuration[]>('/config')
    return response.data
  },

  get: async (key: string) => {
    const response = await apiClient.get<Configuration>(`/config/${key}`)
    return response.data
  },

  getLocation: async () => {
    const response = await apiClient.get<LocationConfig | null>('/config/location/')
    return response.data
  },

  setLocation: async (location: LocationConfig) => {
    const response = await apiClient.put<LocationConfig>('/config/location/', location)
    return response.data
  },

  updateLocation: async (location: Partial<LocationConfig>) => {
    const response = await apiClient.patch<LocationConfig>('/config/location/', location)
    return response.data
  },

  // Multiple locations API
  getLocations: async () => {
    const response = await apiClient.get<LocationsConfig>('/config/locations/')
    return response.data
  },

  getActiveLocation: async () => {
    const response = await apiClient.get<SavedLocation | null>('/config/locations/active')
    return response.data
  },

  addLocation: async (location: SavedLocationCreate) => {
    const response = await apiClient.post<SavedLocation>('/config/locations/', location)
    return response.data
  },

  updateSavedLocation: async (locationId: string, location: SavedLocationUpdate) => {
    const response = await apiClient.put<SavedLocation>(`/config/locations/${locationId}`, location)
    return response.data
  },

  deleteLocation: async (locationId: string) => {
    await apiClient.delete(`/config/locations/${locationId}`)
  },

  setActiveLocation: async (locationId: string) => {
    const response = await apiClient.put<LocationsConfig>(`/config/locations/${locationId}/active`)
    return response.data
  },

  getTimezone: async () => {
    const response = await apiClient.get<TimezoneConfig | null>('/config/timezone/')
    return response.data
  },

  setTimezone: async (timezone: TimezoneConfig) => {
    const response = await apiClient.put<TimezoneConfig>('/config/timezone/', timezone)
    return response.data
  },

  // Telescopius API key
  getTelescopiusApiKey: async () => {
    const response = await apiClient.get<TelescopiusApiKeyConfig>('/config/telescopius-api-key/')
    return response.data
  },

  setTelescopiusApiKey: async (config: TelescopiusApiKeyConfig) => {
    const response = await apiClient.put<TelescopiusApiKeyConfig>('/config/telescopius-api-key/', config)
    return response.data
  },

  deleteTelescopiusApiKey: async () => {
    await apiClient.delete('/config/telescopius-api-key/')
  },
}

export const projectsApi = {
  list: async (params?: { skip?: number; limit?: number; status?: string }) => {
    const response = await apiClient.get<Project[]>('/projects', { params })
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ProjectDetail>(`/projects/${id}`)
    return response.data
  },

  create: async (data: ProjectCreate) => {
    const response = await apiClient.post<Project>('/projects', data)
    return response.data
  },

  update: async (id: number, data: ProjectUpdate) => {
    const response = await apiClient.patch<Project>(`/projects/${id}`, data)
    return response.data
  },

  delete: async (id: number) => {
    await apiClient.delete(`/projects/${id}`)
  },

  // Target management
  addTarget: async (projectId: number, objectId: number, isPrimary = false) => {
    const response = await apiClient.post<ProjectDetail>(`/projects/${projectId}/targets`, {
      object_id: objectId,
      is_primary: isPrimary,
    })
    return response.data
  },

  updateTarget: async (projectId: number, objectId: number, data: { is_primary?: boolean; exposure_goals?: Record<string, number> | null; notes?: string | null }) => {
    const response = await apiClient.patch<ProjectDetail>(`/projects/${projectId}/targets/${objectId}`, {
      object_id: objectId,
      ...data,
    })
    return response.data
  },

  removeTarget: async (projectId: number, objectId: number) => {
    await apiClient.delete(`/projects/${projectId}/targets/${objectId}`)
  },

  // Image management
  addImages: async (projectId: number, imageIds: number[]) => {
    const response = await apiClient.post<ProjectDetail>(`/projects/${projectId}/images`, {
      image_ids: imageIds,
    })
    return response.data
  },

  removeImage: async (projectId: number, imageId: number) => {
    await apiClient.delete(`/projects/${projectId}/images/${imageId}`)
  },

  autoLinkImages: async (projectId: number) => {
    const response = await apiClient.post<{ linked_images: number }>(`/projects/${projectId}/auto-link-images`)
    return response.data
  },

  linkImagesFromGroup: async (
    projectId: number,
    objectId: number,
    group: { date: string; target_name: string | null; telescope: string | null }
  ) => {
    const response = await apiClient.post<{ linked_images: number }>(
      `/projects/${projectId}/targets/${objectId}/link-images`,
      group
    )
    return response.data
  },

  // Progress & Visibility
  getProgress: async (id: number) => {
    const response = await apiClient.get<ProjectProgress>(`/projects/${id}/progress`)
    return response.data
  },

  getVisibility: async (id: number) => {
    const response = await apiClient.get(`/projects/${id}/visibility`)
    return response.data
  },

  // Dashboard
  getWellPlaced: async (limit = 5) => {
    const response = await apiClient.get<WellPlacedProjectsResponse>('/projects/dashboard/well-placed', {
      params: { limit },
    })
    return response.data
  },
}
