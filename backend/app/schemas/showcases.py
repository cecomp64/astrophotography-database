from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Literal


class ShowcaseResponse(BaseModel):
    """Response model for showcase image metadata."""
    id: int
    object_id: int
    source_type: Literal["upload", "indexed", "survey"]
    file_path: str
    original_image_id: Optional[int] = None
    survey_name: Optional[str] = None
    cached_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
