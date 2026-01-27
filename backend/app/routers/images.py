from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models import Image, AstroObject, ImageObject
from app.schemas import ImageResponse, ImageUpdate, ImageGroup, SubExposureStats
from app.services.fov_matcher import FOVMatcher
from collections import defaultdict

router = APIRouter(prefix="/images", tags=["images"])


def _image_to_response(img: Image) -> dict:
    """Convert an Image model to a response dict with FOV and objects."""
    # Build objects list from associations
    objects = []
    for io in img.image_objects:
        objects.append({
            "object_id": io.object_id,
            "object_name": io.object.primary_name if io.object else None,
            "association_type": io.association_type,
            "angular_distance": io.angular_distance,
        })

    return {
        "id": img.id,
        "file_path": img.file_path,
        "file_name": img.file_name,
        "directory_path": img.directory_path,
        "date_taken": img.date_taken,
        "exposure_time": img.exposure_time,
        "filter_name": img.filter_name,
        "telescope": img.telescope,
        "camera": img.camera,
        "gain": img.gain,
        "iso": img.iso,
        "binning": img.binning,
        # FOV fields
        "ra": img.ra,
        "dec": img.dec,
        "pixel_size_x": img.pixel_size_x,
        "pixel_size_y": img.pixel_size_y,
        "image_width": img.image_width,
        "image_height": img.image_height,
        "focal_length": img.focal_length,
        "fov_width": img.fov_width,
        "fov_height": img.fov_height,
        # Legacy fields
        "object_id": img.object_id,
        "fits_header": img.fits_header,
        "created_at": img.created_at,
        "updated_at": img.updated_at,
        "object_name": img.object.primary_name if img.object else None,
        # Object associations
        "objects": objects,
    }


@router.get("", response_model=list[ImageResponse])
def list_images(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    object_id: Optional[int] = None,
    filter_name: Optional[str] = None,
    telescope: Optional[str] = None,
    camera: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    ids: Optional[list[int]] = Query(None),
    sort_by: Optional[str] = Query(None, description="Sort field: date_taken, exposure_time, filter_name"),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    db: Session = Depends(get_db),
):
    """List images with optional filters."""
    query = db.query(Image)

    if ids:
        query = query.filter(Image.id.in_(ids))

    if object_id:
        # Filter by object via either legacy FK or association table
        query = query.filter(
            (Image.object_id == object_id) |
            Image.image_objects.any(ImageObject.object_id == object_id)
        )

    if filter_name:
        query = query.filter(Image.filter_name.ilike(f"%{filter_name}%"))

    if telescope:
        query = query.filter(Image.telescope.ilike(f"%{telescope}%"))

    if camera:
        query = query.filter(Image.camera.ilike(f"%{camera}%"))

    if date_from:
        query = query.filter(Image.date_taken >= date_from)

    if date_to:
        query = query.filter(Image.date_taken <= date_to)

    # Apply sorting
    sort_columns = {
        "date_taken": Image.date_taken,
        "exposure_time": Image.exposure_time,
        "filter_name": Image.filter_name,
    }
    sort_column = sort_columns.get(sort_by, Image.date_taken)
    if sort_order == "asc":
        query = query.order_by(sort_column.asc().nullslast())
    else:
        query = query.order_by(sort_column.desc().nullsfirst())

    images = query.offset(skip).limit(limit).all()

    return [_image_to_response(img) for img in images]


@router.get("/stats")
def get_image_stats(db: Session = Depends(get_db)):
    """Get statistics about indexed images."""
    total_images = db.query(func.count(Image.id)).scalar()
    total_objects = db.query(func.count(AstroObject.id)).scalar()

    # Objects that have at least one image associated
    objects_imaged = db.query(func.count(func.distinct(ImageObject.object_id))).scalar()

    # Images by filter
    filter_stats = (
        db.query(Image.filter_name, func.count(Image.id))
        .filter(Image.filter_name.isnot(None))
        .group_by(Image.filter_name)
        .all()
    )

    # Images by telescope
    telescope_stats = (
        db.query(Image.telescope, func.count(Image.id))
        .filter(Image.telescope.isnot(None))
        .group_by(Image.telescope)
        .all()
    )

    # Total exposure time
    total_exposure = db.query(func.sum(Image.exposure_time)).scalar() or 0

    return {
        "total_images": total_images,
        "total_objects": total_objects,
        "objects_imaged": objects_imaged,
        "total_exposure_seconds": total_exposure,
        "total_exposure_hours": round(total_exposure / 3600, 2),
        "by_filter": {f: c for f, c in filter_stats if f},
        "by_telescope": {t: c for t, c in telescope_stats if t},
    }


@router.get("/grouped", response_model=list[ImageGroup])
def get_grouped_images(
    telescope: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get images grouped by date, target, and telescope."""
    query = db.query(Image)

    if telescope:
        query = query.filter(Image.telescope.ilike(f"%{telescope}%"))

    images = query.order_by(Image.date_taken.desc()).all()

    # Group by (date, target, telescope)
    groups: dict[tuple, dict] = defaultdict(lambda: {
        "images": [],
        "subs": defaultdict(int),  # (filter_name, exposure_time) -> count
        "cameras": set(),
        "total_exposure": 0.0,
        "target_id": None,
        "target_name": None,
    })

    for img in images:
        # Extract date portion only
        date_str = img.date_taken.strftime("%Y-%m-%d") if img.date_taken else "Unknown"
        target_name = img.object.primary_name if img.object else None
        telescope_name = img.telescope or "Unknown"

        key = (date_str, target_name, telescope_name)
        group = groups[key]

        group["images"].append(img)
        group["target_id"] = img.object_id
        group["target_name"] = target_name

        if img.exposure_time:
            group["total_exposure"] += img.exposure_time
            # Group by (filter, exposure_time) tuple
            sub_key = (img.filter_name, img.exposure_time)
            group["subs"][sub_key] += 1

        if img.camera:
            group["cameras"].add(img.camera)

    # Convert to response format
    result = []
    for (date_str, target_name, telescope_name), group in groups.items():
        # Build subs list sorted by filter name then exposure time
        subs = []
        for (filter_name, exposure_time), count in group["subs"].items():
            subs.append(SubExposureStats(
                filter_name=filter_name,
                exposure_time=exposure_time,
                count=count,
                total_exposure=count * exposure_time,
            ))
        # Sort: by filter name (None last), then by exposure time
        subs.sort(key=lambda s: (s.filter_name is None, s.filter_name or "", s.exposure_time))

        result.append(ImageGroup(
            date=date_str,
            target_name=target_name,
            target_id=group["target_id"],
            telescope=telescope_name if telescope_name != "Unknown" else None,
            total_frames=len(group["images"]),
            total_exposure_seconds=group["total_exposure"],
            subs=subs,
            cameras=sorted(group["cameras"]),
            image_ids=[img.id for img in group["images"]],
        ))

    # Sort by date descending, then by target name
    result.sort(key=lambda g: (g.date, g.target_name or ""), reverse=True)

    return result


@router.get("/{image_id}", response_model=ImageResponse)
def get_image(image_id: int, db: Session = Depends(get_db)):
    """Get a specific image by ID."""
    img = db.query(Image).filter(Image.id == image_id).first()

    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    return _image_to_response(img)


@router.patch("/{image_id}", response_model=ImageResponse)
def update_image(image_id: int, img_data: ImageUpdate, db: Session = Depends(get_db)):
    """Update image metadata."""
    img = db.query(Image).filter(Image.id == image_id).first()

    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    update_data = img_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(img, field, value)

    db.commit()
    db.refresh(img)

    return _image_to_response(img)


@router.delete("/{image_id}", status_code=204)
def delete_image(image_id: int, db: Session = Depends(get_db)):
    """Delete an image record (does not delete the file)."""
    img = db.query(Image).filter(Image.id == image_id).first()

    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    db.delete(img)
    db.commit()


@router.post("/{image_id}/link-object/{object_id}", response_model=ImageResponse)
def link_image_to_object(
    image_id: int,
    object_id: int,
    association_type: str = Query(default="manual"),
    db: Session = Depends(get_db)
):
    """Link an image to an astronomical object."""
    img = db.query(Image).filter(Image.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    obj = db.query(AstroObject).filter(AstroObject.id == object_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    # Update legacy FK
    img.object_id = object_id

    # Create or update ImageObject association
    existing = db.query(ImageObject).filter(
        ImageObject.image_id == image_id,
        ImageObject.object_id == object_id
    ).first()

    if not existing:
        image_object = ImageObject(
            image_id=image_id,
            object_id=object_id,
            association_type=association_type,
            angular_distance=0.0
        )
        db.add(image_object)

    db.commit()
    db.refresh(img)

    return _image_to_response(img)


@router.get("/{image_id}/objects")
def get_image_objects(image_id: int, db: Session = Depends(get_db)):
    """Get all objects associated with an image."""
    img = db.query(Image).filter(Image.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    return [
        {
            "object_id": io.object_id,
            "object_name": io.object.primary_name if io.object else None,
            "association_type": io.association_type,
            "angular_distance": io.angular_distance,
        }
        for io in img.image_objects
    ]


@router.post("/{image_id}/detect-objects")
def detect_objects_in_fov(
    image_id: int,
    catalogs: list[str] = Query(default=["NGC", "IC", "LDN", "LBN"]),
    db: Session = Depends(get_db)
):
    """Detect and associate catalogue objects within image FOV."""
    img = db.query(Image).filter(Image.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    if not all([img.ra, img.dec, img.fov_width, img.fov_height]):
        raise HTTPException(
            status_code=400,
            detail="Image missing required FOV data (RA, DEC, FOV dimensions)"
        )

    matcher = FOVMatcher(db)
    matches = matcher.match_image_to_objects(img, catalogs)

    return {
        "image_id": image_id,
        "fov": {
            "ra": img.ra,
            "dec": img.dec,
            "width_deg": img.fov_width,
            "height_deg": img.fov_height
        },
        "objects_found": len(matches),
        "objects": [
            {
                "catalog": m["catalogue_object"].catalog,
                "catalog_number": m["catalogue_object"].catalog_number,
                "name": m["catalogue_object"].name,
                "angular_distance_arcmin": m["angular_distance"]
            }
            for m in matches
        ]
    }


@router.delete("/{image_id}/objects/{object_id}", status_code=204)
def remove_object_from_image(image_id: int, object_id: int, db: Session = Depends(get_db)):
    """Remove an object association from an image."""
    img = db.query(Image).filter(Image.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    association = db.query(ImageObject).filter(
        ImageObject.image_id == image_id,
        ImageObject.object_id == object_id
    ).first()

    if not association:
        raise HTTPException(status_code=404, detail="Association not found")

    db.delete(association)

    # Also clear legacy FK if it matches
    if img.object_id == object_id:
        img.object_id = None

    db.commit()
