import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AstroObject, Image, showcasesApi, imagesApi } from '../api/client'

interface ShowcaseManagerProps {
  object: AstroObject
}

const SURVEY_OPTIONS = [
  { value: 'DSS2 Red', label: 'DSS2 Red (recommended)' },
  { value: 'DSS2 Blue', label: 'DSS2 Blue' },
  { value: 'DSS2 IR', label: 'DSS2 Infrared' },
  { value: '2MASS-J', label: '2MASS J-band' },
]

export default function ShowcaseManager({ object }: ShowcaseManagerProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedSurvey, setSelectedSurvey] = useState('DSS2 Red')
  const [activeTab, setActiveTab] = useState<'current' | 'upload' | 'indexed' | 'survey'>('current')

  const { data: showcase, isLoading: showcaseLoading } = useQuery({
    queryKey: ['showcase', object.id],
    queryFn: () => showcasesApi.get(object.id),
    staleTime: 5 * 60 * 1000,
  })

  const { data: objectImages, isLoading: imagesLoading } = useQuery({
    queryKey: ['objectImages', object.id],
    queryFn: () => imagesApi.list({ object_id: object.id, limit: 50 }),
    staleTime: 5 * 60 * 1000,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => showcasesApi.upload(object.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['showcase', object.id] })
      setActiveTab('current')
    },
  })

  const setFromIndexedMutation = useMutation({
    mutationFn: (imageId: number) => showcasesApi.setFromIndexed(object.id, imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['showcase', object.id] })
      setActiveTab('current')
    },
  })

  const fetchSurveyMutation = useMutation({
    mutationFn: (survey: string) => showcasesApi.fetchFromSurvey(object.id, survey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['showcase', object.id] })
      setActiveTab('current')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => showcasesApi.delete(object.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['showcase', object.id] })
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
    }
  }

  const hasCoordinates = object.ra !== null && object.dec !== null
  const isLoading = uploadMutation.isPending || setFromIndexedMutation.isPending || fetchSurveyMutation.isPending

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-space-600 pb-2">
        <button
          onClick={() => setActiveTab('current')}
          className={`px-3 py-1.5 text-sm rounded-t ${activeTab === 'current' ? 'bg-space-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          Current
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-3 py-1.5 text-sm rounded-t ${activeTab === 'upload' ? 'bg-space-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          Upload
        </button>
        <button
          onClick={() => setActiveTab('indexed')}
          className={`px-3 py-1.5 text-sm rounded-t ${activeTab === 'indexed' ? 'bg-space-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          disabled={!objectImages?.length}
        >
          From FITS ({objectImages?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('survey')}
          className={`px-3 py-1.5 text-sm rounded-t ${activeTab === 'survey' ? 'bg-space-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          disabled={!hasCoordinates}
        >
          Survey
        </button>
      </div>

      {/* Current showcase */}
      {activeTab === 'current' && (
        <div className="flex gap-4 items-start">
          {showcaseLoading ? (
            <div className="w-48 h-48 bg-space-700 rounded-lg animate-pulse" />
          ) : showcase ? (
            <div className="space-y-2">
              <img
                src={showcasesApi.getImageUrl(object.id)}
                alt={object.primary_name}
                className="w-48 h-48 object-cover rounded-lg"
              />
              <div className="text-sm text-gray-400">
                Source: <span className="text-gray-200">
                  {showcase.source_type === 'upload' && 'Uploaded image'}
                  {showcase.source_type === 'indexed' && 'FITS thumbnail'}
                  {showcase.source_type === 'survey' && `Survey (${showcase.survey_name})`}
                </span>
              </div>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="text-sm text-red-400 hover:text-red-300"
              >
                {deleteMutation.isPending ? 'Removing...' : 'Remove showcase'}
              </button>
            </div>
          ) : (
            <div className="w-48 h-48 bg-space-700 rounded-lg flex items-center justify-center">
              <span className="text-gray-500 text-sm">No showcase image</span>
            </div>
          )}
        </div>
      )}

      {/* Upload tab */}
      {activeTab === 'upload' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">Upload a JPEG or PNG image (max 10MB)</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="btn btn-primary"
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Choose file'}
          </button>
          {uploadMutation.isError && (
            <p className="text-sm text-red-400">Upload failed. Please try again.</p>
          )}
        </div>
      )}

      {/* Indexed images tab */}
      {activeTab === 'indexed' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">Select an indexed FITS image to generate a thumbnail</p>
          {imagesLoading ? (
            <div className="text-gray-500">Loading images...</div>
          ) : objectImages && objectImages.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {objectImages.map((image: Image) => (
                <button
                  key={image.id}
                  onClick={() => setFromIndexedMutation.mutate(image.id)}
                  disabled={isLoading}
                  className={`p-2 bg-space-700 rounded text-left hover:bg-space-600 transition-colors ${
                    showcase?.original_image_id === image.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  <div className="text-sm font-medium truncate">{image.file_name}</div>
                  <div className="text-xs text-gray-400">
                    {image.filter_name || 'Unknown filter'}
                    {image.exposure_time && ` - ${image.exposure_time}s`}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-gray-500">No indexed images for this object</div>
          )}
          {setFromIndexedMutation.isError && (
            <p className="text-sm text-red-400">Failed to generate thumbnail. The FITS file may be missing or invalid.</p>
          )}
        </div>
      )}

      {/* Survey tab */}
      {activeTab === 'survey' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">Fetch an image from an astronomical survey (requires coordinates)</p>
          {hasCoordinates ? (
            <>
              <div className="flex gap-2 items-center">
                <select
                  value={selectedSurvey}
                  onChange={(e) => setSelectedSurvey(e.target.value)}
                  className="input flex-1"
                >
                  {SURVEY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => fetchSurveyMutation.mutate(selectedSurvey)}
                  disabled={fetchSurveyMutation.isPending}
                  className="btn btn-primary"
                >
                  {fetchSurveyMutation.isPending ? 'Fetching...' : 'Fetch'}
                </button>
              </div>
              {fetchSurveyMutation.isError && (
                <p className="text-sm text-red-400">Failed to fetch survey image. The object may not be covered by this survey.</p>
              )}
            </>
          ) : (
            <div className="text-gray-500">Object has no coordinates - cannot fetch survey image</div>
          )}
        </div>
      )}
    </div>
  )
}
