from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.services.indexer import FileIndexer
from app.services.fov_matcher import FOVMatcher
from app.services.catalogue_importer import CatalogueImporter

router = APIRouter(prefix="/indexer", tags=["indexer"])


class IndexDirectoryRequest(BaseModel):
    directory: str
    recursive: bool = True


class IndexFileRequest(BaseModel):
    file_path: str


@router.post("/directory")
def index_directory(
    request: IndexDirectoryRequest,
    detect_fov: bool = Query(default=True, description="Detect objects within FOV after indexing"),
    db: Session = Depends(get_db)
):
    """
    Index all FITS files in a directory.

    Provide the path to a directory containing FITS files. The indexer will:
    - Scan for .fits, .fit, .fts files (including .gz compressed)
    - Extract metadata from FITS headers
    - Attempt to resolve object names
    - Store image records in the database
    - Optionally detect catalogue objects within each image's FOV

    Note: Paths are relative to the host machine root and will be mounted at /data/host_mnt
    """
    # Prepend /data/host_mnt to make paths absolute within container
    directory = f"/data/host_mnt{request.directory}" if not request.directory.startswith("/data") else request.directory
    indexer = FileIndexer(db, detect_fov_objects=detect_fov)
    result = indexer.index_directory(directory, recursive=request.recursive)

    return {
        "status": "completed",
        "directory": request.directory,
        "indexed": result["indexed"],
        "skipped": result["skipped"],
        "errors": result["errors"],
        "detect_fov_enabled": detect_fov,
    }


@router.post("/file")
def index_file(
    request: IndexFileRequest,
    detect_fov: bool = Query(default=True, description="Detect objects within FOV after indexing"),
    db: Session = Depends(get_db)
):
    """
    Index a single FITS file.

    Provide the full path to a FITS file to extract its metadata and add it to the database.
    Optionally detects catalogue objects within the image's FOV.

    Note: Paths are relative to the host machine root and will be mounted at /data/host_mnt
    """
    # Prepend /data/host_mnt to make paths absolute within container
    file_path = f"/data/host_mnt{request.file_path}" if not request.file_path.startswith("/data") else request.file_path
    indexer = FileIndexer(db, detect_fov_objects=detect_fov)
    result = indexer.index_file(file_path)

    return result


@router.post("/reindex")
def reindex_all(db: Session = Depends(get_db)):
    """
    Reindex all files in the database (update metadata).

    Re-reads FITS headers for all indexed files and updates their metadata.
    Useful after making changes to metadata extraction logic.
    """
    indexer = FileIndexer(db)
    result = indexer.reindex_all()

    return {
        "status": "completed",
        "updated": result["updated"],
        "errors": result["errors"],
    }


@router.post("/download-catalogues")
def download_and_import_catalogues(
    catalogs: list[str] = Query(default=["openngc", "ldn", "lbn"]),
    db: Session = Depends(get_db)
):
    """
    Download and import astronomical catalogues from remote sources.

    This endpoint downloads catalogue data directly from:
    - OpenNGC: GitHub (includes NGC, IC, and Messier objects with cross-references)
    - LDN: VizieR TAP service (Lynds Dark Nebulae, catalog VII/7A)
    - LBN: VizieR TAP service (Lynds Bright Nebulae, catalog VII/9)

    Objects are stored as unified AstroObject entries with ObjectAlias for all
    designations (NGC, IC, Messier, common names, etc.).

    Args:
        catalogs: List of catalogues to download. Options: "openngc", "ldn", "lbn", "all"

    Returns:
        Import results for each catalogue including Messier count
    """
    importer = CatalogueImporter(db)
    results = {"status": "completed", "catalogues": {}, "errors": []}

    # Handle "all" option
    if "all" in catalogs:
        catalogs = ["openngc", "ldn", "lbn"]

    for catalog in catalogs:
        try:
            if catalog == "openngc":
                results["catalogues"]["openngc"] = importer.download_and_import_openngc()
            elif catalog == "ldn":
                results["catalogues"]["ldn"] = importer.download_and_import_ldn()
            elif catalog == "lbn":
                results["catalogues"]["lbn"] = importer.download_and_import_lbn()
            else:
                results["errors"].append(f"Unknown catalogue: {catalog}")
        except Exception as e:
            results["errors"].append(f"{catalog}: {str(e)}")

    # Get final stats
    results["stats"] = importer.get_catalogue_stats()

    return results


@router.get("/catalogue-stats")
def get_catalogue_stats(db: Session = Depends(get_db)):
    """Get statistics about imported catalogues."""
    importer = CatalogueImporter(db)
    return importer.get_catalogue_stats()


@router.post("/detect-fov-objects")
def detect_fov_objects_batch(
    image_ids: Optional[list[int]] = Query(default=None),
    catalogs: list[str] = Query(default=["NGC", "IC", "Messier", "LDN", "LBN"]),
    only_missing: bool = Query(default=True),
    db: Session = Depends(get_db)
):
    """
    Detect FOV objects for multiple images or all images.

    Args:
        image_ids: Optional list of specific image IDs to process
        catalogs: List of catalog types to search (default: NGC, IC, Messier, LDN, LBN)
        only_missing: Only process images without existing FOV associations

    Returns:
        Summary of processing results
    """
    matcher = FOVMatcher(db)

    if image_ids:
        from app.models import Image
        images = db.query(Image).filter(Image.id.in_(image_ids)).all()
        results = {
            "processed": 0,
            "objects_found": 0,
            "details": []
        }
        for image in images:
            matches = matcher.match_image_to_objects(image, catalogs)
            results["processed"] += 1
            results["objects_found"] += len(matches)
            results["details"].append({
                "image_id": image.id,
                "file_name": image.file_name,
                "objects_found": len(matches)
            })
    else:
        results = matcher.detect_objects_for_all_images(catalogs, only_missing)

    return {
        "status": "completed",
        **results
    }
