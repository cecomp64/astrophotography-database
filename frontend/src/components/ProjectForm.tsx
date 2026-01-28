import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ProjectCreate, ProjectUpdate, objectsApi } from '../api/client'

interface ProjectFormProps {
  initialData?: {
    name?: string
    description?: string | null
    status?: string
    exposure_goals?: Record<string, number> | null
    priority?: number
    notes?: string | null
  }
  onSubmit: (data: ProjectCreate | ProjectUpdate) => void
  onCancel: () => void
  isSubmitting?: boolean
  isEdit?: boolean
}

interface ExposureGoal {
  filter: string
  hours: number
}

const COMMON_FILTERS = ['L', 'R', 'G', 'B', 'Ha', 'OIII', 'SII']

export default function ProjectForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  isEdit = false,
}: ProjectFormProps) {
  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [status, setStatus] = useState(initialData?.status || 'active')
  const [priority, setPriority] = useState(initialData?.priority || 0)
  const [notes, setNotes] = useState(initialData?.notes || '')

  // Convert exposure goals from seconds to hours for display
  const initialGoals: ExposureGoal[] = initialData?.exposure_goals
    ? Object.entries(initialData.exposure_goals).map(([filter, seconds]) => ({
        filter,
        hours: seconds / 3600,
      }))
    : []

  const [exposureGoals, setExposureGoals] = useState<ExposureGoal[]>(initialGoals)
  const [newFilter, setNewFilter] = useState('')

  const [targetSearch, setTargetSearch] = useState('')
  const [selectedTargets, setSelectedTargets] = useState<number[]>([])

  const { data: searchResults } = useQuery({
    queryKey: ['objectSearch', targetSearch],
    queryFn: () => objectsApi.search(targetSearch, 10),
    enabled: targetSearch.length >= 2 && !isEdit,
  })

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

  const handleAddTarget = (objectId: number) => {
    if (!selectedTargets.includes(objectId)) {
      setSelectedTargets([...selectedTargets, objectId])
    }
    setTargetSearch('')
  }

  const handleRemoveTarget = (objectId: number) => {
    setSelectedTargets(selectedTargets.filter((id) => id !== objectId))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Convert hours back to seconds
    const goalsInSeconds: Record<string, number> = {}
    exposureGoals.forEach((g) => {
      goalsInSeconds[g.filter] = g.hours * 3600
    })

    const data: ProjectCreate | ProjectUpdate = {
      name,
      description: description || null,
      status,
      exposure_goals: Object.keys(goalsInSeconds).length > 0 ? goalsInSeconds : null,
      priority,
      notes: notes || null,
      ...(isEdit ? {} : { target_object_ids: selectedTargets.length > 0 ? selectedTargets : undefined }),
    }

    onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Project Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input w-full"
          required
          placeholder="e.g., Orion Nebula Mosaic"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input w-full"
          rows={2}
          placeholder="Optional project description..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input w-full"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Priority
          </label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
            className="input w-full"
            min={0}
            max={10}
          />
        </div>
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

      {/* Target Objects (only for new projects) */}
      {!isEdit && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Target Objects
          </label>

          {selectedTargets.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedTargets.map((id) => (
                <span key={id} className="badge badge-blue flex items-center gap-1">
                  Object #{id}
                  <button
                    type="button"
                    onClick={() => handleRemoveTarget(id)}
                    className="hover:text-red-300"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <input
              type="text"
              value={targetSearch}
              onChange={(e) => setTargetSearch(e.target.value)}
              className="input w-full"
              placeholder="Search for objects to add..."
            />
            {searchResults && searchResults.length > 0 && targetSearch.length >= 2 && (
              <div className="absolute z-10 w-full mt-1 bg-space-700 border border-space-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((obj) => (
                  <button
                    key={obj.id}
                    type="button"
                    onClick={() => handleAddTarget(obj.id)}
                    className="w-full px-4 py-2 text-left hover:bg-space-600 flex justify-between items-center"
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
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input w-full"
          rows={2}
          placeholder="Additional notes..."
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
          disabled={isSubmitting || !name}
        >
          {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Project'}
        </button>
      </div>
    </form>
  )
}
