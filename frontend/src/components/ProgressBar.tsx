interface ProgressBarProps {
  percent: number
  message?: string
  status?: 'idle' | 'running' | 'completed' | 'error'
  details?: {
    current?: number
    total?: number
    indexed?: number
    skipped?: number
    errors?: number
  }
}

export default function ProgressBar({
  percent,
  message,
  status = 'running',
  details,
}: ProgressBarProps) {
  const getBarColor = () => {
    switch (status) {
      case 'completed':
        return 'bg-green-500'
      case 'error':
        return 'bg-red-500'
      case 'running':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return '✓'
      case 'error':
        return '✗'
      case 'running':
        return null
      default:
        return null
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-300 flex items-center gap-2">
          {status === 'running' && (
            <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
          {getStatusIcon() && (
            <span className={status === 'completed' ? 'text-green-400' : 'text-red-400'}>
              {getStatusIcon()}
            </span>
          )}
          {message}
        </span>
        <span className="text-sm text-gray-400">{percent.toFixed(0)}%</span>
      </div>

      <div className="relative">
        <div className="bg-space-700 rounded-full overflow-hidden h-3">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getBarColor()}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      </div>

      {details && (details.current !== undefined || details.indexed !== undefined) && (
        <div className="flex justify-between text-xs text-gray-500">
          {details.current !== undefined && details.total !== undefined && (
            <span>
              {details.current} / {details.total} files
            </span>
          )}
          {details.indexed !== undefined && (
            <span className="flex gap-3">
              <span className="text-green-400">{details.indexed} indexed</span>
              <span className="text-yellow-400">{details.skipped} skipped</span>
              {details.errors !== undefined && details.errors > 0 && (
                <span className="text-red-400">{details.errors} errors</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
