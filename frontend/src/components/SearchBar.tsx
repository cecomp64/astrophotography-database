import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { objectsApi, AstroObject } from '../api/client'

interface SearchBarProps {
  placeholder?: string
  onSelect?: (object: AstroObject) => void
}

export default function SearchBar({ placeholder = 'Search objects...', onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: () => objectsApi.search(query),
    enabled: query.length >= 2,
  })

  useEffect(() => {
    setIsOpen(query.length >= 2 && (results?.length ?? 0) > 0)
  }, [query, results])

  const handleSelect = (obj: AstroObject) => {
    setQuery('')
    setIsOpen(false)
    onSelect?.(obj)
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="input w-full"
        onFocus={() => query.length >= 2 && setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
      />

      {isLoading && query.length >= 2 && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      )}

      {isOpen && results && results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-space-800 border border-space-600 rounded-md shadow-lg max-h-60 overflow-auto">
          {results.map((obj) => (
            <div key={obj.id}>
              {onSelect ? (
                <button
                  onClick={() => handleSelect(obj)}
                  className="w-full px-4 py-2 text-left hover:bg-space-700 transition-colors"
                >
                  <div className="font-medium">{obj.primary_name}</div>
                  <div className="text-sm text-gray-400">
                    {obj.object_type} {obj.constellation && `in ${obj.constellation}`}
                  </div>
                </button>
              ) : (
                <Link
                  to={`/objects/${obj.id}`}
                  className="block px-4 py-2 hover:bg-space-700 transition-colors"
                >
                  <div className="font-medium">{obj.primary_name}</div>
                  <div className="text-sm text-gray-400">
                    {obj.object_type} {obj.constellation && `in ${obj.constellation}`}
                  </div>
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
