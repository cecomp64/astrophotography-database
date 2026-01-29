"""Service for calculating object visibility and optimal imaging times."""

from datetime import datetime, date, timezone
from typing import Optional, Dict, Any
from zoneinfo import ZoneInfo

from astropy.coordinates import EarthLocation, AltAz, SkyCoord
from astropy.time import Time
import astropy.units as u
from astroplan import Observer
import numpy as np
from sqlalchemy.orm import Session

from app.models.configuration import Configuration


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

        # Create time array: 24 hours centered on local midnight
        local_midnight = datetime(
            target_date.year, target_date.month, target_date.day,
            0, 0, 0, tzinfo=self._timezone
        )
        utc_midnight = local_midnight.astimezone(timezone.utc)

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
        if twilight and '_astro_dusk_time' in twilight and '_astro_dawn_time' in twilight:
            astro_dusk = twilight['_astro_dusk_time']
            astro_dawn = twilight['_astro_dawn_time']

            # Create mask for times during astronomical darkness
            is_dark = (times >= astro_dusk) & (times <= astro_dawn)

            # Count time points that are both above min altitude AND in darkness
            visible_in_dark = above_min & is_dark
            hours_in_darkness = np.sum(visible_in_dark) * (24.0 / 145.0)

        # Determine if visible tonight: must be above min altitude during darkness for at least 1 hour
        is_visible = bool(hours_in_darkness >= 1.0)

        return {
            "is_visible_tonight": is_visible,
            "location_configured": True,
            "current_altitude": round(current_altitude, 1),
            "max_altitude": round(max_altitude, 1),
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
