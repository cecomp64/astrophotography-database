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
)

router = APIRouter(prefix="/config", tags=["configuration"])

LOCATION_KEY = "location"
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
