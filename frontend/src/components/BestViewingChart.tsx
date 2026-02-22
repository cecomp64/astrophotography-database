import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { MonthlyViewingScore, UpcomingBestDate } from '../api/client'
import { useObjectsApi } from '../pwa/hooks/useApi'

interface BestViewingChartProps {
  objectId: number
}

export default function BestViewingChart({ objectId }: BestViewingChartProps) {
  const [showAllDates, setShowAllDates] = useState(false)
  const objectsApi = useObjectsApi()

  const { data, isLoading, error } = useQuery({
    queryKey: ['bestViewing', objectId],
    queryFn: () => objectsApi.getBestViewing(objectId),
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
  })

  if (isLoading) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400">
        Calculating best viewing times...
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-48 flex items-center justify-center text-red-400">
        Error loading best viewing data
      </div>
    )
  }

  if (!data?.location_configured) {
    return (
      <div className="h-48 flex flex-col items-center justify-center text-gray-400">
        <p>Location not configured</p>
        <Link to="/settings" className="text-blue-400 hover:text-blue-300 mt-2">
          Configure location in Settings
        </Link>
      </div>
    )
  }

  if (data.monthly_summary.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400">
        No viewing data available for this object
      </div>
    )
  }

  // Get max score for scaling colors
  const maxScore = Math.max(...data.monthly_summary.map(m => m.score))

  // Color scale from dark blue (low) to bright cyan (high)
  const getBarColor = (score: number, isPeak: boolean) => {
    if (isPeak) return '#22d3ee' // cyan-400 for peak months
    const ratio = score / maxScore
    if (ratio < 0.3) return '#1e3a5a' // very dark blue
    if (ratio < 0.5) return '#1e4976' // dark blue
    if (ratio < 0.7) return '#2563eb' // blue-600
    return '#3b82f6' // blue-500
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: MonthlyViewingScore }> }) => {
    if (active && payload && payload.length) {
      const month = payload[0].payload
      return (
        <div className="bg-space-800 border border-space-600 rounded px-3 py-2 shadow-lg">
          <p className="text-white font-medium">{month.month_name}</p>
          <p className="text-gray-300">
            Hours visible: <span className="text-cyan-400">{month.avg_hours_in_darkness.toFixed(1)}h</span>
          </p>
          <p className="text-gray-300">
            Max altitude: <span className="text-green-400">{month.avg_max_altitude.toFixed(0)}°</span>
          </p>
          {month.is_peak_month && (
            <p className="text-yellow-400 text-sm mt-1">Peak viewing month</p>
          )}
        </div>
      )
    }
    return null
  }

  const displayedDates = showAllDates ? data.best_upcoming_dates : data.best_upcoming_dates.slice(0, 3)

  return (
    <div className="space-y-4">
      {/* Peak season badge */}
      {data.peak_season && (
        <div className="flex items-center gap-2 px-4 sm:px-0">
          <span className="text-gray-400 text-sm">Peak Season:</span>
          <span className="px-2 py-1 bg-cyan-900/50 text-cyan-300 rounded text-sm font-medium">
            {data.peak_season.start_month_name === data.peak_season.end_month_name
              ? data.peak_season.start_month_name
              : `${data.peak_season.start_month_name} - ${data.peak_season.end_month_name}`
            }
          </span>
        </div>
      )}

      {/* Monthly bar chart */}
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.monthly_summary} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="month_name"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickLine={{ stroke: '#6b7280' }}
              tickFormatter={(name: string) => name.slice(0, 3)}
              interval={0}
            />
            <YAxis
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickLine={{ stroke: '#6b7280' }}
              tickFormatter={(value) => `${value.toFixed(0)}`}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar dataKey="score" radius={[4, 4, 0, 0]} activeBar={{ fillOpacity: 0.8 }}>
              {data.monthly_summary.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.score, entry.is_peak_month)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-gray-500 px-4 sm:px-0">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-cyan-400" />
          <span>Peak months</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-blue-500" />
          <span>Good</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#1e3a5a' }} />
          <span>Poor</span>
        </div>
      </div>

      {/* Best upcoming dates */}
      {data.best_upcoming_dates.length > 0 && (
        <div className="px-4 sm:px-0">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Best Upcoming Nights</h3>
          <div className="space-y-1">
            {displayedDates.map((date: UpcomingBestDate) => (
              <div
                key={date.date}
                className="flex items-center justify-between text-sm bg-space-800/50 rounded px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-white">{formatDate(date.date)}</span>
                  <span className="text-gray-500">{date.day_of_week.slice(0, 3)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-cyan-400">{date.hours_in_darkness.toFixed(1)}h</span>
                  <span className="text-green-400">{date.max_altitude.toFixed(0)}° max</span>
                  <span className="text-gray-500">transit {date.transit_time}</span>
                </div>
              </div>
            ))}
          </div>
          {data.best_upcoming_dates.length > 3 && (
            <button
              onClick={() => setShowAllDates(!showAllDates)}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300"
            >
              {showAllDates ? 'Show fewer' : `Show all ${data.best_upcoming_dates.length} dates`}
            </button>
          )}
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
