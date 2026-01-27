import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { imagesApi } from '../api/client'
import ImageTable from '../components/ImageTable'
import SessionCard from '../components/SessionCard'

type ViewMode = 'grouped' | 'list'

export default function ImagesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('grouped')
  const [filterName, setFilterName] = useState('')
  const [telescope, setTelescope] = useState('')
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
    queryKey: ['imagesGrouped', telescope],
    queryFn: () =>
      imagesApi.getGrouped({
        telescope: telescope || undefined,
      }),
    enabled: viewMode === 'grouped',
  })

  const { data: stats } = useQuery({
    queryKey: ['imageStats'],
    queryFn: imagesApi.getStats,
  })

  const isLoading = viewMode === 'grouped' ? isLoadingGrouped : isLoadingImages

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Images</h1>
        {stats && (
          <span className="text-gray-400">
            {stats.total_images} total images
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-center">
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
          onChange={(e) => setTelescope(e.target.value)}
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
          {grouped && grouped.length > 0 ? (
            grouped.map((session, index) => (
              <SessionCard key={`${session.date}-${session.target_name}-${session.telescope}-${index}`} session={session} />
            ))
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
