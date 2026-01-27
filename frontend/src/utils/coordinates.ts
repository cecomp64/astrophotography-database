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
