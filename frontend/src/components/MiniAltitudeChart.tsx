import { useQuery } from '@tanstack/react-query'
import { objectsApi } from '../api/client'
import { isPwaMode } from '../pwa/hooks/usePwaMode'
import { useObjectsApi } from '../pwa/hooks/useApi'
import { calculateMiniAltitudeData, getStoredLocation } from '../pwa/services/astronomy'

interface MiniAltitudeChartProps {
  objectId: number
  width?: number
  height?: number
}

export default function MiniAltitudeChart({
  objectId,
  width = 120,
  height = 40,
}: MiniAltitudeChartProps) {
  const pwa = isPwaMode()
  const objectsApiHook = useObjectsApi()

  // Fetch object details to get RA/Dec for PWA mode calculations
  const { data: objectDetails } = useQuery({
    queryKey: ['objectDetails', objectId],
    queryFn: () => objectsApiHook.get(objectId),
    staleTime: 60 * 60 * 1000, // Cache for 1 hour - coordinates don't change
    enabled: pwa, // Only needed in PWA mode
  })

  // Server-side altitude data (desktop mode)
  const { data: serverData, isLoading: isLoadingServer } = useQuery({
    queryKey: ['miniAltitude', objectId],
    queryFn: () => objectsApi.getMiniAltitude(objectId),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !pwa, // Only in desktop mode
  })

  // Client-side altitude calculation (PWA mode)
  const { data: clientData, isLoading: isLoadingClient } = useQuery({
    queryKey: ['miniAltitudePwa', objectId, objectDetails?.ra, objectDetails?.dec],
    queryFn: () => {
      const location = getStoredLocation()
      if (!location || !objectDetails?.ra || !objectDetails?.dec) {
        return null
      }
      return calculateMiniAltitudeData(objectDetails.ra, objectDetails.dec, location)
    },
    staleTime: 5 * 60 * 1000,
    enabled: pwa && !!objectDetails?.ra && !!objectDetails?.dec,
  })

  const data = pwa ? clientData : serverData
  const isLoading = pwa ? isLoadingClient : isLoadingServer

  // In PWA mode without location configured, don't render
  if (pwa && !getStoredLocation()) {
    return null
  }

  if (isLoading || !data || data.data.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="bg-space-700 rounded animate-pulse"
      />
    )
  }

  // Build SVG path for altitude curve
  const points = data.data
    .map((alt, i) => {
      const x = (i / (data.data.length - 1)) * width
      // Normalize altitude from -90..90 to height..0 (inverted for SVG)
      const y = height - ((alt + 90) / 180) * height
      return `${x},${y}`
    })
    .join(' ')

  // Horizon line y position (altitude = 0)
  const horizonY = height - (90 / 180) * height

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible"
      style={{ minWidth: width }}
    >
      {/* Darkness overlay */}
      {data.darkness_start !== null && data.darkness_end !== null && (
        <rect
          x={(data.darkness_start / (data.data.length - 1)) * width}
          y={0}
          width={
            ((data.darkness_end - data.darkness_start) /
              (data.data.length - 1)) *
            width
          }
          height={height}
          fill="#1e3a5f"
          opacity={0.5}
        />
      )}

      {/* Horizon line */}
      <line
        x1={0}
        y1={horizonY}
        x2={width}
        y2={horizonY}
        stroke="#4b5563"
        strokeWidth={1}
        strokeDasharray="2,2"
      />

      {/* Altitude curve */}
      <polyline points={points} fill="none" stroke="#22c55e" strokeWidth={1.5} />
    </svg>
  )
}
