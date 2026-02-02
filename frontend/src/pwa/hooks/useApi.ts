/**
 * Hook that provides the appropriate API based on mode (online vs offline).
 * In PWA mode, uses the offline sql.js database.
 * In desktop mode, uses the normal API client.
 */
import { useMemo } from 'react'
import { isPwaMode } from './usePwaMode'
import * as onlineApi from '../../api/client'
import {
  offlineObjectsApi,
  offlineImagesApi,
  offlineProjectsApi,
  offlineCatalogueApi,
} from '../api/offline-client'

// Re-export types for convenience
export type {
  AstroObject,
  ObjectAlias,
  Image,
  ImageStats,
  ImageGroup,
  Project,
  ProjectDetail,
  CatalogueObject,
  CatalogueObjectsResponse,
} from '../../api/client'

/**
 * Get the appropriate objects API based on mode
 */
export function useObjectsApi() {
  return useMemo(() => {
    if (isPwaMode()) {
      return offlineObjectsApi
    }
    return onlineApi.objectsApi
  }, [])
}

/**
 * Get the appropriate images API based on mode
 */
export function useImagesApi() {
  return useMemo(() => {
    if (isPwaMode()) {
      return offlineImagesApi
    }
    return onlineApi.imagesApi
  }, [])
}

/**
 * Get the appropriate projects API based on mode
 */
export function useProjectsApi() {
  return useMemo(() => {
    if (isPwaMode()) {
      return offlineProjectsApi
    }
    return onlineApi.projectsApi
  }, [])
}

/**
 * Get the appropriate catalogue API based on mode
 */
export function useCatalogueApi() {
  return useMemo(() => {
    if (isPwaMode()) {
      return offlineCatalogueApi
    }
    return onlineApi.catalogueApi
  }, [])
}

/**
 * Get the config API - only available in desktop mode
 * Returns null in PWA mode
 */
export function useConfigApi() {
  return useMemo(() => {
    if (isPwaMode()) {
      return null
    }
    return onlineApi.configApi
  }, [])
}

/**
 * Get the indexer API - only available in desktop mode
 * Returns null in PWA mode
 */
export function useIndexerApi() {
  return useMemo(() => {
    if (isPwaMode()) {
      return null
    }
    return onlineApi.indexerApi
  }, [])
}

/**
 * Get the files API - only available in desktop mode
 * Returns null in PWA mode
 */
export function useFilesApi() {
  return useMemo(() => {
    if (isPwaMode()) {
      return null
    }
    return onlineApi.filesApi
  }, [])
}
