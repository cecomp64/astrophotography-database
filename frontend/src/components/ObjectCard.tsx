import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AstroObject, VisibilityInfo, objectsApi } from '../api/client'
import { formatRA, formatDec } from '../utils/coordinates'
import MiniAltitudeChart from './MiniAltitudeChart'
import ShowcaseImage from './ShowcaseImage'

interface ObjectCardProps {
  object: AstroObject
  visibility?: VisibilityInfo
}

// Filter name abbreviations for compact display
const FILTER_ABBREV: Record<string, string> = {
  'Luminance': 'L',
  'Red': 'R',
  'Green': 'G',
  'Blue': 'B',
  'Ha': 'Hα',
  'H-alpha': 'Hα',
  'OIII': 'OIII',
  'SII': 'SII',
}

function abbreviateFilter(filter: string): string {
  return FILTER_ABBREV[filter] || filter.slice(0, 3)
}

export default function ObjectCard({ object, visibility }: ObjectCardProps) {
  // Fetch mini altitude data (React Query deduplicates with MiniAltitudeChart's query)
  const { data: miniAltitude } = useQuery({
    queryKey: ['miniAltitude', object.id],
    queryFn: () => objectsApi.getMiniAltitude(object.id),
    enabled: object.ra !== null && object.dec !== null && !visibility,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch filter stats for this object
  const { data: filterStats } = useQuery({
    queryKey: ['filterStats', object.id],
    queryFn: () => objectsApi.getFilterStats(object.id),
    staleTime: 5 * 60 * 1000,
  })

  // Use provided visibility info, or derive from mini altitude data
  const maxAlt = visibility?.max_altitude ?? miniAltitude?.max_altitude
  const transitTime = visibility?.transit_time ?? miniAltitude?.transit_time
  const hoursInDarkness = visibility?.hours_in_darkness ?? miniAltitude?.hours_in_darkness

  return (
    <Link
      to={`/objects/${object.id}`}
      className="card hover:border-blue-500 transition-colors block"
    >
      <div className="flex gap-3">
        {/* Showcase thumbnail */}
        <ShowcaseImage
          objectId={object.id}
          objectName={object.primary_name}
          ra={object.ra}
          dec={object.dec}
          size="sm"
          className="flex-shrink-0"
        />

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-3 mb-2">
            <h3 className="text-lg font-semibold truncate">{object.primary_name}</h3>
            {object.ra !== null && object.dec !== null && (
              <MiniAltitudeChart objectId={object.id} width={100} height={32} />
            )}
          </div>

      {/* Visibility info - always shown when data is available */}
      {(maxAlt !== null && maxAlt !== undefined) && (
        <div className="flex flex-wrap gap-3 mb-2 text-xs">
          <span className="text-green-400">
            Max: {maxAlt.toFixed(0)}°
          </span>
          {transitTime && (
            <span className="text-blue-400">Transit: {transitTime}</span>
          )}
          {hoursInDarkness !== null && hoursInDarkness !== undefined && (
            <span className="text-purple-400">
              {hoursInDarkness.toFixed(1)}h
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

      {/* Filter stats or image count */}
      {filterStats && filterStats.total_images > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {Object.entries(filterStats.by_filter).map(([filter, count]) => (
            <span
              key={filter}
              className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-300"
              title={`${filter}: ${count} images`}
            >
              {abbreviateFilter(filter)}: {count}
            </span>
          ))}
        </div>
      ) : object.image_count !== undefined && object.image_count > 0 ? (
        <div className="mt-3 text-sm text-gray-400">
          {object.image_count} image{object.image_count !== 1 ? 's' : ''}
        </div>
      ) : null}
        </div>
      </div>
    </Link>
  )
}
