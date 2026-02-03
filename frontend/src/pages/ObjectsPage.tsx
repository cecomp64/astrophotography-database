import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { objectsApi } from '../api/client'
import ObjectCard from '../components/ObjectCard'
import SearchBar from '../components/SearchBar'

export default function ObjectsPage() {
  const [typeFilter, setTypeFilter] = useState('')
  const [constellationFilter, setConstellationFilter] = useState('')
  const [primaryOnly, setPrimaryOnly] = useState(true)

  const { data: objects, isLoading } = useQuery({
    queryKey: ['objects', typeFilter, constellationFilter, primaryOnly],
    queryFn: () =>
      objectsApi.list({
        limit: 100,
        object_type: typeFilter || undefined,
        constellation: constellationFilter || undefined,
        primary_only: primaryOnly,
      }),
  })

  const objectTypes = objects
    ? [...new Set(objects.map((o) => o.object_type).filter(Boolean))]
    : []

  const constellations = objects
    ? [...new Set(objects.map((o) => o.constellation).filter(Boolean))]
    : []

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Astronomical Objects</h1>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
        <div className="w-full sm:w-64">
          <SearchBar placeholder="Search objects..." />
        </div>

        <div className="flex flex-wrap gap-3 sm:gap-4 items-center">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input flex-1 sm:flex-none"
          >
            <option value="">All Types</option>
            {objectTypes.map((type) => (
              <option key={type} value={type!}>
                {type}
              </option>
            ))}
          </select>

          <select
            value={constellationFilter}
            onChange={(e) => setConstellationFilter(e.target.value)}
            className="input flex-1 sm:flex-none"
          >
            <option value="">All Constellations</option>
            {constellations.map((constellation) => (
              <option key={constellation} value={constellation!}>
                {constellation}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={primaryOnly}
              onChange={(e) => setPrimaryOnly(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
            />
            Primary targets only
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading objects...</div>
      ) : objects && objects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {objects.map((obj) => (
            <ObjectCard key={obj.id} object={obj} />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-400 mb-4">No objects found</p>
          <p className="text-sm text-gray-500">
            Index some FITS files to populate the database
          </p>
        </div>
      )}
    </div>
  )
}
