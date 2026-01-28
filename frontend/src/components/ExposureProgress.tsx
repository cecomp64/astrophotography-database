interface ExposureProgressProps {
  goals: Record<string, number>
  actual: Record<string, number>
  progressPercent: Record<string, number>
  compact?: boolean
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export default function ExposureProgress({
  goals,
  actual,
  progressPercent,
  compact = false,
}: ExposureProgressProps) {
  const filters = Object.keys(goals).sort()

  if (filters.length === 0) {
    return (
      <div className="text-gray-500 text-sm">No exposure goals set</div>
    )
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {filters.map((filter) => {
        const goal = goals[filter] || 0
        const actualVal = actual[filter] || 0
        const progress = progressPercent[filter] || 0
        const isComplete = progress >= 100

        return (
          <div key={filter}>
            <div className="flex justify-between items-center mb-1">
              <span className={`font-medium ${compact ? 'text-sm' : ''}`}>
                {filter}
              </span>
              <span className={`text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>
                {formatTime(actualVal)} / {formatTime(goal)} ({progress.toFixed(0)}%)
              </span>
            </div>
            <div className={`bg-space-700 rounded-full overflow-hidden ${compact ? 'h-2' : 'h-3'}`}>
              <div
                className={`h-full rounded-full transition-all ${
                  isComplete ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
