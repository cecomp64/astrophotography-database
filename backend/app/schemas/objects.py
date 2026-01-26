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
    constellation: Optional[str] = None


class ObjectCreate(ObjectBase):
    aliases: Optional[list[ObjectAliasCreate]] = None


class ObjectUpdate(BaseModel):
    primary_name: Optional[str] = None
    ra: Optional[float] = None
    dec: Optional[float] = None
    object_type: Optional[str] = None
    magnitude: Optional[float] = None
    constellation: Optional[str] = None


class ObjectResponse(ObjectBase):
    id: int
    created_at: datetime
    updated_at: datetime
    aliases: list[ObjectAliasResponse] = []
    image_count: Optional[int] = None

    class Config:
        from_attributes = True
