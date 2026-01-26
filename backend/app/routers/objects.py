from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional

from app.database import get_db
from app.models import AstroObject, ObjectAlias, Image
from app.schemas import ObjectResponse, ObjectCreate, ObjectUpdate, ObjectAliasCreate
from app.services.name_resolver import NameResolver

router = APIRouter(prefix="/objects", tags=["objects"])


@router.get("", response_model=list[ObjectResponse])
def list_objects(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    object_type: Optional[str] = None,
    constellation: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all astronomical objects with optional filters."""
    query = db.query(AstroObject)

    if object_type:
        query = query.filter(AstroObject.object_type.ilike(f"%{object_type}%"))

    if constellation:
        query = query.filter(AstroObject.constellation.ilike(f"%{constellation}%"))

    objects = query.offset(skip).limit(limit).all()

    # Add image counts
    result = []
    for obj in objects:
        obj_dict = {
            "id": obj.id,
            "primary_name": obj.primary_name,
            "ra": obj.ra,
            "dec": obj.dec,
            "object_type": obj.object_type,
            "magnitude": obj.magnitude,
            "constellation": obj.constellation,
            "created_at": obj.created_at,
            "updated_at": obj.updated_at,
            "aliases": obj.aliases,
            "image_count": len(obj.images),
        }
        result.append(obj_dict)

    return result


@router.get("/search", response_model=list[ObjectResponse])
def search_objects(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Search objects by name or alias (fuzzy search)."""
    resolver = NameResolver(db)
    objects = resolver.fuzzy_search(q, limit=limit)

    result = []
    for obj in objects:
        obj_dict = {
            "id": obj.id,
            "primary_name": obj.primary_name,
            "ra": obj.ra,
            "dec": obj.dec,
            "object_type": obj.object_type,
            "magnitude": obj.magnitude,
            "constellation": obj.constellation,
            "created_at": obj.created_at,
            "updated_at": obj.updated_at,
            "aliases": obj.aliases,
            "image_count": len(obj.images),
        }
        result.append(obj_dict)

    return result


@router.get("/{object_id}", response_model=ObjectResponse)
def get_object(object_id: int, db: Session = Depends(get_db)):
    """Get a specific astronomical object by ID."""
    obj = db.query(AstroObject).filter(AstroObject.id == object_id).first()

    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    return {
        "id": obj.id,
        "primary_name": obj.primary_name,
        "ra": obj.ra,
        "dec": obj.dec,
        "object_type": obj.object_type,
        "magnitude": obj.magnitude,
        "constellation": obj.constellation,
        "created_at": obj.created_at,
        "updated_at": obj.updated_at,
        "aliases": obj.aliases,
        "image_count": len(obj.images),
    }


@router.post("", response_model=ObjectResponse, status_code=201)
def create_object(obj_data: ObjectCreate, db: Session = Depends(get_db)):
    """Create a new astronomical object."""
    obj = AstroObject(
        primary_name=obj_data.primary_name,
        ra=obj_data.ra,
        dec=obj_data.dec,
        object_type=obj_data.object_type,
        magnitude=obj_data.magnitude,
        constellation=obj_data.constellation,
    )
    db.add(obj)
    db.flush()

    # Add aliases if provided
    if obj_data.aliases:
        for alias_data in obj_data.aliases:
            alias = ObjectAlias(
                object_id=obj.id,
                alias_name=alias_data.alias_name,
                catalog=alias_data.catalog,
            )
            db.add(alias)

    db.commit()
    db.refresh(obj)

    return {
        "id": obj.id,
        "primary_name": obj.primary_name,
        "ra": obj.ra,
        "dec": obj.dec,
        "object_type": obj.object_type,
        "magnitude": obj.magnitude,
        "constellation": obj.constellation,
        "created_at": obj.created_at,
        "updated_at": obj.updated_at,
        "aliases": obj.aliases,
        "image_count": 0,
    }


@router.patch("/{object_id}", response_model=ObjectResponse)
def update_object(object_id: int, obj_data: ObjectUpdate, db: Session = Depends(get_db)):
    """Update an astronomical object."""
    obj = db.query(AstroObject).filter(AstroObject.id == object_id).first()

    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    update_data = obj_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(obj, field, value)

    db.commit()
    db.refresh(obj)

    return {
        "id": obj.id,
        "primary_name": obj.primary_name,
        "ra": obj.ra,
        "dec": obj.dec,
        "object_type": obj.object_type,
        "magnitude": obj.magnitude,
        "constellation": obj.constellation,
        "created_at": obj.created_at,
        "updated_at": obj.updated_at,
        "aliases": obj.aliases,
        "image_count": len(obj.images),
    }


@router.delete("/{object_id}", status_code=204)
def delete_object(object_id: int, db: Session = Depends(get_db)):
    """Delete an astronomical object."""
    obj = db.query(AstroObject).filter(AstroObject.id == object_id).first()

    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    db.delete(obj)
    db.commit()


@router.post("/{object_id}/aliases", response_model=ObjectResponse)
def add_alias(object_id: int, alias_data: ObjectAliasCreate, db: Session = Depends(get_db)):
    """Add an alias to an astronomical object."""
    obj = db.query(AstroObject).filter(AstroObject.id == object_id).first()

    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    alias = ObjectAlias(
        object_id=obj.id,
        alias_name=alias_data.alias_name,
        catalog=alias_data.catalog,
    )
    db.add(alias)
    db.commit()
    db.refresh(obj)

    return {
        "id": obj.id,
        "primary_name": obj.primary_name,
        "ra": obj.ra,
        "dec": obj.dec,
        "object_type": obj.object_type,
        "magnitude": obj.magnitude,
        "constellation": obj.constellation,
        "created_at": obj.created_at,
        "updated_at": obj.updated_at,
        "aliases": obj.aliases,
        "image_count": len(obj.images),
    }


@router.get("/resolve", response_model=ObjectResponse)
async def resolve_object(
    q: str = Query(..., min_length=1, description="Object name to resolve"),
    db: Session = Depends(get_db),
):
    """
    Resolve an object name using local database and Telescopius API.
    Creates a new object record if found externally but not in local DB.
    """
    resolver = NameResolver(db, use_mock=True)
    obj = await resolver.resolve_async(q)

    if not obj:
        raise HTTPException(status_code=404, detail=f"Could not resolve object: {q}")

    return {
        "id": obj.id,
        "primary_name": obj.primary_name,
        "ra": obj.ra,
        "dec": obj.dec,
        "object_type": obj.object_type,
        "magnitude": obj.magnitude,
        "constellation": obj.constellation,
        "created_at": obj.created_at,
        "updated_at": obj.updated_at,
        "aliases": obj.aliases,
        "image_count": len(obj.images),
    }
