import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { indexerApi, IndexResult, CatalogueDownloadResult, CatalogueStats, API_BASE_URL } from '../api/client'
import ProgressBar from '../components/ProgressBar'

interface ProgressState {
  status: 'idle' | 'running' | 'completed' | 'error'
  percent: number
  message: string
  current?: number
  total?: number
  indexed?: number
  skipped?: number
  errors?: number
  currentFile?: string
  currentCatalog?: string
}

const initialProgress: ProgressState = {
  status: 'idle',
  percent: 0,
  message: '',
}

export default function IndexerPage() {
  const [directory, setDirectory] = useState('')
  const [recursive, setRecursive] = useState(true)
  const [detectFov, setDetectFov] = useState(true)
  const [result, setResult] = useState<IndexResult | null>(null)
  const [catalogueResult, setCatalogueResult] = useState<CatalogueDownloadResult | null>(null)
  const [selectedCatalogues, setSelectedCatalogues] = useState({
    openngc: true,
    ldn: true,
    lbn: true,
  })
  const [indexProgress, setIndexProgress] = useState<ProgressState>(initialProgress)
  const [catalogueProgress, setCatalogueProgress] = useState<ProgressState>(initialProgress)
  const queryClient = useQueryClient()

  // Fetch current catalogue stats
  const { data: catalogueStats } = useQuery<CatalogueStats>({
    queryKey: ['catalogueStats'],
    queryFn: indexerApi.getCatalogueStats,
  })

  const reindexMutation = useMutation({
    mutationFn: indexerApi.reindex,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] })
      queryClient.invalidateQueries({ queryKey: ['objects'] })
    },
  })

  const detectFovMutation = useMutation({
    mutationFn: () => indexerApi.detectFovObjects(undefined, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] })
    },
  })

  const handleIndex = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!directory) return

    setResult(null)
    setIndexProgress({
      status: 'running',
      percent: 0,
      message: 'Scanning directory...',
    })

    // Build URL with query params
    const params = new URLSearchParams({
      detect_fov: String(detectFov),
    })
    const url = `${API_BASE_URL}/indexer/directory/stream?${params}`

    // Use fetch with POST for SSE since EventSource only supports GET
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ directory, recursive }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              handleIndexProgress(data)
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      setIndexProgress({
        status: 'error',
        percent: 0,
        message: error instanceof Error ? error.message : 'Connection error',
      })
    }
  }

  const handleIndexProgress = (data: Record<string, unknown>) => {
    const status = data.status as string

    if (status === 'started') {
      setIndexProgress({
        status: 'running',
        percent: 0,
        message: data.message as string,
        total: data.total as number,
        current: 0,
      })
    } else if (status === 'indexing') {
      setIndexProgress({
        status: 'running',
        percent: data.percent as number,
        message: `Processing: ${data.current_file}`,
        current: data.current as number,
        total: data.total as number,
        indexed: data.indexed as number,
        skipped: data.skipped as number,
        errors: data.errors as number,
        currentFile: data.current_file as string,
      })
    } else if (status === 'completed') {
      setIndexProgress({
        status: 'completed',
        percent: 100,
        message: 'Indexing complete!',
        indexed: data.indexed as number,
        skipped: data.skipped as number,
        errors: data.errors as number,
      })
      setResult({
        status: 'completed',
        indexed: data.indexed as number,
        skipped: data.skipped as number,
        errors: data.errors as number,
        directory: data.directory as string,
        detect_fov_enabled: data.detect_fov_enabled as boolean,
      })
      queryClient.invalidateQueries({ queryKey: ['images'] })
      queryClient.invalidateQueries({ queryKey: ['objects'] })
      queryClient.invalidateQueries({ queryKey: ['imageStats'] })
    } else if (status === 'error') {
      setIndexProgress({
        status: 'error',
        percent: 0,
        message: data.message as string,
      })
    }
  }

  const handleDownloadCatalogues = async () => {
    const catalogues = Object.entries(selectedCatalogues)
      .filter(([, selected]) => selected)
      .map(([name]) => name)

    if (catalogues.length === 0) return

    setCatalogueResult(null)
    setCatalogueProgress({
      status: 'running',
      percent: 0,
      message: 'Preparing download...',
    })

    const params = new URLSearchParams()
    catalogues.forEach(c => params.append('catalogs', c))
    const url = `${API_BASE_URL}/indexer/download-catalogues/stream?${params}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              handleCatalogueProgress(data)
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      setCatalogueProgress({
        status: 'error',
        percent: 0,
        message: error instanceof Error ? error.message : 'Connection error',
      })
    }
  }

  const handleCatalogueProgress = (data: Record<string, unknown>) => {
    const status = data.status as string

    if (status === 'started') {
      setCatalogueProgress({
        status: 'running',
        percent: 0,
        message: data.message as string,
        total: data.total as number,
        current: 0,
      })
    } else if (status === 'downloading' || status === 'importing') {
      setCatalogueProgress({
        status: 'running',
        percent: data.percent as number,
        message: data.message as string,
        current: data.current as number,
        total: data.total as number,
        currentCatalog: data.current_catalog as string,
      })
    } else if (status === 'completed') {
      setCatalogueProgress({
        status: 'completed',
        percent: 100,
        message: 'Catalogue download complete!',
      })
      setCatalogueResult({
        status: 'completed',
        catalogues: data.catalogues as CatalogueDownloadResult['catalogues'],
        errors: data.errors as string[],
        stats: data.stats as CatalogueStats,
      })
      queryClient.invalidateQueries({ queryKey: ['catalogueStats'] })
    } else if (status === 'error') {
      setCatalogueProgress(prev => ({
        ...prev,
        status: data.phase === 'importing' ? 'running' : 'error',
        message: data.message as string,
      }))
    }
  }

  const isLoading = indexProgress.status === 'running' ||
                    catalogueProgress.status === 'running' ||
                    reindexMutation.isPending ||
                    detectFovMutation.isPending

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

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={detectFov}
                onChange={(e) => setDetectFov(e.target.checked)}
                disabled={isLoading}
                className="rounded bg-space-700 border-space-600"
              />
              <span className="text-sm text-gray-300">Detect objects in field of view</span>
            </label>

            <button
              type="submit"
              disabled={isLoading || !directory}
              className="btn btn-primary w-full disabled:opacity-50"
            >
              {indexProgress.status === 'running' ? 'Indexing...' : 'Index Directory'}
            </button>
          </form>

          {indexProgress.status !== 'idle' && (
            <div className="mt-4">
              <ProgressBar
                percent={indexProgress.percent}
                message={indexProgress.message}
                status={indexProgress.status}
                details={{
                  current: indexProgress.current,
                  total: indexProgress.total,
                  indexed: indexProgress.indexed,
                  skipped: indexProgress.skipped,
                  errors: indexProgress.errors,
                }}
              />
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Object Catalogues</h2>
          <p className="text-sm text-gray-400 mb-4">
            Download astronomical catalogues to identify objects within your images' field of view.
          </p>

          {catalogueStats && (
            <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">NGC:</span>
                <span className="text-gray-200">{catalogueStats.NGC.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">IC:</span>
                <span className="text-gray-200">{catalogueStats.IC.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">LDN:</span>
                <span className="text-gray-200">{catalogueStats.LDN.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">LBN:</span>
                <span className="text-gray-200">{catalogueStats.LBN.toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="space-y-2 mb-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedCatalogues.openngc}
                onChange={(e) => setSelectedCatalogues(prev => ({ ...prev, openngc: e.target.checked }))}
                disabled={isLoading}
                className="rounded bg-space-700 border-space-600"
              />
              <span className="text-sm text-gray-300">OpenNGC (NGC + IC objects)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedCatalogues.ldn}
                onChange={(e) => setSelectedCatalogues(prev => ({ ...prev, ldn: e.target.checked }))}
                disabled={isLoading}
                className="rounded bg-space-700 border-space-600"
              />
              <span className="text-sm text-gray-300">LDN (Lynds Dark Nebulae)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedCatalogues.lbn}
                onChange={(e) => setSelectedCatalogues(prev => ({ ...prev, lbn: e.target.checked }))}
                disabled={isLoading}
                className="rounded bg-space-700 border-space-600"
              />
              <span className="text-sm text-gray-300">LBN (Lynds Bright Nebulae)</span>
            </label>
          </div>

          <button
            onClick={handleDownloadCatalogues}
            disabled={isLoading || !Object.values(selectedCatalogues).some(v => v)}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {catalogueProgress.status === 'running' ? 'Downloading...' : 'Download Catalogues'}
          </button>
          <p className="text-xs text-gray-500 mt-1">
            Downloads catalogue data from GitHub and VizieR
          </p>

          {catalogueProgress.status !== 'idle' && (
            <div className="mt-4">
              <ProgressBar
                percent={catalogueProgress.percent}
                message={catalogueProgress.message}
                status={catalogueProgress.status}
              />
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Maintenance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <button
              onClick={() => reindexMutation.mutate()}
              disabled={isLoading}
              className="btn btn-secondary w-full disabled:opacity-50"
            >
              {reindexMutation.isPending ? 'Reindexing...' : 'Reindex All Files'}
            </button>
            <p className="text-xs text-gray-500 mt-1">
              Re-reads metadata for all already-indexed files
            </p>
          </div>
          <div>
            <button
              onClick={() => detectFovMutation.mutate()}
              disabled={isLoading}
              className="btn btn-secondary w-full disabled:opacity-50"
            >
              {detectFovMutation.isPending ? 'Detecting...' : 'Detect FOV Objects'}
            </button>
            <p className="text-xs text-gray-500 mt-1">
              Find catalogue objects within each image's field of view
            </p>
          </div>
        </div>
      </div>

      {result && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Indexing Results</h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-green-400">{result.indexed}</div>
              <div className="text-gray-400 text-sm sm:text-base">Indexed</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-yellow-400">{result.skipped}</div>
              <div className="text-gray-400 text-sm sm:text-base">Skipped</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-red-400">{result.errors}</div>
              <div className="text-gray-400 text-sm sm:text-base">Errors</div>
            </div>
          </div>
        </div>
      )}

      {catalogueResult && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Catalogue Download Results</h2>
          <div className="space-y-3">
            {catalogueResult.catalogues.openngc && (
              <div className="flex justify-between items-center">
                <span className="text-gray-300">OpenNGC (NGC + IC)</span>
                <span className="text-green-400">{catalogueResult.catalogues.openngc.imported.toLocaleString()} imported</span>
              </div>
            )}
            {catalogueResult.catalogues.ldn && (
              <div className="flex justify-between items-center">
                <span className="text-gray-300">LDN</span>
                <span className="text-green-400">{catalogueResult.catalogues.ldn.imported.toLocaleString()} imported</span>
              </div>
            )}
            {catalogueResult.catalogues.lbn && (
              <div className="flex justify-between items-center">
                <span className="text-gray-300">LBN</span>
                <span className="text-green-400">{catalogueResult.catalogues.lbn.imported.toLocaleString()} imported</span>
              </div>
            )}
            {catalogueResult.stats && (
              <div className="border-t border-space-600 pt-3 mt-3">
                <div className="flex justify-between items-center font-semibold">
                  <span className="text-gray-200">Total Objects</span>
                  <span className="text-blue-400">{catalogueResult.stats.total_objects.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm mt-1">
                  <span className="text-gray-400">Total Aliases</span>
                  <span className="text-gray-300">{catalogueResult.stats.total_aliases.toLocaleString()}</span>
                </div>
              </div>
            )}
            {catalogueResult.errors.length > 0 && (
              <div className="text-red-400 text-sm mt-2">
                Errors: {catalogueResult.errors.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {(indexProgress.status === 'error' || catalogueProgress.status === 'error' || detectFovMutation.isError) && (
        <div className="card border-red-500">
          <p className="text-red-400">
            Error: {indexProgress.status === 'error' ? indexProgress.message :
                   catalogueProgress.status === 'error' ? catalogueProgress.message :
                   detectFovMutation.error?.message || 'An error occurred'}
          </p>
        </div>
      )}
    </div>
  )
}
