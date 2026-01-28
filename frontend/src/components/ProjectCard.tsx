import { Link } from 'react-router-dom'
import { Project, WellPlacedProject, VisibilityInfo } from '../api/client'

interface ProjectCardProps {
  project: Project
  visibility?: VisibilityInfo
  recommendedFilter?: string | null
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'badge-green'
    case 'completed':
      return 'badge-blue'
    case 'paused':
      return 'badge-purple'
    case 'archived':
      return 'bg-gray-600 text-gray-300'
    default:
      return 'bg-gray-600 text-gray-300'
  }
}

export default function ProjectCard({ project, visibility, recommendedFilter }: ProjectCardProps) {
  const progress = project.overall_progress ?? 0

  return (
    <Link to={`/projects/${project.id}`} className="card hover:border-blue-500 transition-colors block">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-semibold">{project.name}</h3>
        <span className={`badge ${getStatusBadgeClass(project.status)}`}>
          {project.status}
        </span>
      </div>

      {project.description && (
        <p className="text-sm text-gray-400 mb-3 line-clamp-2">
          {project.description}
        </p>
      )}

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-gray-400">Progress</span>
          <span className="text-sm font-medium">{progress.toFixed(0)}%</span>
        </div>
        <div className="bg-space-700 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              progress >= 100 ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      {/* Visibility info */}
      {visibility && visibility.is_visible_tonight && (
        <div className="flex flex-wrap gap-2 mb-3">
          {visibility.current_altitude !== null && (
            <span className="text-sm text-green-400">
              {visibility.current_altitude.toFixed(0)}° alt
            </span>
          )}
          {visibility.hours_above_min_altitude !== null && (
            <span className="text-sm text-blue-400">
              {visibility.hours_above_min_altitude.toFixed(1)}h tonight
            </span>
          )}
          {recommendedFilter && (
            <span className="badge badge-purple">
              Shoot {recommendedFilter}
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4 text-sm text-gray-400">
        <span>{project.target_count} target{project.target_count !== 1 ? 's' : ''}</span>
        <span>{project.image_count} image{project.image_count !== 1 ? 's' : ''}</span>
      </div>
    </Link>
  )
}

// Compact card for dashboard "well-placed" list
interface WellPlacedCardProps {
  project: WellPlacedProject
}

export function WellPlacedCard({ project }: WellPlacedCardProps) {
  return (
    <Link
      to={`/projects/${project.project_id}`}
      className="flex justify-between items-center p-3 bg-space-700 rounded-lg hover:bg-space-600 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{project.project_name}</div>
        <div className="text-sm text-gray-400 truncate">
          {project.primary_target_name}
        </div>
      </div>

      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
        {project.visibility.current_altitude !== null && (
          <span className="text-sm text-green-400 whitespace-nowrap">
            {project.visibility.current_altitude.toFixed(0)}°
          </span>
        )}
        {project.visibility.hours_above_min_altitude !== null && (
          <span className="text-sm text-blue-400 whitespace-nowrap">
            {project.visibility.hours_above_min_altitude.toFixed(1)}h
          </span>
        )}
        {project.recommended_filter && (
          <span className="badge badge-purple text-xs">
            {project.recommended_filter}
          </span>
        )}
        <div className="w-16 flex-shrink-0">
          <div className="bg-space-600 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                project.overall_progress >= 100 ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(project.overall_progress, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}
