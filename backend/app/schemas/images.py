from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any


class ImageObjectAssociation(BaseModel):
    """Represents an object associated with an image."""
    object_id: int
    object_name: str
    association_type: str  # 'primary', 'in_fov', 'manual'
    angular_distance: Optional[float] = None  # arcminutes from image center

    class Config:
        from_attributes = True


class ImageBase(BaseModel):
    file_path: str
    file_name: str
    directory_path: str
    date_taken: Optional[datetime] = None
    exposure_time: Optional[float] = None
    filter_name: Optional[str] = None
    telescope: Optional[str] = None
    camera: Optional[str] = None
    gain: Optional[int] = None
    iso: Optional[int] = None
    binning: Optional[str] = None
    object_id: Optional[int] = None  # Legacy, prefer objects list
    fits_header: Optional[dict[str, Any]] = None


class ImageCreate(ImageBase):
    pass


class ImageUpdate(BaseModel):
    date_taken: Optional[datetime] = None
    exposure_time: Optional[float] = None
    filter_name: Optional[str] = None
    telescope: Optional[str] = None
    camera: Optional[str] = None
    gain: Optional[int] = None
    iso: Optional[int] = None
    binning: Optional[str] = None
    object_id: Optional[int] = None


class ImageResponse(ImageBase):
    id: int
    created_at: datetime
    updated_at: datetime
    object_name: Optional[str] = None  # Legacy, primary object name

    # FOV-related fields
    ra: Optional[float] = None  # Right ascension in degrees
    dec: Optional[float] = None  # Declination in degrees
    pixel_size_x: Optional[float] = None  # microns
    pixel_size_y: Optional[float] = None  # microns
    image_width: Optional[int] = None  # pixels
    image_height: Optional[int] = None  # pixels
    focal_length: Optional[float] = None  # mm
    fov_width: Optional[float] = None  # degrees
    fov_height: Optional[float] = None  # degrees

    # Object associations (many-to-many)
    objects: list[ImageObjectAssociation] = []

    class Config:
        from_attributes = True


class FOVDetectionResult(BaseModel):
    """Result of FOV object detection."""
    catalog: str
    catalog_number: str
    name: Optional[str] = None
    angular_distance_arcmin: float


class SubExposureStats(BaseModel):
    """Stats for a specific filter + sub-exposure combination."""
    filter_name: str | None
    exposure_time: float  # individual sub exposure in seconds
    count: int
    total_exposure: float  # count * exposure_time


class ImageGroup(BaseModel):
    """A group of images from a single imaging session."""
    date: str
    target_name: Optional[str] = None
    target_id: Optional[int] = None
    telescope: Optional[str] = None
    total_frames: int
    total_exposure_seconds: float
    subs: list[SubExposureStats]  # grouped by (filter, exposure_time)
    cameras: list[str]
    image_ids: list[int]
