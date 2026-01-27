import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { objectsApi, AltitudeDataPoint } from '../api/client'

interface AltitudeChartProps {
  objectId: number
  date?: string
}

export default function AltitudeChart({ objectId, date }: AltitudeChartProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['objectAltitude', objectId, date],
    queryFn: () => objectsApi.getAltitude(objectId, date),
  })

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        Calculating altitude data...
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-64 flex items-center justify-center text-red-400">
        Error loading altitude data
      </div>
    )
  }

  if (!data?.location_configured) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-400">
        <p>Location not configured</p>
        <Link to="/settings" className="text-blue-400 hover:text-blue-300 mt-2">
          Configure location in Settings
        </Link>
      </div>
    )
  }

  if (data.data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        No altitude data available
      </div>
    )
  }

  // Filter data to show primarily the nighttime hours (evening to morning)
  // and prepare for charting
  const chartData = data.data.map((point: AltitudeDataPoint) => ({
    ...point,
    // For area chart, we want to fill above horizon only
    altitudeAboveHorizon: point.altitude > 0 ? point.altitude : 0,
    altitudeBelowHorizon: point.altitude < 0 ? point.altitude : 0,
  }))

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: AltitudeDataPoint }> }) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload
      return (
        <div className="bg-space-800 border border-space-600 rounded px-3 py-2 shadow-lg">
          <p className="text-white font-medium">{point.time}</p>
          <p className="text-gray-300">
            Altitude: <span className={point.altitude >= 0 ? 'text-green-400' : 'text-red-400'}>
              {point.altitude.toFixed(1)}°
            </span>
          </p>
          <p className="text-gray-300">Azimuth: {point.azimuth.toFixed(1)}°</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-sm">
        {data.transit_time && (
          <div>
            <span className="text-gray-400">Transit: </span>
            <span className="text-white">{data.transit_time}</span>
            {data.transit_altitude && (
              <span className="text-gray-400 ml-1">
                ({data.transit_altitude.toFixed(1)}°)
              </span>
            )}
          </div>
        )}
        {data.rise_time && (
          <div>
            <span className="text-gray-400">Rise: </span>
            <span className="text-green-400">{data.rise_time}</span>
          </div>
        )}
        {data.set_time && (
          <div>
            <span className="text-gray-400">Set: </span>
            <span className="text-red-400">{data.set_time}</span>
          </div>
        )}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="altitudeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="belowHorizonGradient" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={{ stroke: '#6b7280' }}
              interval={11}
            />
            <YAxis
              domain={[-90, 90]}
              ticks={[-90, -60, -30, 0, 30, 60, 90]}
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={{ stroke: '#6b7280' }}
              tickFormatter={(value) => `${value}°`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#6b7280" strokeWidth={2} label={{ value: 'Horizon', fill: '#9ca3af', fontSize: 11 }} />
            <ReferenceLine y={30} stroke="#4b5563" strokeDasharray="5 5" />
            <Area
              type="monotone"
              dataKey="altitudeAboveHorizon"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#altitudeGradient)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="altitudeBelowHorizon"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#belowHorizonGradient)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="altitude"
              stroke="#60a5fa"
              strokeWidth={2}
              fill="none"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Date: {data.date} | Times in {data.timezone} | 24-hour period centered on midnight
      </p>
    </div>
  )
}
