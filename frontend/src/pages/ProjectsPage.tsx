import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, ProjectCreate } from '../api/client'
import ProjectCard from '../components/ProjectCard'
import ProjectForm from '../components/ProjectForm'

export default function ProjectsPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const queryClient = useQueryClient()

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', statusFilter],
    queryFn: () =>
      projectsApi.list({
        limit: 100,
        status: statusFilter || undefined,
      }),
  })

  const createMutation = useMutation({
    mutationFn: (data: ProjectCreate) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setShowCreateForm(false)
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Projects</h1>
        <button
          onClick={() => setShowCreateForm(true)}
          className="btn btn-primary"
        >
          New Project
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading projects...</div>
      ) : projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">No projects found</p>
          <p className="text-sm text-gray-500 mb-6">
            Create a project to track your imaging progress
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn btn-primary"
          >
            Create Your First Project
          </button>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-space-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">New Project</h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ProjectForm
              onSubmit={(data) => createMutation.mutate(data as ProjectCreate)}
              onCancel={() => setShowCreateForm(false)}
              isSubmitting={createMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  )
}
