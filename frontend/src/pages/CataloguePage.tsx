import { useState, useEffect, useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  CatalogueObject,
  WellPlacedObject,
  WellPlacedObjectsResponse,
} from '../api/client'
import { useCatalogueApi } from '../pwa/hooks/useApi'
import { isPwaMode } from '../pwa/hooks/usePwaMode'
import { formatRA, formatDec } from '../utils/coordinates'
import MiniAltitudeChart from '../components/MiniAltitudeChart'
import CreateObjectModal from '../components/CreateObjectModal'

type SortField = 'primary_name' | 'magnitude' | 'size_major' | 'constellation' | 'object_type' | 'ra' | 'dec'
type WellPlacedSortField = 'primary_name' | 'magnitude' | 'constellation' | 'object_type' | 'max_altitude' | 'transit_time' | 'hours_in_darkness'
type SortOrder = 'asc' | 'desc'

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

interface SortableHeaderProps {
  label: string
  field: string
  currentSort: string
  currentOrder: SortOrder
  onSort: (field: string) => void
}

function SortableHeader({ label, field, currentSort, currentOrder, onSort }: SortableHeaderProps) {
  const isActive = currentSort === field
  return (
    <th
      className="cursor-pointer select-none hover:bg-space-600 transition-colors"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className={`text-xs ${isActive ? 'text-blue-400' : 'text-gray-500'}`}>
          {isActive ? (currentOrder === 'asc' ? '▲' : '▼') : '⬍'}
        </span>
      </div>
    </th>
  )
}

export default function CataloguePage() {
  const catalogueApi = useCatalogueApi()
  const pwa = isPwaMode()
  const [catalogFilter, setCatalogFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [constellationFilter, setConstellationFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [minMagnitude, setMinMagnitude] = useState('')
  const [maxMagnitude, setMaxMagnitude] = useState('')
  const [minSize, setMinSize] = useState('')
  const [maxSize, setMaxSize] = useState('')
  const [visibleTonight, setVisibleTonight] = useState(false)
  const [minAltitude, setMinAltitude] = useState(30)
  const debouncedMinAltitude = useDebounce(minAltitude, 300) // Debounce by 300ms
  const isAltitudeDebouncing = minAltitude !== debouncedMinAltitude
  const [page, setPage] = useState(0)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const pageSize = 50

  // Sorting state
  const [sortBy, setSortBy] = useState<SortField>('primary_name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [wellPlacedSortBy, setWellPlacedSortBy] = useState<WellPlacedSortField>('max_altitude')
  const [wellPlacedSortOrder, setWellPlacedSortOrder] = useState<SortOrder>('desc')

  // Reset page when filters change (use debounced altitude)
  useEffect(() => {
    setPage(0)
  }, [
    catalogFilter,
    typeFilter,
    constellationFilter,
    searchQuery,
    minMagnitude,
    maxMagnitude,
    minSize,
    maxSize,
    visibleTonight,
    debouncedMinAltitude,
    sortBy,
    sortOrder,
  ])

  // Query for well-placed objects (when visibleTonight is true)
  // Uses debounced altitude to prevent excessive recalculations
  const { data: wellPlacedData, isLoading: wellPlacedLoading, isFetching: wellPlacedFetching } = useQuery({
    queryKey: [
      'catalogueWellPlaced',
      pwa ? 'pwa' : 'online',
      catalogFilter,
      typeFilter,
      constellationFilter,
      searchQuery,
      minMagnitude,
      maxMagnitude,
      minSize,
      maxSize,
      debouncedMinAltitude,
      page,
    ],
    queryFn: () =>
      catalogueApi.getWellPlaced({
        skip: page * pageSize,
        limit: pageSize,
        min_altitude: debouncedMinAltitude,
        catalog: catalogFilter || undefined,
        object_type: typeFilter || undefined,
        constellation: constellationFilter || undefined,
        search: searchQuery || undefined,
        min_magnitude: minMagnitude ? parseFloat(minMagnitude) : undefined,
        max_magnitude: maxMagnitude ? parseFloat(maxMagnitude) : undefined,
        min_size: minSize ? parseFloat(minSize) : undefined,
        max_size: maxSize ? parseFloat(maxSize) : undefined,
      }),
    enabled: visibleTonight && !isAltitudeDebouncing,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })

  // Show loading when debouncing or fetching
  const isCalculatingVisibility = isAltitudeDebouncing || wellPlacedFetching

  // Query for regular catalogue (when visibleTonight is false)
  const { data: catalogueData, isLoading: catalogueLoading } = useQuery({
    queryKey: [
      'catalogue',
      catalogFilter,
      typeFilter,
      constellationFilter,
      searchQuery,
      minMagnitude,
      maxMagnitude,
      minSize,
      maxSize,
      page,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      catalogueApi.list({
        skip: page * pageSize,
        limit: pageSize,
        catalog: catalogFilter || undefined,
        object_type: typeFilter || undefined,
        constellation: constellationFilter || undefined,
        search: searchQuery || undefined,
        min_magnitude: minMagnitude ? parseFloat(minMagnitude) : undefined,
        max_magnitude: maxMagnitude ? parseFloat(maxMagnitude) : undefined,
        min_size: minSize ? parseFloat(minSize) : undefined,
        max_size: maxSize ? parseFloat(maxSize) : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
    enabled: !visibleTonight,
    placeholderData: keepPreviousData,
  })

  const { data: objectTypes } = useQuery({
    queryKey: ['catalogue-types'],
    queryFn: () => catalogueApi.getTypes(),
  })

  const { data: constellations } = useQuery({
    queryKey: ['catalogue-constellations'],
    queryFn: () => catalogueApi.getConstellations(),
  })

  const { data: catalogs } = useQuery({
    queryKey: ['catalogue-catalogs'],
    queryFn: () => catalogueApi.getCatalogs(),
  })

  const isLoading = visibleTonight ? (wellPlacedLoading || isCalculatingVisibility) : catalogueLoading
  const total = visibleTonight
    ? (wellPlacedData as WellPlacedObjectsResponse)?.total
    : catalogueData?.total
  const totalPages = total ? Math.ceil(total / pageSize) : 0

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPage(0)
  }

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field as SortField)
      setSortOrder('asc')
    }
  }

  const handleWellPlacedSort = (field: string) => {
    if (wellPlacedSortBy === field) {
      setWellPlacedSortOrder(wellPlacedSortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setWellPlacedSortBy(field as WellPlacedSortField)
      // Default to desc for numeric fields
      const defaultDesc = ['max_altitude', 'hours_in_darkness', 'magnitude'].includes(field)
      setWellPlacedSortOrder(defaultDesc ? 'desc' : 'asc')
    }
  }

  const getAliasesByCatalog = (obj: CatalogueObject, catalog: string): string[] => {
    return obj.aliases.filter((a) => a.catalog === catalog).map((a) => a.name)
  }

  const getDisplayDesignations = (obj: CatalogueObject): string => {
    const ngc = getAliasesByCatalog(obj, 'NGC')
    const ic = getAliasesByCatalog(obj, 'IC')
    const messier = getAliasesByCatalog(obj, 'Messier').filter((m) => m.includes(' '))
    const ldn = getAliasesByCatalog(obj, 'LDN')
    const lbn = getAliasesByCatalog(obj, 'LBN')

    const parts: string[] = []
    if (messier.length > 0) parts.push(messier[0])
    if (ngc.length > 0) parts.push(ngc[0])
    if (ic.length > 0) parts.push(ic[0])
    if (ldn.length > 0) parts.push(ldn[0])
    if (lbn.length > 0) parts.push(lbn[0])

    return parts.join(' / ')
  }

  const catalogOptions = catalogs
    ? Object.keys(catalogs).filter((c) => c !== 'Common')
    : []

  // Get the objects to display based on mode
  const wellPlacedObjects = visibleTonight
    ? (wellPlacedData as WellPlacedObjectsResponse)?.objects
    : undefined

  // Sort well-placed objects client-side
  const sortedWellPlacedObjects = useMemo(() => {
    if (!wellPlacedObjects) return undefined
    const sorted = [...wellPlacedObjects]
    sorted.sort((a, b) => {
      let aVal: string | number | null = null
      let bVal: string | number | null = null

      switch (wellPlacedSortBy) {
        case 'primary_name':
          aVal = a.primary_name.toLowerCase()
          bVal = b.primary_name.toLowerCase()
          break
        case 'magnitude':
          aVal = a.magnitude
          bVal = b.magnitude
          break
        case 'constellation':
          aVal = a.constellation?.toLowerCase() || ''
          bVal = b.constellation?.toLowerCase() || ''
          break
        case 'object_type':
          aVal = a.object_type?.toLowerCase() || ''
          bVal = b.object_type?.toLowerCase() || ''
          break
        case 'max_altitude':
          aVal = a.visibility.max_altitude
          bVal = b.visibility.max_altitude
          break
        case 'transit_time':
          aVal = a.visibility.transit_time || ''
          bVal = b.visibility.transit_time || ''
          break
        case 'hours_in_darkness':
          aVal = a.visibility.hours_in_darkness
          bVal = b.visibility.hours_in_darkness
          break
      }

      // Handle nulls
      if (aVal === null && bVal === null) return 0
      if (aVal === null) return wellPlacedSortOrder === 'asc' ? 1 : -1
      if (bVal === null) return wellPlacedSortOrder === 'asc' ? -1 : 1

      // Compare
      if (aVal < bVal) return wellPlacedSortOrder === 'asc' ? -1 : 1
      if (aVal > bVal) return wellPlacedSortOrder === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [wellPlacedObjects, wellPlacedSortBy, wellPlacedSortOrder])

  const renderPagination = () => {
    if (totalPages <= 1) return null
    const currentTotal = visibleTonight ? (wellPlacedData as WellPlacedObjectsResponse)?.total : catalogueData?.total
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-gray-400 text-center sm:text-left">
          Showing {page * pageSize + 1} -{' '}
          {Math.min((page + 1) * pageSize, currentTotal!)} of{' '}
          {currentTotal!.toLocaleString()}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            className="btn btn-secondary hidden sm:inline-flex"
          >
            First
          </button>
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 0}
            className="btn btn-secondary"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-gray-300 text-sm sm:text-base">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages - 1}
            className="btn btn-secondary"
          >
            Next
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
            className="btn btn-secondary hidden sm:inline-flex"
          >
            Last
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-2xl font-bold">Catalogue Browser</h1>
        <div className="flex items-center gap-4">
          {total !== undefined && (
            <span className="text-gray-400 text-sm sm:text-base">
              {total.toLocaleString()} objects
            </span>
          )}
          {!pwa && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              + Create Object
            </button>
          )}
        </div>
      </div>

      <CreateObjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <div className="card">
        {/* Search - always visible */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or designation (M42, NGC 1976, Orion)..."
              className="input w-full"
            />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1 sm:flex-none">
              Search
            </button>
            {/* Filters toggle for mobile */}
            <button
              type="button"
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              className="sm:hidden flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-gray-200 bg-space-700 rounded transition-colors"
            >
              <span className={`transform transition-transform ${filtersExpanded ? 'rotate-90' : ''}`}>
                ▶
              </span>
              <span>Filters</span>
              {(catalogFilter || typeFilter || constellationFilter || minMagnitude || maxMagnitude || minSize || maxSize || visibleTonight) && (
                <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">Active</span>
              )}
            </button>
          </div>
        </form>

        {/* Desktop filters - always visible on sm+ */}
        <div className="hidden sm:flex flex-wrap gap-4 mt-4 pt-4 border-t border-space-600">
          <select
            value={catalogFilter}
            onChange={(e) => {
              setCatalogFilter(e.target.value)
              setPage(0)
            }}
            className="input"
          >
            <option value="">All Catalogues</option>
            {catalogOptions.map((cat) => (
              <option key={cat} value={cat}>
                {cat} {catalogs && `(${catalogs[cat]})`}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value)
              setPage(0)
            }}
            className="input"
          >
            <option value="">All Types</option>
            {objectTypes?.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <select
            value={constellationFilter}
            onChange={(e) => {
              setConstellationFilter(e.target.value)
              setPage(0)
            }}
            className="input"
          >
            <option value="">All Constellations</option>
            {constellations?.map((constellation) => (
              <option key={constellation} value={constellation}>
                {constellation}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Magnitude:</span>
            <input
              type="number"
              step="0.1"
              value={minMagnitude}
              onChange={(e) => {
                setMinMagnitude(e.target.value)
                setPage(0)
              }}
              placeholder="Min"
              className="input w-20"
            />
            <span className="text-gray-500">-</span>
            <input
              type="number"
              step="0.1"
              value={maxMagnitude}
              onChange={(e) => {
                setMaxMagnitude(e.target.value)
                setPage(0)
              }}
              placeholder="Max"
              className="input w-20"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Size (arcmin):</span>
            <input
              type="number"
              step="0.1"
              value={minSize}
              onChange={(e) => {
                setMinSize(e.target.value)
                setPage(0)
              }}
              placeholder="Min"
              className="input w-20"
            />
            <span className="text-gray-500">-</span>
            <input
              type="number"
              step="0.1"
              value={maxSize}
              onChange={(e) => {
                setMaxSize(e.target.value)
                setPage(0)
              }}
              placeholder="Max"
              className="input w-20"
            />
          </div>

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
              {isCalculatingVisibility && (
                <span className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          )}

          {(catalogFilter || typeFilter || constellationFilter || minMagnitude || maxMagnitude || minSize || maxSize || visibleTonight) && (
            <button
              type="button"
              onClick={() => {
                setCatalogFilter('')
                setTypeFilter('')
                setConstellationFilter('')
                setMinMagnitude('')
                setMaxMagnitude('')
                setMinSize('')
                setMaxSize('')
                setVisibleTonight(false)
                setPage(0)
              }}
              className="text-sm text-gray-400 hover:text-white"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Mobile filters - collapsible */}
        {filtersExpanded && (
          <div className="sm:hidden flex flex-col gap-3 mt-4 pt-4 border-t border-space-600">
            <select
              value={catalogFilter}
              onChange={(e) => {
                setCatalogFilter(e.target.value)
                setPage(0)
              }}
              className="input"
            >
              <option value="">All Catalogues</option>
              {catalogOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat} {catalogs && `(${catalogs[cat]})`}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(0)
              }}
              className="input"
            >
              <option value="">All Types</option>
              {objectTypes?.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <select
              value={constellationFilter}
              onChange={(e) => {
                setConstellationFilter(e.target.value)
                setPage(0)
              }}
              className="input"
            >
              <option value="">All Constellations</option>
              {constellations?.map((constellation) => (
                <option key={constellation} value={constellation}>
                  {constellation}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Magnitude:</span>
              <input
                type="number"
                step="0.1"
                value={minMagnitude}
                onChange={(e) => {
                  setMinMagnitude(e.target.value)
                  setPage(0)
                }}
                placeholder="Min"
                className="input w-20"
              />
              <span className="text-gray-500">-</span>
              <input
                type="number"
                step="0.1"
                value={maxMagnitude}
                onChange={(e) => {
                  setMaxMagnitude(e.target.value)
                  setPage(0)
                }}
                placeholder="Max"
                className="input w-20"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Size (arcmin):</span>
              <input
                type="number"
                step="0.1"
                value={minSize}
                onChange={(e) => {
                  setMinSize(e.target.value)
                  setPage(0)
                }}
                placeholder="Min"
                className="input w-20"
              />
              <span className="text-gray-500">-</span>
              <input
                type="number"
                step="0.1"
                value={maxSize}
                onChange={(e) => {
                  setMaxSize(e.target.value)
                  setPage(0)
                }}
                placeholder="Max"
                className="input w-20"
              />
            </div>

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
                {isCalculatingVisibility && (
                  <span className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            )}

            {(catalogFilter || typeFilter || constellationFilter || minMagnitude || maxMagnitude || minSize || maxSize || visibleTonight) && (
              <button
                type="button"
                onClick={() => {
                  setCatalogFilter('')
                  setTypeFilter('')
                  setConstellationFilter('')
                  setMinMagnitude('')
                  setMaxMagnitude('')
                  setMinSize('')
                  setMaxSize('')
                  setVisibleTonight(false)
                  setPage(0)
                }}
                className="text-sm text-gray-400 hover:text-white"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading catalogue...</div>
      ) : visibleTonight && sortedWellPlacedObjects && sortedWellPlacedObjects.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <SortableHeader
                    label="Name"
                    field="primary_name"
                    currentSort={wellPlacedSortBy}
                    currentOrder={wellPlacedSortOrder}
                    onSort={handleWellPlacedSort}
                  />
                  <th>Visibility</th>
                  <SortableHeader
                    label="Type"
                    field="object_type"
                    currentSort={wellPlacedSortBy}
                    currentOrder={wellPlacedSortOrder}
                    onSort={handleWellPlacedSort}
                  />
                  <SortableHeader
                    label="Constellation"
                    field="constellation"
                    currentSort={wellPlacedSortBy}
                    currentOrder={wellPlacedSortOrder}
                    onSort={handleWellPlacedSort}
                  />
                  <SortableHeader
                    label="Max Alt"
                    field="max_altitude"
                    currentSort={wellPlacedSortBy}
                    currentOrder={wellPlacedSortOrder}
                    onSort={handleWellPlacedSort}
                  />
                  <SortableHeader
                    label="Transit"
                    field="transit_time"
                    currentSort={wellPlacedSortBy}
                    currentOrder={wellPlacedSortOrder}
                    onSort={handleWellPlacedSort}
                  />
                  <SortableHeader
                    label="Hours"
                    field="hours_in_darkness"
                    currentSort={wellPlacedSortBy}
                    currentOrder={wellPlacedSortOrder}
                    onSort={handleWellPlacedSort}
                  />
                  <SortableHeader
                    label="Mag"
                    field="magnitude"
                    currentSort={wellPlacedSortBy}
                    currentOrder={wellPlacedSortOrder}
                    onSort={handleWellPlacedSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedWellPlacedObjects.map((obj: WellPlacedObject) => (
                  <tr key={obj.id} className="hover:bg-space-700">
                    <td className="font-medium">
                      <Link
                        to={`/objects/${obj.id}`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {obj.primary_name}
                      </Link>
                    </td>
                    <td>
                      {obj.ra !== null && obj.dec !== null && (
                        <MiniAltitudeChart objectId={obj.id} width={80} height={24} />
                      )}
                    </td>
                    <td>
                      {obj.object_type && (
                        <span className="badge badge-gray">{obj.object_type}</span>
                      )}
                    </td>
                    <td>{obj.constellation || '-'}</td>
                    <td className="text-green-400">
                      {obj.visibility.max_altitude !== null
                        ? `${obj.visibility.max_altitude.toFixed(0)}°`
                        : '-'}
                    </td>
                    <td className="text-blue-400">
                      {obj.visibility.transit_time || '-'}
                    </td>
                    <td className="text-purple-400">
                      {obj.visibility.hours_in_darkness !== null
                        ? `${obj.visibility.hours_in_darkness.toFixed(1)}h`
                        : '-'}
                    </td>
                    <td>
                      {obj.magnitude !== null ? obj.magnitude.toFixed(1) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPagination()}
        </>
      ) : catalogueData && catalogueData.objects.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <SortableHeader
                    label="Name"
                    field="primary_name"
                    currentSort={sortBy}
                    currentOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <th>Visibility</th>
                  <th>Designations</th>
                  <SortableHeader
                    label="Type"
                    field="object_type"
                    currentSort={sortBy}
                    currentOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Constellation"
                    field="constellation"
                    currentSort={sortBy}
                    currentOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="RA"
                    field="ra"
                    currentSort={sortBy}
                    currentOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Dec"
                    field="dec"
                    currentSort={sortBy}
                    currentOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Mag"
                    field="magnitude"
                    currentSort={sortBy}
                    currentOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Size"
                    field="size_major"
                    currentSort={sortBy}
                    currentOrder={sortOrder}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {catalogueData.objects.map((obj: CatalogueObject) => (
                  <tr key={obj.id} className="hover:bg-space-700">
                    <td className="font-medium">
                      <Link
                        to={`/objects/${obj.id}`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {obj.primary_name}
                      </Link>
                    </td>
                    <td>
                      {obj.ra !== null && obj.dec !== null && (
                        <MiniAltitudeChart objectId={obj.id} width={80} height={24} />
                      )}
                    </td>
                    <td className="text-sm text-gray-400">
                      {getDisplayDesignations(obj)}
                    </td>
                    <td>
                      {obj.object_type && (
                        <span className="badge badge-gray">{obj.object_type}</span>
                      )}
                    </td>
                    <td>{obj.constellation || '-'}</td>
                    <td className="font-mono text-sm">{formatRA(obj.ra)}</td>
                    <td className="font-mono text-sm">{formatDec(obj.dec)}</td>
                    <td>
                      {obj.magnitude !== null ? obj.magnitude.toFixed(1) : '-'}
                    </td>
                    <td>
                      {obj.size_major !== null ? (
                        obj.size_minor !== null && obj.size_minor !== obj.size_major
                          ? `${obj.size_major.toFixed(1)}' × ${obj.size_minor.toFixed(1)}'`
                          : `${obj.size_major.toFixed(1)}'`
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderPagination()}
        </>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">
            {visibleTonight
              ? 'No catalogue objects visible tonight with current filters'
              : 'No catalogue objects found'}
          </p>
          <p className="text-sm text-gray-500">
            {visibleTonight
              ? 'Try lowering the minimum altitude or changing filters'
              : catalogueData?.total === 0 &&
                  !searchQuery &&
                  !catalogFilter &&
                  !typeFilter &&
                  !constellationFilter &&
                  !minMagnitude &&
                  !maxMagnitude &&
                  !minSize &&
                  !maxSize
                ? 'Download catalogues from the Indexer page to populate the database'
                : 'Try adjusting your filters or search query'}
          </p>
        </div>
      )}
    </div>
  )
}
