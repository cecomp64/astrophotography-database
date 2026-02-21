import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { ImageGroup } from '../api/client'
import { useImagesApi, useObjectsApi } from '../pwa/hooks/useApi'
import ImageTable from '../components/ImageTable'
import SessionCard from '../components/SessionCard'

type ViewMode = 'grouped' | 'list'

const PAGE_SIZE = 20

export default function ImagesPage() {
  const imagesApi = useImagesApi()
  const objectsApi = useObjectsApi()

  const [viewMode, setViewMode] = useState<ViewMode>('grouped')
  const [filterName, setFilterName] = useState('')
  const [telescope, setTelescope] = useState('')
  const [camera, setCamera] = useState('')
  const [objectId, setObjectId] = useState<number | null>(null)
  const [limit, setLimit] = useState(50)
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  const loadMoreRef = useRef<HTMLDivElement>(null)

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

  const {
    data: groupedData,
    isLoading: isLoadingGrouped,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['imagesGroupedInfinite', telescope, camera, objectId],
    queryFn: ({ pageParam = 0 }) =>
      imagesApi.getGrouped({
        skip: pageParam * PAGE_SIZE,
        limit: PAGE_SIZE,
        telescope: telescope || undefined,
        camera: camera || undefined,
        object_id: objectId || undefined,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.length * PAGE_SIZE
      return totalLoaded < lastPage.total ? allPages.length : undefined
    },
    initialPageParam: 0,
    enabled: viewMode === 'grouped',
  })

  const { data: objectsWithImages } = useQuery({
    queryKey: ['objectsWithImages'],
    queryFn: () => objectsApi.list({ limit: 500 }),
    staleTime: 5 * 60 * 1000,
  })

  const { data: stats } = useQuery({
    queryKey: ['imageStats'],
    queryFn: () => imagesApi.getStats(),
    staleTime: 5 * 60 * 1000,
  })

  // Flatten all pages into a single array
  const allGroups: ImageGroup[] = groupedData?.pages.flatMap(page => page.groups) ?? []
  const totalGroups = groupedData?.pages[0]?.total ?? 0

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(loadMoreRef.current)

    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const resetFilters = useCallback(() => {
    // Scroll to top when filters change
    window.scrollTo(0, 0)
  }, [])

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

      <div className="flex flex-col gap-3">
        {/* View mode toggle - always visible */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 sm:items-center">
          <div className="flex rounded-lg overflow-hidden border border-space-600 w-fit">
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

          {/* Filters toggle for mobile */}
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="sm:hidden flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <span className={`transform transition-transform ${filtersExpanded ? 'rotate-90' : ''}`}>
              ▶
            </span>
            <span>Filters</span>
            {(telescope || camera || objectId || filterName) && (
              <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">Active</span>
            )}
          </button>

          {/* Desktop filters - always visible on sm+ */}
          <div className="hidden sm:flex sm:flex-wrap gap-3 sm:gap-4 sm:items-center">
            <select
              value={telescope}
              onChange={(e) => {
                setTelescope(e.target.value)
                resetFilters()
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
                    resetFilters()
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
                    resetFilters()
                  }}
                  className="input"
                >
                  <option value="">All Objects</option>
                  {objectsWithImages &&
                    [...objectsWithImages]
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
        </div>

        {/* Mobile filters - collapsible */}
        {filtersExpanded && (
          <div className="sm:hidden flex flex-col gap-3 pl-4 border-l-2 border-space-600">
            <select
              value={telescope}
              onChange={(e) => {
                setTelescope(e.target.value)
                resetFilters()
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
                    resetFilters()
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
                    resetFilters()
                  }}
                  className="input"
                >
                  <option value="">All Objects</option>
                  {objectsWithImages &&
                    [...objectsWithImages]
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
        )}
      </div>

      {isLoading ? (
        <div className="text-gray-400 py-8 text-center">Loading...</div>
      ) : viewMode === 'grouped' ? (
        <div className="space-y-4">
          {allGroups.length > 0 ? (
            <>
              <div className="flex justify-between items-center text-sm text-gray-400">
                <span>
                  {allGroups.length} of {totalGroups} sessions loaded
                </span>
                {isFetchingNextPage && (
                  <span className="text-blue-400">Loading more...</span>
                )}
              </div>

              <div className="space-y-4">
                {allGroups.map((session) => (
                  <SessionCard
                    key={`${session.date}-${session.target_name}-${session.telescope}`}
                    session={session}
                  />
                ))}

                {/* Load more trigger */}
                <div ref={loadMoreRef} className="text-center py-4 text-gray-400">
                  {hasNextPage ? (isFetchingNextPage ? 'Loading more...' : '') : 'End of list'}
                </div>
              </div>
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
