import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
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
  total_exposure_seconds: number
  total_exposure_hours: number
  by_filter: Record<string, number>
  by_telescope: Record<string, number>
}

export interface IndexResult {
  status: string
  indexed: number
  skipped: number
  errors: number
  directory?: string
  detect_fov_enabled?: boolean
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

// API functions
export const objectsApi = {
  list: async (params?: { skip?: number; limit?: number; object_type?: string; constellation?: string }) => {
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
