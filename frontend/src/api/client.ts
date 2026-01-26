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
  constellation: string | null
  created_at: string
  updated_at: string
  aliases: ObjectAlias[]
  image_count?: number
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
  object_id: number | null
  object_name: string | null
  fits_header: Record<string, unknown> | null
  created_at: string
  updated_at: string
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
  indexDirectory: async (directory: string, recursive = true) => {
    const response = await apiClient.post<IndexResult>('/indexer/directory', { directory, recursive })
    return response.data
  },

  indexFile: async (filePath: string) => {
    const response = await apiClient.post('/indexer/file', { file_path: filePath })
    return response.data
  },

  reindex: async () => {
    const response = await apiClient.post('/indexer/reindex')
    return response.data
  },
}
