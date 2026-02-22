"""Service for calculating object visibility and optimal imaging times."""

from datetime import datetime, date, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple
from zoneinfo import ZoneInfo

from astropy.coordinates import EarthLocation, AltAz, SkyCoord
from astropy.time import Time
import astropy.units as u
from astroplan import Observer
import numpy as np
from sqlalchemy.orm import Session

from app.models.configuration import Configuration
from app.models.best_viewing_cache import BestViewingCache


# Horizon angles for different twilight types
CIVIL_TWILIGHT_HORIZON = -6  # degrees
NAUTICAL_TWILIGHT_HORIZON = -12  # degrees
ASTRONOMICAL_TWILIGHT_HORIZON = -18  # degrees


class VisibilityService:
    """Calculate visibility and observability for astronomical objects."""

    DEFAULT_MIN_ALTITUDE = 30.0  # Degrees above horizon for good imaging

    def __init__(self, db: Session):
        self.db = db
        self._location: Optional[EarthLocation] = None
        self._timezone: ZoneInfo = ZoneInfo("UTC")
        self._tz_name: str = "UTC"
        self._location_configured: bool = False
        self._location_id: Optional[str] = None
        self._load_location()

    def _load_location(self) -> None:
        """Load observer location from configuration."""
        # Try multi-location config first
        locations_config = self.db.query(Configuration).filter(
            Configuration.key == "locations"
        ).first()

        latitude = None
        longitude = None
        elevation = 0.0

        if locations_config and locations_config.value:
            locs = locations_config.value.get("locations", [])
            active_id = locations_config.value.get("active_id")
            if active_id and locs:
                for loc in locs:
                    if loc.get("id") == active_id:
                        latitude = loc.get("latitude")
                        longitude = loc.get("longitude")
                        elevation = loc.get("elevation", 0)
                        self._tz_name = loc.get("timezone", "UTC")
                        self._location_id = active_id
                        break

        # Fall back to legacy config
        if latitude is None:
            legacy_config = self.db.query(Configuration).filter(
                Configuration.key == "location"
            ).first()
            if legacy_config and legacy_config.value:
                latitude = legacy_config.value.get("latitude")
                longitude = legacy_config.value.get("longitude")
                elevation = legacy_config.value.get("elevation", 0)
                self._location_id = "legacy"

            timezone_config = self.db.query(Configuration).filter(
                Configuration.key == "timezone"
            ).first()
            if timezone_config and timezone_config.value:
                self._tz_name = timezone_config.value.get("timezone", "UTC")

        # Parse timezone
        try:
            self._timezone = ZoneInfo(self._tz_name)
        except KeyError:
            self._timezone = ZoneInfo("UTC")
            self._tz_name = "UTC"

        if latitude is not None and longitude is not None:
            self._location = EarthLocation(
                lat=latitude * u.deg,
                lon=longitude * u.deg,
                height=elevation * u.m
            )
            self._location_configured = True

    @property
    def location_configured(self) -> bool:
        return self._location_configured

    @property
    def timezone_name(self) -> str:
        return self._tz_name

    @property
    def location_id(self) -> Optional[str]:
        return self._location_id

    def _get_observer(self) -> Optional[Observer]:
        """Get an astroplan Observer for the configured location."""
        if not self._location_configured or self._location is None:
            return None
        return Observer(location=self._location, timezone=self._timezone)

    def calculate_twilight_times(
        self,
        target_date: Optional[date] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Calculate civil, nautical, and astronomical twilight times for a given date.

        Uses the evening of target_date through the morning of target_date+1.

        Args:
            target_date: Date for calculation (defaults to today)

        Returns:
            dict with twilight times in local timezone, or None if location not configured
        """
        if not self._location_configured or self._location is None:
            return None

        observer = self._get_observer()
        if observer is None:
            return None

        target_date = target_date or date.today()

        # Use local noon as reference time to get "next" sunset/sunrise
        local_noon = datetime(
            target_date.year, target_date.month, target_date.day,
            12, 0, 0, tzinfo=self._timezone
        )
        reference_time = Time(local_noon.astimezone(timezone.utc))

        result = {}

        try:
            # Evening twilight times (sun setting)
            # Sunset (horizon = 0)
            sunset = observer.sun_set_time(reference_time, which='next', horizon=0*u.deg)
            result['sunset'] = self._format_astropy_time(sunset)

            # Civil dusk (horizon = -6°)
            civil_dusk = observer.sun_set_time(reference_time, which='next', horizon=CIVIL_TWILIGHT_HORIZON*u.deg)
            result['civil_dusk'] = self._format_astropy_time(civil_dusk)

            # Nautical dusk (horizon = -12°)
            nautical_dusk = observer.sun_set_time(reference_time, which='next', horizon=NAUTICAL_TWILIGHT_HORIZON*u.deg)
            result['nautical_dusk'] = self._format_astropy_time(nautical_dusk)

            # Astronomical dusk (horizon = -18°) - start of astronomical darkness
            astro_dusk = observer.sun_set_time(reference_time, which='next', horizon=ASTRONOMICAL_TWILIGHT_HORIZON*u.deg)
            result['astronomical_dusk'] = self._format_astropy_time(astro_dusk)

            # Morning twilight times (sun rising)
            # Astronomical dawn (horizon = -18°) - end of astronomical darkness
            astro_dawn = observer.sun_rise_time(reference_time, which='next', horizon=ASTRONOMICAL_TWILIGHT_HORIZON*u.deg)
            result['astronomical_dawn'] = self._format_astropy_time(astro_dawn)

            # Nautical dawn (horizon = -12°)
            nautical_dawn = observer.sun_rise_time(reference_time, which='next', horizon=NAUTICAL_TWILIGHT_HORIZON*u.deg)
            result['nautical_dawn'] = self._format_astropy_time(nautical_dawn)

            # Civil dawn (horizon = -6°)
            civil_dawn = observer.sun_rise_time(reference_time, which='next', horizon=CIVIL_TWILIGHT_HORIZON*u.deg)
            result['civil_dawn'] = self._format_astropy_time(civil_dawn)

            # Sunrise (horizon = 0)
            sunrise = observer.sun_rise_time(reference_time, which='next', horizon=0*u.deg)
            result['sunrise'] = self._format_astropy_time(sunrise)

            # Store raw astropy times for internal use
            result['_astro_dusk_time'] = astro_dusk
            result['_astro_dawn_time'] = astro_dawn

        except Exception:
            # Some locations may not have all twilight phases (polar regions)
            pass

        return result

    def _format_astropy_time(self, astropy_time: Time) -> str:
        """Convert astropy Time to local timezone HH:MM string."""
        dt_utc = astropy_time.to_datetime(timezone=timezone.utc)
        dt_local = dt_utc.astimezone(self._timezone)
        return dt_local.strftime("%H:%M")

    def calculate_object_visibility(
        self,
        ra: float,
        dec: float,
        target_date: Optional[date] = None,
        min_altitude: float = DEFAULT_MIN_ALTITUDE,
    ) -> dict:
        """
        Calculate visibility metrics for an object.

        Visibility is determined during astronomical darkness only (sun below -18°).

        Args:
            ra: Right ascension in degrees
            dec: Declination in degrees
            target_date: Date to calculate for (defaults to today)
            min_altitude: Minimum altitude for "good" imaging (default 30°)

        Returns:
            dict with visibility metrics
        """
        if not self._location_configured:
            return {
                "is_visible_tonight": False,
                "location_configured": False,
                "current_altitude": None,
                "max_altitude": None,
                "transit_time": None,
                "hours_above_min_altitude": None,
                "hours_in_darkness": None,
                "rise_time": None,
                "set_time": None,
            }

        target = SkyCoord(ra=ra * u.deg, dec=dec * u.deg)
        target_date = target_date or date.today()

        # Get twilight times for this date
        twilight = self.calculate_twilight_times(target_date)

        # Get current altitude
        now_utc = datetime.now(timezone.utc)
        current_time = Time(now_utc)
        current_altaz = target.transform_to(
            AltAz(obstime=current_time, location=self._location)
        )
        current_altitude = float(current_altaz.alt.deg)

        # Create time array: 24 hours centered on NEXT midnight (between target_date and target_date+1)
        # This ensures we cover tonight's darkness (evening of target_date → morning of target_date+1)
        next_midnight = datetime(
            target_date.year, target_date.month, target_date.day,
            0, 0, 0, tzinfo=self._timezone
        ) + timedelta(days=1)
        utc_midnight = next_midnight.astimezone(timezone.utc)

        # Generate times from 12 hours before to 12 hours after local midnight
        times_hours = np.linspace(-12, 12, 145)  # Every 10 minutes
        times = Time(utc_midnight) + times_hours * u.hour

        # Calculate altitudes for all times
        altaz_frame = AltAz(obstime=times, location=self._location)
        altaz = target.transform_to(altaz_frame)
        altitudes = altaz.alt.deg

        # Find transit (maximum altitude)
        max_alt_idx = np.argmax(altitudes)
        transit_time_utc = times[max_alt_idx].to_datetime(timezone=timezone.utc)
        transit_time_local = transit_time_utc.astimezone(self._timezone)
        max_altitude = float(altitudes[max_alt_idx])

        # Find rise and set times (crossing 0 altitude)
        rise_time = None
        set_time = None

        for i in range(1, len(altitudes)):
            if altitudes[i - 1] < 0 and altitudes[i] >= 0 and rise_time is None:
                dt_utc = times[i].to_datetime(timezone=timezone.utc)
                dt_local = dt_utc.astimezone(self._timezone)
                rise_time = dt_local.strftime("%H:%M")
            if altitudes[i - 1] >= 0 and altitudes[i] < 0:
                dt_utc = times[i].to_datetime(timezone=timezone.utc)
                dt_local = dt_utc.astimezone(self._timezone)
                set_time = dt_local.strftime("%H:%M")

        # Calculate hours above minimum altitude (total, regardless of darkness)
        above_min = altitudes >= min_altitude
        hours_above = np.sum(above_min) * (24.0 / 145.0)

        # Calculate hours above min altitude DURING astronomical darkness
        hours_in_darkness = 0.0
        max_altitude_in_darkness = 0.0
        if twilight and '_astro_dusk_time' in twilight and '_astro_dawn_time' in twilight:
            astro_dusk = twilight['_astro_dusk_time']
            astro_dawn = twilight['_astro_dawn_time']

            # Create mask for times during astronomical darkness
            is_dark = (times >= astro_dusk) & (times <= astro_dawn)

            # Count time points that are both above min altitude AND in darkness
            visible_in_dark = above_min & is_dark
            hours_in_darkness = np.sum(visible_in_dark) * (24.0 / 145.0)

            # Calculate max altitude during darkness
            dark_altitudes = altitudes[is_dark]
            if len(dark_altitudes) > 0:
                max_altitude_in_darkness = float(np.max(dark_altitudes))

        # Determine if visible tonight: must be above min altitude during darkness for at least 1 hour
        is_visible = bool(hours_in_darkness >= 1.0)

        return {
            "is_visible_tonight": is_visible,
            "location_configured": True,
            "current_altitude": round(current_altitude, 1),
            "max_altitude": round(max_altitude, 1),
            "max_altitude_in_darkness": round(max_altitude_in_darkness, 1),
            "transit_time": transit_time_local.strftime("%H:%M"),
            "hours_above_min_altitude": round(hours_above, 1),
            "hours_in_darkness": round(hours_in_darkness, 1),
            "rise_time": rise_time,
            "set_time": set_time,
        }

    def calculate_hours_remaining_tonight(
        self,
        ra: float,
        dec: float,
        min_altitude: float = DEFAULT_MIN_ALTITUDE,
    ) -> float:
        """
        Calculate hours remaining above min altitude during astronomical darkness.

        Only counts time from now until astronomical dawn when object is above
        minimum altitude.

        Returns:
            Hours remaining for imaging tonight (0 if not visible or not dark)
        """
        if not self._location_configured:
            return 0.0

        # Get twilight times for tonight
        twilight = self.calculate_twilight_times()
        if not twilight or '_astro_dawn_time' not in twilight:
            return 0.0

        astro_dawn = twilight['_astro_dawn_time']

        target = SkyCoord(ra=ra * u.deg, dec=dec * u.deg)
        now_utc = datetime.now(timezone.utc)
        now_time = Time(now_utc)

        # If it's already past astronomical dawn, no imaging time left
        if now_time >= astro_dawn:
            return 0.0

        # Generate times from now until astronomical dawn
        duration_hours = (astro_dawn - now_time).to(u.hour).value
        if duration_hours <= 0:
            return 0.0

        num_points = max(2, int(duration_hours * 6) + 1)  # ~10 min intervals
        times_hours = np.linspace(0, duration_hours, num_points)
        times = now_time + times_hours * u.hour

        # Calculate altitudes
        altaz_frame = AltAz(obstime=times, location=self._location)
        altaz = target.transform_to(altaz_frame)
        altitudes = altaz.alt.deg

        # Count time above minimum altitude
        above_min = altitudes >= min_altitude
        hours_remaining = np.sum(above_min) * (duration_hours / num_points)

        return round(hours_remaining, 1)

    def get_current_altitude(self, ra: float, dec: float) -> Optional[float]:
        """Get current altitude of an object."""
        if not self._location_configured:
            return None

        target = SkyCoord(ra=ra * u.deg, dec=dec * u.deg)
        now_utc = datetime.now(timezone.utc)
        current_time = Time(now_utc)

        altaz = target.transform_to(
            AltAz(obstime=current_time, location=self._location)
        )
        return round(float(altaz.alt.deg), 1)

    def calculate_imaging_score(
        self,
        ra: float,
        dec: float,
        project_progress: float = 0.0,
        priority: int = 0,
        min_altitude: float = DEFAULT_MIN_ALTITUDE,
    ) -> float:
        """
        Calculate a composite score for project prioritization.

        Higher score = better candidate for imaging tonight.

        Factors:
        - Current/max altitude (higher = better seeing)
        - Hours remaining above min altitude
        - Project progress (lower progress = more urgent)
        - Priority setting

        Returns:
            Score (higher is better)
        """
        if not self._location_configured:
            return 0.0

        visibility = self.calculate_object_visibility(ra, dec, min_altitude=min_altitude)

        if not visibility.get("is_visible_tonight"):
            return 0.0

        score = 0.0

        # Higher max altitude = better
        max_alt = visibility.get("max_altitude", 0) or 0
        score += max_alt * 0.5

        # More hours available during darkness = better
        hours = visibility.get("hours_in_darkness", 0) or 0
        score += hours * 10

        # Lower progress = more urgent (need to capture more data)
        score += (100 - project_progress) * 0.3

        # Priority boost
        score += priority * 5

        return round(score, 1)

    def get_declination_bounds(self, min_altitude: float = DEFAULT_MIN_ALTITUDE) -> Tuple[float, float]:
        """
        Get the declination bounds for objects that can reach min_altitude.

        For an observer at latitude L, an object with declination D has max altitude = 90 - |L - D|.
        For max_altitude >= min_altitude: |L - D| <= 90 - min_altitude.

        Returns:
            Tuple of (min_dec, max_dec) in degrees, or (-90, 90) if location not configured.
        """
        if not self._location_configured or self._location is None:
            return (-90.0, 90.0)

        latitude = self._location.lat.deg
        dec_range = 90.0 - min_altitude

        min_dec = max(-90.0, latitude - dec_range)
        max_dec = min(90.0, latitude + dec_range)

        return (min_dec, max_dec)

    def get_observer_latitude(self) -> Optional[float]:
        """Get the observer's latitude in degrees."""
        if not self._location_configured or self._location is None:
            return None
        return float(self._location.lat.deg)

    def calculate_batch_visibility(
        self,
        objects: List[Tuple[int, float, float]],  # List of (id, ra, dec)
        target_date: Optional[date] = None,
        min_altitude: float = DEFAULT_MIN_ALTITUDE,
    ) -> Dict[int, Dict[str, Any]]:
        """
        Calculate visibility for multiple objects efficiently.

        Uses analytical formulas where possible and processes in batches.

        Args:
            objects: List of tuples (object_id, ra, dec) with coordinates in degrees.
            target_date: Date for calculation (defaults to today).
            min_altitude: Minimum altitude for good imaging.

        Returns:
            Dict mapping object_id to visibility dict.
        """
        if not self._location_configured or self._location is None:
            return {
                obj_id: {
                    "is_visible_tonight": False,
                    "location_configured": False,
                    "current_altitude": None,
                    "max_altitude": None,
                    "transit_time": None,
                    "hours_in_darkness": None,
                }
                for obj_id, _, _ in objects
            }

        if not objects:
            return {}

        target_date = target_date or date.today()

        # Calculate twilight times ONCE for all objects
        twilight = self.calculate_twilight_times(target_date)

        # Get darkness window in hours from midnight
        darkness_start_hour = None
        darkness_end_hour = None
        if twilight and '_astro_dusk_time' in twilight and '_astro_dawn_time' in twilight:
            astro_dusk = twilight['_astro_dusk_time']
            astro_dawn = twilight['_astro_dawn_time']

            # Create reference midnight
            next_midnight = datetime(
                target_date.year, target_date.month, target_date.day,
                0, 0, 0, tzinfo=self._timezone
            ) + timedelta(days=1)
            utc_midnight = Time(next_midnight.astimezone(timezone.utc))

            # Hours relative to midnight
            darkness_start_hour = (astro_dusk - utc_midnight).to(u.hour).value
            darkness_end_hour = (astro_dawn - utc_midnight).to(u.hour).value

        # Current time
        now_utc = datetime.now(timezone.utc)
        current_time = Time(now_utc)

        # Extract coordinates
        obj_ids = [obj[0] for obj in objects]
        ras = np.array([obj[1] for obj in objects])
        decs = np.array([obj[2] for obj in objects])

        # Get observer latitude
        lat_rad = self._location.lat.rad
        lat_deg = self._location.lat.deg

        # Calculate theoretical max altitude analytically: max_alt = 90 - |lat - dec|
        # This is the altitude at transit (meridian crossing)
        theoretical_max_altitudes = 90.0 - np.abs(lat_deg - decs)

        # Calculate transit times from RA and local sidereal time at midnight
        next_midnight = datetime(
            target_date.year, target_date.month, target_date.day,
            0, 0, 0, tzinfo=self._timezone
        ) + timedelta(days=1)
        midnight_time = Time(next_midnight.astimezone(timezone.utc))
        lst_midnight = midnight_time.sidereal_time('apparent', longitude=self._location.lon).hour  # hours

        # Transit occurs when RA = LST, so hours from midnight = (RA/15 - LST_midnight) mod 24
        # Adjust to be in range [-12, 12]
        transit_hours = (ras / 15.0 - lst_midnight) % 24
        transit_hours = np.where(transit_hours > 12, transit_hours - 24, transit_hours)

        # Create SkyCoord for current altitude calculation (vectorized, single time point)
        coords = SkyCoord(ra=ras * u.deg, dec=decs * u.deg)
        current_altaz = coords.transform_to(
            AltAz(obstime=current_time, location=self._location)
        )
        current_altitudes = np.asarray(current_altaz.alt.deg)

        # Pre-compute trig values for altitude calculations
        dec_rad = np.radians(decs)
        sin_lat = np.sin(lat_rad)
        cos_lat = np.cos(lat_rad)
        sin_dec = np.sin(dec_rad)
        cos_dec = np.cos(dec_rad)

        # Calculate max altitude during darkness (not theoretical max)
        # If transit occurs during darkness, max = theoretical max
        # Otherwise, max = max(altitude at darkness start, altitude at darkness end)
        max_altitudes = theoretical_max_altitudes.copy()

        if darkness_start_hour is not None and darkness_end_hour is not None:
            # Hour angle at darkness start and end for each object
            # HA = LST - RA, and LST = LST_midnight + hours_from_midnight
            # So HA at time t = (LST_midnight + t) - RA/15 = t - (RA/15 - LST_midnight)
            # Since transit_hours = (RA/15 - LST_midnight) mod 24 adjusted to [-12, 12]
            # HA at time t = t - transit_hours (in hours)
            ha_at_darkness_start = (darkness_start_hour - transit_hours) * 15.0  # Convert to degrees
            ha_at_darkness_end = (darkness_end_hour - transit_hours) * 15.0

            ha_start_rad = np.radians(ha_at_darkness_start)
            ha_end_rad = np.radians(ha_at_darkness_end)

            # Calculate altitude at darkness boundaries using:
            # sin(alt) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(HA)
            sin_alt_at_start = sin_lat * sin_dec + cos_lat * cos_dec * np.cos(ha_start_rad)
            sin_alt_at_end = sin_lat * sin_dec + cos_lat * cos_dec * np.cos(ha_end_rad)

            alt_at_darkness_start = np.degrees(np.arcsin(np.clip(sin_alt_at_start, -1, 1)))
            alt_at_darkness_end = np.degrees(np.arcsin(np.clip(sin_alt_at_end, -1, 1)))

            # Determine if transit occurs during darkness
            # Transit is at hour 0 relative to transit_hours, so it's at transit_hours from midnight
            transit_in_darkness = (transit_hours >= darkness_start_hour) & (transit_hours <= darkness_end_hour)

            # For objects where transit is NOT during darkness, use max of boundary altitudes
            max_alt_during_darkness = np.maximum(alt_at_darkness_start, alt_at_darkness_end)
            max_altitudes = np.where(transit_in_darkness, theoretical_max_altitudes, max_alt_during_darkness)

        # Calculate hours above min altitude during darkness
        # Using analytical approximation based on hour angle
        # Object is above min_alt when: sin(alt) >= sin(min_alt)
        # sin(alt) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(HA)
        # Solving for HA: cos(HA) = (sin(min_alt) - sin(lat)*sin(dec)) / (cos(lat)*cos(dec))

        min_alt_rad = np.radians(min_altitude)

        # Calculate the cosine of hour angle at which altitude = min_altitude
        cos_ha_limit = (np.sin(min_alt_rad) - sin_lat * sin_dec) / (cos_lat * cos_dec + 1e-10)

        # Clamp to valid range
        cos_ha_limit = np.clip(cos_ha_limit, -1, 1)

        # Hour angle range (in hours) where object is above min_altitude
        # If cos_ha_limit > 1, never above; if < -1, always above (circumpolar)
        ha_limit_hours = np.degrees(np.arccos(cos_ha_limit)) / 15.0  # Convert to hours

        # Total hours above min altitude per day = 2 * ha_limit_hours
        hours_above_total = 2 * ha_limit_hours

        # Calculate overlap with darkness window
        hours_in_darkness = np.zeros(len(obj_ids))

        if darkness_start_hour is not None and darkness_end_hour is not None:
            darkness_duration = darkness_end_hour - darkness_start_hour

            for i in range(len(obj_ids)):
                # Object is above min_alt from (transit - ha_limit) to (transit + ha_limit)
                rise_hour = transit_hours[i] - ha_limit_hours[i]
                set_hour = transit_hours[i] + ha_limit_hours[i]

                # Calculate overlap between [rise, set] and [darkness_start, darkness_end]
                overlap_start = max(rise_hour, darkness_start_hour)
                overlap_end = min(set_hour, darkness_end_hour)

                if overlap_end > overlap_start:
                    hours_in_darkness[i] = overlap_end - overlap_start
                else:
                    hours_in_darkness[i] = 0.0

        # Build results
        results = {}
        for i, obj_id in enumerate(obj_ids):
            is_visible = bool(hours_in_darkness[i] >= 1.0)

            # Transit time as local time string
            transit_dt = midnight_time.to_datetime(timezone=timezone.utc) + timedelta(hours=float(transit_hours[i]))
            transit_local = transit_dt.astimezone(self._timezone)

            results[obj_id] = {
                "is_visible_tonight": is_visible,
                "location_configured": True,
                "current_altitude": round(float(current_altitudes[i]), 1),
                "max_altitude": round(float(max_altitudes[i]), 1),
                "transit_time": transit_local.strftime("%H:%M"),
                "hours_in_darkness": round(float(hours_in_darkness[i]), 1),
            }

        return results

    def calculate_batch_scores(
        self,
        visibility_results: Dict[int, Dict[str, Any]],
    ) -> Dict[int, float]:
        """
        Calculate imaging scores for objects based on pre-computed visibility.

        Args:
            visibility_results: Dict from calculate_batch_visibility.

        Returns:
            Dict mapping object_id to score.
        """
        scores = {}
        for obj_id, visibility in visibility_results.items():
            if not visibility.get("is_visible_tonight"):
                scores[obj_id] = 0.0
                continue

            score = 0.0

            # Higher max altitude = better
            max_alt = visibility.get("max_altitude", 0) or 0
            score += max_alt * 0.5

            # More hours available during darkness = better
            hours = visibility.get("hours_in_darkness", 0) or 0
            score += hours * 10

            # Base progress score (no project context in catalogue)
            score += 100 * 0.3

            scores[obj_id] = round(score, 1)

        return scores

    def estimate_max_altitude(self, dec: float) -> float:
        """
        Estimate maximum possible altitude for an object based on declination.

        This is a quick approximation: max_alt ≈ 90 - |latitude - dec|

        Args:
            dec: Declination in degrees.

        Returns:
            Estimated max altitude in degrees.
        """
        if not self._location_configured or self._location is None:
            return 45.0  # Default guess

        latitude = self._location.lat.deg
        return 90.0 - abs(latitude - dec)

    def calculate_best_viewing_periods(
        self,
        ra: float,
        dec: float,
        min_altitude: float = DEFAULT_MIN_ALTITUDE,
        year: Optional[int] = None,
        object_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Calculate optimal viewing periods for an object throughout the year.

        Uses caching: monthly data is cached per object/location/year since it
        doesn't change. Upcoming dates are derived from peak season data.

        Args:
            ra: Right ascension in degrees
            dec: Declination in degrees
            min_altitude: Minimum altitude for good imaging (default 30°)
            year: Year for calculations (defaults to current year)
            object_id: Optional object ID for caching

        Returns:
            Dict with monthly_summary, peak_season, best_upcoming_dates
        """
        if not self._location_configured or self._location is None:
            return {
                "location_configured": False,
                "monthly_summary": [],
                "peak_season": None,
                "best_upcoming_dates": [],
                "best_month": None,
                "next_good_date": None,
            }

        year = year or date.today().year
        location_id = self._location_id or "unknown"

        # Try to get cached data
        monthly_summary = None
        peak_season = None

        if object_id is not None:
            cache_entry = self.db.query(BestViewingCache).filter(
                BestViewingCache.object_id == object_id,
                BestViewingCache.location_id == location_id,
                BestViewingCache.year == year,
                BestViewingCache.min_altitude == min_altitude,
            ).first()

            if cache_entry:
                monthly_summary = cache_entry.monthly_summary
                peak_season = cache_entry.peak_season

        # Calculate if not cached
        if monthly_summary is None:
            monthly_summary, peak_season = self._calculate_monthly_data(
                ra, dec, min_altitude, year
            )

            # Store in cache if we have an object_id
            if object_id is not None:
                new_cache = BestViewingCache(
                    object_id=object_id,
                    location_id=location_id,
                    year=year,
                    min_altitude=min_altitude,
                    monthly_summary=monthly_summary,
                    peak_season=peak_season,
                )
                self.db.add(new_cache)
                try:
                    self.db.commit()
                except Exception:
                    self.db.rollback()

        # Derive upcoming dates from peak season (no expensive calculations)
        best_dates = self._derive_upcoming_dates(peak_season, monthly_summary)

        # Find best month
        best_month = None
        if monthly_summary:
            best_month_data = max(monthly_summary, key=lambda x: x["score"])
            if best_month_data["score"] > 0:
                best_month = best_month_data["month_name"]

        # Find next good date
        next_good_date = None
        if best_dates:
            earliest = min(best_dates, key=lambda x: x["date"])
            parsed_date = datetime.strptime(earliest["date"], "%Y-%m-%d")
            next_good_date = parsed_date.strftime("%B %d, %Y")

        return {
            "location_configured": True,
            "monthly_summary": monthly_summary,
            "peak_season": peak_season,
            "best_upcoming_dates": best_dates,
            "best_month": best_month,
            "next_good_date": next_good_date,
        }

    def _calculate_monthly_data(
        self,
        ra: float,
        dec: float,
        min_altitude: float,
        year: int,
    ) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
        """Calculate monthly visibility scores and peak season."""
        month_names = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ]

        monthly_scores: List[Dict[str, Any]] = []

        for month in range(1, 13):
            sample_dates = [
                date(year, month, 1),
                date(year, month, 15),
            ]

            total_hours = 0.0
            total_max_alt = 0.0
            count = 0

            for sample_date in sample_dates:
                try:
                    visibility = self.calculate_object_visibility(
                        ra, dec, target_date=sample_date, min_altitude=min_altitude
                    )
                    hours = visibility.get("hours_in_darkness", 0) or 0
                    max_alt = visibility.get("max_altitude_in_darkness", 0) or 0
                    total_hours += hours
                    total_max_alt += max_alt
                    count += 1
                except Exception:
                    continue

            if count > 0:
                avg_hours = total_hours / count
                avg_max_alt = total_max_alt / count
                score = (avg_hours * 8) + (avg_max_alt * 0.5)
            else:
                avg_hours = 0.0
                avg_max_alt = 0.0
                score = 0.0

            monthly_scores.append({
                "month": month,
                "month_name": month_names[month - 1],
                "score": round(score, 1),
                "avg_hours_in_darkness": round(avg_hours, 1),
                "avg_max_altitude": round(avg_max_alt, 1),
                "is_peak_month": False,
            })

        # Find peak months
        peak_season = None
        if monthly_scores:
            scores = [m["score"] for m in monthly_scores]
            max_score = max(scores) if scores else 0
            threshold = max_score * 0.8

            peak_months = []
            for m in monthly_scores:
                if m["score"] >= threshold and m["score"] > 0:
                    m["is_peak_month"] = True
                    peak_months.append(m["month"])

            if peak_months:
                peak_months_set = set(peak_months)
                best_start = peak_months[0]
                best_end = peak_months[0]
                best_length = 1

                for start in peak_months:
                    length = 0
                    current = start
                    while current in peak_months_set or ((current % 12) + 1) in peak_months_set:
                        if current in peak_months_set:
                            length += 1
                            current = (current % 12) + 1
                        else:
                            break
                        if length > 12:
                            break

                    if length > best_length:
                        best_length = length
                        best_start = start
                        best_end = ((start + length - 2) % 12) + 1

                if best_length >= 1:
                    peak_season = {
                        "start_month": best_start,
                        "end_month": best_end,
                        "start_month_name": month_names[best_start - 1],
                        "end_month_name": month_names[best_end - 1],
                        "description": f"Best viewed from {month_names[best_start - 1]} to {month_names[best_end - 1]}"
                        if best_start != best_end else f"Best viewed in {month_names[best_start - 1]}",
                    }

        return monthly_scores, peak_season

    def _derive_upcoming_dates(
        self,
        peak_season: Optional[Dict[str, Any]],
        monthly_summary: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Derive best upcoming dates from peak season data.

        If currently in peak season: return next 5 days.
        If outside peak season: return first 5 days of next peak season.
        """
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        today = date.today()
        current_month = today.month
        current_year = today.year

        if not peak_season:
            return []

        start_month = peak_season["start_month"]
        end_month = peak_season["end_month"]

        # Check if current month is within peak season (handle wrap-around)
        in_peak = self._month_in_range(current_month, start_month, end_month)

        # Get the monthly data for score/hours lookup
        month_data = {m["month"]: m for m in monthly_summary}

        best_dates: List[Dict[str, Any]] = []

        if in_peak:
            # We're in peak season - return next 5 days
            for day_offset in range(5):
                check_date = today + timedelta(days=day_offset)
                month_info = month_data.get(check_date.month, {})
                best_dates.append({
                    "date": check_date.isoformat(),
                    "day_of_week": day_names[check_date.weekday()],
                    "score": month_info.get("score", 0),
                    "hours_in_darkness": month_info.get("avg_hours_in_darkness", 0),
                    "max_altitude": month_info.get("avg_max_altitude", 0),
                    "transit_time": "",
                })
        else:
            # Not in peak season - find start of next peak season
            next_peak_start = self._find_next_peak_start(
                current_month, current_year, start_month
            )
            for day_offset in range(5):
                check_date = next_peak_start + timedelta(days=day_offset)
                month_info = month_data.get(check_date.month, {})
                best_dates.append({
                    "date": check_date.isoformat(),
                    "day_of_week": day_names[check_date.weekday()],
                    "score": month_info.get("score", 0),
                    "hours_in_darkness": month_info.get("avg_hours_in_darkness", 0),
                    "max_altitude": month_info.get("avg_max_altitude", 0),
                    "transit_time": "",
                })

        return best_dates

    def _month_in_range(self, month: int, start: int, end: int) -> bool:
        """Check if month is within start-end range, handling year wrap-around."""
        if start <= end:
            # Normal range (e.g., March to August)
            return start <= month <= end
        else:
            # Wrap-around range (e.g., November to February)
            return month >= start or month <= end

    def _find_next_peak_start(
        self, current_month: int, current_year: int, peak_start_month: int
    ) -> date:
        """Find the date when the next peak season starts."""
        if peak_start_month > current_month:
            # Peak starts later this year
            return date(current_year, peak_start_month, 1)
        else:
            # Peak starts next year
            return date(current_year + 1, peak_start_month, 1)
