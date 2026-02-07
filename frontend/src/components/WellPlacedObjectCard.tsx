import { Link } from 'react-router-dom'
import { WellPlacedObject } from '../api/client'
import MiniAltitudeChart from './MiniAltitudeChart'

function formatSize(major: number | null | undefined, minor: number | null | undefined): string | null {
  if (major == null) return null
  if (minor == null || major === minor) {
    return `${major.toFixed(1)}'`
  }
  return `${major.toFixed(1)}' × ${minor.toFixed(1)}'`
}

interface WellPlacedObjectCardProps {
  object: WellPlacedObject
  showChart?: boolean
}

export default function WellPlacedObjectCard({
  object,
  showChart = true,
}: WellPlacedObjectCardProps) {
  const size = formatSize(object.size_major, object.size_minor)

  return (
    <Link
      to={`/objects/${object.id}`}
      className="flex justify-between items-center p-3 bg-space-700 rounded-lg hover:bg-space-600 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{object.primary_name}</div>
        <div className="text-sm text-gray-400 truncate">
          {[object.object_type, size].filter(Boolean).join(' • ')}
          {object.constellation && ` in ${object.constellation}`}
        </div>
      </div>

      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
        {showChart && object.ra !== null && object.dec !== null && (
          <MiniAltitudeChart objectId={object.id} />
        )}

        <div className="flex flex-col items-end text-sm">
          {object.visibility.max_altitude !== null && (
            <span className="text-green-400 whitespace-nowrap">
              {object.visibility.max_altitude.toFixed(0)}°
            </span>
          )}
          {object.visibility.transit_time && (
            <span className="text-blue-400 whitespace-nowrap">
              {object.visibility.transit_time}
            </span>
          )}
        </div>

        {object.visibility.hours_in_darkness !== null && (
          <span className="text-sm text-purple-400 whitespace-nowrap">
            {object.visibility.hours_in_darkness.toFixed(1)}h
          </span>
        )}
      </div>
    </Link>
  )
}
