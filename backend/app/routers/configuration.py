from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.configuration import Configuration
from app.schemas.configuration import (
    ConfigurationResponse,
    ConfigurationCreate,
    ConfigurationUpdate,
    LocationConfig,
    LocationConfigUpdate,
    TimezoneConfig,
    LocationsConfig,
    SavedLocation,
    SavedLocationCreate,
    SavedLocationUpdate,
)

router = APIRouter(prefix="/config", tags=["configuration"])

LOCATION_KEY = "location"
LOCATIONS_KEY = "locations"
TIMEZONE_KEY = "timezone"


@router.get("", response_model=list[ConfigurationResponse])
def list_configurations(db: Session = Depends(get_db)):
    """List all configurations."""
    return db.query(Configuration).all()


@router.get("/{key}", response_model=ConfigurationResponse)
def get_configuration(key: str, db: Session = Depends(get_db)):
    """Get a configuration by key."""
    config = db.query(Configuration).filter(Configuration.key == key).first()
    if not config:
        raise HTTPException(status_code=404, detail=f"Configuration '{key}' not found")
    return config


@router.post("", response_model=ConfigurationResponse)
def create_configuration(config: ConfigurationCreate, db: Session = Depends(get_db)):
    """Create a new configuration."""
    existing = db.query(Configuration).filter(Configuration.key == config.key).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Configuration '{config.key}' already exists")

    db_config = Configuration(
        key=config.key,
        value=config.value,
        description=config.description,
    )
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config


@router.put("/{key}", response_model=ConfigurationResponse)
def update_configuration(key: str, config: ConfigurationUpdate, db: Session = Depends(get_db)):
    """Update an existing configuration."""
    db_config = db.query(Configuration).filter(Configuration.key == key).first()
    if not db_config:
        raise HTTPException(status_code=404, detail=f"Configuration '{key}' not found")

    if config.value is not None:
        db_config.value = config.value
    if config.description is not None:
        db_config.description = config.description

    db.commit()
    db.refresh(db_config)
    return db_config


@router.delete("/{key}")
def delete_configuration(key: str, db: Session = Depends(get_db)):
    """Delete a configuration."""
    db_config = db.query(Configuration).filter(Configuration.key == key).first()
    if not db_config:
        raise HTTPException(status_code=404, detail=f"Configuration '{key}' not found")

    db.delete(db_config)
    db.commit()
    return {"message": f"Configuration '{key}' deleted successfully"}


# Location-specific endpoints

@router.get("/location/", response_model=Optional[LocationConfig])
def get_location(db: Session = Depends(get_db)):
    """Get the observatory location configuration."""
    config = db.query(Configuration).filter(Configuration.key == LOCATION_KEY).first()
    if not config:
        return None
    return LocationConfig(**config.value)


@router.put("/location/", response_model=LocationConfig)
def set_location(location: LocationConfig, db: Session = Depends(get_db)):
    """Set the observatory location configuration."""
    db_config = db.query(Configuration).filter(Configuration.key == LOCATION_KEY).first()

    if db_config:
        db_config.value = location.model_dump()
    else:
        db_config = Configuration(
            key=LOCATION_KEY,
            value=location.model_dump(),
            description="Observatory location (latitude, longitude, elevation)",
        )
        db.add(db_config)

    db.commit()
    db.refresh(db_config)
    return LocationConfig(**db_config.value)


@router.patch("/location/", response_model=LocationConfig)
def update_location(location: LocationConfigUpdate, db: Session = Depends(get_db)):
    """Partially update the observatory location configuration."""
    db_config = db.query(Configuration).filter(Configuration.key == LOCATION_KEY).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Location not configured. Use PUT to set initial location.")

    current_value = db_config.value.copy()
    update_data = location.model_dump(exclude_unset=True)
    current_value.update(update_data)

    db_config.value = current_value
    db.commit()
    db.refresh(db_config)
    return LocationConfig(**db_config.value)


# Multiple locations endpoints

def _get_locations_config(db: Session) -> LocationsConfig:
    """Helper to get locations config, initializing if not exists."""
    config = db.query(Configuration).filter(Configuration.key == LOCATIONS_KEY).first()
    if not config:
        return LocationsConfig(locations=[], active_id=None)
    return LocationsConfig(**config.value)


def _save_locations_config(db: Session, locations_config: LocationsConfig) -> LocationsConfig:
    """Helper to save locations config."""
    db_config = db.query(Configuration).filter(Configuration.key == LOCATIONS_KEY).first()
    if db_config:
        db_config.value = locations_config.model_dump()
    else:
        db_config = Configuration(
            key=LOCATIONS_KEY,
            value=locations_config.model_dump(),
            description="Saved observatory locations",
        )
        db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return LocationsConfig(**db_config.value)


@router.get("/locations/", response_model=LocationsConfig)
def get_locations(db: Session = Depends(get_db)):
    """Get all saved locations and the active location ID."""
    return _get_locations_config(db)


@router.get("/locations/active", response_model=Optional[SavedLocation])
def get_active_location(db: Session = Depends(get_db)):
    """Get the currently active location for altitude charts."""
    config = _get_locations_config(db)
    if not config.active_id:
        return None
    for loc in config.locations:
        if loc.id == config.active_id:
            return loc
    return None


@router.post("/locations/", response_model=SavedLocation)
def add_location(location: SavedLocationCreate, db: Session = Depends(get_db)):
    """Add a new saved location."""
    import uuid
    import zoneinfo

    # Validate the timezone
    try:
        zoneinfo.ZoneInfo(location.timezone)
    except (KeyError, zoneinfo.ZoneInfoNotFoundError):
        raise HTTPException(status_code=400, detail=f"Invalid timezone: {location.timezone}")

    config = _get_locations_config(db)
    new_location = SavedLocation(
        id=str(uuid.uuid4()),
        name=location.name,
        latitude=location.latitude,
        longitude=location.longitude,
        elevation=location.elevation,
        timezone=location.timezone,
    )
    config.locations.append(new_location)

    # If this is the first location, make it active
    if len(config.locations) == 1:
        config.active_id = new_location.id

    _save_locations_config(db, config)
    return new_location


@router.put("/locations/{location_id}", response_model=SavedLocation)
def update_saved_location(
    location_id: str,
    location: SavedLocationUpdate,
    db: Session = Depends(get_db)
):
    """Update a saved location."""
    import zoneinfo

    # Validate timezone if provided
    if location.timezone is not None:
        try:
            zoneinfo.ZoneInfo(location.timezone)
        except (KeyError, zoneinfo.ZoneInfoNotFoundError):
            raise HTTPException(status_code=400, detail=f"Invalid timezone: {location.timezone}")

    config = _get_locations_config(db)

    for i, loc in enumerate(config.locations):
        if loc.id == location_id:
            update_data = location.model_dump(exclude_unset=True)
            updated_loc = loc.model_copy(update=update_data)
            config.locations[i] = updated_loc
            _save_locations_config(db, config)
            return updated_loc

    raise HTTPException(status_code=404, detail=f"Location '{location_id}' not found")


@router.delete("/locations/{location_id}")
def delete_location(location_id: str, db: Session = Depends(get_db)):
    """Delete a saved location."""
    config = _get_locations_config(db)

    original_len = len(config.locations)
    config.locations = [loc for loc in config.locations if loc.id != location_id]

    if len(config.locations) == original_len:
        raise HTTPException(status_code=404, detail=f"Location '{location_id}' not found")

    # If we deleted the active location, clear active_id or set to first available
    if config.active_id == location_id:
        config.active_id = config.locations[0].id if config.locations else None

    _save_locations_config(db, config)
    return {"message": f"Location '{location_id}' deleted successfully"}


@router.put("/locations/{location_id}/active", response_model=LocationsConfig)
def set_active_location(location_id: str, db: Session = Depends(get_db)):
    """Set a location as the active location for altitude charts."""
    config = _get_locations_config(db)

    # Verify the location exists
    found = any(loc.id == location_id for loc in config.locations)
    if not found:
        raise HTTPException(status_code=404, detail=f"Location '{location_id}' not found")

    config.active_id = location_id
    return _save_locations_config(db, config)


# Timezone-specific endpoints

@router.get("/timezone/", response_model=Optional[TimezoneConfig])
def get_timezone(db: Session = Depends(get_db)):
    """Get the timezone configuration."""
    config = db.query(Configuration).filter(Configuration.key == TIMEZONE_KEY).first()
    if not config:
        return None
    return TimezoneConfig(**config.value)


@router.put("/timezone/", response_model=TimezoneConfig)
def set_timezone(timezone_config: TimezoneConfig, db: Session = Depends(get_db)):
    """Set the timezone configuration."""
    import zoneinfo

    # Validate the timezone
    try:
        zoneinfo.ZoneInfo(timezone_config.timezone)
    except (KeyError, zoneinfo.ZoneInfoNotFoundError):
        raise HTTPException(status_code=400, detail=f"Invalid timezone: {timezone_config.timezone}")

    db_config = db.query(Configuration).filter(Configuration.key == TIMEZONE_KEY).first()

    if db_config:
        db_config.value = timezone_config.model_dump()
    else:
        db_config = Configuration(
            key=TIMEZONE_KEY,
            value=timezone_config.model_dump(),
            description="Timezone for display (IANA timezone identifier)",
        )
        db.add(db_config)

    db.commit()
    db.refresh(db_config)
    return TimezoneConfig(**db_config.value)
