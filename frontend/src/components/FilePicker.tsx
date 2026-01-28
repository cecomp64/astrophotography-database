import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { filesApi, FileEntry, RootEntry } from '../api/client'

interface FilePickerProps {
  mode: 'file' | 'directory'
  isOpen: boolean
  onSelect: (path: string, displayPath: string) => void
  onCancel: () => void
  initialPath?: string
  fileFilter?: string[]
}

export default function FilePicker({
  mode,
  isOpen,
  onSelect,
  onCancel,
  initialPath,
  fileFilter,
}: FilePickerProps) {
  const [currentPath, setCurrentPath] = useState<string | undefined>(initialPath)
  const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null)

  // Fetch available roots
  const { data: rootsData } = useQuery({
    queryKey: ['files', 'roots'],
    queryFn: () => filesApi.getRoots(),
    enabled: isOpen,
  })

  // Fetch directory contents
  const { data: browseData, isLoading, error } = useQuery({
    queryKey: ['files', 'browse', currentPath],
    queryFn: () => filesApi.browse(currentPath),
    enabled: isOpen && currentPath !== undefined,
  })

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentPath(initialPath)
      setSelectedEntry(null)
    }
  }, [isOpen, initialPath])

  if (!isOpen) return null

  const handleRootSelect = (root: RootEntry) => {
    setCurrentPath(root.path)
    setSelectedEntry(null)
  }

  const handleEntryClick = (entry: FileEntry) => {
    if (entry.type === 'directory') {
      setCurrentPath(entry.path)
      setSelectedEntry(null)
    } else if (mode === 'file') {
      // For file mode, select the file
      setSelectedEntry(entry)
    }
  }

  const handleEntryDoubleClick = (entry: FileEntry) => {
    if (entry.type === 'directory') {
      if (mode === 'directory') {
        // In directory mode, double-click selects the directory
        onSelect(entry.path, entry.display_path)
      } else {
        // Navigate into it
        setCurrentPath(entry.path)
        setSelectedEntry(null)
      }
    } else if (mode === 'file') {
      // In file mode, double-click selects the file
      onSelect(entry.path, entry.display_path)
    }
  }

  const handleGoUp = () => {
    if (browseData?.parent_path) {
      setCurrentPath(browseData.parent_path)
      setSelectedEntry(null)
    }
  }

  const handleSelect = () => {
    if (mode === 'directory' && browseData) {
      onSelect(browseData.current_path, browseData.current_display_path)
    } else if (mode === 'file' && selectedEntry) {
      onSelect(selectedEntry.path, selectedEntry.display_path)
    }
  }

  const filterEntries = (entries: FileEntry[]) => {
    if (mode === 'file' && fileFilter && fileFilter.length > 0) {
      return entries.filter(entry => {
        if (entry.type === 'directory') return true
        return fileFilter.some(ext => entry.name.toLowerCase().endsWith(ext.toLowerCase()))
      })
    }
    return entries
  }

  const formatSize = (size: number | null) => {
    if (size === null) return ''
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
    return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
  }

  const canSelect = mode === 'directory' ? !!browseData : !!selectedEntry

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-space-800 border border-space-600 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-space-600">
          <h2 className="text-lg font-semibold">
            {mode === 'directory' ? 'Select Directory' : 'Select File'}
          </h2>
          {browseData && (
            <p className="text-sm text-gray-400 mt-1 truncate" title={browseData.current_display_path}>
              {browseData.current_display_path}
            </p>
          )}
        </div>

        {/* Navigation bar */}
        <div className="px-4 py-2 border-b border-space-600 flex items-center gap-2">
          <button
            onClick={handleGoUp}
            disabled={!browseData?.parent_path}
            className="btn btn-secondary p-2 disabled:opacity-50"
            title="Go up"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
          <button
            onClick={() => setCurrentPath(undefined)}
            className="btn btn-secondary text-sm"
            title="Go to roots"
          >
            Home
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {!currentPath && rootsData ? (
            // Show roots
            <div className="space-y-2">
              <p className="text-sm text-gray-400 mb-3">Select a starting location:</p>
              {rootsData.roots.map((root) => (
                <button
                  key={root.path}
                  onClick={() => handleRootSelect(root)}
                  className="w-full flex items-center gap-3 p-3 rounded hover:bg-space-700 transition-colors text-left"
                >
                  <span className="text-2xl">
                    {root.icon === 'users' && '👥'}
                    {root.icon === 'home' && '🏠'}
                    {root.icon === 'hard-drive' && '💾'}
                    {root.icon === 'folder' && '📁'}
                  </span>
                  <div>
                    <div className="font-medium">{root.name}</div>
                    <div className="text-sm text-gray-400">{root.display_path}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : error ? (
            <div className="text-red-400 p-4">
              Failed to load directory contents. Please try again.
            </div>
          ) : browseData ? (
            <div className="space-y-1">
              {filterEntries(browseData.entries).length === 0 ? (
                <p className="text-gray-400 text-center py-8">This directory is empty</p>
              ) : (
                filterEntries(browseData.entries).map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => handleEntryClick(entry)}
                    onDoubleClick={() => handleEntryDoubleClick(entry)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-colors text-left ${
                      selectedEntry?.path === entry.path
                        ? 'bg-blue-600/30 border border-blue-500'
                        : 'hover:bg-space-700'
                    }`}
                  >
                    <span className="text-lg flex-shrink-0">
                      {entry.type === 'directory' ? '📁' : '📄'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{entry.name}</div>
                    </div>
                    {entry.type === 'file' && entry.size !== null && (
                      <div className="text-sm text-gray-400 flex-shrink-0">
                        {formatSize(entry.size)}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-space-600 flex justify-between items-center">
          <div className="text-sm text-gray-400">
            {mode === 'directory' ? (
              'Select current directory or navigate into subdirectories'
            ) : selectedEntry ? (
              `Selected: ${selectedEntry.name}`
            ) : (
              'Click to select a file, double-click to open'
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleSelect}
              disabled={!canSelect}
              className="btn btn-primary disabled:opacity-50"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
