from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, or_, exists, case
from typing import Optional
from datetime import datetime, date, timezone
from zoneinfo import ZoneInfo
from pydantic import BaseModel

from astropy.coordinates import EarthLocation, AltAz, SkyCoord
from astropy.time import Time
import astropy.units as u
import numpy as np

from app.database import get_db
from app.models import AstroObject, ObjectAlias, Image, ImageObject
from app.models.configuration import Configuration
from app.schemas import ObjectResponse, ObjectCreate, ObjectUpdate, ObjectAliasCreate
from app.services.name_resolver import NameResolver
from app.services.visibility_service import VisibilityService


class AltitudeDataPoint(BaseModel):
    time: str
    altitude: float
    azimuth: float


class TwilightTimes(BaseModel):
    sunset: Optional[str] = None
    civil_dusk: Optional[str] = None
    nautical_dusk: Optional[str] = None
    astronomical_dusk: Optional[str] = None
    astronomical_dawn: Optional[str] = None
    nautical_dawn: Optional[str] = None
    civil_dawn: Optional[str] = None
    sunrise: Optional[str] = None


class AltitudeChartResponse(BaseModel):
    object_name: str
    date: str
    timezone: str
    location_configured: bool
    data: list[AltitudeDataPoint]
    transit_time: Optional[str]
    transit_altitude: Optional[float]
    rise_time: Optional[str]
    set_time: Optional[str]
    twilight: Optional[TwilightTimes] = None

router = APIRouter(prefix="/objects", tags=["objects"])


@router.get("", response_model=list[ObjectResponse])
def list_objects(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    object_type: Optional[str] = None,
    constellation: Optional[str] = None,
    primary_only: bool = Query(True, description="Only show objects that are primary targets of images"),
    db: Session = Depends(get_db),
):
    """List astronomical objects with optional filters. By default, only includes objects that are primary targets."""
    # Use a subquery to get image counts per object efficiently
    image_count_subquery = (
        db.query(
            ImageObject.object_id,
            func.count(ImageObject.id).label("image_count")
        )
        .group_by(ImageObject.object_id)
    )

    if primary_only:
        # Only count images where this object is the primary target
        image_count_subquery = image_count_subquery.filter(ImageObject.association_type == "primary")

    image_count_subquery = image_count_subquery.subquery()

    # Main query with eager loading for aliases
    query = (
        db.query(AstroObject, func.coalesce(image_count_subquery.c.image_count, 0).label("image_count"))
        .outerjoin(image_count_subquery, AstroObject.id == image_count_subquery.c.object_id)
        .options(selectinload(AstroObject.aliases))
    )

    if primary_only:
        # Only include objects that have at least one primary image
        query = query.filter(image_count_subquery.c.image_count > 0)
    else:
        # Include objects that have any image association
        has_legacy_images = exists().where(Image.object_id == AstroObject.id)
        has_image_objects = exists().where(ImageObject.object_id == AstroObject.id)
        query = query.filter(or_(has_legacy_images, has_image_objects))

    if object_type:
        query = query.filter(AstroObject.object_type.ilike(f"%{object_type}%"))

    if constellation:
        query = query.filter(AstroObject.constellation.ilike(f"%{constellation}%"))

    # Order by image count descending to show most photographed objects first
    query = query.order_by(func.coalesce(image_count_subquery.c.image_count, 0).desc())

    results = query.offset(skip).limit(limit).all()

    # Build response - aliases are already loaded via selectinload
    response = []
    for obj, image_count in results:
        response.append({
            "id": obj.id,
            "primary_name": obj.primary_name,
            "ra": obj.ra,
            "dec": obj.dec,
            "object_type": obj.object_type,
            "magnitude": obj.magnitude,
            "constellation": obj.constellation,
            "created_at": obj.created_at,
            "updated_at": obj.updated_at,
            "aliases": obj.aliases,
            "image_count": image_count,
        })

    return response


@router.get("/search", response_model=list[ObjectResponse])
def search_objects(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Search objects by name or alias (fuzzy search)."""
    resolver = NameResolver(db)
    objects = resolver.fuzzy_search(q, limit=limit)

    if not objects:
        return []

    # Get image counts for all found objects in a single query
    object_ids = [obj.id for obj in objects]
    image_counts = dict(
        db.query(ImageObject.object_id, func.count(ImageObject.id))
        .filter(ImageObject.object_id.in_(object_ids))
        .group_by(ImageObject.object_id)
        .all()
    )

    result = []
    for obj in objects:
        obj_dict = {
            "id": obj.id,
            "primary_name": obj.primary_name,
            "ra": obj.ra,
            "dec": obj.dec,
            "object_type": obj.object_type,
            "magnitude": obj.magnitude,
            "constellation": obj.constellation,
            "created_at": obj.created_at,
            "updated_at": obj.updated_at,
            "aliases": obj.aliases,
            "image_count": image_counts.get(obj.id, 0),
        }
        result.append(obj_dict)

    return result


@router.get("/{object_id}", response_model=ObjectResponse)
def get_object(object_id: int, db: Session = Depends(get_db)):
    """Get a specific astronomical object by ID."""
    obj = (
        db.query(AstroObject)
        .options(selectinload(AstroObject.aliases))
        .filter(AstroObject.id == object_id)
        .first()
    )

    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    # Get image count in a single query
    image_count = db.query(func.count(ImageObject.id)).filter(ImageObject.object_id == object_id).scalar()

    return {
        "id": obj.id,
        "primary_name": obj.primary_name,
        "ra": obj.ra,
        "dec": obj.dec,
        "object_type": obj.object_type,
        "magnitude": obj.magnitude,
        "constellation": obj.constellation,
        "created_at": obj.created_at,
        "updated_at": obj.updated_at,
        "aliases": obj.aliases,
        "image_count": image_count or 0,
    }


@router.post("", response_model=ObjectResponse, status_code=201)
def create_object(obj_data: ObjectCreate, db: Session = Depends(get_db)):
    """Create a new astronomical object."""
    obj = AstroObject(
        primary_name=obj_data.primary_name,
        ra=obj_data.ra,
        dec=obj_data.dec,
        object_type=obj_data.object_type,
        magnitude=obj_data.magnitude,
        constellation=obj_data.constellation,
    )
    db.add(obj)
    db.flush()

    # Add aliases if provided
    if obj_data.aliases:
        for alias_data in obj_data.aliases:
            alias = ObjectAlias(
                object_id=obj.id,
                alias_name=alias_data.alias_name,
                catalog=alias_data.catalog,
            )
            db.add(alias)

    db.commit()
    db.refresh(obj)

    return {
        "id": obj.id,
        "primary_name": obj.primary_name,
        "ra": obj.ra,
        "dec": obj.dec,
        "object_type": obj.object_type,
        "magnitude": obj.magnitude,
        "constellation": obj.constellation,
        "created_at": obj.created_at,
        "updated_at": obj.updated_at,
        "aliases": obj.aliases,
        "image_count": 0,
    }


@router.patch("/{object_id}", response_model=ObjectResponse)
def update_object(object_id: int, obj_data: ObjectUpdate, db: Session = Depends(get_db)):
    """Update an astronomical object."""
    obj = db.query(AstroObject).filter(AstroObject.id == object_id).first()

    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    update_data = obj_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(obj, field, value)

    db.commit()
    db.refresh(obj)

    image_count = db.query(func.count(ImageObject.id)).filter(ImageObject.object_id == object_id).scalar()

    return {
        "id": obj.id,
        "primary_name": obj.primary_name,
        "ra": obj.ra,
        "dec": obj.dec,
        "object_type": obj.object_type,
        "magnitude": obj.magnitude,
        "constellation": obj.constellation,
        "created_at": obj.created_at,
        "updated_at": obj.updated_at,
        "aliases": obj.aliases,
        "image_count": image_count or 0,
    }


@router.delete("/{object_id}", status_code=204)
def delete_object(object_id: int, db: Session = Depends(get_db)):
    """Delete an astronomical object."""
    obj = db.query(AstroObject).filter(AstroObject.id == object_id).first()

    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    db.delete(obj)
    db.commit()


@router.post("/{object_id}/aliases", response_model=ObjectResponse)
def add_alias(object_id: int, alias_data: ObjectAliasCreate, db: Session = Depends(get_db)):
    """Add an alias to an astronomical object."""
    obj = db.query(AstroObject).filter(AstroObject.id == object_id).first()

    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    alias = ObjectAlias(
        object_id=obj.id,
        alias_name=alias_data.alias_name,
        catalog=alias_data.catalog,
    )
    db.add(alias)
    db.commit()
    db.refresh(obj)

    image_count = db.query(func.count(ImageObject.id)).filter(ImageObject.object_id == object_id).scalar()

    return {
        "id": obj.id,
        "primary_name": obj.primary_name,
        "ra": obj.ra,
        "dec": obj.dec,
        "object_type": obj.object_type,
        "magnitude": obj.magnitude,
        "constellation": obj.constellation,
        "created_at": obj.created_at,
        "updated_at": obj.updated_at,
        "aliases": obj.aliases,
        "image_count": image_count or 0,
    }


@router.get("/resolve", response_model=ObjectResponse)
async def resolve_object(
    q: str = Query(..., min_length=1, description="Object name to resolve"),
    db: Session = Depends(get_db),
):
    """
    Resolve an object name using local database and Telescopius API.
    Creates a new object record if found externally but not in local DB.
    """
    resolver = NameResolver(db, use_mock=True)
    obj = await resolver.resolve_async(q)

    if not obj:
        raise HTTPException(status_code=404, detail=f"Could not resolve object: {q}")

    image_count = db.query(func.count(ImageObject.id)).filter(ImageObject.object_id == obj.id).scalar()

    return {
        "id": obj.id,
        "primary_name": obj.primary_name,
        "ra": obj.ra,
        "dec": obj.dec,
        "object_type": obj.object_type,
        "magnitude": obj.magnitude,
        "constellation": obj.constellation,
        "created_at": obj.created_at,
        "updated_at": obj.updated_at,
        "aliases": obj.aliases,
        "image_count": image_count or 0,
    }


@router.get("/{object_id}/altitude", response_model=AltitudeChartResponse)
def get_altitude_chart(
    object_id: int,
    chart_date: Optional[date] = Query(None, description="Date for the chart (defaults to today)"),
    db: Session = Depends(get_db),
):
    """
    Calculate altitude of an object over the course of a night.
    Returns altitude/azimuth data points at 10-minute intervals over 24 hours
    centered on local midnight for the given date.
    Times are displayed in the configured timezone.
    """
    obj = db.query(AstroObject).filter(AstroObject.id == object_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    if obj.ra is None or obj.dec is None:
        raise HTTPException(status_code=400, detail="Object has no coordinates")

    # Get location configuration - first try multi-location config, then fall back to legacy
    locations_config = db.query(Configuration).filter(Configuration.key == "locations").first()
    latitude = None
    longitude = None
    elevation = 0
    tz_name = "UTC"

    if locations_config and locations_config.value:
        locs = locations_config.value.get("locations", [])
        active_id = locations_config.value.get("active_id")
        if active_id and locs:
            for loc in locs:
                if loc.get("id") == active_id:
                    latitude = loc.get("latitude")
                    longitude = loc.get("longitude")
                    elevation = loc.get("elevation", 0)
                    tz_name = loc.get("timezone", "UTC")
                    break

    # Fall back to legacy single-location config and separate timezone config
    if latitude is None:
        legacy_config = db.query(Configuration).filter(Configuration.key == "location").first()
        if legacy_config and legacy_config.value:
            latitude = legacy_config.value.get("latitude")
            longitude = legacy_config.value.get("longitude")
            elevation = legacy_config.value.get("elevation", 0)
        # Use legacy timezone config for legacy location
        timezone_config = db.query(Configuration).filter(Configuration.key == "timezone").first()
        if timezone_config and timezone_config.value:
            tz_name = timezone_config.value.get("timezone", "UTC")

    # Parse timezone
    try:
        local_tz = ZoneInfo(tz_name)
    except KeyError:
        local_tz = ZoneInfo("UTC")
        tz_name = "UTC"

    if latitude is None or longitude is None:
        return AltitudeChartResponse(
            object_name=obj.primary_name,
            date=str(chart_date or date.today()),
            timezone=tz_name,
            location_configured=False,
            data=[],
            transit_time=None,
            transit_altitude=None,
            rise_time=None,
            set_time=None,
        )

    # Create location and sky coordinate
    observer_location = EarthLocation(lat=latitude * u.deg, lon=longitude * u.deg, height=elevation * u.m)
    target = SkyCoord(ra=obj.ra * u.deg, dec=obj.dec * u.deg)

    # Use provided date or today
    target_date = chart_date or date.today()

    # Create time array: 24 hours centered on local midnight, 10-minute intervals
    # Create midnight in the local timezone, then convert to UTC for astropy
    local_midnight = datetime(target_date.year, target_date.month, target_date.day, 0, 0, 0, tzinfo=local_tz)
    utc_midnight = local_midnight.astimezone(timezone.utc)

    # Generate times from 12 hours before to 12 hours after local midnight
    times_hours = np.linspace(-12, 12, 145)  # 145 points = every 10 minutes over 24 hours
    times = Time(utc_midnight) + times_hours * u.hour

    # Calculate alt/az for all times
    altaz_frame = AltAz(obstime=times, location=observer_location)
    altaz = target.transform_to(altaz_frame)

    altitudes = altaz.alt.deg
    azimuths = altaz.az.deg

    # Find transit (maximum altitude)
    max_alt_idx = np.argmax(altitudes)
    transit_time_utc = times[max_alt_idx].to_datetime(timezone=timezone.utc)
    transit_time_local = transit_time_utc.astimezone(local_tz)
    transit_altitude = float(altitudes[max_alt_idx])

    # Find rise and set times (crossing 0 altitude)
    rise_time = None
    set_time = None

    for i in range(1, len(altitudes)):
        # Rising: previous altitude < 0, current >= 0
        if altitudes[i - 1] < 0 and altitudes[i] >= 0 and rise_time is None:
            dt_utc = times[i].to_datetime(timezone=timezone.utc)
            dt_local = dt_utc.astimezone(local_tz)
            rise_time = dt_local.strftime("%H:%M")
        # Setting: previous altitude >= 0, current < 0
        if altitudes[i - 1] >= 0 and altitudes[i] < 0:
            dt_utc = times[i].to_datetime(timezone=timezone.utc)
            dt_local = dt_utc.astimezone(local_tz)
            set_time = dt_local.strftime("%H:%M")

    # Build data points with local times
    data_points = []
    for i in range(len(times)):
        dt_utc = times[i].to_datetime(timezone=timezone.utc)
        dt_local = dt_utc.astimezone(local_tz)
        data_points.append(AltitudeDataPoint(
            time=dt_local.strftime("%H:%M"),
            altitude=round(float(altitudes[i]), 2),
            azimuth=round(float(azimuths[i]), 2),
        ))

    # Calculate twilight times
    visibility_service = VisibilityService(db)
    twilight_data = visibility_service.calculate_twilight_times(target_date)
    twilight = None
    if twilight_data:
        twilight = TwilightTimes(
            sunset=twilight_data.get('sunset'),
            civil_dusk=twilight_data.get('civil_dusk'),
            nautical_dusk=twilight_data.get('nautical_dusk'),
            astronomical_dusk=twilight_data.get('astronomical_dusk'),
            astronomical_dawn=twilight_data.get('astronomical_dawn'),
            nautical_dawn=twilight_data.get('nautical_dawn'),
            civil_dawn=twilight_data.get('civil_dawn'),
            sunrise=twilight_data.get('sunrise'),
        )

    return AltitudeChartResponse(
        object_name=obj.primary_name,
        date=str(target_date),
        timezone=tz_name,
        location_configured=True,
        data=data_points,
        transit_time=transit_time_local.strftime("%H:%M") if transit_time_local else None,
        transit_altitude=round(transit_altitude, 2) if transit_altitude else None,
        rise_time=rise_time,
        set_time=set_time,
        twilight=twilight,
    )
