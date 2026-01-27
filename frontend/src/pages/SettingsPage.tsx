import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configApi, SavedLocation, SavedLocationCreate } from '../api/client'

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (US)' },
  { value: 'America/Chicago', label: 'Central Time (US)' },
  { value: 'America/Denver', label: 'Mountain Time (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European Time' },
  { value: 'Europe/Helsinki', label: 'Eastern European Time' },
  { value: 'Europe/Moscow', label: 'Moscow Time' },
  { value: 'Asia/Tokyo', label: 'Japan Time' },
  { value: 'Asia/Shanghai', label: 'China Time' },
  { value: 'Asia/Kolkata', label: 'India Time' },
  { value: 'Australia/Sydney', label: 'Sydney Time' },
  { value: 'Australia/Perth', label: 'Perth Time' },
  { value: 'Pacific/Auckland', label: 'New Zealand Time' },
]

interface LocationFormData {
  name: string
  latitude: string
  longitude: string
  elevation: string
  timezone: string
}

const emptyFormData: LocationFormData = {
  name: '',
  latitude: '',
  longitude: '',
  elevation: '',
  timezone: 'UTC',
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Location form state
  const [showLocationForm, setShowLocationForm] = useState(false)
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [locationForm, setLocationForm] = useState<LocationFormData>(emptyFormData)

  const { data: locationsConfig, isLoading } = useQuery({
    queryKey: ['config', 'locations'],
    queryFn: configApi.getLocations,
  })

  const showMessage = (type: 'success' | 'error', text: string) => {
    setSaveMessage({ type, text })
    setTimeout(() => setSaveMessage(null), 3000)
  }

  const addLocationMutation = useMutation({
    mutationFn: (data: SavedLocationCreate) => configApi.addLocation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'locations'] })
      setShowLocationForm(false)
      setLocationForm(emptyFormData)
      showMessage('success', 'Location added successfully')
    },
    onError: (error: Error) => {
      showMessage('error', error.message || 'Failed to add location')
    },
  })

  const updateLocationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SavedLocationCreate> }) =>
      configApi.updateSavedLocation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'locations'] })
      setEditingLocationId(null)
      setLocationForm(emptyFormData)
      showMessage('success', 'Location updated successfully')
    },
    onError: (error: Error) => {
      showMessage('error', error.message || 'Failed to update location')
    },
  })

  const deleteLocationMutation = useMutation({
    mutationFn: (id: string) => configApi.deleteLocation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'locations'] })
      showMessage('success', 'Location deleted successfully')
    },
    onError: (error: Error) => {
      showMessage('error', error.message || 'Failed to delete location')
    },
  })

  const setActiveMutation = useMutation({
    mutationFn: (id: string) => configApi.setActiveLocation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'locations'] })
      showMessage('success', 'Active location updated')
    },
    onError: (error: Error) => {
      showMessage('error', error.message || 'Failed to set active location')
    },
  })

  const validateLocationForm = (): string | null => {
    if (!locationForm.name.trim()) {
      return 'Name is required'
    }
    const lat = parseFloat(locationForm.latitude)
    const lng = parseFloat(locationForm.longitude)
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return 'Latitude must be between -90 and 90'
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return 'Longitude must be between -180 and 180'
    }
    return null
  }

  const handleSaveLocation = (e: React.FormEvent) => {
    e.preventDefault()
    const error = validateLocationForm()
    if (error) {
      showMessage('error', error)
      return
    }

    const data: SavedLocationCreate = {
      name: locationForm.name.trim(),
      latitude: parseFloat(locationForm.latitude),
      longitude: parseFloat(locationForm.longitude),
      elevation: parseFloat(locationForm.elevation) || 0,
      timezone: locationForm.timezone,
    }

    if (editingLocationId) {
      updateLocationMutation.mutate({ id: editingLocationId, data })
    } else {
      addLocationMutation.mutate(data)
    }
  }

  const handleEditLocation = (location: SavedLocation) => {
    setEditingLocationId(location.id)
    setLocationForm({
      name: location.name,
      latitude: location.latitude.toString(),
      longitude: location.longitude.toString(),
      elevation: location.elevation.toString(),
      timezone: location.timezone,
    })
    setShowLocationForm(true)
  }

  const handleCancelForm = () => {
    setShowLocationForm(false)
    setEditingLocationId(null)
    setLocationForm(emptyFormData)
  }

  const getTimezoneLabel = (tzValue: string): string => {
    const tz = COMMON_TIMEZONES.find(t => t.value === tzValue)
    return tz ? tz.label : tzValue
  }

  const locations = locationsConfig?.locations ?? []
  const activeId = locationsConfig?.active_id

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-400">Configure your astrophotography database</p>
      </div>

      {saveMessage && (
        <div
          className={`p-4 rounded-md ${
            saveMessage.type === 'success'
              ? 'bg-green-900/50 text-green-300 border border-green-700'
              : 'bg-red-900/50 text-red-300 border border-red-700'
          }`}
        >
          {saveMessage.text}
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">Observatory Locations</h2>
            <p className="text-gray-400 text-sm mt-1">
              Save multiple locations and select one as active for altitude charts.
            </p>
          </div>
          {!showLocationForm && (
            <button
              onClick={() => setShowLocationForm(true)}
              className="btn btn-primary"
            >
              Add Location
            </button>
          )}
        </div>

        {isLoading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <>
            {/* Location Form */}
            {showLocationForm && (
              <form onSubmit={handleSaveLocation} className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <h3 className="text-lg font-medium mb-4">
                  {editingLocationId ? 'Edit Location' : 'Add New Location'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={locationForm.name}
                      onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                      placeholder="e.g. Home Observatory"
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Latitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="-90"
                      max="90"
                      value={locationForm.latitude}
                      onChange={(e) => setLocationForm({ ...locationForm, latitude: e.target.value })}
                      placeholder="e.g. 51.4772"
                      className="input w-full"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">-90 to 90</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Longitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="-180"
                      max="180"
                      value={locationForm.longitude}
                      onChange={(e) => setLocationForm({ ...locationForm, longitude: e.target.value })}
                      placeholder="e.g. -0.0005"
                      className="input w-full"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">-180 to 180</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Elevation (m)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="-500"
                      max="9000"
                      value={locationForm.elevation}
                      onChange={(e) => setLocationForm({ ...locationForm, elevation: e.target.value })}
                      placeholder="e.g. 50"
                      className="input w-full"
                    />
                  </div>
                  <div className="md:col-span-2 lg:col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Timezone
                    </label>
                    <select
                      value={locationForm.timezone}
                      onChange={(e) => setLocationForm({ ...locationForm, timezone: e.target.value })}
                      className="input w-full"
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label} ({tz.value})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancelForm}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addLocationMutation.isPending || updateLocationMutation.isPending}
                    className="btn btn-primary"
                  >
                    {addLocationMutation.isPending || updateLocationMutation.isPending
                      ? 'Saving...'
                      : editingLocationId
                      ? 'Update Location'
                      : 'Add Location'}
                  </button>
                </div>
              </form>
            )}

            {/* Locations List */}
            {locations.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No locations saved yet. Add a location to enable altitude charts.
              </p>
            ) : (
              <div className="space-y-2">
                {locations.map((location) => (
                  <div
                    key={location.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      location.id === activeId
                        ? 'bg-blue-900/30 border-blue-600'
                        : 'bg-gray-800/30 border-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setActiveMutation.mutate(location.id)}
                        disabled={setActiveMutation.isPending}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          location.id === activeId
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-gray-500 hover:border-blue-400'
                        }`}
                        title={location.id === activeId ? 'Active location' : 'Set as active'}
                      >
                        {location.id === activeId && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {location.name}
                          {location.id === activeId && (
                            <span className="text-xs px-2 py-0.5 bg-blue-600 rounded text-white">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-400">
                          {location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}°
                          {location.elevation > 0 && ` • ${location.elevation}m`}
                          {' • '}{getTimezoneLabel(location.timezone)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditLocation(location)}
                        className="btn btn-secondary btn-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete location "${location.name}"?`)) {
                            deleteLocationMutation.mutate(location.id)
                          }
                        }}
                        disabled={deleteLocationMutation.isPending}
                        className="btn btn-secondary btn-sm text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
