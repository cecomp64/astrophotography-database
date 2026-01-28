import json
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Generator

from app.database import get_db, SessionLocal
from app.services.indexer import FileIndexer
from app.services.fov_matcher import FOVMatcher
from app.services.catalogue_importer import CatalogueImporter
from app.routers.files import detect_mount_structure, display_to_container_path

router = APIRouter(prefix="/indexer", tags=["indexer"])


def resolve_path(path: str) -> str:
    """
    Resolve a path to a container-accessible path.

    Accepts either:
    - Container paths (starting with /data) - used as-is
    - Display paths (e.g., /Users/...) - translated to container path
    """
    if path.startswith("/data"):
        return path
    mount_info = detect_mount_structure()
    return display_to_container_path(path, mount_info)


def sse_event(data: dict, event: str = "progress") -> str:
    """Format data as Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


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

    Note: Accepts container paths (from file picker) or display paths (e.g., /Users/...)
    """
    directory = resolve_path(request.directory)
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

    Note: Accepts container paths (from file picker) or display paths (e.g., /Users/...)
    """
    file_path = resolve_path(request.file_path)
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


# ==================== SSE Progress Streaming Endpoints ====================


@router.post("/directory/stream")
def index_directory_stream(
    request: IndexDirectoryRequest,
    detect_fov: bool = Query(default=True, description="Detect objects within FOV after indexing"),
):
    """
    Index all FITS files with real-time progress streaming via SSE.

    Returns Server-Sent Events with progress updates.
    """
    def generate_progress() -> Generator[str, None, None]:
        from pathlib import Path

        db = SessionLocal()
        try:
            directory = resolve_path(request.directory)
            dir_path = Path(directory)

            if not dir_path.exists():
                yield sse_event({"status": "error", "message": f"Directory not found: {request.directory}"}, "error")
                return

            # First, count total files to index
            pattern = "**/*" if request.recursive else "*"
            fits_extensions = {".fits", ".fit", ".fts"}

            files_to_index = []
            for file_path in dir_path.glob(pattern):
                if not file_path.is_file():
                    continue
                name_lower = file_path.name.lower()
                if any(name_lower.endswith(ext) or name_lower.endswith(f"{ext}.gz") for ext in fits_extensions):
                    files_to_index.append(file_path)

            total_files = len(files_to_index)

            yield sse_event({
                "status": "started",
                "phase": "scanning",
                "total": total_files,
                "current": 0,
                "message": f"Found {total_files} FITS files to process"
            })

            if total_files == 0:
                yield sse_event({
                    "status": "completed",
                    "indexed": 0,
                    "skipped": 0,
                    "errors": 0,
                    "message": "No FITS files found"
                }, "complete")
                return

            indexer = FileIndexer(db, detect_fov_objects=detect_fov)
            stats = {"indexed": 0, "skipped": 0, "errors": 0}

            for i, file_path in enumerate(files_to_index):
                result = indexer.index_file(file_path)

                if result["status"] == "indexed":
                    stats["indexed"] += 1
                elif result["status"] == "skipped":
                    stats["skipped"] += 1
                else:
                    stats["errors"] += 1

                # Send progress update every file
                yield sse_event({
                    "status": "indexing",
                    "phase": "indexing",
                    "current": i + 1,
                    "total": total_files,
                    "percent": round((i + 1) / total_files * 100, 1),
                    "current_file": file_path.name,
                    "indexed": stats["indexed"],
                    "skipped": stats["skipped"],
                    "errors": stats["errors"]
                })

            # Final result
            yield sse_event({
                "status": "completed",
                "indexed": stats["indexed"],
                "skipped": stats["skipped"],
                "errors": stats["errors"],
                "directory": request.directory,
                "detect_fov_enabled": detect_fov
            }, "complete")

        except Exception as e:
            yield sse_event({"status": "error", "message": str(e)}, "error")
        finally:
            db.close()

    return StreamingResponse(
        generate_progress(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/download-catalogues/stream")
def download_catalogues_stream(
    catalogs: list[str] = Query(default=["openngc", "ldn", "lbn"]),
):
    """
    Download and import catalogues with real-time progress streaming via SSE.

    Returns Server-Sent Events with progress updates.
    """
    def generate_progress() -> Generator[str, None, None]:
        db = SessionLocal()
        try:
            # Handle "all" option
            catalog_list = catalogs
            if "all" in catalog_list:
                catalog_list = ["openngc", "ldn", "lbn"]

            total_catalogs = len(catalog_list)
            results = {"catalogues": {}, "errors": []}

            yield sse_event({
                "status": "started",
                "phase": "downloading",
                "total": total_catalogs,
                "current": 0,
                "message": f"Preparing to download {total_catalogs} catalogue(s)"
            })

            importer = CatalogueImporter(db)

            for i, catalog in enumerate(catalog_list):
                # Send "downloading" event
                yield sse_event({
                    "status": "downloading",
                    "phase": "downloading",
                    "current": i,
                    "total": total_catalogs,
                    "percent": round(i / total_catalogs * 100, 1),
                    "current_catalog": catalog,
                    "message": f"Downloading {catalog.upper()}..."
                })

                try:
                    if catalog == "openngc":
                        result = importer.download_and_import_openngc()
                        results["catalogues"]["openngc"] = result
                    elif catalog == "ldn":
                        result = importer.download_and_import_ldn()
                        results["catalogues"]["ldn"] = result
                    elif catalog == "lbn":
                        result = importer.download_and_import_lbn()
                        results["catalogues"]["lbn"] = result
                    else:
                        results["errors"].append(f"Unknown catalogue: {catalog}")
                        continue

                    # Send progress after each catalogue
                    yield sse_event({
                        "status": "importing",
                        "phase": "importing",
                        "current": i + 1,
                        "total": total_catalogs,
                        "percent": round((i + 1) / total_catalogs * 100, 1),
                        "current_catalog": catalog,
                        "imported": result.get("imported", 0),
                        "message": f"Imported {result.get('imported', 0)} objects from {catalog.upper()}"
                    })

                except Exception as e:
                    results["errors"].append(f"{catalog}: {str(e)}")
                    yield sse_event({
                        "status": "error",
                        "phase": "importing",
                        "current": i + 1,
                        "total": total_catalogs,
                        "current_catalog": catalog,
                        "message": f"Error importing {catalog}: {str(e)}"
                    })

            # Get final stats
            results["stats"] = importer.get_catalogue_stats()

            yield sse_event({
                "status": "completed",
                **results
            }, "complete")

        except Exception as e:
            yield sse_event({"status": "error", "message": str(e)}, "error")
        finally:
            db.close()

    return StreamingResponse(
        generate_progress(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
