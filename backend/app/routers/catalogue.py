from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, distinct
from typing import Optional

from app.database import get_db
from app.models.objects import AstroObject, ObjectAlias
from app.schemas.objects import (
    VisibilityInfo,
    WellPlacedObjectResponse,
    WellPlacedObjectsListResponse,
)
from app.services.visibility_service import VisibilityService

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


@router.get("/well-placed", response_model=WellPlacedObjectsListResponse)
def get_well_placed_catalogue_objects(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    min_altitude: float = Query(30.0, ge=0, le=90, description="Minimum altitude in degrees"),
    catalog: Optional[str] = Query(None, description="Filter by catalog (NGC, IC, Messier, LDN, LBN)"),
    object_type: Optional[str] = Query(None, description="Filter by object type"),
    constellation: Optional[str] = Query(None, description="Filter by constellation"),
    min_magnitude: Optional[float] = Query(None, description="Minimum magnitude"),
    max_magnitude: Optional[float] = Query(None, description="Maximum magnitude"),
    min_size: Optional[float] = Query(None, description="Minimum size in arcminutes"),
    max_size: Optional[float] = Query(None, description="Maximum size in arcminutes"),
    search: Optional[str] = Query(None, description="Search by name or catalog number"),
    db: Session = Depends(get_db),
):
    """
    Get catalogue objects that are well-placed for imaging tonight.

    Returns objects that are above the minimum altitude during astronomical darkness
    for at least 1 hour. Results are sorted by imaging score (higher = better).

    Performance optimizations:
    - Pre-filters by declination to exclude objects that can never reach min_altitude
    - Sorts candidates by estimated max altitude before visibility calculation
    - Uses batch visibility calculations with cached twilight times
    """
    visibility_service = VisibilityService(db)

    if not visibility_service.location_configured:
        return WellPlacedObjectsListResponse(
            location_configured=False,
            total=0,
            skip=skip,
            limit=limit,
            objects=[],
        )

    # Get declination bounds based on observer latitude and min_altitude
    min_dec, max_dec = visibility_service.get_declination_bounds(min_altitude)
    observer_lat = visibility_service.get_observer_latitude()

    # Build base query for objects with coordinates, pre-filtered by declination
    query = db.query(AstroObject).filter(
        AstroObject.ra.isnot(None),
        AstroObject.dec.isnot(None),
        AstroObject.dec >= min_dec,
        AstroObject.dec <= max_dec,
    )

    # Apply user filters
    if catalog:
        query = query.join(ObjectAlias).filter(ObjectAlias.catalog == catalog)

    if object_type:
        query = query.filter(AstroObject.object_type.ilike(f"%{object_type}%"))

    if constellation:
        query = query.filter(AstroObject.constellation.ilike(f"%{constellation}%"))

    if min_magnitude is not None:
        query = query.filter(AstroObject.magnitude >= min_magnitude)

    if max_magnitude is not None:
        query = query.filter(AstroObject.magnitude <= max_magnitude)

    if min_size is not None:
        query = query.filter(AstroObject.size_major >= min_size)

    if max_size is not None:
        query = query.filter(AstroObject.size_major <= max_size)

    if search:
        search_term = f"%{search}%"
        search_no_spaces = f"%{search.replace(' ', '')}%"
        query = query.outerjoin(ObjectAlias).filter(
            or_(
                AstroObject.primary_name.ilike(search_term),
                ObjectAlias.alias_name.ilike(search_term),
                func.replace(AstroObject.primary_name, ' ', '').ilike(search_no_spaces),
                func.replace(ObjectAlias.alias_name, ' ', '').ilike(search_no_spaces)
            )
        )

    # Get candidate objects - increased limit since we pre-filter by declination
    candidates = query.distinct().limit(2000).all()

    if not candidates:
        return WellPlacedObjectsListResponse(
            location_configured=True,
            total=0,
            skip=skip,
            limit=limit,
            objects=[],
        )

    # Sort candidates by estimated max altitude (best candidates first)
    # This helps ensure we find the best objects even with early stopping
    if observer_lat is not None:
        candidates.sort(
            key=lambda obj: -(90.0 - abs(observer_lat - obj.dec)),
            reverse=False  # Already negated, so ascending = descending max_alt
        )

    # Prepare object data for batch calculation
    object_data = [(obj.id, obj.ra, obj.dec) for obj in candidates]

    # Calculate visibility for all candidates in batch (with cached twilight)
    visibility_results = visibility_service.calculate_batch_visibility(
        object_data, min_altitude=min_altitude
    )

    # Calculate scores based on visibility
    scores = visibility_service.calculate_batch_scores(visibility_results)

    # Build response objects for visible items
    obj_map = {obj.id: obj for obj in candidates}
    well_placed = []

    for obj_id, visibility in visibility_results.items():
        if not visibility.get("is_visible_tonight"):
            continue

        obj = obj_map[obj_id]
        well_placed.append(WellPlacedObjectResponse(
            id=obj.id,
            primary_name=obj.primary_name,
            object_type=obj.object_type,
            constellation=obj.constellation,
            magnitude=obj.magnitude,
            size_major=obj.size_major,
            size_minor=obj.size_minor,
            ra=obj.ra,
            dec=obj.dec,
            image_count=0,
            visibility=VisibilityInfo(
                is_visible_tonight=visibility.get("is_visible_tonight", False),
                current_altitude=visibility.get("current_altitude"),
                max_altitude=visibility.get("max_altitude"),
                transit_time=visibility.get("transit_time"),
                hours_in_darkness=visibility.get("hours_in_darkness"),
            ),
            score=scores.get(obj_id, 0.0),
        ))

    # Sort by score descending
    well_placed.sort(key=lambda x: x.score, reverse=True)

    # Apply pagination
    total = len(well_placed)
    paginated = well_placed[skip : skip + limit]

    return WellPlacedObjectsListResponse(
        location_configured=True,
        total=total,
        skip=skip,
        limit=limit,
        objects=paginated,
    )


@router.get("/objects")
def list_catalogue_objects(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    catalog: Optional[str] = Query(default=None, description="Filter by catalog (NGC, IC, Messier, LDN, LBN)"),
    object_type: Optional[str] = Query(default=None, description="Filter by object type"),
    constellation: Optional[str] = Query(default=None, description="Filter by constellation"),
    min_magnitude: Optional[float] = Query(default=None, description="Minimum magnitude"),
    max_magnitude: Optional[float] = Query(default=None, description="Maximum magnitude"),
    min_size: Optional[float] = Query(default=None, description="Minimum size in arcminutes"),
    max_size: Optional[float] = Query(default=None, description="Maximum size in arcminutes"),
    search: Optional[str] = Query(default=None, description="Search by name or catalog number"),
    sort_by: Optional[str] = Query(default="primary_name", description="Sort by field: primary_name, magnitude, size_major, constellation, object_type, ra, dec"),
    sort_order: Optional[str] = Query(default="asc", description="Sort order: asc or desc"),
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

    if min_size is not None:
        query = query.filter(AstroObject.size_major >= min_size)

    if max_size is not None:
        query = query.filter(AstroObject.size_major <= max_size)

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

    # Apply sorting
    sort_column_map = {
        "primary_name": AstroObject.primary_name,
        "magnitude": AstroObject.magnitude,
        "size_major": AstroObject.size_major,
        "constellation": AstroObject.constellation,
        "object_type": AstroObject.object_type,
        "ra": AstroObject.ra,
        "dec": AstroObject.dec,
    }
    sort_column = sort_column_map.get(sort_by, AstroObject.primary_name)
    if sort_order == "desc":
        sort_column = sort_column.desc()

    objects = query.order_by(sort_column).offset(skip).limit(limit).all()

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
