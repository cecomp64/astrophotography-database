import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useObjectsApi, useImagesApi } from '../pwa/hooks/useApi'
import ImageTable from '../components/ImageTable'
import AltitudeChart from '../components/AltitudeChart'
import ShowcaseImage from '../components/ShowcaseImage'
import ShowcaseManager from '../components/ShowcaseManager'
import { formatRA, formatDec } from '../utils/coordinates'

function formatSize(major: number | null | undefined, minor: number | null | undefined): string | null {
  if (major == null) return null
  if (minor == null || major === minor) {
    return `${major.toFixed(1)}'`
  }
  return `${major.toFixed(1)}' × ${minor.toFixed(1)}'`
}

type SortField = 'date_taken' | 'exposure_time' | 'filter_name'
type SortOrder = 'asc' | 'desc'

export default function ObjectDetailPage() {
  const objectsApi = useObjectsApi()
  const imagesApi = useImagesApi()
  const { id } = useParams<{ id: string }>()
  const objectId = parseInt(id!, 10)

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [sortBy, setSortBy] = useState<SortField>('date_taken')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [showcaseExpanded, setShowcaseExpanded] = useState(false)

  const { data: object, isLoading: objectLoading } = useQuery({
    queryKey: ['object', objectId],
    queryFn: () => objectsApi.get(objectId),
    enabled: !isNaN(objectId),
  })

  const { data: images, isLoading: imagesLoading, isFetching } = useQuery({
    queryKey: ['objectImages', objectId, page, pageSize, sortBy, sortOrder],
    queryFn: () => imagesApi.list({
      object_id: objectId,
      skip: page * pageSize,
      limit: pageSize,
      sort_by: sortBy,
      sort_order: sortOrder,
    }),
    enabled: !isNaN(objectId),
    placeholderData: keepPreviousData,
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
        <div className="flex gap-6">
          <ShowcaseImage
            objectId={object.id}
            objectName={object.primary_name}
            ra={object.ra}
            dec={object.dec}
            size="lg"
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold mb-1">{object.primary_name}</h1>
            {(object.object_type || formatSize(object.size_major, object.size_minor)) && (
              <p className="text-gray-400 mb-4">
                {[object.object_type, formatSize(object.size_major, object.size_minor)].filter(Boolean).join(' • ')}
              </p>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              {object.object_type && (
                <div>
                  <div className="text-gray-400 text-xs">Type</div>
                  <div>{object.object_type}</div>
                </div>
              )}
              {object.constellation && (
                <div>
                  <div className="text-gray-400 text-xs">Constellation</div>
                  <div>{object.constellation}</div>
                </div>
              )}
              {object.magnitude !== null && (
                <div>
                  <div className="text-gray-400 text-xs">Magnitude</div>
                  <div>{object.magnitude.toFixed(1)}</div>
                </div>
              )}
              {object.ra !== null && (
                <div>
                  <div className="text-gray-400 text-xs">RA</div>
                  <div className="font-mono">{formatRA(object.ra)}</div>
                </div>
              )}
              {object.dec !== null && (
                <div>
                  <div className="text-gray-400 text-xs">Dec</div>
                  <div className="font-mono">{formatDec(object.dec)}</div>
                </div>
              )}
              <div>
                <div className="text-gray-400 text-xs">Images</div>
                <div>{totalImages}</div>
              </div>
            </div>

            {object.aliases && object.aliases.length > 0 && (
              <div className="mt-4">
                <div className="flex flex-wrap gap-1">
                  {object.aliases.slice(0, 5).map((alias) => (
                    <span key={alias.id} className="badge badge-blue text-xs">
                      {alias.alias_name}
                    </span>
                  ))}
                  {object.aliases.length > 5 && (
                    <span className="badge badge-blue text-xs">+{object.aliases.length - 5}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Showcase Manager */}
        <div className="border-t border-space-600 mt-6 pt-4">
          <button
            onClick={() => setShowcaseExpanded(!showcaseExpanded)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <span className={`transform transition-transform ${showcaseExpanded ? 'rotate-90' : ''}`}>
              ▶
            </span>
            <span>Manage Showcase Image</span>
          </button>
          {showcaseExpanded && (
            <div className="mt-4">
              <ShowcaseManager object={object} />
            </div>
          )}
        </div>
      </div>

      {object.ra !== null && object.dec !== null && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Altitude Tonight</h2>
          <AltitudeChart objectId={objectId} />
        </div>
      )}

      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-xl font-semibold">Images</h2>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Sort:</span>
              <div className="flex gap-1">
                {([
                  { field: 'date_taken' as SortField, label: 'Date' },
                  { field: 'exposure_time' as SortField, label: 'Exp' },
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

        <div className={isFetching && !imagesLoading ? 'opacity-50' : ''}>
          {imagesLoading ? (
            <div className="text-gray-400">Loading images...</div>
          ) : (
            <ImageTable images={images || []} />
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-700">
            <div className="text-sm text-gray-400">
              Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalImages)} of {totalImages}
            </div>
            <div className="flex flex-wrap justify-center items-center gap-2">
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="px-2 py-1 text-sm bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 hidden sm:inline-flex"
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
                className="px-2 py-1 text-sm bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 hidden sm:inline-flex"
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
