from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# --- Project Target Schemas ---

class ProjectTargetBase(BaseModel):
    object_id: int
    is_primary: bool = False
    exposure_goals: Optional[dict[str, float]] = None  # {"L": 36000, "Ha": 72000} in seconds
    notes: Optional[str] = None  # Per-target notes


class ProjectTargetCreate(ProjectTargetBase):
    pass


class TargetProgressResponse(BaseModel):
    exposure_goals: dict[str, float]
    actual_exposure: dict[str, float]
    progress_percent: dict[str, float]
    overall_progress: float
    total_frames: int
    total_exposure_seconds: float


class ProjectTargetResponse(ProjectTargetBase):
    id: int
    project_id: int
    object_name: str
    object_type: Optional[str] = None
    ra: Optional[float] = None
    dec: Optional[float] = None
    constellation: Optional[str] = None
    created_at: datetime
    progress: Optional[TargetProgressResponse] = None

    class Config:
        from_attributes = True


# --- Project Image Schemas ---

class ProjectImageAdd(BaseModel):
    image_ids: list[int]


class LinkImagesFromGroupRequest(BaseModel):
    date: str  # YYYY-MM-DD from the grouping
    target_name: Optional[str] = None
    telescope: Optional[str] = None


class ProjectImageResponse(BaseModel):
    id: int
    project_id: int
    image_id: int
    file_name: str
    filter_name: Optional[str] = None
    exposure_time: Optional[float] = None
    date_taken: Optional[datetime] = None
    added_manually: bool

    class Config:
        from_attributes = True


# --- Project Schemas ---

class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: str = "active"
    priority: int = 0


class ProjectCreate(ProjectBase):
    target_object_ids: Optional[list[int]] = None  # Initial targets to add


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[int] = None


class ProjectResponse(ProjectBase):
    id: int
    created_at: datetime
    updated_at: datetime
    target_count: int = 0
    image_count: int = 0
    overall_progress: Optional[float] = None

    class Config:
        from_attributes = True


class ProjectDetailResponse(ProjectResponse):
    targets: list[ProjectTargetResponse] = []
    images: list[ProjectImageResponse] = []
    progress: Optional[dict] = None


# --- Progress Schemas ---

class ProjectProgressResponse(BaseModel):
    exposure_goals: dict[str, float]
    actual_exposure: dict[str, float]
    progress_percent: dict[str, float]
    overall_progress: float
    total_frames: int
    total_exposure_seconds: float


# --- Visibility Schemas ---

class VisibilityInfo(BaseModel):
    is_visible_tonight: bool
    current_altitude: Optional[float] = None
    max_altitude: Optional[float] = None
    transit_time: Optional[str] = None
    hours_above_min_altitude: Optional[float] = None
    rise_time: Optional[str] = None
    set_time: Optional[str] = None


class WellPlacedProjectResponse(BaseModel):
    project_id: int
    project_name: str
    project_status: str
    primary_target_name: str
    primary_target_id: int
    visibility: VisibilityInfo
    overall_progress: float
    recommended_filter: Optional[str] = None
    score: float


class WellPlacedProjectsListResponse(BaseModel):
    location_configured: bool
    projects: list[WellPlacedProjectResponse]
