import { Link } from 'react-router-dom'
import { Image } from '../api/client'

interface ImageTableProps {
  images: Image[]
}

export default function ImageTable({ images }: ImageTableProps) {
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }

  const formatExposure = (seconds: number | null) => {
    if (!seconds) return '-'
    if (seconds >= 60) {
      return `${(seconds / 60).toFixed(1)} min`
    }
    return `${seconds.toFixed(1)} s`
  }

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>File Name</th>
            <th>Object</th>
            <th>Date</th>
            <th>Filter</th>
            <th>Exposure</th>
            <th>Telescope</th>
            <th>Camera</th>
          </tr>
        </thead>
        <tbody>
          {images.map((image) => (
            <tr key={image.id} className="hover:bg-space-800">
              <td>
                <div className="font-medium">{image.file_name}</div>
                <div className="text-xs text-gray-500 truncate max-w-xs">{image.directory_path}</div>
              </td>
              <td>
                {image.object_id ? (
                  <Link
                    to={`/objects/${image.object_id}`}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {image.object_name || `Object #${image.object_id}`}
                  </Link>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </td>
              <td>{formatDate(image.date_taken)}</td>
              <td>
                {image.filter_name ? (
                  <span className="badge badge-purple">{image.filter_name}</span>
                ) : (
                  '-'
                )}
              </td>
              <td>{formatExposure(image.exposure_time)}</td>
              <td className="text-sm">{image.telescope || '-'}</td>
              <td className="text-sm">{image.camera || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {images.length === 0 && (
        <div className="text-center py-8 text-gray-400">No images found</div>
      )}
    </div>
  )
}
