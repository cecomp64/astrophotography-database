from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Any


class SavedLocation(BaseModel):
    """A saved location with a unique ID and name."""
    id: str = Field(..., description="Unique identifier for the location")
    name: str = Field(..., min_length=1, max_length=100, description="Display name for the location")
    latitude: float = Field(..., ge=-90, le=90, description="Latitude in degrees (-90 to 90)")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in degrees (-180 to 180)")
    elevation: float = Field(0, ge=-500, le=9000, description="Elevation in meters above sea level")
    timezone: str = Field("UTC", description="IANA timezone identifier (e.g. 'America/New_York', 'Europe/London')")


class SavedLocationCreate(BaseModel):
    """Schema for creating a new saved location."""
    name: str = Field(..., min_length=1, max_length=100, description="Display name for the location")
    latitude: float = Field(..., ge=-90, le=90, description="Latitude in degrees (-90 to 90)")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in degrees (-180 to 180)")
    elevation: float = Field(0, ge=-500, le=9000, description="Elevation in meters above sea level")
    timezone: str = Field("UTC", description="IANA timezone identifier (e.g. 'America/New_York', 'Europe/London')")


class SavedLocationUpdate(BaseModel):
    """Schema for updating a saved location."""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="Display name for the location")
    latitude: Optional[float] = Field(None, ge=-90, le=90, description="Latitude in degrees (-90 to 90)")
    longitude: Optional[float] = Field(None, ge=-180, le=180, description="Longitude in degrees (-180 to 180)")
    elevation: Optional[float] = Field(None, ge=-500, le=9000, description="Elevation in meters above sea level")
    timezone: Optional[str] = Field(None, description="IANA timezone identifier (e.g. 'America/New_York', 'Europe/London')")


class LocationsConfig(BaseModel):
    """Configuration holding multiple saved locations and the active one."""
    locations: list[SavedLocation] = Field(default_factory=list, description="List of saved locations")
    active_id: Optional[str] = Field(None, description="ID of the currently active location")


class LocationConfig(BaseModel):
    """Location configuration with latitude, longitude, and elevation."""
    latitude: float = Field(..., ge=-90, le=90, description="Latitude in degrees (-90 to 90)")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in degrees (-180 to 180)")
    elevation: float = Field(0, ge=-500, le=9000, description="Elevation in meters above sea level")


class LocationConfigUpdate(BaseModel):
    """Update schema for location configuration."""
    latitude: Optional[float] = Field(None, ge=-90, le=90, description="Latitude in degrees (-90 to 90)")
    longitude: Optional[float] = Field(None, ge=-180, le=180, description="Longitude in degrees (-180 to 180)")
    elevation: Optional[float] = Field(None, ge=-500, le=9000, description="Elevation in meters above sea level")


class TimezoneConfig(BaseModel):
    """Timezone configuration."""
    timezone: str = Field(..., description="IANA timezone identifier (e.g. 'America/New_York', 'Europe/London')")


class TelescopiusApiKeyConfig(BaseModel):
    """Telescopius API key configuration."""
    api_key: str = Field("", description="Telescopius API key for object name resolution")


class ConfigurationBase(BaseModel):
    """Base configuration schema."""
    key: str = Field(..., max_length=100)
    value: Any
    description: Optional[str] = Field(None, max_length=500)


class ConfigurationCreate(ConfigurationBase):
    """Schema for creating a configuration."""
    pass


class ConfigurationUpdate(BaseModel):
    """Schema for updating a configuration."""
    value: Optional[Any] = None
    description: Optional[str] = Field(None, max_length=500)


class ConfigurationResponse(ConfigurationBase):
    """Schema for configuration response."""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
