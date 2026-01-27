import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ImageGroup, imagesApi } from '../api/client'
import ImageTable from './ImageTable'

interface SessionCardProps {
  session: ImageGroup
}

export default function SessionCard({ session }: SessionCardProps) {
  const [expanded, setExpanded] = useState(false)

  const { data: images, isLoading } = useQuery({
    queryKey: ['sessionImages', session.image_ids],
    queryFn: () => imagesApi.getByIds(session.image_ids),
    enabled: expanded,
  })

  const formatTotalExposure = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.round(seconds % 60)
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (dateStr: string) => {
    if (dateStr === 'Unknown') return dateStr
    return new Date(dateStr).toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // Sort subs by typical imaging order: L, R, G, B, Ha, OIII, SII, then others
  const filterOrder = ['L', 'Luminance', 'R', 'Red', 'G', 'Green', 'B', 'Blue', 'Ha', 'H-alpha', 'OIII', 'O-III', 'SII', 'S-II']
  const sortedSubs = [...session.subs].sort((a, b) => {
    const aName = a.filter_name || ''
    const bName = b.filter_name || ''
    const aIndex = filterOrder.findIndex(f => aName.toLowerCase().includes(f.toLowerCase()))
    const bIndex = filterOrder.findIndex(f => bName.toLowerCase().includes(f.toLowerCase()))
    if (aIndex === -1 && bIndex === -1) {
      // Both unknown, sort by name then exposure time
      if (aName !== bName) return aName.localeCompare(bName)
      return a.exposure_time - b.exposure_time
    }
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    if (aIndex !== bIndex) return aIndex - bIndex
    // Same filter, sort by exposure time
    return a.exposure_time - b.exposure_time
  })

  return (
    <div className="card">
      <div
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-lg font-semibold">
              {session.target_name ? (
                <Link
                  to={`/objects/${session.target_id}`}
                  className="text-blue-400 hover:text-blue-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  {session.target_name}
                </Link>
              ) : (
                <span className="text-gray-400">Unknown Target</span>
              )}
            </div>
            <div className="text-sm text-gray-400">
              {formatDate(session.date)}
              {session.telescope && ` · ${session.telescope}`}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold">
              {formatTotalExposure(session.total_exposure_seconds)}
            </div>
            <div className="text-sm text-gray-400">
              {session.total_frames} frame{session.total_frames !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {sortedSubs.map((sub, index) => (
            <div
              key={`${sub.filter_name}-${sub.exposure_time}-${index}`}
              className="badge badge-purple"
            >
              {sub.filter_name || 'No filter'} @{sub.exposure_time}s x {sub.count}: {formatTotalExposure(sub.total_exposure)}
            </div>
          ))}
        </div>

        {session.cameras.length > 0 && (
          <div className="mt-2 text-xs text-gray-500">
            {session.cameras.join(', ')}
          </div>
        )}

        <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
          <span>{expanded ? '▼' : '▶'}</span>
          <span>{expanded ? 'Hide' : 'Show'} frames</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-space-700">
          {isLoading ? (
            <div className="text-gray-400 py-4 text-center">Loading frames...</div>
          ) : (
            <ImageTable images={images || []} />
          )}
        </div>
      )}
    </div>
  )
}
