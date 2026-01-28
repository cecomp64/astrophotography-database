import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, objectsApi, ProjectUpdate } from '../api/client'
import ExposureProgress from '../components/ExposureProgress'
import ProjectForm from '../components/ProjectForm'
import AltitudeChart from '../components/AltitudeChart'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = parseInt(id!, 10)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showEditForm, setShowEditForm] = useState(false)
  const [showAddTarget, setShowAddTarget] = useState(false)
  const [targetSearch, setTargetSearch] = useState('')
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null)

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

  const updateMutation = useMutation({
    mutationFn: (data: ProjectUpdate) => projectsApi.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setShowEditForm(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate('/projects')
    },
  })

  const addTargetMutation = useMutation({
    mutationFn: ({ objectId, isPrimary }: { objectId: number; isPrimary: boolean }) =>
      projectsApi.addTarget(projectId, objectId, isPrimary),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      setShowAddTarget(false)
      setTargetSearch('')
    },
  })

  const removeTargetMutation = useMutation({
    mutationFn: (objectId: number) => projectsApi.removeTarget(projectId, objectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
    },
  })

  const autoLinkMutation = useMutation({
    mutationFn: () => projectsApi.autoLinkImages(projectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      alert(`Linked ${data.linked_images} image(s) to project`)
    },
  })

  const removeImageMutation = useMutation({
    mutationFn: (imageId: number) => projectsApi.removeImage(projectId, imageId),
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/projects" className="text-gray-400 hover:text-gray-200">
          &larr; Back
        </Link>
      </div>

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

      {/* Exposure Progress */}
      {project.progress && project.exposure_goals && Object.keys(project.exposure_goals).length > 0 && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Exposure Progress</h2>
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

      {/* Targets */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Targets</h2>
          <button
            onClick={() => setShowAddTarget(true)}
            className="btn btn-secondary text-sm"
          >
            Add Target
          </button>
        </div>

        {project.targets.length > 0 ? (
          <div className="space-y-3">
            {project.targets.map((target) => (
              <div
                key={target.id}
                className="flex items-center justify-between p-3 bg-space-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Link
                    to={`/objects/${target.object_id}`}
                    className="font-medium hover:text-blue-400"
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedTargetId(target.object_id)}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    Chart
                  </button>
                  <button
                    onClick={() => removeTargetMutation.mutate(target.object_id)}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No targets added yet</p>
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

      {/* Altitude Chart */}
      {selectedTargetId && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              Altitude Chart - {project.targets.find((t) => t.object_id === selectedTargetId)?.object_name}
            </h2>
            <button
              onClick={() => setSelectedTargetId(null)}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <AltitudeChart objectId={selectedTargetId} />
        </div>
      )}

      {/* Images */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Images ({project.images.length})</h2>
          <button
            onClick={() => autoLinkMutation.mutate()}
            disabled={autoLinkMutation.isPending}
            className="btn btn-secondary text-sm"
          >
            {autoLinkMutation.isPending ? 'Linking...' : 'Auto-Link Images'}
          </button>
        </div>

        {project.images.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Date</th>
                  <th>Filter</th>
                  <th>Exposure</th>
                  <th></th>
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
                    <td>
                      <button
                        onClick={() => removeImageMutation.mutate(img.image_id)}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </td>
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
            <p className="text-gray-500 mb-4">No images linked to this project yet</p>
            <button
              onClick={() => autoLinkMutation.mutate()}
              disabled={autoLinkMutation.isPending || project.targets.length === 0}
              className="btn btn-primary"
            >
              Auto-Link Images from Targets
            </button>
          </div>
        )}
      </div>

      {/* Notes */}
      {project.notes && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-2">Notes</h2>
          <p className="text-gray-400 whitespace-pre-wrap">{project.notes}</p>
        </div>
      )}

      {/* Edit Modal */}
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
                exposure_goals: project.exposure_goals,
                priority: project.priority,
                notes: project.notes,
              }}
              onSubmit={(data) => updateMutation.mutate(data as ProjectUpdate)}
              onCancel={() => setShowEditForm(false)}
              isSubmitting={updateMutation.isPending}
              isEdit
            />
          </div>
        </div>
      )}
    </div>
  )
}
