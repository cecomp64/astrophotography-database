from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any


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
    object_id: Optional[int] = None
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
    object_name: Optional[str] = None

    class Config:
        from_attributes = True
