import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { imagesApi } from '../api/client'
import { formatRA, formatDec } from '../utils/coordinates'

export default function ImageDetailPage() {
  const { id } = useParams<{ id: string }>()
  const imageId = parseInt(id || '0', 10)

  const { data: image, isLoading, error } = useQuery({
    queryKey: ['image', imageId],
    queryFn: () => imagesApi.get(imageId),
    enabled: imageId > 0,
  })

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString()
  }

  const formatExposure = (seconds: number | null) => {
    if (!seconds) return '-'
    if (seconds >= 60) {
      return `${(seconds / 60).toFixed(1)} min`
    }
    return `${seconds.toFixed(1)} s`
  }

  const formatFov = (width: number | null, height: number | null): string => {
    if (width === null || height === null) return '-'
    const formatDeg = (deg: number) => {
      if (deg >= 1) return `${deg.toFixed(2)}°`
      return `${(deg * 60).toFixed(1)}'`
    }
    return `${formatDeg(width)} × ${formatDeg(height)}`
  }

  if (isLoading) {
    return <div className="text-gray-400">Loading image details...</div>
  }

  if (error || !image) {
    return (
      <div className="card text-center py-12">
        <p className="text-red-400 mb-4">Image not found</p>
        <Link to="/images" className="btn btn-secondary">
          Back to Images
        </Link>
      </div>
    )
  }

  const primaryObject = image.objects?.find(o => o.association_type === 'primary')
  const fovObjects = image.objects?.filter(o => o.association_type === 'in_fov') || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/images" className="text-blue-400 hover:text-blue-300 text-sm">
            &larr; Back to Images
          </Link>
          <h1 className="text-2xl font-bold mt-2">{image.file_name}</h1>
          <p className="text-gray-400 text-sm mt-1">{image.file_path}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Metadata */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Image Metadata</h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-400">Date Taken</dt>
              <dd>{formatDate(image.date_taken)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Exposure</dt>
              <dd>{formatExposure(image.exposure_time)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Filter</dt>
              <dd>
                {image.filter_name ? (
                  <span className="badge badge-purple">{image.filter_name}</span>
                ) : '-'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Telescope</dt>
              <dd>{image.telescope || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Camera</dt>
              <dd>{image.camera || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Gain</dt>
              <dd>{image.gain !== null ? image.gain : '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">ISO</dt>
              <dd>{image.iso !== null ? image.iso : '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Binning</dt>
              <dd>{image.binning || '-'}</dd>
            </div>
          </dl>
        </div>

        {/* FOV Information */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Field of View</h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-400">Center RA</dt>
              <dd className="font-mono">{formatRA(image.ra)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Center Dec</dt>
              <dd className="font-mono">{formatDec(image.dec)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">FOV Size</dt>
              <dd>{formatFov(image.fov_width, image.fov_height)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Image Size</dt>
              <dd>
                {image.image_width && image.image_height
                  ? `${image.image_width} × ${image.image_height} px`
                  : '-'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Pixel Size</dt>
              <dd>
                {image.pixel_size_x !== null
                  ? `${image.pixel_size_x}µm${image.pixel_size_y !== image.pixel_size_x ? ` × ${image.pixel_size_y}µm` : ''}`
                  : '-'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Focal Length</dt>
              <dd>{image.focal_length !== null ? `${image.focal_length} mm` : '-'}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Associated Objects */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Associated Objects</h2>

        {primaryObject && (
          <div className="mb-4">
            <h3 className="text-sm text-gray-400 mb-2">Primary Target</h3>
            <Link
              to={`/objects/${primaryObject.object_id}`}
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-900/30 border border-blue-700 rounded-lg hover:bg-blue-900/50 transition-colors"
            >
              <span className="text-blue-400 font-medium">
                {primaryObject.object_name || `Object #${primaryObject.object_id}`}
              </span>
            </Link>
          </div>
        )}

        {fovObjects.length > 0 && (
          <div>
            <h3 className="text-sm text-gray-400 mb-2">Objects in Field of View ({fovObjects.length})</h3>
            <div className="flex flex-wrap gap-2">
              {fovObjects.map((obj) => (
                <Link
                  key={obj.object_id}
                  to={`/objects/${obj.object_id}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-space-700 border border-space-600 rounded hover:bg-space-600 transition-colors"
                >
                  <span>{obj.object_name || `Object #${obj.object_id}`}</span>
                  {obj.angular_distance !== null && (
                    <span className="text-xs text-gray-500">
                      {obj.angular_distance.toFixed(1)}'
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {!primaryObject && fovObjects.length === 0 && (
          <p className="text-gray-500">No objects associated with this image</p>
        )}
      </div>

      {/* FITS Header */}
      {image.fits_header && Object.keys(image.fits_header).length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">FITS Header</h2>
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th className="w-1/4">Keyword</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(image.fits_header)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => (
                    <tr key={key} className="hover:bg-space-700">
                      <td className="font-mono text-blue-400">{key}</td>
                      <td className="font-mono">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* File Information */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">File Information</h2>
        <dl className="space-y-3">
          <div className="flex justify-between">
            <dt className="text-gray-400">Directory</dt>
            <dd className="text-sm font-mono">{image.directory_path}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-400">Created</dt>
            <dd>{formatDate(image.created_at)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-400">Last Updated</dt>
            <dd>{formatDate(image.updated_at)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
