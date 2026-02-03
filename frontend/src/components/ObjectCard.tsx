import { Link } from 'react-router-dom'
import { AstroObject, VisibilityInfo } from '../api/client'
import { formatRA, formatDec } from '../utils/coordinates'
import MiniAltitudeChart from './MiniAltitudeChart'

interface ObjectCardProps {
  object: AstroObject
  visibility?: VisibilityInfo
}

export default function ObjectCard({ object, visibility }: ObjectCardProps) {
  return (
    <Link
      to={`/objects/${object.id}`}
      className="card hover:border-blue-500 transition-colors block"
    >
      <div className="flex justify-between items-start gap-3 mb-2">
        <h3 className="text-lg font-semibold">{object.primary_name}</h3>
        {object.ra !== null && object.dec !== null && (
          <MiniAltitudeChart objectId={object.id} width={100} height={32} />
        )}
      </div>

      {/* Visibility info if provided */}
      {visibility && visibility.is_visible_tonight && (
        <div className="flex flex-wrap gap-3 mb-2 text-xs">
          {visibility.max_altitude !== null && (
            <span className="text-green-400">
              Max: {visibility.max_altitude.toFixed(0)}°
            </span>
          )}
          {visibility.transit_time && (
            <span className="text-blue-400">Transit: {visibility.transit_time}</span>
          )}
          {visibility.hours_in_darkness !== null && (
            <span className="text-purple-400">
              {visibility.hours_in_darkness.toFixed(1)}h
            </span>
          )}
        </div>
      )}

      <div className="space-y-1 text-sm text-gray-400">
        {object.object_type && (
          <div className="flex justify-between">
            <span>Type:</span>
            <span className="text-gray-200">{object.object_type}</span>
          </div>
        )}

        {object.constellation && (
          <div className="flex justify-between">
            <span>Constellation:</span>
            <span className="text-gray-200">{object.constellation}</span>
          </div>
        )}

        {object.magnitude && (
          <div className="flex justify-between">
            <span>Magnitude:</span>
            <span className="text-gray-200">{object.magnitude.toFixed(1)}</span>
          </div>
        )}

        {object.ra !== null && (
          <div className="flex justify-between">
            <span>RA:</span>
            <span className="text-gray-200 font-mono">{formatRA(object.ra)}</span>
          </div>
        )}

        {object.dec !== null && (
          <div className="flex justify-between">
            <span>Dec:</span>
            <span className="text-gray-200 font-mono">{formatDec(object.dec)}</span>
          </div>
        )}
      </div>

      {object.aliases && object.aliases.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {object.aliases.slice(0, 3).map((alias) => (
            <span key={alias.id} className="badge badge-blue">
              {alias.alias_name}
            </span>
          ))}
          {object.aliases.length > 3 && (
            <span className="badge badge-blue">+{object.aliases.length - 3}</span>
          )}
        </div>
      )}

      {object.image_count !== undefined && (
        <div className="mt-3 text-sm text-gray-400">
          {object.image_count} image{object.image_count !== 1 ? 's' : ''}
        </div>
      )}
    </Link>
  )
}
