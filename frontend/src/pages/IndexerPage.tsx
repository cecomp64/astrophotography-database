import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { indexerApi, IndexResult, CatalogueDownloadResult, CatalogueStats } from '../api/client'

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
  const queryClient = useQueryClient()

  // Fetch current catalogue stats
  const { data: catalogueStats } = useQuery<CatalogueStats>({
    queryKey: ['catalogueStats'],
    queryFn: indexerApi.getCatalogueStats,
  })

  const indexMutation = useMutation({
    mutationFn: ({ dir, rec, fov }: { dir: string; rec: boolean; fov: boolean }) =>
      indexerApi.indexDirectory(dir, rec, fov),
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

  const catalogueMutation = useMutation({
    mutationFn: (catalogues: string[]) => indexerApi.downloadCatalogues(catalogues),
    onSuccess: (data) => {
      setCatalogueResult(data)
      queryClient.invalidateQueries({ queryKey: ['catalogueStats'] })
    },
  })

  const detectFovMutation = useMutation({
    mutationFn: () => indexerApi.detectFovObjects(undefined, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] })
    },
  })

  const handleIndex = (e: React.FormEvent) => {
    e.preventDefault()
    if (directory) {
      indexMutation.mutate({ dir: directory, rec: recursive, fov: detectFov })
    }
  }

  const handleDownloadCatalogues = () => {
    const catalogues = Object.entries(selectedCatalogues)
      .filter(([, selected]) => selected)
      .map(([name]) => name)
    if (catalogues.length > 0) {
      catalogueMutation.mutate(catalogues)
    }
  }

  const isLoading = indexMutation.isPending || reindexMutation.isPending || catalogueMutation.isPending || detectFovMutation.isPending

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
              {indexMutation.isPending ? 'Indexing...' : 'Index Directory'}
            </button>
          </form>
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
            {catalogueMutation.isPending ? 'Downloading...' : 'Download Catalogues'}
          </button>
          <p className="text-xs text-gray-500 mt-1">
            Downloads catalogue data from GitHub and VizieR
          </p>
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

      {(indexMutation.isError || catalogueMutation.isError || detectFovMutation.isError) && (
        <div className="card border-red-500">
          <p className="text-red-400">
            Error: {indexMutation.error?.message || catalogueMutation.error?.message || detectFovMutation.error?.message || 'An error occurred'}
          </p>
        </div>
      )}
    </div>
  )
}
