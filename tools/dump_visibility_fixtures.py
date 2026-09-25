#!/usr/bin/env python3
"""Dump astroplan/astropy visibility results as golden fixtures for the Hub.

The Hub (altair-observatory-system/hub) re-implements this app's visibility maths
in Ruby (docs/SYSTEM_ARCHITECTURE.md §7.2). Its specs compare against the JSON
this script writes: altitude within 0.5 deg, twilight within 2 min, best month
identical.

It drives this app's own VisibilityService, so the numbers are exactly what the
desktop app showed.

    cd backend && pip install -r requirements.txt
    APP_USER_DATA=/tmp/astrodb python ../tools/dump_visibility_fixtures.py > visibility.json
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import astropy.units as u  # noqa: E402
from astropy.coordinates import AltAz, EarthLocation, SkyCoord, get_body  # noqa: E402
from astropy.time import Time  # noqa: E402
from astropy.utils import iers  # noqa: E402

iers.conf.auto_download = False  # reproducible offline; IERS-B bundled with astropy

from app.services.visibility_service import VisibilityService  # noqa: E402

SITES = {
    "san-jose": {"latitude": 37.34, "longitude": -121.89, "elevation_m": 100, "timezone": "America/Los_Angeles"},
    "siding-spring": {"latitude": -31.27, "longitude": 149.07, "elevation_m": 1165, "timezone": "Australia/Sydney"},
}
DATES = [date(2026, 1, 15), date(2026, 6, 21), date(2026, 9, 24)]
MIN_ALTITUDE = 30.0
OBJECTS = {  # J2000 degrees
    "M31": (10.6847, 41.2690), "M42": (83.8221, -5.3911), "M45": (56.8500, 24.1167), "M51": (202.4696, 47.1952),
    "M81": (148.8882, 69.0653), "M101": (210.8024, 54.3488), "M13": (250.4235, 36.4613), "M27": (299.9016, 22.7211),
    "M57": (283.3963, 33.0292), "NGC7000": (314.6833, 44.5333), "IC1396": (324.7500, 57.5000), "M8": (270.9042, -24.3867),
    "M16": (274.7000, -13.8067), "M20": (270.6750, -22.9717), "M33": (23.4621, 30.6599), "NGC2244": (97.9833, 4.9417),
    "IC434": (85.2500, -2.4583), "M1": (83.6331, 22.0145), "NGC253": (11.8880, -25.2883), "LMC": (80.8938, -69.7561),
}


def service_for(site: dict) -> VisibilityService:
    svc = VisibilityService.__new__(VisibilityService)  # skip the DB-backed location lookup
    svc.db = None
    svc._location = EarthLocation(lat=site["latitude"] * u.deg, lon=site["longitude"] * u.deg, height=site["elevation_m"] * u.m)
    svc._tz_name = site["timezone"]
    svc._timezone = ZoneInfo(site["timezone"])
    svc._location_configured = True
    svc._location_id = "fixture"
    return svc


def iso(t: Time) -> str:
    return t.to_datetime(timezone=timezone.utc).isoformat().replace("+00:00", "Z")


def night(svc: VisibilityService, site: dict, d: date) -> dict:
    tw = svc.calculate_twilight_times(d)
    twilight = {k: iso(v) for k, v in (("astronomical_dusk", tw["_astro_dusk_time"]), ("astronomical_dawn", tw["_astro_dawn_time"]))}
    observer = svc._get_observer()
    ref = Time(datetime(d.year, d.month, d.day, 12, tzinfo=svc._timezone).astimezone(timezone.utc))
    for name, horizon, fn in (("sunset", 0, observer.sun_set_time), ("civil_dusk", -6, observer.sun_set_time),
                              ("nautical_dusk", -12, observer.sun_set_time), ("nautical_dawn", -12, observer.sun_rise_time),
                              ("civil_dawn", -6, observer.sun_rise_time), ("sunrise", 0, observer.sun_rise_time)):
        twilight[name] = iso(fn(ref, which="next", horizon=horizon * u.deg))

    # Hourly samples from local 18:00 to 06:00.
    start = datetime(d.year, d.month, d.day, 18, tzinfo=svc._timezone).astimezone(timezone.utc)
    samples = [Time(start + timedelta(hours=h)) for h in range(13)]
    times = Time(samples)
    frame = AltAz(obstime=times, location=svc._location)
    moon = get_body("moon", times, svc._location).transform_to(frame)
    sun = get_body("sun", times, svc._location).transform_to(frame)

    objects = {}
    for name, (ra, dec) in OBJECTS.items():
        vis = svc.calculate_object_visibility(ra, dec, target_date=d, min_altitude=MIN_ALTITUDE)
        altaz = SkyCoord(ra=ra * u.deg, dec=dec * u.deg).transform_to(frame)
        objects[name] = {
            "altitudes": [[iso(t), round(float(a), 3), round(float(z), 3)] for t, a, z in zip(samples, altaz.alt.deg, altaz.az.deg)],
            "max_altitude": vis["max_altitude"],
            "max_altitude_in_darkness": vis["max_altitude_in_darkness"],
            "transit_time": vis["transit_time"],
            "hours_in_darkness": vis["hours_in_darkness"],
            "hours_above_min_altitude": vis["hours_above_min_altitude"],
        }
    return {
        "date": d.isoformat(),
        "twilight": twilight,
        "sun_altitudes": [[iso(t), round(float(a), 3)] for t, a in zip(samples, sun.alt.deg)],
        "moon_altitudes": [[iso(t), round(float(a), 3), round(float(z), 3)] for t, a, z in zip(samples, moon.alt.deg, moon.az.deg)],
        "objects": objects,
    }


def best_viewing(svc: VisibilityService, year: int) -> dict:
    result = {}
    for name, (ra, dec) in OBJECTS.items():
        monthly, peak = svc._calculate_monthly_data(ra, dec, MIN_ALTITUDE, year)
        best = max(monthly, key=lambda m: m["score"])
        result[name] = {
            "best_month": best["month"] if best["score"] > 0 else None,
            "monthly_scores": [m["score"] for m in monthly],
            "peak_season": peak and {"start_month": peak["start_month"], "end_month": peak["end_month"]},
        }
    return result


def main() -> None:
    out = {
        "generator": "astrophotography-database tools/dump_visibility_fixtures.py",
        "astropy": __import__("astropy").__version__, "astroplan": __import__("astroplan").__version__,
        "min_altitude": MIN_ALTITUDE,
        "objects": {k: {"ra_deg": v[0], "dec_deg": v[1]} for k, v in OBJECTS.items()},
        "sites": {},
    }
    for key, site in SITES.items():
        svc = service_for(site)
        print(f"{key}: nights", file=sys.stderr)
        nights = [night(svc, site, d) for d in DATES]
        print(f"{key}: best viewing", file=sys.stderr)
        out["sites"][key] = {**site, "nights": nights, "best_viewing": {"year": 2026, **best_viewing(svc, 2026)}}
    json.dump(out, sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
