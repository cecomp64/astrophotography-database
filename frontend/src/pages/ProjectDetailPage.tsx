import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi as onlineProjectsApi, ProjectUpdate, ProjectTarget, ImageGroup } from '../api/client'
import { useProjectsApi, useObjectsApi, useImagesApi } from '../pwa/hooks/useApi'
import { isPwaMode } from '../pwa/hooks/usePwaMode'
import ExposureProgress from '../components/ExposureProgress'
import ProjectForm from '../components/ProjectForm'
import AltitudeChart from '../components/AltitudeChart'
import BestViewingMini from '../components/BestViewingMini'

const COMMON_FILTERS = ['L', 'R', 'G', 'B', 'Ha', 'OIII', 'SII', 'No Filter']

interface ExposureGoal {
  filter: string
  hours: number
}

function TargetEditModal({
  target,
  onSave,
  onCancel,
  isSubmitting,
}: {
  target: ProjectTarget
  onSave: (data: { is_primary: boolean; exposure_goals: Record<string, number> | null; notes: string | null }) => void
  onCancel: () => void
  isSubmitting: boolean
}) {
  const [isPrimary, setIsPrimary] = useState(target.is_primary)
  const [notes, setNotes] = useState(target.notes || '')

  // Convert exposure goals from seconds to hours for display
  const initialGoals: ExposureGoal[] = target.exposure_goals
    ? Object.entries(target.exposure_goals).map(([filter, seconds]) => ({
        filter,
        hours: seconds / 3600,
      }))
    : []

  const [exposureGoals, setExposureGoals] = useState<ExposureGoal[]>(initialGoals)
  const [newFilter, setNewFilter] = useState('')

  const handleAddFilter = () => {
    if (newFilter && !exposureGoals.find((g) => g.filter === newFilter)) {
      setExposureGoals([...exposureGoals, { filter: newFilter, hours: 1 }])
      setNewFilter('')
    }
  }

  const handleRemoveFilter = (filter: string) => {
    setExposureGoals(exposureGoals.filter((g) => g.filter !== filter))
  }

  const handleGoalChange = (filter: string, hours: number) => {
    setExposureGoals(
      exposureGoals.map((g) => (g.filter === filter ? { ...g, hours } : g))
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Convert hours back to seconds
    const goalsInSeconds: Record<string, number> = {}
    exposureGoals.forEach((g) => {
      goalsInSeconds[g.filter] = g.hours * 3600
    })

    onSave({
      is_primary: isPrimary,
      exposure_goals: Object.keys(goalsInSeconds).length > 0 ? goalsInSeconds : null,
      notes: notes || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-space-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Edit Target: {target.object_name}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPrimary"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="isPrimary" className="text-sm text-gray-300">
              Primary target (used for visibility calculations)
            </label>
          </div>

          {/* Exposure Goals */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Exposure Goals (hours per filter)
            </label>

            {exposureGoals.length > 0 && (
              <div className="space-y-2 mb-3">
                {exposureGoals.map((goal) => (
                  <div key={goal.filter} className="flex items-center gap-2">
                    <span className="w-16 text-sm font-medium">{goal.filter}</span>
                    <input
                      type="number"
                      value={goal.hours}
                      onChange={(e) =>
                        handleGoalChange(goal.filter, parseFloat(e.target.value) || 0)
                      }
                      className="input w-24"
                      min={0}
                      step={0.5}
                    />
                    <span className="text-sm text-gray-400">hours</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFilter(goal.filter)}
                      className="text-red-400 hover:text-red-300 ml-auto"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <select
                value={newFilter}
                onChange={(e) => setNewFilter(e.target.value)}
                className="input flex-1"
              >
                <option value="">Add filter...</option>
                {COMMON_FILTERS.filter(
                  (f) => !exposureGoals.find((g) => g.filter === f)
                ).map((filter) => (
                  <option key={filter} value={filter}>
                    {filter}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddFilter}
                disabled={!newFilter}
                className="btn btn-secondary"
              >
                Add
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input w-full"
              rows={3}
              placeholder="Notes about this target..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LinkImagesModal({
  target,
  imageGroups,
  onLink,
  onCancel,
  isLinking,
}: {
  target: ProjectTarget
  imageGroups: ImageGroup[]
  onLink: (group: ImageGroup) => void
  onCancel: () => void
  isLinking: boolean
}) {
  const [search, setSearch] = useState('')

  // Get allowed filters from target's exposure goals
  const allowedFilters = target.exposure_goals ? Object.keys(target.exposure_goals) : null

  // Filter groups by search text only - let backend handle filter matching
  const filteredGroups = imageGroups.filter((group) => {
    if (search) {
      const searchLower = search.toLowerCase()
      if (!group.target_name?.toLowerCase().includes(searchLower)) {
        return false
      }
    }
    return true
  })

  // Helper to check if a group has any matching filters
  // "No Filter" in allowedFilters matches subs with filter_name = null
  const getMatchingFilterCount = (group: ImageGroup) => {
    if (!allowedFilters || allowedFilters.length === 0) return group.total_frames
    const hasNoFilterGoal = allowedFilters.includes('No Filter')
    return group.subs
      .filter((s) => {
        if (s.filter_name === null) return hasNoFilterGoal
        return allowedFilters.includes(s.filter_name)
      })
      .reduce((sum, s) => sum + s.count, 0)
  }

  const formatExposure = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-space-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Link Images to {target.object_name}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {allowedFilters && allowedFilters.length > 0 && (
          <p className="text-sm text-gray-400 mb-3">
            Only images with filters: {allowedFilters.join(', ')}
          </p>
        )}

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-full mb-4"
          placeholder="Search by target name..."
          autoFocus
        />

        <div className="flex-1 overflow-y-auto space-y-2">
          {filteredGroups.length > 0 ? (
            filteredGroups.map((group) => {
              const key = `${group.date}-${group.target_name}-${group.telescope}`
              const matchingCount = getMatchingFilterCount(group)
              const hasNoMatchingFilters = allowedFilters && allowedFilters.length > 0 && matchingCount === 0

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onLink(group)}
                  disabled={isLinking}
                  className={`w-full p-3 bg-space-700 rounded-lg hover:bg-space-600 text-left transition-colors disabled:opacity-50 ${
                    hasNoMatchingFilters ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-medium">{group.target_name || 'Unknown Target'}</span>
                      <span className="text-gray-400 mx-2">|</span>
                      <span className="text-gray-400">{group.date}</span>
                      {group.telescope && (
                        <>
                          <span className="text-gray-500 mx-2">|</span>
                          <span className="text-gray-500 text-sm">{group.telescope}</span>
                        </>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-sm text-gray-400">
                        {group.total_frames} frames &bull; {formatExposure(group.total_exposure_seconds)}
                      </span>
                      {hasNoMatchingFilters && (
                        <div className="text-xs text-yellow-500">No matching filters</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.subs.map((sub, i) => {
                      const isMatching = !allowedFilters ||
                        (sub.filter_name === null ? allowedFilters.includes('No Filter') : allowedFilters.includes(sub.filter_name))
                      return (
                        <span
                          key={i}
                          className={`text-xs px-2 py-0.5 rounded ${
                            isMatching
                              ? 'bg-blue-500/30 text-blue-300'
                              : 'bg-space-600 text-gray-500'
                          }`}
                        >
                          {sub.filter_name || 'No filter'}: {sub.count}x{sub.exposure_time}s
                        </span>
                      )
                    })}
                  </div>
                </button>
              )
            })
          ) : (
            <p className="text-gray-500 text-center py-8">
              {search ? 'No matching image groups found' : 'No image groups available'}
            </p>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-space-600">
          <button onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = parseInt(id!, 10)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectsApi = useProjectsApi()
  const objectsApi = useObjectsApi()
  const imagesApi = useImagesApi()
  const pwa = isPwaMode()

  const [showEditForm, setShowEditForm] = useState(false)
  const [showAddTarget, setShowAddTarget] = useState(false)
  const [targetSearch, setTargetSearch] = useState('')
  const [editingTarget, setEditingTarget] = useState<ProjectTarget | null>(null)
  const [linkingTarget, setLinkingTarget] = useState<ProjectTarget | null>(null)
  const [removingTargetId, setRemovingTargetId] = useState<number | null>(null)

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
    enabled: !isNaN(projectId),
  })

  const { data: searchResults } = useQuery({
    queryKey: ['objectSearch', targetSearch],
    queryFn: () => objectsApi.search(targetSearch, 10),
    enabled: targetSearch.length >= 2,
  })

  const { data: imageGroupsResponse } = useQuery({
    queryKey: ['imageGroups'],
    queryFn: () => imagesApi.getGrouped({ limit: 100 }),
    enabled: linkingTarget !== null,
  })

  // Mutations only work in desktop mode (online API)
  const updateMutation = useMutation({
    mutationFn: (data: ProjectUpdate) => onlineProjectsApi.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setShowEditForm(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => onlineProjectsApi.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate('/projects')
    },
  })

  const addTargetMutation = useMutation({
    mutationFn: ({ objectId, isPrimary }: { objectId: number; isPrimary: boolean }) =>
      onlineProjectsApi.addTarget(projectId, objectId, isPrimary),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setShowAddTarget(false)
      setTargetSearch('')
    },
  })

  const updateTargetMutation = useMutation({
    mutationFn: ({ objectId, data }: { objectId: number; data: { is_primary?: boolean; exposure_goals?: Record<string, number> | null; notes?: string | null } }) =>
      onlineProjectsApi.updateTarget(projectId, objectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setEditingTarget(null)
    },
  })

  const removeTargetMutation = useMutation({
    mutationFn: (objectId: number) => onlineProjectsApi.removeTarget(projectId, objectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })

  const linkImagesMutation = useMutation({
    mutationFn: ({ objectId, group }: { objectId: number; group: ImageGroup }) =>
      onlineProjectsApi.linkImagesFromGroup(projectId, objectId, {
        date: group.date,
        target_name: group.target_name,
        telescope: group.telescope,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setLinkingTarget(null)
      alert(`Linked ${data.linked_images} image(s) to project`)
    },
  })

  const removeImageMutation = useMutation({
    mutationFn: (imageId: number) => onlineProjectsApi.removeImage(projectId, imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })

  if (isLoading) {
    return <div className="text-gray-400">Loading project...</div>
  }

  if (!project) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-400">Project not found</p>
        <Link to="/projects" className="text-blue-400 hover:text-blue-300 mt-4 inline-block">
          Back to Projects
        </Link>
      </div>
    )
  }

  const hasExposureGoals = project.progress && Object.keys(project.progress.exposure_goals).length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
            <span className={`badge ${
              project.status === 'active' ? 'badge-green' :
              project.status === 'completed' ? 'badge-blue' :
              project.status === 'paused' ? 'badge-purple' : 'bg-gray-600 text-gray-300'
            }`}>
              {project.status}
            </span>
          </div>
          {!pwa && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowEditForm(true)}
                className="btn btn-secondary"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this project?')) {
                    deleteMutation.mutate()
                  }
                }}
                className="btn bg-red-600 hover:bg-red-500 text-white"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {project.description && (
          <p className="text-gray-400 mb-4">{project.description}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Targets</div>
            <div className="text-lg font-semibold">{project.target_count}</div>
          </div>
          <div>
            <div className="text-gray-500">Images</div>
            <div className="text-lg font-semibold">{project.image_count}</div>
          </div>
          <div>
            <div className="text-gray-500">Priority</div>
            <div className="text-lg font-semibold">{project.priority}</div>
          </div>
          <div>
            <div className="text-gray-500">Progress</div>
            <div className="text-lg font-semibold">{(project.overall_progress ?? 0).toFixed(0)}%</div>
          </div>
        </div>
      </div>

      {/* Aggregated Exposure Progress */}
      {hasExposureGoals && project.progress && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-2">Aggregated Exposure Progress</h2>
          <p className="text-sm text-gray-500 mb-4">Combined goals from all targets</p>
          <ExposureProgress
            goals={project.progress.exposure_goals}
            actual={project.progress.actual_exposure}
            progressPercent={project.progress.progress_percent}
          />
          <div className="mt-4 pt-4 border-t border-space-600 text-sm text-gray-400">
            {project.progress.total_frames} frames &bull;{' '}
            {(project.progress.total_exposure_seconds / 3600).toFixed(1)} hours total
          </div>
        </div>
      )}

      {/* Targets Header */}
      <div className="card">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Targets</h2>
          {!pwa && (
            <button
              onClick={() => setShowAddTarget(true)}
              className="btn btn-secondary text-sm"
            >
              Add Target
            </button>
          )}
        </div>

        {project.targets.length === 0 && (
          <p className="text-gray-500 mt-4">No targets added yet</p>
        )}

        {/* Add Target Search */}
        {showAddTarget && (
          <div className="mt-4 p-4 bg-space-700 rounded-lg">
            <div className="relative">
              <input
                type="text"
                value={targetSearch}
                onChange={(e) => setTargetSearch(e.target.value)}
                className="input w-full"
                placeholder="Search for objects..."
                autoFocus
              />
              {searchResults && searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-space-600 border border-space-500 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map((obj) => (
                    <button
                      key={obj.id}
                      type="button"
                      onClick={() => addTargetMutation.mutate({ objectId: obj.id, isPrimary: project.targets.length === 0 })}
                      className="w-full px-4 py-2 text-left hover:bg-space-500 flex justify-between items-center"
                    >
                      <span>{obj.primary_name}</span>
                      {obj.object_type && (
                        <span className="text-sm text-gray-400">{obj.object_type}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setShowAddTarget(false)
                setTargetSearch('')
              }}
              className="mt-2 text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Individual Target Cards */}
      {project.targets.map((target) => (
        <div key={target.id} className="card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/objects/${target.object_id}`}
                className="text-lg font-medium hover:text-blue-400"
              >
                {target.object_name}
              </Link>
              {target.is_primary && (
                <span className="badge badge-green text-xs">Primary</span>
              )}
              {target.object_type && (
                <span className="text-sm text-gray-400">{target.object_type}</span>
              )}
              {target.constellation && (
                <span className="text-sm text-gray-500">{target.constellation}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {!pwa && (
                <>
                  <button
                    onClick={() => setEditingTarget(target)}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setLinkingTarget(target)}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Link Images
                  </button>
                  <button
                    onClick={() => {
                      setRemovingTargetId(target.object_id)
                      removeTargetMutation.mutate(target.object_id, {
                        onSettled: () => setRemovingTargetId(null),
                      })
                    }}
                    disabled={removingTargetId === target.object_id}
                    className="text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {removingTargetId === target.object_id ? 'Removing...' : 'Remove'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Per-target exposure progress */}
          {target.progress && Object.keys(target.progress.exposure_goals).length > 0 && (
            <div className="mb-4 space-y-2">
              {Object.entries(target.progress.exposure_goals).map(([filter, goalSeconds]) => {
                const actualSeconds = target.progress!.actual_exposure[filter] || 0
                const percent = target.progress!.progress_percent[filter] || 0
                return (
                  <div key={filter} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{filter}</span>
                      <span className="text-gray-400">
                        {(actualSeconds / 3600).toFixed(1)}h / {(goalSeconds / 3600).toFixed(1)}h ({percent.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-space-600 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          percent >= 100 ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="text-xs text-gray-500 pt-1">
                {target.progress.total_frames} frames &bull; {(target.progress.total_exposure_seconds / 3600).toFixed(1)}h total &bull; {target.progress.overall_progress.toFixed(0)}% complete
              </div>
            </div>
          )}

          {/* Show goals without progress if no images yet */}
          {(!target.progress || Object.keys(target.progress.exposure_goals).length === 0) &&
            target.exposure_goals && Object.keys(target.exposure_goals).length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.entries(target.exposure_goals).map(([filter, seconds]) => (
                <span key={filter} className="text-xs bg-space-600 px-2 py-1 rounded">
                  {filter}: {(seconds / 3600).toFixed(1)}h goal
                </span>
              ))}
              <span className="text-xs text-gray-500">No images yet</span>
            </div>
          )}

          {/* Per-target notes */}
          {target.notes && (
            <p className="mb-4 text-sm text-gray-400 italic">{target.notes}</p>
          )}

          {/* Altitude Chart */}
          <div className="pt-4 border-t border-space-600">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Altitude Tonight</h3>
            <div className="-mx-4 sm:mx-0">
              <AltitudeChart objectId={target.object_id} />
            </div>
          </div>

          {/* Best Viewing Info */}
          <div className="pt-3 mt-3 border-t border-space-600">
            <BestViewingMini objectId={target.object_id} />
          </div>
        </div>
      ))}

      {/* Images */}
      <div className="card">

        {project.images.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Date</th>
                  <th>Filter</th>
                  <th>Exposure</th>
                  {!pwa && <th></th>}
                </tr>
              </thead>
              <tbody>
                {project.images.slice(0, 50).map((img) => (
                  <tr key={img.id}>
                    <td className="font-mono text-sm">
                      <Link to={`/images/${img.image_id}`} className="hover:text-blue-400">
                        {img.file_name}
                      </Link>
                    </td>
                    <td className="text-sm text-gray-400">
                      {img.date_taken ? new Date(img.date_taken).toLocaleDateString() : '-'}
                    </td>
                    <td>
                      {img.filter_name && (
                        <span className="badge badge-blue">{img.filter_name}</span>
                      )}
                    </td>
                    <td className="text-sm">
                      {img.exposure_time ? `${img.exposure_time}s` : '-'}
                    </td>
                    {!pwa && (
                      <td>
                        <button
                          onClick={() => removeImageMutation.mutate(img.image_id)}
                          className="text-sm text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {project.images.length > 50 && (
              <div className="mt-2 text-sm text-gray-500">
                Showing 50 of {project.images.length} images
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No images linked to this project yet.  Add a target and 
              exposure goals, then link images to get started.
            </p>
          </div>
        )}
      </div>

      {/* Edit Project Modal */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-space-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Edit Project</h2>
              <button
                onClick={() => setShowEditForm(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ProjectForm
              initialData={{
                name: project.name,
                description: project.description,
                status: project.status,
                priority: project.priority,
              }}
              onSubmit={(data) => updateMutation.mutate(data as ProjectUpdate)}
              onCancel={() => setShowEditForm(false)}
              isSubmitting={updateMutation.isPending}
              isEdit
            />
          </div>
        </div>
      )}

      {/* Edit Target Modal */}
      {editingTarget && (
        <TargetEditModal
          target={editingTarget}
          onSave={(data) => updateTargetMutation.mutate({ objectId: editingTarget.object_id, data })}
          onCancel={() => setEditingTarget(null)}
          isSubmitting={updateTargetMutation.isPending}
        />
      )}

      {/* Link Images Modal */}
      {linkingTarget && imageGroupsResponse && (
        <LinkImagesModal
          target={linkingTarget}
          imageGroups={imageGroupsResponse.groups}
          onLink={(group) => linkImagesMutation.mutate({ objectId: linkingTarget.object_id, group })}
          onCancel={() => setLinkingTarget(null)}
          isLinking={linkImagesMutation.isPending}
        />
      )}
    </div>
  )
}
