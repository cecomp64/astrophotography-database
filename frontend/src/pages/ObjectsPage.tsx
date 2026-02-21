import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  AstroObject,
  WellPlacedObject,
  WellPlacedObjectsResponse,
} from '../api/client'
import { useObjectsApi } from '../pwa/hooks/useApi'
import { isPwaMode } from '../pwa/hooks/usePwaMode'
import ObjectCard from '../components/ObjectCard'
import SearchBar from '../components/SearchBar'
import CreateObjectModal from '../components/CreateObjectModal'

const PAGE_SIZE = 20

export default function ObjectsPage() {
  const objectsApi = useObjectsApi()
  const pwa = isPwaMode()
  const [searchParams, setSearchParams] = useSearchParams()

  const [typeFilter, setTypeFilter] = useState('')
  const [constellationFilter, setConstellationFilter] = useState('')
  const [primaryOnly, setPrimaryOnly] = useState(true)
  const [visibleTonight, setVisibleTonight] = useState(
    !pwa && searchParams.get('visible_tonight') === 'true' // Disable in PWA mode
  )
  const [minAltitude, setMinAltitude] = useState(30)
  const [page, setPage] = useState(0)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Update URL when visibleTonight changes
  useEffect(() => {
    if (visibleTonight) {
      setSearchParams({ visible_tonight: 'true' })
    } else {
      setSearchParams({})
    }
  }, [visibleTonight, setSearchParams])

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [typeFilter, constellationFilter, primaryOnly, visibleTonight, minAltitude])

  // Query for well-placed objects (when visibleTonight is true) - not available in PWA mode
  const {
    data: wellPlacedData,
    isLoading: wellPlacedLoading,
    isFetching: wellPlacedFetching,
  } = useQuery({
    queryKey: [
      'wellPlacedObjects',
      typeFilter,
      constellationFilter,
      primaryOnly,
      minAltitude,
      page,
    ],
    queryFn: () =>
      (objectsApi as typeof import('../api/client').objectsApi).getWellPlaced({
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        min_altitude: minAltitude,
        object_type: typeFilter || undefined,
        constellation: constellationFilter || undefined,
        primary_only: primaryOnly,
      }),
    enabled: visibleTonight && !pwa,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })

  // Query for regular objects list (when visibleTonight is false)
  const {
    data: regularObjects,
    isLoading: regularLoading,
    isFetching: regularFetching,
  } = useQuery({
    queryKey: ['objects', typeFilter, constellationFilter, primaryOnly, page],
    queryFn: () =>
      objectsApi.list({
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        object_type: typeFilter || undefined,
        constellation: constellationFilter || undefined,
        primary_only: primaryOnly,
      }),
    enabled: !visibleTonight,
    placeholderData: keepPreviousData,
  })

  const isLoading = visibleTonight ? wellPlacedLoading : regularLoading
  // Only show "Updating..." when actively refetching data that already exists
  const isFetching = visibleTonight
    ? wellPlacedFetching && !wellPlacedLoading && wellPlacedData !== undefined
    : regularFetching && !regularLoading && regularObjects !== undefined

  // Get objects and total count based on mode
  const wellPlacedObjects = visibleTonight
    ? (wellPlacedData as WellPlacedObjectsResponse)?.objects
    : undefined

  const objects = visibleTonight ? wellPlacedObjects : (regularObjects as AstroObject[])

  const total = visibleTonight
    ? (wellPlacedData as WellPlacedObjectsResponse)?.total
    : undefined

  const totalPages =
    total !== undefined ? Math.ceil(total / PAGE_SIZE) : undefined

  // Extract unique types and constellations from current results
  const objectTypes = objects
    ? [...new Set(objects.map((o) => o.object_type).filter(Boolean))]
    : []

  const constellations = objects
    ? [...new Set(objects.map((o) => o.constellation).filter(Boolean))]
    : []

  // Convert WellPlacedObject to AstroObject-like for ObjectCard
  const toAstroObject = (obj: WellPlacedObject): AstroObject => ({
    id: obj.id,
    primary_name: obj.primary_name,
    object_type: obj.object_type,
    constellation: obj.constellation,
    magnitude: obj.magnitude,
    ra: obj.ra,
    dec: obj.dec,
    size_major: null,
    size_minor: null,
    created_at: '',
    updated_at: '',
    aliases: obj.aliases || [],
    image_count: obj.image_count,
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Astronomical Objects</h1>
        <div className="flex items-center gap-4">
          {isFetching && !isLoading && (
            <span className="text-sm text-gray-400">Updating...</span>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            + Create Object
          </button>
        </div>
      </div>

      <CreateObjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
        <div className="w-full sm:w-64">
          <SearchBar placeholder="Search objects..." />
        </div>

        <div className="flex flex-wrap gap-3 sm:gap-4 items-center">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input flex-1 sm:flex-none"
          >
            <option value="">All Types</option>
            {objectTypes.map((type) => (
              <option key={type} value={type!}>
                {type}
              </option>
            ))}
          </select>

          <select
            value={constellationFilter}
            onChange={(e) => setConstellationFilter(e.target.value)}
            className="input flex-1 sm:flex-none"
          >
            <option value="">All Constellations</option>
            {constellations.map((constellation) => (
              <option key={constellation} value={constellation!}>
                {constellation}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={primaryOnly}
              onChange={(e) => setPrimaryOnly(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
            />
            Primary targets only
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={visibleTonight}
              onChange={(e) => setVisibleTonight(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-gray-800"
            />
            Visible tonight
          </label>

          {visibleTonight && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400 whitespace-nowrap">
                Min altitude:
              </label>
              <input
                type="range"
                min={0}
                max={60}
                step={5}
                value={minAltitude}
                onChange={(e) => setMinAltitude(Number(e.target.value))}
                className="w-24 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <span className="text-sm text-gray-300 w-8">{minAltitude}°</span>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading objects...</div>
      ) : objects && objects.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleTonight
              ? (wellPlacedObjects as WellPlacedObject[]).map((obj) => (
                  <ObjectCard
                    key={obj.id}
                    object={toAstroObject(obj)}
                    visibility={obj.visibility}
                  />
                ))
              : (objects as AstroObject[]).map((obj) => (
                  <ObjectCard key={obj.id} object={obj} />
                ))}
          </div>

          {/* Pagination */}
          {totalPages !== undefined && totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-gray-400">
                Page {page + 1} of {totalPages}
                {total !== undefined && (
                  <span className="text-gray-500 ml-2">({total} objects)</span>
                )}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page + 1 >= totalPages}
                className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">
            {visibleTonight
              ? 'No objects visible tonight with current filters'
              : 'No objects found'}
          </p>
          <p className="text-sm text-gray-500">
            {visibleTonight
              ? 'Try lowering the minimum altitude or changing filters'
              : 'Index some FITS files to populate the database'}
          </p>
        </div>
      )}
    </div>
  )
}
