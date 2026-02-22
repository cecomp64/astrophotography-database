"""
Export router for PWA database sync.
Provides endpoints to download the SQLite database file and showcase images for offline use.
"""
import gzip
import hashlib
import os
from datetime import datetime
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from sqlalchemy import text

from app.config import get_settings
from app.database import SessionLocal
from app.models.showcases import ObjectShowcase

router = APIRouter(prefix="/export", tags=["export"])


class ExportMetadata(BaseModel):
    """Metadata about the database export for sync purposes."""
    version: str
    size_bytes: int
    checksum: str
    last_modified: str
    row_counts: dict[str, int]


class ShowcaseExportItem(BaseModel):
    """Metadata for a single showcase image in the export list."""
    object_id: int
    checksum: str
    size_bytes: int
    source_type: str


class ShowcasesExportMetadata(BaseModel):
    """Metadata about all showcase images available for sync."""
    total_count: int
    total_size_bytes: int
    showcases: list[ShowcaseExportItem]


def get_showcases_dir() -> Path:
    """Get the showcases directory path."""
    user_data = os.getenv("APP_USER_DATA")
    if user_data:
        return Path(user_data) / "showcases"
    # Fallback for development
    return Path("./showcases")


def get_database_path() -> Path:
    """Get the actual filesystem path to the SQLite database."""
    settings = get_settings()
    # database_url is like "sqlite:///./astrophotography.db" or "sqlite:////absolute/path/db.db"
    db_url = settings.database_url

    # Extract path from SQLite URL
    if db_url.startswith("sqlite:///"):
        db_path = db_url[len("sqlite:///"):]
        # Handle relative paths
        if not os.path.isabs(db_path):
            # Relative to current working directory
            db_path = os.path.abspath(db_path)
        return Path(db_path)

    raise ValueError(f"Unsupported database URL format: {db_url}")


def compute_file_checksum(file_path: Path) -> str:
    """Compute MD5 checksum of a file."""
    md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            md5.update(chunk)
    return md5.hexdigest()


def get_table_row_counts() -> dict[str, int]:
    """Get row counts for main tables."""
    tables = ["objects", "object_aliases", "images", "image_objects", "projects", "project_targets", "project_images", "best_viewing_cache"]
    counts = {}

    db = SessionLocal()
    try:
        for table in tables:
            try:
                result = db.execute(text(f"SELECT COUNT(*) FROM {table}"))
                counts[table] = result.scalar() or 0
            except Exception:
                # Table might not exist
                counts[table] = 0
    finally:
        db.close()

    return counts


@router.get("/metadata", response_model=ExportMetadata)
async def get_export_metadata():
    """
    Get metadata about the database for sync purposes.
    Returns version, size, checksum, and row counts.
    """
    try:
        db_path = get_database_path()

        if not db_path.exists():
            raise HTTPException(status_code=404, detail="Database file not found")

        stat = db_path.stat()

        return ExportMetadata(
            version=datetime.fromtimestamp(stat.st_mtime).isoformat(),
            size_bytes=stat.st_size,
            checksum=compute_file_checksum(db_path),
            last_modified=datetime.fromtimestamp(stat.st_mtime).isoformat(),
            row_counts=get_table_row_counts(),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting metadata: {str(e)}")


@router.get("/sqlite")
async def export_sqlite():
    """
    Download the SQLite database file (gzipped).
    Used by PWA to sync the full database for offline use.
    """
    try:
        db_path = get_database_path()

        if not db_path.exists():
            raise HTTPException(status_code=404, detail="Database file not found")

        # Read and gzip the database file
        buffer = BytesIO()
        with open(db_path, "rb") as f:
            with gzip.GzipFile(fileobj=buffer, mode="wb") as gz:
                # Stream in chunks to handle large files
                for chunk in iter(lambda: f.read(65536), b""):
                    gz.write(chunk)

        buffer.seek(0)

        # Get original file stats for headers
        stat = db_path.stat()
        checksum = compute_file_checksum(db_path)

        return StreamingResponse(
            buffer,
            media_type="application/gzip",
            headers={
                "Content-Disposition": f'attachment; filename="astrophotography.db.gz"',
                "X-Original-Size": str(stat.st_size),
                "X-Checksum": checksum,
                "X-Last-Modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting database: {str(e)}")


@router.get("/showcases", response_model=ShowcasesExportMetadata)
async def get_showcases_metadata():
    """
    Get metadata about all showcase images available for sync.
    Returns list of object IDs with checksums and sizes for incremental sync.
    """
    showcases_dir = get_showcases_dir()
    db = SessionLocal()

    try:
        # Get all showcases from database
        showcases = db.query(ObjectShowcase).all()

        items = []
        total_size = 0

        for showcase in showcases:
            file_path = showcases_dir / showcase.file_path
            if file_path.exists():
                stat = file_path.stat()
                checksum = compute_file_checksum(file_path)
                items.append(ShowcaseExportItem(
                    object_id=showcase.object_id,
                    checksum=checksum,
                    size_bytes=stat.st_size,
                    source_type=showcase.source_type,
                ))
                total_size += stat.st_size

        return ShowcasesExportMetadata(
            total_count=len(items),
            total_size_bytes=total_size,
            showcases=items,
        )
    finally:
        db.close()


@router.get("/showcases/{object_id}")
async def export_showcase_image(object_id: int):
    """
    Download a specific showcase image by object ID.
    Returns raw image bytes (JPEG or PNG).
    """
    showcases_dir = get_showcases_dir()
    db = SessionLocal()

    try:
        showcase = db.query(ObjectShowcase).filter(
            ObjectShowcase.object_id == object_id
        ).first()

        if not showcase:
            raise HTTPException(status_code=404, detail=f"No showcase for object {object_id}")

        file_path = showcases_dir / showcase.file_path
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Showcase image file not found")

        # Determine media type
        media_type = "image/jpeg" if showcase.file_path.endswith(".jpg") else "image/png"

        # Read file and return with checksum header
        with open(file_path, "rb") as f:
            content = f.read()

        checksum = hashlib.md5(content).hexdigest()

        return Response(
            content=content,
            media_type=media_type,
            headers={
                "X-Checksum": checksum,
                "X-Object-Id": str(object_id),
                "X-Source-Type": showcase.source_type,
            },
        )
    finally:
        db.close()
