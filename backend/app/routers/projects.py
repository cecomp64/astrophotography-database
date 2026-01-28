from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database import get_db
from app.models import Project, ProjectTarget, ProjectImage, AstroObject, Image
from app.schemas.projects import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectDetailResponse,
    ProjectTargetCreate,
    ProjectTargetResponse,
    ProjectImageAdd,
    ProjectImageResponse,
    ProjectProgressResponse,
    WellPlacedProjectResponse,
    WellPlacedProjectsListResponse,
    LinkImagesFromGroupRequest,
)
from app.services import VisibilityService, ProjectService


router = APIRouter(prefix="/projects", tags=["projects"])


def _project_to_response(project: Project, db: Session) -> dict:
    """Convert a Project model to a response dict."""
    project_service = ProjectService(db)
    progress = project_service.calculate_project_progress(project.id)
    overall_progress = progress.get("overall_progress") if progress else None

    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "priority": project.priority,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "target_count": len(project.project_targets),
        "image_count": len(project.project_images),
        "overall_progress": overall_progress,
    }


def _project_to_detail_response(project: Project, db: Session) -> dict:
    """Convert a Project model to a detailed response dict."""
    project_service = ProjectService(db)
    progress = project_service.calculate_project_progress(project.id)

    # Build targets list with per-target progress
    targets = []
    for pt in project.project_targets:
        obj = pt.object
        # Calculate progress for this specific target
        target_progress = project_service.calculate_target_progress(project.id, pt.object_id)
        targets.append({
            "id": pt.id,
            "project_id": pt.project_id,
            "object_id": pt.object_id,
            "object_name": obj.primary_name if obj else None,
            "object_type": obj.object_type if obj else None,
            "ra": obj.ra if obj else None,
            "dec": obj.dec if obj else None,
            "constellation": obj.constellation if obj else None,
            "is_primary": pt.is_primary,
            "exposure_goals": pt.exposure_goals,
            "notes": pt.notes,
            "created_at": pt.created_at,
            "progress": target_progress,
        })

    # Build images list
    images = []
    for pi in project.project_images:
        img = pi.image
        images.append({
            "id": pi.id,
            "project_id": pi.project_id,
            "image_id": pi.image_id,
            "file_name": img.file_name if img else None,
            "filter_name": img.filter_name if img else None,
            "exposure_time": img.exposure_time if img else None,
            "date_taken": img.date_taken if img else None,
            "added_manually": pi.added_manually,
        })

    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "priority": project.priority,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "target_count": len(project.project_targets),
        "image_count": len(project.project_images),
        "overall_progress": progress.get("overall_progress") if progress else None,
        "targets": targets,
        "images": images,
        "progress": progress,
    }


# --- Dashboard Endpoint (must be before /{project_id} routes) ---

@router.get("/dashboard/well-placed", response_model=WellPlacedProjectsListResponse)
def get_well_placed_projects(
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """Get projects that are well-placed for imaging tonight."""
    project_service = ProjectService(db)
    visibility_service = VisibilityService(db)

    results = project_service.get_well_placed_projects(
        visibility_service=visibility_service,
        status_filter="active",
        limit=limit,
    )

    return WellPlacedProjectsListResponse(
        location_configured=visibility_service.location_configured,
        projects=results,
    )


# --- CRUD Operations ---

@router.get("", response_model=List[ProjectResponse])
def list_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status: Optional[str] = Query(None, description="Filter by status: active, completed, paused, archived"),
    db: Session = Depends(get_db),
):
    """List all projects with optional status filter."""
    query = db.query(Project)

    if status:
        query = query.filter(Project.status == status)

    query = query.order_by(Project.priority.desc(), Project.updated_at.desc())
    projects = query.offset(skip).limit(limit).all()

    return [_project_to_response(p, db) for p in projects]


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(project_data: ProjectCreate, db: Session = Depends(get_db)):
    """Create a new project."""
    project = Project(
        name=project_data.name,
        description=project_data.description,
        status=project_data.status,
        priority=project_data.priority,
    )
    db.add(project)
    db.flush()

    # Add initial targets if provided
    if project_data.target_object_ids:
        for i, object_id in enumerate(project_data.target_object_ids):
            obj = db.query(AstroObject).filter(AstroObject.id == object_id).first()
            if obj:
                target = ProjectTarget(
                    project_id=project.id,
                    object_id=object_id,
                    is_primary=(i == 0),  # First target is primary
                )
                db.add(target)

    db.commit()
    db.refresh(project)

    return _project_to_response(project, db)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    """Get a specific project with all details."""
    project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return _project_to_detail_response(project, db)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, project_data: ProjectUpdate, db: Session = Depends(get_db)):
    """Update a project."""
    project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = project_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    db.commit()
    db.refresh(project)

    return _project_to_response(project, db)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """Delete a project."""
    project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(project)
    db.commit()


# --- Target Management ---

@router.post("/{project_id}/targets", response_model=ProjectDetailResponse)
def add_target(
    project_id: int,
    target_data: ProjectTargetCreate,
    db: Session = Depends(get_db),
):
    """Add a target object to a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    obj = db.query(AstroObject).filter(AstroObject.id == target_data.object_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    # Check if already added
    existing = db.query(ProjectTarget).filter(
        ProjectTarget.project_id == project_id,
        ProjectTarget.object_id == target_data.object_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Object already added to project")

    # If marking as primary, unmark others
    if target_data.is_primary:
        db.query(ProjectTarget).filter(
            ProjectTarget.project_id == project_id,
        ).update({"is_primary": False})

    target = ProjectTarget(
        project_id=project_id,
        object_id=target_data.object_id,
        is_primary=target_data.is_primary,
        exposure_goals=target_data.exposure_goals,
        notes=target_data.notes,
    )
    db.add(target)
    db.commit()
    db.refresh(project)

    return _project_to_detail_response(project, db)


@router.patch("/{project_id}/targets/{object_id}", response_model=ProjectDetailResponse)
def update_target(
    project_id: int,
    object_id: int,
    target_data: ProjectTargetCreate,
    db: Session = Depends(get_db),
):
    """Update a target in a project."""
    target = db.query(ProjectTarget).filter(
        ProjectTarget.project_id == project_id,
        ProjectTarget.object_id == object_id,
    ).first()

    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    # If marking as primary, unmark others
    if target_data.is_primary and not target.is_primary:
        db.query(ProjectTarget).filter(
            ProjectTarget.project_id == project_id,
        ).update({"is_primary": False})

    target.is_primary = target_data.is_primary
    target.exposure_goals = target_data.exposure_goals
    target.notes = target_data.notes

    db.commit()

    project = db.query(Project).filter(Project.id == project_id).first()
    return _project_to_detail_response(project, db)


@router.delete("/{project_id}/targets/{object_id}", status_code=204)
def remove_target(project_id: int, object_id: int, db: Session = Depends(get_db)):
    """Remove a target object from a project."""
    target = db.query(ProjectTarget).filter(
        ProjectTarget.project_id == project_id,
        ProjectTarget.object_id == object_id,
    ).first()

    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    db.delete(target)
    db.commit()


# --- Image Management ---

@router.post("/{project_id}/images", response_model=ProjectDetailResponse)
def add_images(
    project_id: int,
    image_data: ProjectImageAdd,
    db: Session = Depends(get_db),
):
    """Add images to a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    added_count = 0
    for image_id in image_data.image_ids:
        # Check image exists
        img = db.query(Image).filter(Image.id == image_id).first()
        if not img:
            continue

        # Check if already added
        existing = db.query(ProjectImage).filter(
            ProjectImage.project_id == project_id,
            ProjectImage.image_id == image_id,
        ).first()
        if existing:
            continue

        project_image = ProjectImage(
            project_id=project_id,
            image_id=image_id,
            added_manually=True,
        )
        db.add(project_image)
        added_count += 1

    db.commit()
    db.refresh(project)

    return _project_to_detail_response(project, db)


@router.delete("/{project_id}/images/{image_id}", status_code=204)
def remove_image(project_id: int, image_id: int, db: Session = Depends(get_db)):
    """Remove an image from a project."""
    project_image = db.query(ProjectImage).filter(
        ProjectImage.project_id == project_id,
        ProjectImage.image_id == image_id,
    ).first()

    if not project_image:
        raise HTTPException(status_code=404, detail="Image not found in project")

    db.delete(project_image)
    db.commit()


@router.post("/{project_id}/auto-link-images")
def auto_link_images(project_id: int, db: Session = Depends(get_db)):
    """Automatically link images based on target objects."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_service = ProjectService(db)
    count = project_service.auto_link_images(project_id)

    return {"linked_images": count}


@router.post("/{project_id}/targets/{object_id}/link-images")
def link_images_from_group(
    project_id: int,
    object_id: int,
    request: LinkImagesFromGroupRequest,
    db: Session = Depends(get_db),
):
    """Link images from a specific grouping to a project, filtered by target's exposure goals."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get the target to retrieve its exposure_goals
    target = db.query(ProjectTarget).filter(
        ProjectTarget.project_id == project_id,
        ProjectTarget.object_id == object_id,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found in project")

    # Get allowed filters from exposure_goals (if any)
    allowed_filters = set(target.exposure_goals.keys()) if target.exposure_goals else None

    # Build query for images matching the grouping
    from sqlalchemy import func
    query = db.query(Image)

    # Filter by date (extract date portion from date_taken)
    if request.date and request.date != "Unknown":
        query = query.filter(func.date(Image.date_taken) == request.date)

    # Filter by target name (via object relationship)
    if request.target_name:
        query = query.join(Image.object).filter(
            AstroObject.primary_name == request.target_name
        )
    else:
        query = query.filter(Image.object_id.is_(None))

    # Filter by telescope
    if request.telescope:
        query = query.filter(Image.telescope == request.telescope)
    else:
        query = query.filter(
            (Image.telescope.is_(None)) | (Image.telescope == "Unknown")
        )

    images = query.all()

    # Link images, filtering by allowed filters and excluding duplicates
    # "No Filter" in exposure_goals matches images with filter_name = null
    has_no_filter_goal = allowed_filters and "No Filter" in allowed_filters
    linked_count = 0
    for img in images:
        # Filter by allowed filters if exposure_goals are set
        if allowed_filters:
            if img.filter_name is None:
                # Image has no filter - only allow if "No Filter" goal exists
                if not has_no_filter_goal:
                    continue
            elif img.filter_name not in allowed_filters:
                continue

        # Check if already linked
        existing = db.query(ProjectImage).filter(
            ProjectImage.project_id == project_id,
            ProjectImage.image_id == img.id,
        ).first()
        if existing:
            continue

        # Create link
        project_image = ProjectImage(
            project_id=project_id,
            image_id=img.id,
            added_manually=False,
        )
        db.add(project_image)
        linked_count += 1

    db.commit()

    return {"linked_images": linked_count}


# --- Progress & Visibility ---

@router.get("/{project_id}/progress", response_model=ProjectProgressResponse)
def get_project_progress(project_id: int, db: Session = Depends(get_db)):
    """Get detailed progress breakdown for a project."""
    project_service = ProjectService(db)
    progress = project_service.calculate_project_progress(project_id)

    if not progress:
        raise HTTPException(status_code=404, detail="Project not found")

    return progress


@router.get("/{project_id}/visibility")
def get_project_visibility(project_id: int, db: Session = Depends(get_db)):
    """Get visibility data for all project targets."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    visibility_service = VisibilityService(db)

    results = []
    for pt in project.project_targets:
        obj = pt.object
        if not obj or obj.ra is None or obj.dec is None:
            results.append({
                "object_id": pt.object_id,
                "object_name": obj.primary_name if obj else None,
                "is_primary": pt.is_primary,
                "visibility": None,
            })
            continue

        visibility = visibility_service.calculate_object_visibility(obj.ra, obj.dec)
        results.append({
            "object_id": pt.object_id,
            "object_name": obj.primary_name,
            "is_primary": pt.is_primary,
            "visibility": visibility,
        })

    return {
        "project_id": project_id,
        "project_name": project.name,
        "location_configured": visibility_service.location_configured,
        "timezone": visibility_service.timezone_name,
        "targets": results,
    }
