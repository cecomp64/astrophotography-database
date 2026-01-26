import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { indexerApi, IndexResult } from '../api/client'

export default function IndexerPage() {
  const [directory, setDirectory] = useState('')
  const [recursive, setRecursive] = useState(true)
  const [result, setResult] = useState<IndexResult | null>(null)
  const queryClient = useQueryClient()

  const indexMutation = useMutation({
    mutationFn: ({ dir, rec }: { dir: string; rec: boolean }) =>
      indexerApi.indexDirectory(dir, rec),
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries({ queryKey: ['images'] })
      queryClient.invalidateQueries({ queryKey: ['objects'] })
      queryClient.invalidateQueries({ queryKey: ['imageStats'] })
    },
  })

  const reindexMutation = useMutation({
    mutationFn: indexerApi.reindex,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] })
      queryClient.invalidateQueries({ queryKey: ['objects'] })
    },
  })

  const handleIndex = (e: React.FormEvent) => {
    e.preventDefault()
    if (directory) {
      indexMutation.mutate({ dir: directory, rec: recursive })
    }
  }

  const isLoading = indexMutation.isPending || reindexMutation.isPending

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">File Indexer</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Index Directory</h2>
          <form onSubmit={handleIndex} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Directory Path</label>
              <input
                type="text"
                value={directory}
                onChange={(e) => setDirectory(e.target.value)}
                placeholder="/path/to/fits/files"
                className="input w-full"
                disabled={isLoading}
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the full path to a directory containing FITS files
              </p>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={recursive}
                onChange={(e) => setRecursive(e.target.checked)}
                disabled={isLoading}
                className="rounded bg-space-700 border-space-600"
              />
              <span className="text-sm text-gray-300">Scan subdirectories recursively</span>
            </label>

            <button
              type="submit"
              disabled={isLoading || !directory}
              className="btn btn-primary w-full disabled:opacity-50"
            >
              {indexMutation.isPending ? 'Indexing...' : 'Index Directory'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Maintenance</h2>
          <div className="space-y-4">
            <div>
              <button
                onClick={() => reindexMutation.mutate()}
                disabled={isLoading}
                className="btn btn-secondary w-full disabled:opacity-50"
              >
                {reindexMutation.isPending ? 'Reindexing...' : 'Reindex All Files'}
              </button>
              <p className="text-xs text-gray-500 mt-1">
                Re-reads metadata for all already-indexed files and updates the database
              </p>
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-green-400">{result.indexed}</div>
              <div className="text-gray-400">Indexed</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-yellow-400">{result.skipped}</div>
              <div className="text-gray-400">Skipped</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-red-400">{result.errors}</div>
              <div className="text-gray-400">Errors</div>
            </div>
          </div>
        </div>
      )}

      {indexMutation.isError && (
        <div className="card border-red-500">
          <p className="text-red-400">
            Error: {indexMutation.error?.message || 'Failed to index files'}
          </p>
        </div>
      )}
    </div>
  )
}
