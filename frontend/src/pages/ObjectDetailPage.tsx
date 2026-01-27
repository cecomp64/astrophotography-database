import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { objectsApi, imagesApi } from '../api/client'
import ImageTable from '../components/ImageTable'
import AltitudeChart from '../components/AltitudeChart'
import { formatRA, formatDec } from '../utils/coordinates'

type SortField = 'date_taken' | 'exposure_time' | 'filter_name'
type SortOrder = 'asc' | 'desc'

export default function ObjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const objectId = parseInt(id!, 10)

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [sortBy, setSortBy] = useState<SortField>('date_taken')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const { data: object, isLoading: objectLoading } = useQuery({
    queryKey: ['object', objectId],
    queryFn: () => objectsApi.get(objectId),
    enabled: !isNaN(objectId),
  })

  const { data: images, isLoading: imagesLoading } = useQuery({
    queryKey: ['objectImages', objectId, page, pageSize, sortBy, sortOrder],
    queryFn: () => imagesApi.list({
      object_id: objectId,
      skip: page * pageSize,
      limit: pageSize,
      sort_by: sortBy,
      sort_order: sortOrder,
    }),
    enabled: !isNaN(objectId),
  })

  const totalImages = object?.image_count ?? 0
  const totalPages = Math.ceil(totalImages / pageSize)

  const handleSortChange = (field: SortField) => {
    if (field === sortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
    setPage(0)
  }

  if (objectLoading) {
    return <div className="text-gray-400">Loading object...</div>
  }

  if (!object) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-400">Object not found</p>
        <Link to="/objects" className="text-blue-400 hover:text-blue-300 mt-4 inline-block">
          Back to Objects
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/objects" className="text-gray-400 hover:text-gray-200">
          &larr; Back
        </Link>
      </div>

      <div className="card">
        <h1 className="text-3xl font-bold mb-4">{object.primary_name}</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {object.object_type && (
            <div>
              <div className="text-gray-400 text-sm">Type</div>
              <div className="text-lg">{object.object_type}</div>
            </div>
          )}

          {object.constellation && (
            <div>
              <div className="text-gray-400 text-sm">Constellation</div>
              <div className="text-lg">{object.constellation}</div>
            </div>
          )}

          {object.magnitude !== null && (
            <div>
              <div className="text-gray-400 text-sm">Magnitude</div>
              <div className="text-lg">{object.magnitude.toFixed(1)}</div>
            </div>
          )}

          {object.ra !== null && (
            <div>
              <div className="text-gray-400 text-sm">Right Ascension</div>
              <div className="text-lg font-mono">{formatRA(object.ra)}</div>
            </div>
          )}

          {object.dec !== null && (
            <div>
              <div className="text-gray-400 text-sm">Declination</div>
              <div className="text-lg font-mono">{formatDec(object.dec)}</div>
            </div>
          )}

          <div>
            <div className="text-gray-400 text-sm">Images</div>
            <div className="text-lg">{totalImages}</div>
          </div>
        </div>

        {object.aliases && object.aliases.length > 0 && (
          <div className="mt-6">
            <div className="text-gray-400 text-sm mb-2">Aliases</div>
            <div className="flex flex-wrap gap-2">
              {object.aliases.map((alias) => (
                <span key={alias.id} className="badge badge-blue">
                  {alias.alias_name}
                  {alias.catalog && (
                    <span className="text-blue-300 ml-1">({alias.catalog})</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {object.ra !== null && object.dec !== null && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Altitude Tonight</h2>
          <AltitudeChart objectId={objectId} />
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-semibold">Images</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Sort by:</span>
              <div className="flex gap-1">
                {([
                  { field: 'date_taken' as SortField, label: 'Date' },
                  { field: 'exposure_time' as SortField, label: 'Exposure' },
                  { field: 'filter_name' as SortField, label: 'Filter' },
                ]).map(({ field, label }) => (
                  <button
                    key={field}
                    onClick={() => handleSortChange(field)}
                    className={`px-2 py-1 text-sm rounded ${
                      sortBy === field
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {label}
                    {sortBy === field && (
                      <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(0)
                }}
                className="bg-gray-700 text-white text-sm rounded px-2 py-1"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {imagesLoading ? (
          <div className="text-gray-400">Loading images...</div>
        ) : (
          <ImageTable images={images || []} />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
            <div className="text-sm text-gray-400">
              Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalImages)} of {totalImages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="px-2 py-1 text-sm bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
              >
                First
              </button>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2 py-1 text-sm bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-2 py-1 text-sm bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
              >
                Next
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1}
                className="px-2 py-1 text-sm bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
