import { Link } from 'react-router-dom'
import { AstroObject } from '../api/client'

interface ObjectCardProps {
  object: AstroObject
}

export default function ObjectCard({ object }: ObjectCardProps) {
  return (
    <Link to={`/objects/${object.id}`} className="card hover:border-blue-500 transition-colors block">
      <h3 className="text-lg font-semibold mb-2">{object.primary_name}</h3>

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

        {object.ra !== null && object.dec !== null && (
          <div className="flex justify-between">
            <span>RA/Dec:</span>
            <span className="text-gray-200">
              {object.ra.toFixed(2)}° / {object.dec.toFixed(2)}°
            </span>
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
