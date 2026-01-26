from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, distinct
from typing import Optional

from app.database import get_db
from app.models.objects import AstroObject, ObjectAlias

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


@router.get("/objects")
def list_catalogue_objects(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    catalog: Optional[str] = Query(default=None, description="Filter by catalog (NGC, IC, Messier, LDN, LBN)"),
    object_type: Optional[str] = Query(default=None, description="Filter by object type"),
    constellation: Optional[str] = Query(default=None, description="Filter by constellation"),
    min_magnitude: Optional[float] = Query(default=None, description="Minimum magnitude"),
    max_magnitude: Optional[float] = Query(default=None, description="Maximum magnitude"),
    search: Optional[str] = Query(default=None, description="Search by name or catalog number"),
    db: Session = Depends(get_db)
):
    """
    List catalogue objects with optional filtering.

    Returns paginated list of astronomical objects with their aliases.
    """
    query = db.query(AstroObject).options(joinedload(AstroObject.aliases))

    if catalog:
        # Filter objects that have an alias in the specified catalog
        query = query.join(ObjectAlias).filter(ObjectAlias.catalog == catalog)

    if object_type:
        query = query.filter(AstroObject.object_type.ilike(f"%{object_type}%"))

    if constellation:
        query = query.filter(AstroObject.constellation.ilike(f"%{constellation}%"))

    if min_magnitude is not None:
        query = query.filter(AstroObject.magnitude >= min_magnitude)

    if max_magnitude is not None:
        query = query.filter(AstroObject.magnitude <= max_magnitude)

    if search:
        search_term = f"%{search}%"
        # Also create a normalized version without spaces for matching "NGC1976" to "NGC 1976"
        search_no_spaces = f"%{search.replace(' ', '')}%"
        # Search in primary_name and aliases (with and without spaces)
        query = query.outerjoin(ObjectAlias).filter(
            or_(
                AstroObject.primary_name.ilike(search_term),
                ObjectAlias.alias_name.ilike(search_term),
                func.replace(AstroObject.primary_name, ' ', '').ilike(search_no_spaces),
                func.replace(ObjectAlias.alias_name, ' ', '').ilike(search_no_spaces)
            )
        )

    # Get distinct objects (since joins may cause duplicates)
    query = query.distinct()

    total = query.count()
    objects = query.order_by(AstroObject.primary_name).offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "objects": [
            {
                "id": obj.id,
                "primary_name": obj.primary_name,
                "aliases": [
                    {"name": a.alias_name, "catalog": a.catalog}
                    for a in obj.aliases
                ],
                "ra": obj.ra,
                "dec": obj.dec,
                "object_type": obj.object_type,
                "size_major": obj.size_major,
                "size_minor": obj.size_minor,
                "magnitude": obj.magnitude,
                "constellation": obj.constellation,
            }
            for obj in objects
        ]
    }


@router.get("/objects/{object_id}")
def get_catalogue_object(object_id: int, db: Session = Depends(get_db)):
    """Get a specific object by ID with all its aliases."""
    obj = db.query(AstroObject).options(
        joinedload(AstroObject.aliases)
    ).filter(AstroObject.id == object_id).first()

    if not obj:
        return {"error": "Object not found"}

    return {
        "id": obj.id,
        "primary_name": obj.primary_name,
        "aliases": [
            {"name": a.alias_name, "catalog": a.catalog}
            for a in obj.aliases
        ],
        "ra": obj.ra,
        "dec": obj.dec,
        "object_type": obj.object_type,
        "size_major": obj.size_major,
        "size_minor": obj.size_minor,
        "magnitude": obj.magnitude,
        "constellation": obj.constellation,
        "created_at": obj.created_at,
        "updated_at": obj.updated_at,
    }


@router.get("/search")
def search_catalogue_objects(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Quick search for objects by name or designation.

    Searches across primary name and all aliases. Space-insensitive
    (e.g., "NGC1976" matches "NGC 1976").
    """
    search_term = f"%{q}%"
    search_no_spaces = f"%{q.replace(' ', '')}%"

    # Find matching aliases (with and without spaces)
    matching_aliases = db.query(ObjectAlias).filter(
        or_(
            ObjectAlias.alias_name.ilike(search_term),
            func.replace(ObjectAlias.alias_name, ' ', '').ilike(search_no_spaces)
        )
    ).limit(limit * 2).all()

    # Get unique object IDs
    object_ids = list(set(a.object_id for a in matching_aliases))

    # Also search primary names (with and without spaces)
    primary_matches = db.query(AstroObject).filter(
        or_(
            AstroObject.primary_name.ilike(search_term),
            func.replace(AstroObject.primary_name, ' ', '').ilike(search_no_spaces)
        )
    ).limit(limit).all()

    for obj in primary_matches:
        if obj.id not in object_ids:
            object_ids.append(obj.id)

    # Fetch full objects with aliases
    objects = db.query(AstroObject).options(
        joinedload(AstroObject.aliases)
    ).filter(AstroObject.id.in_(object_ids[:limit])).all()

    return [
        {
            "id": obj.id,
            "primary_name": obj.primary_name,
            "aliases": [
                {"name": a.alias_name, "catalog": a.catalog}
                for a in obj.aliases
            ],
            "object_type": obj.object_type,
            "constellation": obj.constellation,
            "magnitude": obj.magnitude,
        }
        for obj in objects
    ]


@router.get("/types")
def get_object_types(db: Session = Depends(get_db)):
    """Get list of distinct object types in the catalogue."""
    types = db.query(AstroObject.object_type).distinct().filter(
        AstroObject.object_type.isnot(None)
    ).all()
    return sorted([t[0] for t in types if t[0]])


@router.get("/constellations")
def get_constellations(db: Session = Depends(get_db)):
    """Get list of distinct constellations in the catalogue."""
    constellations = db.query(AstroObject.constellation).distinct().filter(
        AstroObject.constellation.isnot(None)
    ).all()
    return sorted([c[0] for c in constellations if c[0]])


@router.get("/catalogs")
def get_catalogs(db: Session = Depends(get_db)):
    """Get list of available catalogs with counts."""
    catalogs = db.query(
        ObjectAlias.catalog,
        func.count(distinct(ObjectAlias.object_id)).label('count')
    ).filter(
        ObjectAlias.catalog.isnot(None)
    ).group_by(ObjectAlias.catalog).all()

    return {c.catalog: c.count for c in catalogs}
