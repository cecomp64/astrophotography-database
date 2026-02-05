from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.schemas.showcases import ShowcaseResponse
from app.services.showcase_service import ShowcaseService

router = APIRouter(prefix="/showcases", tags=["showcases"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.get("/objects/{object_id}", response_model=Optional[ShowcaseResponse])
def get_object_showcase(object_id: int, db: Session = Depends(get_db)):
    """Get showcase metadata for an object."""
    service = ShowcaseService(db)
    showcase = service.get_showcase(object_id)
    return showcase


@router.get("/objects/{object_id}/image")
def get_showcase_image(object_id: int, db: Session = Depends(get_db)):
    """Get the actual showcase image file."""
    service = ShowcaseService(db)
    showcase = service.get_showcase(object_id)
    if not showcase:
        raise HTTPException(status_code=404, detail="No showcase image for this object")

    file_path = service.get_absolute_path(showcase.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Showcase image file not found")

    media_type = "image/jpeg" if showcase.file_path.endswith(".jpg") else "image/png"
    return FileResponse(file_path, media_type=media_type)


@router.post("/objects/{object_id}/upload", response_model=ShowcaseResponse)
async def upload_showcase(
    object_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a showcase image for an object."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_CONTENT_TYPES)}"
        )

    # Read file with size limit
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    service = ShowcaseService(db)
    try:
        showcase = service.upload_showcase(object_id, contents, file.content_type)
        return showcase
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/objects/{object_id}/from-indexed/{image_id}", response_model=ShowcaseResponse)
def set_indexed_showcase(
    object_id: int,
    image_id: int,
    db: Session = Depends(get_db),
):
    """Generate showcase from an indexed FITS image."""
    service = ShowcaseService(db)
    try:
        showcase = service.generate_from_indexed(object_id, image_id)
        return showcase
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process FITS: {str(e)}")


@router.post("/objects/{object_id}/from-survey", response_model=ShowcaseResponse)
async def fetch_survey_showcase(
    object_id: int,
    survey: str = Query("DSS2 Red", description="SkyView survey name"),
    db: Session = Depends(get_db),
):
    """Fetch showcase image from SkyView survey."""
    service = ShowcaseService(db)
    try:
        showcase = await service.fetch_survey_image(object_id, survey)
        return showcase
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch survey image: {str(e)}")


@router.delete("/objects/{object_id}", status_code=204)
def delete_showcase(object_id: int, db: Session = Depends(get_db)):
    """Delete showcase for an object."""
    service = ShowcaseService(db)
    if not service.delete_showcase(object_id):
        raise HTTPException(status_code=404, detail="No showcase found for this object")
