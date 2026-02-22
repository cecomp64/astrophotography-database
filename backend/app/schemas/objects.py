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


# --- Best Viewing Periods ---


class MonthlyViewingScore(BaseModel):
    """Viewing score for a specific month."""

    month: int  # 1-12
    month_name: str  # "January", etc.
    score: float  # 0-100 composite score
    avg_hours_in_darkness: float  # Average hours above min_alt during darkness
    avg_max_altitude: float  # Average max altitude during darkness
    is_peak_month: bool  # True if this is one of the best months


class UpcomingBestDate(BaseModel):
    """A specific date with excellent viewing conditions."""

    date: str  # "2026-03-15"
    day_of_week: str  # "Saturday"
    score: float
    hours_in_darkness: float
    max_altitude: float
    transit_time: str  # "23:45"


class PeakSeason(BaseModel):
    """The best viewing season for this object."""

    start_month: int
    end_month: int
    start_month_name: str
    end_month_name: str
    description: str  # "Best viewed from March to May"


class BestViewingResponse(BaseModel):
    """Complete best viewing periods response."""

    location_configured: bool
    object_name: str
    monthly_summary: list[MonthlyViewingScore]
    peak_season: Optional[PeakSeason] = None
    best_upcoming_dates: list[UpcomingBestDate]
    # Quick summary
    best_month: Optional[str] = None  # "April"
    next_good_date: Optional[str] = None  # "March 15, 2026"
