import { useQuery } from '@tanstack/react-query'
import { useObjectsApi } from '../pwa/hooks/useApi'

interface BestViewingMiniProps {
  objectId: number
}

export default function BestViewingMini({ objectId }: BestViewingMiniProps) {
  const objectsApi = useObjectsApi()

  const { data, isLoading, error } = useQuery({
    queryKey: ['bestViewing', objectId],
    queryFn: () => objectsApi.getBestViewing(objectId),
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
  })

  if (isLoading) {
    return (
      <div className="text-xs text-gray-500">
        Loading best viewing...
      </div>
    )
  }

  if (error || !data?.location_configured) {
    return null
  }

  if (!data.peak_season && !data.next_good_date) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {data.peak_season && (
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Best:</span>
          <span className="text-cyan-400 font-medium">
            {data.peak_season.start_month_name === data.peak_season.end_month_name
              ? data.peak_season.start_month_name.slice(0, 3)
              : `${data.peak_season.start_month_name.slice(0, 3)}-${data.peak_season.end_month_name.slice(0, 3)}`
            }
          </span>
        </div>
      )}
      {data.best_upcoming_dates.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Next:</span>
          <span className="text-green-400">
            {formatDate(data.best_upcoming_dates[0].date)}
          </span>
        </div>
      )}
    </div>
  )
}

// Format date string "2026-03-15" to "Mar 15"
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
