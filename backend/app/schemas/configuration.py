from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Any


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
