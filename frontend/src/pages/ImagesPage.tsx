import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { imagesApi, objectsApi, ImageGroup } from '../api/client'
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
  const [limit, setLimit] = useState(50)

  const parentRef = useRef<HTMLDivElement>(null)

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
    queryFn: () => objectsApi.list({ limit: 500, primary_only: true }),
    staleTime: 5 * 60 * 1000,
  })

  const { data: stats } = useQuery({
    queryKey: ['imageStats'],
    queryFn: imagesApi.getStats,
    staleTime: 5 * 60 * 1000,
  })

  // Flatten all pages into a single array
  const allGroups: ImageGroup[] = groupedData?.pages.flatMap(page => page.groups) ?? []
  const totalGroups = groupedData?.pages[0]?.total ?? 0

  // Virtual list setup
  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? allGroups.length + 1 : allGroups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180, // Estimated height of SessionCard
    overscan: 5,
  })

  // Load more when scrolling near the end
  const virtualItems = rowVirtualizer.getVirtualItems()
  const lastItem = virtualItems[virtualItems.length - 1]

  useEffect(() => {
    if (!lastItem) return

    if (
      lastItem.index >= allGroups.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [lastItem, hasNextPage, isFetchingNextPage, fetchNextPage, allGroups.length])

  const resetFilters = useCallback(() => {
    // Reset scroll position when filters change
    if (parentRef.current) {
      parentRef.current.scrollTop = 0
    }
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

              <div
                ref={parentRef}
                className="overflow-auto"
                style={{ height: 'calc(100vh - 220px)' }}
              >
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const isLoaderRow = virtualRow.index >= allGroups.length
                    const session = allGroups[virtualRow.index]

                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        className="pb-4"
                      >
                        {isLoaderRow ? (
                          <div className="text-center py-4 text-gray-400">
                            {hasNextPage ? 'Loading more...' : 'End of list'}
                          </div>
                        ) : (
                          <SessionCard
                            key={`${session.date}-${session.target_name}-${session.telescope}`}
                            session={session}
                          />
                        )}
                      </div>
                    )
                  })}
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
