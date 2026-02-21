/**
 * Format Right Ascension from degrees to hh:mm:ss.s format
 * @param degrees - RA value in degrees (0-360)
 * @returns Formatted string like "05:55:10.3"
 */
export function formatRA(degrees: number | null): string {
  if (degrees === null) return '-'

  const hours = degrees / 15
  const h = Math.floor(hours)
  const m = Math.floor((hours - h) * 60)
  const s = ((hours - h) * 60 - m) * 60

  const hStr = h.toString().padStart(2, '0')
  const mStr = m.toString().padStart(2, '0')
  const sStr = s.toFixed(1).padStart(4, '0')

  return `${hStr}:${mStr}:${sStr}`
}

/**
 * Format Declination from degrees to ±dd° mm' ss.s" format
 * @param degrees - Dec value in degrees (-90 to +90)
 * @returns Formatted string like "+07° 24' 25.3""
 */
export function formatDec(degrees: number | null): string {
  if (degrees === null) return '-'

  const sign = degrees >= 0 ? '+' : '-'
  const absVal = Math.abs(degrees)
  const d = Math.floor(absVal)
  const m = Math.floor((absVal - d) * 60)
  const s = ((absVal - d) * 60 - m) * 60

  const dStr = d.toString().padStart(2, '0')
  const mStr = m.toString().padStart(2, '0')
  const sStr = s.toFixed(1).padStart(4, '0')

  return `${sign}${dStr}° ${mStr}' ${sStr}"`
}

/**
 * Parse Right Ascension from various formats to degrees
 * Accepts: decimal degrees, decimal hours, or hh:mm:ss / hh mm ss format
 * @param input - RA string in various formats
 * @returns RA in degrees (0-360) or null if invalid
 */
export function parseRA(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Try parsing as HMS format (hh:mm:ss, hh mm ss, hh:mm:ss.s, etc.)
  const hmsMatch = trimmed.match(/^(\d{1,2})[\s:hH]+(\d{1,2})[\s:mM']+(\d{1,2}(?:\.\d+)?)[\s:sS"]*$/)
  if (hmsMatch) {
    const h = parseFloat(hmsMatch[1])
    const m = parseFloat(hmsMatch[2])
    const s = parseFloat(hmsMatch[3])
    if (h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60) {
      return (h + m / 60 + s / 3600) * 15
    }
    return null
  }

  // Try parsing as decimal with 'h' suffix (hours)
  const hoursMatch = trimmed.match(/^(\d+\.?\d*)h?$/i)
  if (hoursMatch && trimmed.toLowerCase().endsWith('h')) {
    const hours = parseFloat(hoursMatch[1])
    if (hours >= 0 && hours < 24) {
      return hours * 15
    }
    return null
  }

  // Try parsing as plain decimal (assume degrees if >= 24, otherwise prompt ambiguity)
  const decimal = parseFloat(trimmed)
  if (!isNaN(decimal)) {
    // If value is >= 24, it must be degrees
    if (decimal >= 24 && decimal <= 360) {
      return decimal
    }
    // If value is < 24, assume it's degrees (user should use 'h' suffix for hours)
    if (decimal >= 0 && decimal < 360) {
      return decimal
    }
  }

  return null
}

/**
 * Parse Declination from various formats to degrees
 * Accepts: decimal degrees or ±dd:mm:ss / dd mm ss format
 * @param input - Dec string in various formats
 * @returns Dec in degrees (-90 to +90) or null if invalid
 */
export function parseDec(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Try parsing as DMS format (±dd:mm:ss, dd mm ss, dd°mm'ss", etc.)
  const dmsMatch = trimmed.match(/^([+-]?)(\d{1,2})[\s:°dD]+(\d{1,2})[\s:'mM]+(\d{1,2}(?:\.\d+)?)[\s:"sS]*$/)
  if (dmsMatch) {
    const sign = dmsMatch[1] === '-' ? -1 : 1
    const d = parseFloat(dmsMatch[2])
    const m = parseFloat(dmsMatch[3])
    const s = parseFloat(dmsMatch[4])
    if (d <= 90 && m >= 0 && m < 60 && s >= 0 && s < 60) {
      const result = sign * (d + m / 60 + s / 3600)
      if (result >= -90 && result <= 90) {
        return result
      }
    }
    return null
  }

  // Try parsing as plain decimal
  const decimal = parseFloat(trimmed)
  if (!isNaN(decimal) && decimal >= -90 && decimal <= 90) {
    return decimal
  }

  return null
}
