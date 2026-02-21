import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { objectsApi, AstroObject } from '../api/client'
import { parseRA, parseDec, formatRA, formatDec } from '../utils/coordinates'

interface CreateObjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (objectId: number) => void
}

const OBJECT_TYPES = [
  'Galaxy',
  'Nebula',
  'Open Cluster',
  'Globular Cluster',
  'Planetary Nebula',
  'Dark Nebula',
  'Emission Nebula',
  'Reflection Nebula',
  'Supernova Remnant',
  'Star',
  'Double Star',
  'Asterism',
  'Other',
]

const CONSTELLATIONS = [
  'And', 'Ant', 'Aps', 'Aqr', 'Aql', 'Ara', 'Ari', 'Aur', 'Boo', 'Cae',
  'Cam', 'Cnc', 'CVn', 'CMa', 'CMi', 'Cap', 'Car', 'Cas', 'Cen', 'Cep',
  'Cet', 'Cha', 'Cir', 'Col', 'Com', 'CrA', 'CrB', 'Crv', 'Crt', 'Cru',
  'Cyg', 'Del', 'Dor', 'Dra', 'Equ', 'Eri', 'For', 'Gem', 'Gru', 'Her',
  'Hor', 'Hya', 'Hyi', 'Ind', 'Lac', 'Leo', 'LMi', 'Lep', 'Lib', 'Lup',
  'Lyn', 'Lyr', 'Men', 'Mic', 'Mon', 'Mus', 'Nor', 'Oct', 'Oph', 'Ori',
  'Pav', 'Peg', 'Per', 'Phe', 'Pic', 'Psc', 'PsA', 'Pup', 'Pyx', 'Ret',
  'Sge', 'Sgr', 'Sco', 'Scl', 'Sct', 'Ser', 'Sex', 'Tau', 'Tel', 'Tri',
  'TrA', 'Tuc', 'UMa', 'UMi', 'Vel', 'Vir', 'Vol', 'Vul',
]

export default function CreateObjectModal({ isOpen, onClose, onSuccess }: CreateObjectModalProps) {
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    primary_name: '',
    ra: '',
    dec: '',
    object_type: '',
    magnitude: '',
    size_major: '',
    size_minor: '',
    constellation: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [debouncedName, setDebouncedName] = useState('')

  // Debounce the name search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedName(formData.primary_name.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [formData.primary_name])

  // Search for similar objects
  const { data: similarObjects, isFetching: isSearching } = useQuery({
    queryKey: ['objectSearch', debouncedName],
    queryFn: () => objectsApi.search(debouncedName, 5),
    enabled: debouncedName.length >= 2,
    staleTime: 30000,
  })

  // Check for exact match (case-insensitive)
  const hasExactMatch = similarObjects?.some(
    (obj: AstroObject) =>
      obj.primary_name.toLowerCase() === formData.primary_name.trim().toLowerCase() ||
      obj.aliases?.some((a) => a.alias_name.toLowerCase() === formData.primary_name.trim().toLowerCase())
  )

  const createMutation = useMutation({
    mutationFn: async (data: {
      primary_name: string
      ra: number
      dec: number
      object_type?: string | null
      magnitude?: number | null
      size_major?: number | null
      size_minor?: number | null
      constellation?: string | null
    }) => {
      return objectsApi.create(data)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['objects'] })
      queryClient.invalidateQueries({ queryKey: ['wellPlacedObjects'] })
      queryClient.invalidateQueries({ queryKey: ['catalogue'] })
      queryClient.invalidateQueries({ queryKey: ['catalogueWellPlaced'] })
      resetForm()
      onClose()
      if (onSuccess) {
        onSuccess(data.id)
      }
    },
  })

  const resetForm = () => {
    setFormData({
      primary_name: '',
      ra: '',
      dec: '',
      object_type: '',
      magnitude: '',
      size_major: '',
      size_minor: '',
      constellation: '',
    })
    setErrors({})
    setDebouncedName('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.primary_name.trim()) {
      newErrors.primary_name = 'Name is required'
    } else if (hasExactMatch) {
      newErrors.primary_name = 'An object with this name already exists'
    }

    const ra = parseRA(formData.ra)
    if (formData.ra.trim() && ra === null) {
      newErrors.ra = 'Invalid RA format. Use degrees (0-360) or hh:mm:ss'
    } else if (!formData.ra.trim()) {
      newErrors.ra = 'RA is required'
    }

    const dec = parseDec(formData.dec)
    if (formData.dec.trim() && dec === null) {
      newErrors.dec = 'Invalid Dec format. Use degrees (-90 to +90) or ±dd:mm:ss'
    } else if (!formData.dec.trim()) {
      newErrors.dec = 'Dec is required'
    }

    if (formData.magnitude && isNaN(parseFloat(formData.magnitude))) {
      newErrors.magnitude = 'Must be a number'
    }

    if (formData.size_major && isNaN(parseFloat(formData.size_major))) {
      newErrors.size_major = 'Must be a number'
    }

    if (formData.size_minor && isNaN(parseFloat(formData.size_minor))) {
      newErrors.size_minor = 'Must be a number'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    const ra = parseRA(formData.ra)!
    const dec = parseDec(formData.dec)!

    createMutation.mutate({
      primary_name: formData.primary_name.trim(),
      ra,
      dec,
      object_type: formData.object_type || null,
      magnitude: formData.magnitude ? parseFloat(formData.magnitude) : null,
      size_major: formData.size_major ? parseFloat(formData.size_major) : null,
      size_minor: formData.size_minor ? parseFloat(formData.size_minor) : null,
      constellation: formData.constellation || null,
    })
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  // Show parsed coordinates as preview
  const parsedRA = parseRA(formData.ra)
  const parsedDec = parseDec(formData.dec)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-space-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Create New Object</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white text-2xl leading-none"
            >
              &times;
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.primary_name}
                onChange={(e) => handleInputChange('primary_name', e.target.value)}
                placeholder="e.g., NGC 7000, M42, Orion Nebula"
                className={`input w-full ${errors.primary_name ? 'border-red-500' : hasExactMatch ? 'border-yellow-500' : ''}`}
              />
              {errors.primary_name && (
                <p className="text-red-500 text-sm mt-1">{errors.primary_name}</p>
              )}

              {/* Similar objects display */}
              {formData.primary_name.trim().length >= 2 && (
                <div className="mt-2">
                  {isSearching ? (
                    <p className="text-gray-500 text-sm">Searching...</p>
                  ) : similarObjects && similarObjects.length > 0 ? (
                    <div className="bg-space-700 rounded border border-space-600 p-2">
                      <p className="text-xs text-gray-400 mb-2">
                        {hasExactMatch ? (
                          <span className="text-yellow-500">Object already exists:</span>
                        ) : (
                          'Similar objects found:'
                        )}
                      </p>
                      <ul className="space-y-1">
                        {similarObjects.map((obj: AstroObject) => {
                          const isExact =
                            obj.primary_name.toLowerCase() === formData.primary_name.trim().toLowerCase() ||
                            obj.aliases?.some((a) => a.alias_name.toLowerCase() === formData.primary_name.trim().toLowerCase())
                          return (
                            <li
                              key={obj.id}
                              className={`text-sm flex items-center justify-between ${isExact ? 'text-yellow-400' : 'text-gray-300'}`}
                            >
                              <span>
                                <Link
                                  to={`/objects/${obj.id}`}
                                  className="hover:text-blue-400 underline"
                                  onClick={handleClose}
                                >
                                  {obj.primary_name}
                                </Link>
                                {obj.aliases && obj.aliases.length > 0 && (
                                  <span className="text-gray-500 text-xs ml-2">
                                    ({obj.aliases.slice(0, 3).map((a) => a.alias_name).join(', ')}
                                    {obj.aliases.length > 3 && '...'})
                                  </span>
                                )}
                              </span>
                              {obj.object_type && (
                                <span className="text-xs text-gray-500 ml-2">{obj.object_type}</span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : debouncedName.length >= 2 ? (
                    <p className="text-green-500 text-sm">No similar objects found</p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Right Ascension <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.ra}
                  onChange={(e) => handleInputChange('ra', e.target.value)}
                  placeholder="e.g., 83.82 or 05:35:17"
                  className={`input w-full ${errors.ra ? 'border-red-500' : ''}`}
                />
                {errors.ra ? (
                  <p className="text-red-500 text-sm mt-1">{errors.ra}</p>
                ) : parsedRA !== null ? (
                  <p className="text-green-500 text-sm mt-1">{formatRA(parsedRA)}</p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Declination <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.dec}
                  onChange={(e) => handleInputChange('dec', e.target.value)}
                  placeholder="e.g., -5.39 or -05:23:28"
                  className={`input w-full ${errors.dec ? 'border-red-500' : ''}`}
                />
                {errors.dec ? (
                  <p className="text-red-500 text-sm mt-1">{errors.dec}</p>
                ) : parsedDec !== null ? (
                  <p className="text-green-500 text-sm mt-1">{formatDec(parsedDec)}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Object Type
                </label>
                <select
                  value={formData.object_type}
                  onChange={(e) => handleInputChange('object_type', e.target.value)}
                  className="input w-full"
                >
                  <option value="">Select type...</option>
                  {OBJECT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Constellation
                </label>
                <select
                  value={formData.constellation}
                  onChange={(e) => handleInputChange('constellation', e.target.value)}
                  className="input w-full"
                >
                  <option value="">Select...</option>
                  {CONSTELLATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Magnitude
              </label>
              <input
                type="text"
                value={formData.magnitude}
                onChange={(e) => handleInputChange('magnitude', e.target.value)}
                placeholder="e.g., 8.5"
                className={`input w-full ${errors.magnitude ? 'border-red-500' : ''}`}
              />
              {errors.magnitude && (
                <p className="text-red-500 text-sm mt-1">{errors.magnitude}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Size Major (arcmin)
                </label>
                <input
                  type="text"
                  value={formData.size_major}
                  onChange={(e) => handleInputChange('size_major', e.target.value)}
                  placeholder="e.g., 120"
                  className={`input w-full ${errors.size_major ? 'border-red-500' : ''}`}
                />
                {errors.size_major && (
                  <p className="text-red-500 text-sm mt-1">{errors.size_major}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Size Minor (arcmin)
                </label>
                <input
                  type="text"
                  value={formData.size_minor}
                  onChange={(e) => handleInputChange('size_minor', e.target.value)}
                  placeholder="e.g., 60"
                  className={`input w-full ${errors.size_minor ? 'border-red-500' : ''}`}
                />
                {errors.size_minor && (
                  <p className="text-red-500 text-sm mt-1">{errors.size_minor}</p>
                )}
              </div>
            </div>

            {createMutation.error && (
              <div className="bg-red-900/50 border border-red-500 rounded p-3 text-red-200 text-sm">
                Failed to create object. Please try again.
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn btn-primary"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Object'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
