import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { objectsApi, imagesApi } from '../api/client'
import ImageTable from '../components/ImageTable'
import AltitudeChart from '../components/AltitudeChart'
import { formatRA, formatDec } from '../utils/coordinates'

export default function ObjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const objectId = parseInt(id!, 10)

  const { data: object, isLoading: objectLoading } = useQuery({
    queryKey: ['object', objectId],
    queryFn: () => objectsApi.get(objectId),
    enabled: !isNaN(objectId),
  })

  const { data: images, isLoading: imagesLoading } = useQuery({
    queryKey: ['objectImages', objectId],
    queryFn: () => imagesApi.list({ object_id: objectId, limit: 100 }),
    enabled: !isNaN(objectId),
  })

  if (objectLoading) {
    return <div className="text-gray-400">Loading object...</div>
  }

  if (!object) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-400">Object not found</p>
        <Link to="/objects" className="text-blue-400 hover:text-blue-300 mt-4 inline-block">
          Back to Objects
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/objects" className="text-gray-400 hover:text-gray-200">
          &larr; Back
        </Link>
      </div>

      <div className="card">
        <h1 className="text-3xl font-bold mb-4">{object.primary_name}</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {object.object_type && (
            <div>
              <div className="text-gray-400 text-sm">Type</div>
              <div className="text-lg">{object.object_type}</div>
            </div>
          )}

          {object.constellation && (
            <div>
              <div className="text-gray-400 text-sm">Constellation</div>
              <div className="text-lg">{object.constellation}</div>
            </div>
          )}

          {object.magnitude !== null && (
            <div>
              <div className="text-gray-400 text-sm">Magnitude</div>
              <div className="text-lg">{object.magnitude.toFixed(1)}</div>
            </div>
          )}

          {object.ra !== null && (
            <div>
              <div className="text-gray-400 text-sm">Right Ascension</div>
              <div className="text-lg font-mono">{formatRA(object.ra)}</div>
            </div>
          )}

          {object.dec !== null && (
            <div>
              <div className="text-gray-400 text-sm">Declination</div>
              <div className="text-lg font-mono">{formatDec(object.dec)}</div>
            </div>
          )}

          <div>
            <div className="text-gray-400 text-sm">Images</div>
            <div className="text-lg">{images?.length ?? 0}</div>
          </div>
        </div>

        {object.aliases && object.aliases.length > 0 && (
          <div className="mt-6">
            <div className="text-gray-400 text-sm mb-2">Aliases</div>
            <div className="flex flex-wrap gap-2">
              {object.aliases.map((alias) => (
                <span key={alias.id} className="badge badge-blue">
                  {alias.alias_name}
                  {alias.catalog && (
                    <span className="text-blue-300 ml-1">({alias.catalog})</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {object.ra !== null && object.dec !== null && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Altitude Tonight</h2>
          <AltitudeChart objectId={objectId} />
        </div>
      )}

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Images</h2>
        {imagesLoading ? (
          <div className="text-gray-400">Loading images...</div>
        ) : (
          <ImageTable images={images || []} />
        )}
      </div>
    </div>
  )
}
