import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Bar,
} from 'recharts'
import { objectsApi, AltitudeDataPoint, TwilightTimes } from '../api/client'
import { isPwaMode } from '../pwa/hooks/usePwaMode'
import { useObjectsApi } from '../pwa/hooks/useApi'
import { calculateAltitudeData, getStoredLocation } from '../pwa/services/astronomy'

interface AltitudeChartProps {
  objectId: number
  date?: string
}

// Twilight phases with their display properties (no "night" - astronomical is the darkest)
const TWILIGHT_PHASES = {
  day: { color: '#fbbf24', label: 'Day', opacity: 0.15 },
  civil: { color: '#f97316', label: 'Civil', opacity: 0.25 },
  nautical: { color: '#3b82f6', label: 'Nautical', opacity: 0.35 },
  astronomical: { color: '#1e3a5f', label: 'Astro', opacity: 0.5 },
} as const

type TwilightPhase = keyof typeof TWILIGHT_PHASES

// Convert time string "HH:MM" to minutes since midnight
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

// Determine twilight phase for a given data point
// The chart spans from noon (12:00) to noon next day, centered on midnight
// Index 0 = 12:00 (noon), Index 72 = 00:00 (midnight), Index 144 = 12:00 (noon next day)
function getTwilightPhase(
  timeStr: string,
  twilight: TwilightTimes,
  dataIndex: number,
  totalPoints: number
): TwilightPhase {
  const time = timeToMinutes(timeStr)

  // Get twilight times as minutes
  const sunset = twilight.sunset ? timeToMinutes(twilight.sunset) : null
  const civilDusk = twilight.civil_dusk ? timeToMinutes(twilight.civil_dusk) : null
  const nauticalDusk = twilight.nautical_dusk ? timeToMinutes(twilight.nautical_dusk) : null
  const astroDusk = twilight.astronomical_dusk ? timeToMinutes(twilight.astronomical_dusk) : null
  const astroDawn = twilight.astronomical_dawn ? timeToMinutes(twilight.astronomical_dawn) : null
  const nauticalDawn = twilight.nautical_dawn ? timeToMinutes(twilight.nautical_dawn) : null
  const civilDawn = twilight.civil_dawn ? timeToMinutes(twilight.civil_dawn) : null
  const sunrise = twilight.sunrise ? timeToMinutes(twilight.sunrise) : null

  // Determine if we're in the evening portion (before midnight) or morning portion (after midnight)
  // Evening: index 0-72 (12:00 to 00:00), times go from 720 to 1440 then wrap
  // Morning: index 72-144 (00:00 to 12:00), times go from 0 to 720
  const midpointIndex = Math.floor(totalPoints / 2)
  const isEvening = dataIndex < midpointIndex

  if (isEvening) {
    // Evening: times range from ~720 (12:00) to ~1439 (23:59)
    // Compare against evening twilight times (sunset, civil dusk, etc.)
    if (sunset !== null && time < sunset) return 'day'
    if (civilDusk !== null && time < civilDusk) return 'civil'
    if (nauticalDusk !== null && time < nauticalDusk) return 'nautical'
    if (astroDusk !== null && time < astroDusk) return 'astronomical'
    // After astronomical dusk, it's still astronomical (darkest)
    return 'astronomical'
  } else {
    // Morning: times range from 0 (00:00) to ~720 (12:00)
    // Compare against morning twilight times (dawn, sunrise, etc.)
    if (astroDawn !== null && time < astroDawn) return 'astronomical'
    if (nauticalDawn !== null && time < nauticalDawn) return 'nautical'
    if (civilDawn !== null && time < civilDawn) return 'civil'
    if (sunrise !== null && time < sunrise) return 'civil'
    return 'day'
  }
}

interface ChartDataPoint extends AltitudeDataPoint {
  altitudeAboveHorizon: number
  altitudeBelowHorizon: number
  twilightPhase: TwilightPhase
  twilightFill: number // Fixed value for background bar height
}

// Calculate X-axis interval based on container width
// Returns interval that shows appropriate number of labels for the width
function getXAxisInterval(width: number): number {
  // Data has ~145 points (every 10 min for 24 hours)
  // We want to show only hour labels (every 6 points = 1 hour)
  if (width < 300) return 36      // ~4 labels (every 6 hours)
  if (width < 400) return 24      // ~6 labels (every 4 hours)
  if (width < 550) return 18      // ~8 labels (every 3 hours)
  return 12                        // ~12 labels (every 2 hours)
}

// Format time label - always show just the hour
function formatTimeLabel(time: string): string {
  const [hour] = time.split(':')
  return hour
}

export default function AltitudeChart({ objectId, date }: AltitudeChartProps) {
  const pwa = isPwaMode()
  const objectsApiHook = useObjectsApi()
  const storedLocation = getStoredLocation()

  // Track container width for responsive X-axis
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(600)

  const handleResize = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth)
    }
  }, [])

  useEffect(() => {
    handleResize()
    const resizeObserver = new ResizeObserver(handleResize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    return () => resizeObserver.disconnect()
  }, [handleResize])

  // Fetch object details to get RA/Dec for PWA mode calculations
  const { data: objectDetails } = useQuery({
    queryKey: ['objectDetails', objectId],
    queryFn: () => objectsApiHook.get(objectId),
    staleTime: 60 * 60 * 1000, // Cache for 1 hour - coordinates don't change
    enabled: pwa, // Only needed in PWA mode
  })

  // Server-side altitude data (desktop mode)
  const { data: serverData, isLoading: isLoadingServer, error: serverError } = useQuery({
    queryKey: ['objectAltitude', objectId, date],
    queryFn: () => objectsApi.getAltitude(objectId, date),
    enabled: !pwa,
  })

  // Client-side altitude calculation (PWA mode)
  const { data: clientData, isLoading: isLoadingClient, error: clientError } = useQuery({
    queryKey: ['objectAltitudePwa', objectId, date, objectDetails?.ra, objectDetails?.dec],
    queryFn: () => {
      if (!storedLocation || !objectDetails?.ra || !objectDetails?.dec) {
        return null
      }
      return calculateAltitudeData(objectDetails.ra, objectDetails.dec, storedLocation, date)
    },
    staleTime: 5 * 60 * 1000,
    enabled: pwa && !!objectDetails?.ra && !!objectDetails?.dec && !!storedLocation,
  })

  const data = pwa ? clientData : serverData
  const isLoading = pwa ? isLoadingClient : isLoadingServer
  const error = pwa ? clientError : serverError

  // In PWA mode without location configured
  if (pwa && !storedLocation) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-400">
        <p>Location not configured for offline mode</p>
        <p className="text-sm text-gray-500 mt-2">
          Configure your location on the desktop app, then re-sync
        </p>
      </div>
    )
  }

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

  // Build chart data with twilight phase for each point
  const chartData: ChartDataPoint[] = data.data.map((point: AltitudeDataPoint, index: number) => {
    const twilightPhase = data.twilight
      ? getTwilightPhase(point.time, data.twilight, index, data.data.length)
      : 'day'

    return {
      ...point,
      altitudeAboveHorizon: point.altitude > 0 ? point.altitude : 0,
      altitudeBelowHorizon: point.altitude < 0 ? point.altitude : 0,
      twilightPhase,
      twilightFill: 90, // Bar from 0 to 90 (will be positioned at y=-90)
    }
  })

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }> }) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload
      const phaseInfo = TWILIGHT_PHASES[point.twilightPhase]
      return (
        <div className="bg-space-800 border border-space-600 rounded px-3 py-2 shadow-lg">
          <p className="text-white font-medium">{point.time}</p>
          <p className="text-gray-300">
            Altitude: <span className={point.altitude >= 0 ? 'text-green-400' : 'text-red-400'}>
              {point.altitude.toFixed(1)}°
            </span>
          </p>
          <p className="text-gray-300">Azimuth: {point.azimuth.toFixed(1)}°</p>
          <p className="text-gray-400 text-sm mt-1">
            Sky: <span style={{ color: phaseInfo.color }}>{phaseInfo.label}</span>
          </p>
        </div>
      )
    }
    return null
  }

  // Custom bar shape to color each bar based on twilight phase
  // Bars span from -90 to +90 (full chart height)
  const TwilightBar = (props: { x?: number; width?: number; payload?: ChartDataPoint }) => {
    const { x, width, payload } = props
    if (!payload || x === undefined || width === undefined) {
      return null
    }
    const phase = payload.twilightPhase
    const { color, opacity } = TWILIGHT_PHASES[phase]

    // Draw bar from bottom (-90) to top (90) of chart
    // In recharts, we need to calculate pixel positions based on the y-axis scale
    return (
      <rect
        x={x}
        y={0}
        width={width}
        height="100%"
        fill={color}
        fillOpacity={opacity}
        stroke="none"      // Crucial: disables the SVG border
        shapeRendering="crispEdges"  // Optional: force sharp edges to prevent sub-pixel gaps
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm px-4 sm:px-0">
        {data.transit_time && (
          <div>
            <span className="text-gray-400">Transit: </span>
            <span className="text-yellow-300 font-medium">{data.transit_time}</span>
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

      {/* Twilight times */}
      {data.twilight && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 px-4 sm:px-0">
          {data.twilight.astronomical_dusk && (
            <div>
              <span>Astro Dark: </span>
              <span className="text-gray-400">{data.twilight.astronomical_dusk}</span>
            </div>
          )}
          {data.twilight.astronomical_dawn && (
            <div>
              <span>Astro Dawn: </span>
              <span className="text-gray-400">{data.twilight.astronomical_dawn}</span>
            </div>
          )}
        </div>
      )}

      <div className="h-64" ref={containerRef}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap={0} barGap={0}>
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
            {/* Twilight background bars - rendered first so they're behind everything */}
            <Bar
              dataKey="twilightFill"
              shape={<TwilightBar />}
              isAnimationActive={false}
              yAxisId="twilight"
            />
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: containerWidth < 400 ? 10 : 11 }}
              tickLine={{ stroke: '#6b7280' }}
              interval={getXAxisInterval(containerWidth)}
              tickFormatter={formatTimeLabel}
            />
            <YAxis
              yAxisId="main"
              domain={[-90, 90]}
              ticks={[-90, -60, -30, 0, 30, 60, 90]}
              stroke="#9ca3af"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={{ stroke: '#6b7280' }}
              tickFormatter={(value) => `${value}°`}
            />
            {/* Hidden Y axis for twilight bars */}
            <YAxis
              yAxisId="twilight"
              domain={[0, 1]}
              hide
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine yAxisId="main" y={0} stroke="#6b7280" strokeWidth={2} label={{ value: 'Horizon', fill: '#9ca3af', fontSize: 11 }} />
            <ReferenceLine yAxisId="main" y={30} stroke="#4b5563" strokeDasharray="5 5" />
            <Area
              yAxisId="main"
              type="monotone"
              dataKey="altitudeAboveHorizon"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#altitudeGradient)"
              isAnimationActive={false}
            />
            <Area
              yAxisId="main"
              type="monotone"
              dataKey="altitudeBelowHorizon"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#belowHorizonGradient)"
              isAnimationActive={false}
            />
            <Area
              yAxisId="main"
              type="monotone"
              dataKey="altitude"
              stroke="#60a5fa"
              strokeWidth={2}
              fill="none"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Twilight legend */}
      {data.twilight && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs px-4 sm:px-0">
          {Object.entries(TWILIGHT_PHASES).map(([key, phase]) => (
            <div key={key} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-sm"
                style={{
                  backgroundColor: phase.color,
                  opacity: phase.opacity + 0.2
                }}
              />
              <span className="text-gray-500">{phase.label}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 text-center px-4 sm:px-0">
        Date: {data.date} | Times in {data.timezone} | 24-hour period centered on midnight
      </p>
    </div>
  )
}
