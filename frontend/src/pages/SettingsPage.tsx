import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configApi, LocationConfig, TimezoneConfig } from '../api/client'

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

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [elevation, setElevation] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data: location, isLoading: locationLoading } = useQuery({
    queryKey: ['config', 'location'],
    queryFn: configApi.getLocation,
  })

  const { data: timezoneConfig, isLoading: timezoneLoading } = useQuery({
    queryKey: ['config', 'timezone'],
    queryFn: configApi.getTimezone,
  })

  useEffect(() => {
    if (location) {
      setLatitude(location.latitude.toString())
      setLongitude(location.longitude.toString())
      setElevation(location.elevation.toString())
    }
  }, [location])

  useEffect(() => {
    if (timezoneConfig) {
      setTimezone(timezoneConfig.timezone)
    }
  }, [timezoneConfig])

  const locationMutation = useMutation({
    mutationFn: (data: LocationConfig) => configApi.setLocation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'location'] })
      setSaveMessage({ type: 'success', text: 'Location saved successfully' })
      setTimeout(() => setSaveMessage(null), 3000)
    },
    onError: (error: Error) => {
      setSaveMessage({ type: 'error', text: error.message || 'Failed to save location' })
      setTimeout(() => setSaveMessage(null), 5000)
    },
  })

  const timezoneMutation = useMutation({
    mutationFn: (data: TimezoneConfig) => configApi.setTimezone(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'timezone'] })
      setSaveMessage({ type: 'success', text: 'Timezone saved successfully' })
      setTimeout(() => setSaveMessage(null), 3000)
    },
    onError: (error: Error) => {
      setSaveMessage({ type: 'error', text: error.message || 'Failed to save timezone' })
      setTimeout(() => setSaveMessage(null), 5000)
    },
  })

  const handleSaveLocation = (e: React.FormEvent) => {
    e.preventDefault()
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    const elev = parseFloat(elevation) || 0

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setSaveMessage({ type: 'error', text: 'Latitude must be between -90 and 90' })
      return
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setSaveMessage({ type: 'error', text: 'Longitude must be between -180 and 180' })
      return
    }

    locationMutation.mutate({ latitude: lat, longitude: lng, elevation: elev })
  }

  const handleSaveTimezone = (e: React.FormEvent) => {
    e.preventDefault()
    timezoneMutation.mutate({ timezone })
  }

  const isLoading = locationLoading || timezoneLoading

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
        <h2 className="text-xl font-semibold mb-4">Observatory Location</h2>
        <p className="text-gray-400 text-sm mb-6">
          Set your observatory location for accurate altitude/azimuth calculations and object visibility.
        </p>

        {isLoading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <form onSubmit={handleSaveLocation} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="e.g. 51.4772"
                  className="input w-full"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">-90 to 90 degrees</p>
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
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="e.g. -0.0005"
                  className="input w-full"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">-180 to 180 degrees</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Elevation
                </label>
                <input
                  type="number"
                  step="any"
                  min="-500"
                  max="9000"
                  value={elevation}
                  onChange={(e) => setElevation(e.target.value)}
                  placeholder="e.g. 50"
                  className="input w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Meters above sea level</p>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={locationMutation.isPending}
                className="btn btn-primary"
              >
                {locationMutation.isPending ? 'Saving...' : 'Save Location'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Timezone</h2>
        <p className="text-gray-400 text-sm mb-6">
          Set your local timezone for displaying times in altitude charts and other calculations.
        </p>

        {isLoading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <form onSubmit={handleSaveTimezone} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="input w-full max-w-md"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label} ({tz.value})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Select your local timezone for accurate time displays
              </p>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={timezoneMutation.isPending}
                className="btn btn-primary"
              >
                {timezoneMutation.isPending ? 'Saving...' : 'Save Timezone'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
