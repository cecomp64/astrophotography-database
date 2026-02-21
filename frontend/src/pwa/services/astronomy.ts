/**
 * Client-side astronomy calculations using astronomy-engine.
 * Used in PWA mode for altitude charts when server is not available.
 */
import {
  Observer,
  SiderealTime,
  SearchAltitude,
  Body,
} from 'astronomy-engine'

export interface ObserverLocation {
  latitude: number
  longitude: number
  timezone: string
}

export interface AltitudeDataPoint {
  time: string
  altitude: number
  azimuth: number
}

export interface TwilightTimes {
  sunset: string | null
  sunrise: string | null
  civil_dusk: string | null
  civil_dawn: string | null
  nautical_dusk: string | null
  nautical_dawn: string | null
  astronomical_dusk: string | null
  astronomical_dawn: string | null
}

export interface AltitudeResponse {
  location_configured: boolean
  date: string
  timezone: string
  data: AltitudeDataPoint[]
  rise_time: string | null
  set_time: string | null
  transit_time: string | null
  transit_altitude: number | null
  twilight: TwilightTimes | null
}

export interface MiniAltitudeResponse {
  data: number[]
  darkness_start: number | null
  darkness_end: number | null
}

const LOCATION_STORAGE_KEY = 'pwa_observer_location'

/**
 * Get stored observer location from localStorage
 */
export function getStoredLocation(): ObserverLocation | null {
  try {
    const stored = localStorage.getItem(LOCATION_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load stored location:', e)
  }
  return null
}

/**
 * Store observer location in localStorage
 */
export function storeLocation(location: ObserverLocation): void {
  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location))
  } catch (e) {
    console.error('Failed to store location:', e)
  }
}

/**
 * Format a Date to HH:MM string
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Format a Date to YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Convert RA in degrees to hours
 */
function raDegreesToHours(raDegrees: number): number {
  return raDegrees / 15
}

/**
 * Calculate altitude and azimuth using spherical astronomy formulas
 */
function calculateAltAz(
  raHours: number,
  decDegrees: number,
  lat: number,
  lon: number,
  date: Date
): { altitude: number; azimuth: number } {
  // Calculate Local Sidereal Time
  const gst = SiderealTime(date)
  const lst = (gst + lon / 15) % 24

  // Hour angle
  const ha = (lst - raHours) * 15 // in degrees
  const haRad = ha * Math.PI / 180
  const decRad = decDegrees * Math.PI / 180
  const latRad = lat * Math.PI / 180

  // Calculate altitude
  const sinAlt = Math.sin(decRad) * Math.sin(latRad) +
                 Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad)
  const altitude = Math.asin(sinAlt) * 180 / Math.PI

  // Calculate azimuth
  const cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
                (Math.cos(latRad) * Math.cos(Math.asin(sinAlt)))
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI

  if (Math.sin(haRad) > 0) {
    azimuth = 360 - azimuth
  }

  return { altitude, azimuth }
}

/**
 * Search for when sun reaches a specific altitude (for twilight calculations)
 */
function searchSunAltitude(
  observer: Observer,
  altitude: number,
  startTime: Date,
  direction: 1 | -1,
  limitHours: number = 24
): Date | null {
  try {
    const result = SearchAltitude(
      Body.Sun,
      observer,
      direction,
      startTime,
      limitHours,
      altitude
    )
    return result ? result.date : null
  } catch {
    return null
  }
}

/**
 * Calculate twilight times for a given date and location
 */
function calculateTwilightTimes(
  observer: Observer,
  date: Date
): TwilightTimes {
  // Start from noon on the given date
  const noon = new Date(date)
  noon.setHours(12, 0, 0, 0)

  // Search for sunset/sunrise (altitude = 0)
  const sunset = searchSunAltitude(observer, 0, noon, -1, 12)
  const nextNoon = new Date(noon.getTime() + 24 * 60 * 60 * 1000)
  const sunrise = searchSunAltitude(observer, 0, nextNoon, 1, 12)

  // Civil twilight (altitude = -6)
  const civilDusk = sunset ? searchSunAltitude(observer, -6, sunset, -1, 4) : null
  const civilDawn = sunrise ? searchSunAltitude(observer, -6, sunrise, 1, 4) : null

  // Nautical twilight (altitude = -12)
  const nauticalDusk = civilDusk ? searchSunAltitude(observer, -12, civilDusk, -1, 4) : null
  const nauticalDawn = civilDawn ? searchSunAltitude(observer, -12, civilDawn, 1, 4) : null

  // Astronomical twilight (altitude = -18)
  const astroDusk = nauticalDusk ? searchSunAltitude(observer, -18, nauticalDusk, -1, 4) : null
  const astroDawn = nauticalDawn ? searchSunAltitude(observer, -18, nauticalDawn, 1, 4) : null

  return {
    sunset: sunset ? formatTime(sunset) : null,
    sunrise: sunrise ? formatTime(sunrise) : null,
    civil_dusk: civilDusk ? formatTime(civilDusk) : null,
    civil_dawn: civilDawn ? formatTime(civilDawn) : null,
    nautical_dusk: nauticalDusk ? formatTime(nauticalDusk) : null,
    nautical_dawn: nauticalDawn ? formatTime(nauticalDawn) : null,
    astronomical_dusk: astroDusk ? formatTime(astroDusk) : null,
    astronomical_dawn: astroDawn ? formatTime(astroDawn) : null,
  }
}

/**
 * Find transit time (when object crosses meridian)
 */
function findTransitTime(
  raHours: number,
  lon: number,
  date: Date
): { time: Date; lstAtTransit: number } {
  // Object transits when LST = RA
  // LST = GST + longitude/15
  // So GST at transit = RA - longitude/15

  const targetLst = raHours

  // Start from noon
  const noon = new Date(date)
  noon.setHours(12, 0, 0, 0)

  // Search in 10-minute increments to find approximate transit
  let bestTime = noon
  let minDiff = 24

  for (let minutes = 0; minutes < 24 * 60; minutes += 10) {
    const testTime = new Date(noon.getTime() + minutes * 60 * 1000)
    const gst = SiderealTime(testTime)
    const lst = (gst + lon / 15 + 24) % 24

    let diff = Math.abs(lst - targetLst)
    if (diff > 12) diff = 24 - diff

    if (diff < minDiff) {
      minDiff = diff
      bestTime = testTime
    }
  }

  // Refine with 1-minute search around best time
  const searchStart = new Date(bestTime.getTime() - 30 * 60 * 1000)
  for (let minutes = 0; minutes < 60; minutes++) {
    const testTime = new Date(searchStart.getTime() + minutes * 60 * 1000)
    const gst = SiderealTime(testTime)
    const lst = (gst + lon / 15 + 24) % 24

    let diff = Math.abs(lst - targetLst)
    if (diff > 12) diff = 24 - diff

    if (diff < minDiff) {
      minDiff = diff
      bestTime = testTime
    }
  }

  return { time: bestTime, lstAtTransit: targetLst }
}

/**
 * Calculate full altitude data for an object over 24 hours
 */
export function calculateAltitudeData(
  raDegrees: number,
  decDegrees: number,
  location: ObserverLocation,
  dateStr?: string
): AltitudeResponse {
  const raHours = raDegreesToHours(raDegrees)
  const observer = new Observer(location.latitude, location.longitude, 0)

  // Parse date or use today
  const baseDate = dateStr ? new Date(dateStr) : new Date()
  baseDate.setHours(12, 0, 0, 0) // Start at noon

  // Generate 145 data points over 24 hours (10-minute intervals)
  const data: AltitudeDataPoint[] = []
  const altitudes: number[] = []

  for (let i = 0; i < 145; i++) {
    const time = new Date(baseDate.getTime() + i * 10 * 60 * 1000)
    const { altitude, azimuth } = calculateAltAz(
      raHours,
      decDegrees,
      location.latitude,
      location.longitude,
      time
    )

    data.push({
      time: formatTime(time),
      altitude,
      azimuth,
    })
    altitudes.push(altitude)
  }

  // Find rise and set times (when altitude crosses 0)
  let riseTime: string | null = null
  let setTime: string | null = null

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1]
    const curr = data[i]

    // Rising: crosses from negative to positive
    if (prev.altitude < 0 && curr.altitude >= 0 && !riseTime) {
      riseTime = curr.time
    }
    // Setting: crosses from positive to negative
    if (prev.altitude >= 0 && curr.altitude < 0 && !setTime) {
      setTime = curr.time
    }
  }

  // Find transit (max altitude)
  const transitInfo = findTransitTime(raHours, location.longitude, baseDate)
  const transitCoords = calculateAltAz(
    raHours,
    decDegrees,
    location.latitude,
    location.longitude,
    transitInfo.time
  )

  // Calculate twilight times
  const twilight = calculateTwilightTimes(observer, baseDate)

  return {
    location_configured: true,
    date: formatDate(baseDate),
    timezone: location.timezone,
    data,
    rise_time: riseTime,
    set_time: setTime,
    transit_time: formatTime(transitInfo.time),
    transit_altitude: transitCoords.altitude,
    twilight,
  }
}

/**
 * Calculate mini altitude data (just altitude values for sparkline)
 */
export interface VisibilityInfo {
  is_visible_tonight: boolean
  max_altitude: number | null
  transit_time: string | null
  hours_in_darkness: number | null
  current_altitude: number | null
}

export interface BatchVisibilityResult {
  [objectId: number]: VisibilityInfo
}

interface DarknessWindow {
  start: Date | null
  end: Date | null
  startHoursFromMidnight: number | null
  endHoursFromMidnight: number | null
}

/**
 * Calculate darkness window (astronomical twilight) for tonight.
 * Returns start/end times and hours relative to midnight.
 */
function calculateDarknessWindow(
  location: ObserverLocation,
  targetDate?: Date
): DarknessWindow {
  const observer = new Observer(location.latitude, location.longitude, 0)
  const baseDate = targetDate || new Date()

  // Start from noon to find tonight's darkness
  const noon = new Date(baseDate)
  noon.setHours(12, 0, 0, 0)

  // Find astronomical dusk (sun at -18°)
  let astroDusk: Date | null = null
  let astroDawn: Date | null = null

  try {
    const duskResult = SearchAltitude(Body.Sun, observer, -1, noon, 12, -18)
    astroDusk = duskResult ? duskResult.date : null

    if (astroDusk) {
      const dawnResult = SearchAltitude(Body.Sun, observer, 1, astroDusk, 18, -18)
      astroDawn = dawnResult ? dawnResult.date : null
    }
  } catch {
    return { start: null, end: null, startHoursFromMidnight: null, endHoursFromMidnight: null }
  }

  if (!astroDusk || !astroDawn) {
    return { start: null, end: null, startHoursFromMidnight: null, endHoursFromMidnight: null }
  }

  // Calculate hours relative to local midnight
  const midnight = new Date(baseDate)
  midnight.setHours(24, 0, 0, 0) // Next midnight

  const startHours = (astroDusk.getTime() - midnight.getTime()) / (1000 * 60 * 60)
  const endHours = (astroDawn.getTime() - midnight.getTime()) / (1000 * 60 * 60)

  return {
    start: astroDusk,
    end: astroDawn,
    startHoursFromMidnight: startHours,
    endHoursFromMidnight: endHours,
  }
}

/**
 * Calculate Local Sidereal Time at midnight for a given location
 */
function getLstAtMidnight(location: ObserverLocation, targetDate?: Date): number {
  const baseDate = targetDate || new Date()
  const midnight = new Date(baseDate)
  midnight.setHours(24, 0, 0, 0) // Next midnight

  const gst = SiderealTime(midnight)
  const lst = (gst + location.longitude / 15 + 24) % 24
  return lst
}

/**
 * Calculate visibility metrics for a single object using analytical formulas.
 * This is much faster than computing full altitude curves.
 */
function calculateObjectVisibility(
  raDegrees: number,
  decDegrees: number,
  location: ObserverLocation,
  darkness: DarknessWindow,
  lstMidnight: number,
  minAltitude: number = 30
): VisibilityInfo {
  const latRad = location.latitude * Math.PI / 180
  const decRad = decDegrees * Math.PI / 180
  const raHours = raDegrees / 15

  // Calculate theoretical max altitude: 90 - |lat - dec|
  const maxAltitude = 90 - Math.abs(location.latitude - decDegrees)

  // If max altitude is below minimum, object can never be well-placed
  if (maxAltitude < minAltitude) {
    return {
      is_visible_tonight: false,
      max_altitude: maxAltitude,
      transit_time: null,
      hours_in_darkness: 0,
      current_altitude: null,
    }
  }

  // Calculate transit time (when RA = LST)
  // Transit hours from midnight = (RA - LST_midnight) mod 24, adjusted to [-12, 12]
  let transitHours = (raHours - lstMidnight) % 24
  if (transitHours > 12) transitHours -= 24
  if (transitHours < -12) transitHours += 24

  // Convert transit hours to time string
  const midnight = new Date()
  midnight.setHours(24, 0, 0, 0)
  const transitDate = new Date(midnight.getTime() + transitHours * 60 * 60 * 1000)
  const transitTime = transitDate.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  // Calculate hour angle range where object is above minAltitude
  // sin(alt) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(HA)
  // Solving: cos(HA) = (sin(minAlt) - sin(lat)*sin(dec)) / (cos(lat)*cos(dec))
  const sinMinAlt = Math.sin(minAltitude * Math.PI / 180)
  const sinLat = Math.sin(latRad)
  const cosLat = Math.cos(latRad)
  const sinDec = Math.sin(decRad)
  const cosDec = Math.cos(decRad)

  const cosHaLimit = (sinMinAlt - sinLat * sinDec) / (cosLat * cosDec + 1e-10)

  let hoursInDarkness = 0

  if (cosHaLimit <= -1) {
    // Circumpolar above min altitude - visible all night during darkness
    if (darkness.startHoursFromMidnight !== null && darkness.endHoursFromMidnight !== null) {
      hoursInDarkness = darkness.endHoursFromMidnight - darkness.startHoursFromMidnight
    }
  } else if (cosHaLimit >= 1) {
    // Never above min altitude
    hoursInDarkness = 0
  } else {
    // Calculate hour angle limit in hours
    const haLimitHours = Math.acos(cosHaLimit) * 180 / Math.PI / 15

    // Object is above min altitude from (transit - haLimit) to (transit + haLimit)
    const riseHour = transitHours - haLimitHours
    const setHour = transitHours + haLimitHours

    // Calculate overlap with darkness window
    if (darkness.startHoursFromMidnight !== null && darkness.endHoursFromMidnight !== null) {
      const overlapStart = Math.max(riseHour, darkness.startHoursFromMidnight)
      const overlapEnd = Math.min(setHour, darkness.endHoursFromMidnight)

      if (overlapEnd > overlapStart) {
        hoursInDarkness = overlapEnd - overlapStart
      }
    }
  }

  // Calculate current altitude
  const now = new Date()
  const { altitude: currentAltitude } = calculateAltAz(
    raHours,
    decDegrees,
    location.latitude,
    location.longitude,
    now
  )

  // Object is visible if it has at least 1 hour above min altitude during darkness
  const isVisible = hoursInDarkness >= 1.0

  return {
    is_visible_tonight: isVisible,
    max_altitude: Math.round(maxAltitude * 10) / 10,
    transit_time: transitTime,
    hours_in_darkness: Math.round(hoursInDarkness * 10) / 10,
    current_altitude: Math.round(currentAltitude * 10) / 10,
  }
}

/**
 * Calculate visibility for multiple objects efficiently.
 * Computes twilight once and uses analytical formulas for each object.
 */
export function calculateBatchVisibility(
  objects: Array<{ id: number; ra: number | null; dec: number | null }>,
  location: ObserverLocation,
  minAltitude: number = 30
): BatchVisibilityResult {
  const results: BatchVisibilityResult = {}

  // Calculate darkness window once for all objects
  const darkness = calculateDarknessWindow(location)
  const lstMidnight = getLstAtMidnight(location)

  for (const obj of objects) {
    if (obj.ra === null || obj.dec === null) {
      results[obj.id] = {
        is_visible_tonight: false,
        max_altitude: null,
        transit_time: null,
        hours_in_darkness: null,
        current_altitude: null,
      }
      continue
    }

    results[obj.id] = calculateObjectVisibility(
      obj.ra,
      obj.dec,
      location,
      darkness,
      lstMidnight,
      minAltitude
    )
  }

  return results
}

/**
 * Calculate a visibility score for ranking objects.
 * Higher score = better candidate for imaging tonight.
 */
export function calculateVisibilityScore(visibility: VisibilityInfo): number {
  if (!visibility.is_visible_tonight) return 0

  let score = 0

  // Higher max altitude = better
  if (visibility.max_altitude !== null) {
    score += visibility.max_altitude * 0.5
  }

  // More hours during darkness = better
  if (visibility.hours_in_darkness !== null) {
    score += visibility.hours_in_darkness * 10
  }

  // Base score
  score += 30

  return Math.round(score * 10) / 10
}

export function calculateMiniAltitudeData(
  raDegrees: number,
  decDegrees: number,
  location: ObserverLocation
): MiniAltitudeResponse {
  const raHours = raDegreesToHours(raDegrees)
  const observer = new Observer(location.latitude, location.longitude, 0)

  const now = new Date()
  now.setHours(12, 0, 0, 0) // Start at noon

  // Generate 145 data points
  const data: number[] = []

  for (let i = 0; i < 145; i++) {
    const time = new Date(now.getTime() + i * 10 * 60 * 1000)
    const { altitude } = calculateAltAz(
      raHours,
      decDegrees,
      location.latitude,
      location.longitude,
      time
    )
    data.push(altitude)
  }

  // Calculate twilight to find darkness period
  const twilight = calculateTwilightTimes(observer, now)

  let darknessStart: number | null = null
  let darknessEnd: number | null = null

  if (twilight.astronomical_dusk && twilight.astronomical_dawn) {
    // Convert twilight times to indices
    const duskParts = twilight.astronomical_dusk.split(':').map(Number)
    const dawnParts = twilight.astronomical_dawn.split(':').map(Number)

    const duskMinutes = duskParts[0] * 60 + duskParts[1]
    const dawnMinutes = dawnParts[0] * 60 + dawnParts[1]

    // Convert to indices (each index = 10 minutes, starting at noon = 720 minutes)
    // Noon = index 0, midnight = index 72
    const noonMinutes = 12 * 60

    let duskIndex = Math.round((duskMinutes - noonMinutes) / 10)
    if (duskIndex < 0) duskIndex += 144

    let dawnIndex = Math.round((dawnMinutes - noonMinutes) / 10)
    if (dawnIndex < 0) dawnIndex += 144
    if (dawnMinutes < noonMinutes) dawnIndex += 144 // Dawn is next day

    darknessStart = Math.max(0, Math.min(144, duskIndex))
    darknessEnd = Math.max(0, Math.min(144, dawnIndex))
  }

  return {
    data,
    darkness_start: darknessStart,
    darkness_end: darknessEnd,
  }
}
