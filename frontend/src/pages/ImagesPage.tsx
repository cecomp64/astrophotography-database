import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { imagesApi } from '../api/client'
import ImageTable from '../components/ImageTable'

export default function ImagesPage() {
  const [filterName, setFilterName] = useState('')
  const [telescope, setTelescope] = useState('')
  const [limit, setLimit] = useState(50)

  const { data: images, isLoading } = useQuery({
    queryKey: ['images', filterName, telescope, limit],
    queryFn: () =>
      imagesApi.list({
        limit,
        filter_name: filterName || undefined,
        telescope: telescope || undefined,
      }),
  })

  const { data: stats } = useQuery({
    queryKey: ['imageStats'],
    queryFn: imagesApi.getStats,
  })

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

      <div className="flex flex-wrap gap-4">
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
      </div>

      <div className="card">
        {isLoading ? (
          <div className="text-gray-400 py-8 text-center">Loading images...</div>
        ) : (
          <ImageTable images={images || []} />
        )}
      </div>
    </div>
  )
}
