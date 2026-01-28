"""Service for calculating object visibility and optimal imaging times."""

from datetime import datetime, date, timezone, timedelta
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

from astropy.coordinates import EarthLocation, AltAz, SkyCoord
from astropy.time import Time
import astropy.units as u
import numpy as np
from sqlalchemy.orm import Session

from app.models.configuration import Configuration


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

    def calculate_object_visibility(
        self,
        ra: float,
        dec: float,
        target_date: Optional[date] = None,
        min_altitude: float = DEFAULT_MIN_ALTITUDE,
    ) -> dict:
        """
        Calculate visibility metrics for an object.

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
                "rise_time": None,
                "set_time": None,
            }

        target = SkyCoord(ra=ra * u.deg, dec=dec * u.deg)
        target_date = target_date or date.today()

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

        # Calculate hours above minimum altitude
        above_min = altitudes >= min_altitude
        hours_above = np.sum(above_min) * (24.0 / 145.0)

        # Determine if visible tonight (above min altitude for at least 1 hour)
        is_visible = hours_above >= 1.0

        return {
            "is_visible_tonight": is_visible,
            "location_configured": True,
            "current_altitude": round(current_altitude, 1),
            "max_altitude": round(max_altitude, 1),
            "transit_time": transit_time_local.strftime("%H:%M"),
            "hours_above_min_altitude": round(hours_above, 1),
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
        Calculate hours remaining above min altitude from now until sunrise.

        Returns:
            Hours remaining for imaging tonight (0 if not visible)
        """
        if not self._location_configured:
            return 0.0

        target = SkyCoord(ra=ra * u.deg, dec=dec * u.deg)
        now_utc = datetime.now(timezone.utc)

        # Generate times from now until 12 hours from now (covers until morning)
        times_hours = np.linspace(0, 12, 73)  # Every 10 minutes for 12 hours
        times = Time(now_utc) + times_hours * u.hour

        # Calculate altitudes
        altaz_frame = AltAz(obstime=times, location=self._location)
        altaz = target.transform_to(altaz_frame)
        altitudes = altaz.alt.deg

        # Count time above minimum altitude
        above_min = altitudes >= min_altitude
        hours_remaining = np.sum(above_min) * (12.0 / 73.0)

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

        # More hours available = better
        hours = visibility.get("hours_above_min_altitude", 0) or 0
        score += hours * 10

        # Lower progress = more urgent (need to capture more data)
        score += (100 - project_progress) * 0.3

        # Priority boost
        score += priority * 5

        return round(score, 1)
