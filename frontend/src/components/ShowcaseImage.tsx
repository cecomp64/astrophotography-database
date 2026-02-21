import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { showcasesApi } from '../api/client'
import { isPwaMode } from '../pwa/hooks/usePwaMode'
import { getShowcaseImage } from '../pwa/db/persistence'

interface ShowcaseImageProps {
  objectId: number
  objectName: string
  ra: number | null
  dec: number | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function ShowcaseImage({
  objectId,
  objectName,
  ra,
  dec,
  size = 'md',
  className = '',
}: ShowcaseImageProps) {
  const queryClient = useQueryClient()
  const pwa = isPwaMode()
  const [imageError, setImageError] = useState(false)
  const [cachedImageUrl, setCachedImageUrl] = useState<string | null>(null)
  const [cachedImageLoading, setCachedImageLoading] = useState(pwa)

  // Load cached image from IndexedDB in PWA mode
  useEffect(() => {
    if (!pwa) return

    let objectUrl: string | null = null

    getShowcaseImage(objectId)
      .then((record) => {
        if (record) {
          objectUrl = URL.createObjectURL(record.blob)
          setCachedImageUrl(objectUrl)
        }
        setCachedImageLoading(false)
      })
      .catch((err) => {
        console.warn('Failed to load cached showcase image:', err)
        setCachedImageLoading(false)
      })

    // Cleanup object URL on unmount
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [pwa, objectId])

  const { data: showcase, isLoading } = useQuery({
    queryKey: ['showcase', objectId],
    queryFn: () => showcasesApi.get(objectId),
    staleTime: 5 * 60 * 1000,
    enabled: !pwa, // Disable in PWA mode - images require server
  })

  const fetchSurveyMutation = useMutation({
    mutationFn: () => showcasesApi.fetchFromSurvey(objectId),
    onSuccess: () => {
      setImageError(false)
      queryClient.invalidateQueries({ queryKey: ['showcase', objectId] })
    },
  })

  // Reset error state when showcase data changes
  useEffect(() => {
    setImageError(false)
  }, [showcase?.updated_at])

  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-32 h-32',
    lg: 'w-48 h-48',
  }

  const hasCoordinates = ra !== null && dec !== null

  // In PWA mode, show cached image or placeholder
  if (pwa) {
    if (cachedImageLoading) {
      return (
        <div className={`${sizeClasses[size]} bg-space-700 rounded-lg animate-pulse ${className}`} />
      )
    }

    if (cachedImageUrl) {
      return (
        <div className={`relative ${className}`}>
          <img
            src={cachedImageUrl}
            alt={objectName}
            className={`${sizeClasses[size]} object-cover rounded-lg`}
            onError={() => setCachedImageUrl(null)}
          />
        </div>
      )
    }

    // No cached image available
    return (
      <div className={`${sizeClasses[size]} bg-space-700 rounded-lg flex items-center justify-center ${className}`}>
        <span className="text-gray-500 text-xs text-center px-2">Not synced</span>
      </div>
    )
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className={`${sizeClasses[size]} bg-space-700 rounded-lg animate-pulse ${className}`} />
    )
  }

  // Show placeholder if no showcase and no coordinates for survey fallback
  if (!showcase && !hasCoordinates) {
    return (
      <div className={`${sizeClasses[size]} bg-space-700 rounded-lg flex items-center justify-center ${className}`}>
        <span className="text-gray-500 text-xs text-center px-2">No image</span>
      </div>
    )
  }

  // If no showcase but has coordinates, offer to fetch from survey
  if (!showcase && hasCoordinates) {
    return (
      <div className={`${sizeClasses[size]} bg-space-700 rounded-lg flex flex-col items-center justify-center p-2 ${className}`}>
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            fetchSurveyMutation.mutate()
          }}
          disabled={fetchSurveyMutation.isPending}
          className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-500"
        >
          {fetchSurveyMutation.isPending ? 'Loading...' : 'Load image'}
        </button>
        {fetchSurveyMutation.isError && (
          <span className="text-xs text-red-400 mt-1">Failed</span>
        )}
      </div>
    )
  }

  // Show image with error handling
  if (imageError) {
    return (
      <div className={`${sizeClasses[size]} bg-space-700 rounded-lg flex items-center justify-center ${className}`}>
        <span className="text-gray-500 text-xs">Load failed</span>
      </div>
    )
  }

  // Use updated_at as cache buster to force reload when image changes
  const imageUrl = showcase?.updated_at
    ? `${showcasesApi.getImageUrl(objectId)}?t=${encodeURIComponent(showcase.updated_at)}`
    : showcasesApi.getImageUrl(objectId)

  return (
    <div className={`relative ${className}`}>
      <img
        src={imageUrl}
        alt={objectName}
        className={`${sizeClasses[size]} object-cover rounded-lg`}
        onError={() => setImageError(true)}
      />
      {showcase && (
        <div className="absolute bottom-1 right-1 text-xs bg-black/60 px-1.5 py-0.5 rounded" title={`Source: ${showcase.source_type}`}>
          {showcase.source_type === 'upload' && 'User'}
          {showcase.source_type === 'indexed' && 'FITS'}
          {showcase.source_type === 'survey' && 'DSS'}
        </div>
      )}
    </div>
  )
}
