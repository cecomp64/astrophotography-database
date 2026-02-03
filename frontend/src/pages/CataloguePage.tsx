import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  catalogueApi,
  CatalogueObject,
  WellPlacedObject,
  WellPlacedObjectsResponse,
} from '../api/client'
import { formatRA, formatDec } from '../utils/coordinates'
import MiniAltitudeChart from '../components/MiniAltitudeChart'

export default function CataloguePage() {
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
  const [page, setPage] = useState(0)
  const pageSize = 50

  // Reset page when filters change
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
    minAltitude,
  ])

  // Query for well-placed objects (when visibleTonight is true)
  const { data: wellPlacedData, isLoading: wellPlacedLoading } = useQuery({
    queryKey: [
      'catalogueWellPlaced',
      catalogFilter,
      typeFilter,
      constellationFilter,
      minMagnitude,
      maxMagnitude,
      minAltitude,
      page,
    ],
    queryFn: () =>
      catalogueApi.getWellPlaced({
        skip: page * pageSize,
        limit: pageSize,
        min_altitude: minAltitude,
        catalog: catalogFilter || undefined,
        object_type: typeFilter || undefined,
        constellation: constellationFilter || undefined,
        min_magnitude: minMagnitude ? parseFloat(minMagnitude) : undefined,
        max_magnitude: maxMagnitude ? parseFloat(maxMagnitude) : undefined,
      }),
    enabled: visibleTonight,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })

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

  const isLoading = visibleTonight ? wellPlacedLoading : catalogueLoading
  const total = visibleTonight
    ? (wellPlacedData as WellPlacedObjectsResponse)?.total
    : catalogueData?.total
  const totalPages = total ? Math.ceil(total / pageSize) : 0

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPage(0)
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-2xl font-bold">Catalogue Browser</h1>
        {total !== undefined && (
          <span className="text-gray-400 text-sm sm:text-base">
            {total.toLocaleString()} objects
          </span>
        )}
      </div>

      <div className="card">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or designation (M42, NGC 1976, Orion)..."
              className="input w-full"
              disabled={visibleTonight}
            />
          </div>

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

          {!visibleTonight && (
            <button type="submit" className="btn btn-primary">
              Search
            </button>
          )}
        </form>

        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-space-600">
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

          {!visibleTonight && (
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
          )}

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

          {(minMagnitude ||
            maxMagnitude ||
            minSize ||
            maxSize ||
            visibleTonight) && (
            <button
              type="button"
              onClick={() => {
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
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading catalogue...</div>
      ) : visibleTonight && wellPlacedObjects && wellPlacedObjects.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Altitude</th>
                  <th>Type</th>
                  <th>Constellation</th>
                  <th>Transit</th>
                  <th>Hours</th>
                  <th>Magnitude</th>
                </tr>
              </thead>
              <tbody>
                {wellPlacedObjects.map((obj: WellPlacedObject) => (
                  <tr key={obj.id} className="hover:bg-space-700 cursor-pointer">
                    <td className="font-medium">
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/objects/${obj.id}`}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {obj.primary_name}
                        </Link>
                        {obj.ra !== null && obj.dec !== null && (
                          <MiniAltitudeChart objectId={obj.id} width={80} height={24} />
                        )}
                      </div>
                    </td>
                    <td className="text-green-400">
                      {obj.visibility.max_altitude !== null
                        ? `${obj.visibility.max_altitude.toFixed(0)}°`
                        : '-'}
                    </td>
                    <td>
                      {obj.object_type && (
                        <span className="badge badge-gray">{obj.object_type}</span>
                      )}
                    </td>
                    <td>{obj.constellation || '-'}</td>
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

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-400 text-center sm:text-left">
                Showing {page * pageSize + 1} -{' '}
                {Math.min((page + 1) * pageSize, total!)} of{' '}
                {total!.toLocaleString()}
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
          )}
        </>
      ) : catalogueData && catalogueData.objects.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Designations</th>
                  <th>Type</th>
                  <th>Constellation</th>
                  <th>RA</th>
                  <th>Dec</th>
                  <th>Magnitude</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {catalogueData.objects.map((obj: CatalogueObject) => (
                  <tr key={obj.id} className="hover:bg-space-700 cursor-pointer">
                    <td className="font-medium">
                      <Link
                        to={`/objects/${obj.id}`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {obj.primary_name}
                      </Link>
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

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-400 text-center sm:text-left">
                Showing {page * pageSize + 1} -{' '}
                {Math.min((page + 1) * pageSize, catalogueData.total)} of{' '}
                {catalogueData.total.toLocaleString()}
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
          )}
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
