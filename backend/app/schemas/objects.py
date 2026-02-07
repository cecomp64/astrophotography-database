from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ObjectAliasBase(BaseModel):
    alias_name: str
    catalog: Optional[str] = None


class ObjectAliasCreate(ObjectAliasBase):
    pass


class ObjectAliasResponse(ObjectAliasBase):
    id: int
    object_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ObjectBase(BaseModel):
    primary_name: str
    ra: Optional[float] = None
    dec: Optional[float] = None
    object_type: Optional[str] = None
    magnitude: Optional[float] = None
    size_major: Optional[float] = None  # Major axis in arcminutes
    size_minor: Optional[float] = None  # Minor axis in arcminutes
    constellation: Optional[str] = None


class ObjectCreate(ObjectBase):
    aliases: Optional[list[ObjectAliasCreate]] = None


class ObjectUpdate(BaseModel):
    primary_name: Optional[str] = None
    ra: Optional[float] = None
    dec: Optional[float] = None
    object_type: Optional[str] = None
    magnitude: Optional[float] = None
    size_major: Optional[float] = None
    size_minor: Optional[float] = None
    constellation: Optional[str] = None


class ObjectResponse(ObjectBase):
    id: int
    created_at: datetime
    updated_at: datetime
    aliases: list[ObjectAliasResponse] = []
    image_count: Optional[int] = None

    class Config:
        from_attributes = True


# --- Visibility & Well-Placed Objects ---


class VisibilityInfo(BaseModel):
    """Visibility information for an astronomical object."""

    is_visible_tonight: bool
    current_altitude: Optional[float] = None
    max_altitude: Optional[float] = None
    transit_time: Optional[str] = None
    hours_in_darkness: Optional[float] = None


class WellPlacedObjectResponse(BaseModel):
    """Object with visibility data for well-placed queries."""

    id: int
    primary_name: str
    object_type: Optional[str] = None
    constellation: Optional[str] = None
    magnitude: Optional[float] = None
    size_major: Optional[float] = None
    size_minor: Optional[float] = None
    ra: Optional[float] = None
    dec: Optional[float] = None
    image_count: int
    visibility: VisibilityInfo
    score: float
    aliases: list[ObjectAliasResponse] = []


class WellPlacedObjectsListResponse(BaseModel):
    """Paginated list of well-placed objects."""

    location_configured: bool
    total: int
    skip: int
    limit: int
    objects: list[WellPlacedObjectResponse]


class MiniAltitudeResponse(BaseModel):
    """Simplified altitude data for sparkline charts with visibility stats."""

    data: list[float]  # 24 hourly altitude values
    darkness_start: Optional[int] = None  # hour index where darkness begins
    darkness_end: Optional[int] = None  # hour index where darkness ends
    # Visibility stats (calculated during darkness only)
    max_altitude: Optional[float] = None  # max altitude during darkness
    transit_time: Optional[str] = None  # HH:MM format
    hours_in_darkness: Optional[float] = None  # hours above min altitude during darkness
