import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { imagesApi, objectsApi } from '../api/client'
import ImageTable from '../components/ImageTable'
import SessionCard from '../components/SessionCard'

type ViewMode = 'grouped' | 'list'

const PAGE_SIZE = 20

export default function ImagesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('grouped')
  const [filterName, setFilterName] = useState('')
  const [telescope, setTelescope] = useState('')
  const [camera, setCamera] = useState('')
  const [objectId, setObjectId] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [limit, setLimit] = useState(50)

  const { data: images, isLoading: isLoadingImages } = useQuery({
    queryKey: ['images', filterName, telescope, limit],
    queryFn: () =>
      imagesApi.list({
        limit,
        filter_name: filterName || undefined,
        telescope: telescope || undefined,
      }),
    enabled: viewMode === 'list',
  })

  const { data: grouped, isLoading: isLoadingGrouped } = useQuery({
    queryKey: ['imagesGrouped', telescope, camera, objectId, page],
    queryFn: () =>
      imagesApi.getGrouped({
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        telescope: telescope || undefined,
        camera: camera || undefined,
        object_id: objectId || undefined,
      }),
    enabled: viewMode === 'grouped',
  })

  const { data: objectsWithImages } = useQuery({
    queryKey: ['objectsWithImages'],
    queryFn: () => objectsApi.list({ limit: 500, primary_only: true }),
  })

  const { data: stats } = useQuery({
    queryKey: ['imageStats'],
    queryFn: imagesApi.getStats,
  })

  const isLoading = viewMode === 'grouped' ? isLoadingGrouped : isLoadingImages

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <h1 className="text-2xl font-bold">Images</h1>
        {stats && (
          <span className="text-gray-400 text-sm sm:text-base">
            {stats.total_images} total images
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 sm:items-center">
        <div className="flex rounded-lg overflow-hidden border border-space-600">
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === 'grouped'
                ? 'bg-blue-600 text-white'
                : 'bg-space-800 text-gray-300 hover:bg-space-700'
            }`}
          >
            Sessions
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-space-800 text-gray-300 hover:bg-space-700'
            }`}
          >
            List
          </button>
        </div>

        <select
          value={telescope}
          onChange={(e) => {
            setTelescope(e.target.value)
            setPage(0)
          }}
          className="input"
        >
          <option value="">All Telescopes</option>
          {stats &&
            Object.keys(stats.by_telescope).map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
        </select>

        {viewMode === 'grouped' && (
          <>
            <select
              value={camera}
              onChange={(e) => {
                setCamera(e.target.value)
                setPage(0)
              }}
              className="input"
            >
              <option value="">All Cameras</option>
              {stats &&
                Object.keys(stats.by_camera || {}).map((cam) => (
                  <option key={cam} value={cam}>
                    {cam}
                  </option>
                ))}
            </select>

            <select
              value={objectId?.toString() || ''}
              onChange={(e) => {
                setObjectId(e.target.value ? parseInt(e.target.value) : null)
                setPage(0)
              }}
              className="input"
            >
              <option value="">All Objects</option>
              {objectsWithImages &&
                objectsWithImages
                  .filter((obj) => (obj.image_count ?? 0) > 0)
                  .sort((a, b) => a.primary_name.localeCompare(b.primary_name))
                  .map((obj) => (
                    <option key={obj.id} value={obj.id}>
                      {obj.primary_name}
                    </option>
                  ))}
            </select>
          </>
        )}

        {viewMode === 'list' && (
          <>
            <select
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              className="input"
            >
              <option value="">All Filters</option>
              {stats &&
                Object.keys(stats.by_filter).map((filter) => (
                  <option key={filter} value={filter}>
                    {filter} ({stats.by_filter[filter]})
                  </option>
                ))}
            </select>

            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="input"
            >
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
              <option value={200}>200 per page</option>
            </select>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="text-gray-400 py-8 text-center">Loading...</div>
      ) : viewMode === 'grouped' ? (
        <div className="space-y-4">
          {grouped && grouped.groups.length > 0 ? (
            <>
              <div className="flex justify-between items-center text-sm text-gray-400">
                <span>
                  Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, grouped.total)} of {grouped.total} sessions
                </span>
              </div>
              {grouped.groups.map((session, index) => (
                <SessionCard key={`${session.date}-${session.target_name}-${session.telescope}-${index}`} session={session} />
              ))}
              {grouped.total > PAGE_SIZE && (
                <div className="flex justify-center items-center gap-4 pt-4">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-4 py-2 bg-space-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-space-600 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-gray-400">
                    Page {page + 1} of {Math.ceil(grouped.total / PAGE_SIZE)}
                  </span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * PAGE_SIZE >= grouped.total}
                    className="px-4 py-2 bg-space-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-space-600 transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="card text-center py-8 text-gray-400">
              No imaging sessions found
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <ImageTable images={images || []} />
        </div>
      )}
    </div>
  )
}
