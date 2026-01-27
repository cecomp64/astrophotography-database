import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { catalogueApi, CatalogueObject } from '../api/client'
import { formatRA, formatDec } from '../utils/coordinates'

export default function CataloguePage() {
  const [catalogFilter, setCatalogFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [constellationFilter, setConstellationFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [minMagnitude, setMinMagnitude] = useState('')
  const [maxMagnitude, setMaxMagnitude] = useState('')
  const [minSize, setMinSize] = useState('')
  const [maxSize, setMaxSize] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 50

  const { data: catalogueData, isLoading } = useQuery({
    queryKey: ['catalogue', catalogFilter, typeFilter, constellationFilter, searchQuery, minMagnitude, maxMagnitude, minSize, maxSize, page],
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

  const totalPages = catalogueData ? Math.ceil(catalogueData.total / pageSize) : 0

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPage(0)
  }

  const getAliasesByCatalog = (obj: CatalogueObject, catalog: string): string[] => {
    return obj.aliases
      .filter(a => a.catalog === catalog)
      .map(a => a.name)
  }

  const getDisplayDesignations = (obj: CatalogueObject): string => {
    // Show key catalog designations
    const ngc = getAliasesByCatalog(obj, 'NGC')
    const ic = getAliasesByCatalog(obj, 'IC')
    const messier = getAliasesByCatalog(obj, 'Messier').filter(m => m.includes(' '))
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

  const catalogOptions = catalogs ? Object.keys(catalogs).filter(c => c !== 'Common') : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-2xl font-bold">Catalogue Browser</h1>
        {catalogueData && (
          <span className="text-gray-400 text-sm sm:text-base">
            {catalogueData.total.toLocaleString()} objects
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

          <button type="submit" className="btn btn-primary">
            Search
          </button>
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

          {(minMagnitude || maxMagnitude || minSize || maxSize) && (
            <button
              type="button"
              onClick={() => {
                setMinMagnitude('')
                setMaxMagnitude('')
                setMinSize('')
                setMaxSize('')
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
                    <td className="font-mono text-sm">
                      {formatRA(obj.ra)}
                    </td>
                    <td className="font-mono text-sm">
                      {formatDec(obj.dec)}
                    </td>
                    <td>
                      {obj.magnitude !== null ? obj.magnitude.toFixed(1) : '-'}
                    </td>
                    <td>
                      {obj.size_major !== null ? (
                        obj.size_minor !== null && obj.size_minor !== obj.size_major
                          ? `${obj.size_major.toFixed(1)}' × ${obj.size_minor.toFixed(1)}'`
                          : `${obj.size_major.toFixed(1)}'`
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-400 text-center sm:text-left">
                Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, catalogueData.total)} of {catalogueData.total.toLocaleString()}
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
          <p className="text-gray-400 mb-4">No catalogue objects found</p>
          <p className="text-sm text-gray-500">
            {catalogueData?.total === 0 && !searchQuery && !catalogFilter && !typeFilter && !constellationFilter && !minMagnitude && !maxMagnitude && !minSize && !maxSize
              ? 'Download catalogues from the Indexer page to populate the database'
              : 'Try adjusting your filters or search query'}
          </p>
        </div>
      )}
    </div>
  )
}
