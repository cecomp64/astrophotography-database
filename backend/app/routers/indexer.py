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


@router.post("/reindex/stream")
def reindex_stream(
    re_resolve_names: bool = Query(default=False, description="Re-resolve object names via Telescopius to fetch missing aliases"),
):
    """
    Reindex all files with real-time progress streaming via SSE.

    Args:
        re_resolve_names: If True, re-resolve object names via Telescopius even if already resolved.
                         This can fetch additional aliases for existing objects.

    Returns Server-Sent Events with progress updates.
    """
    def generate_progress() -> Generator[str, None, None]:
        from app.models import Image, ImageObject

        db = SessionLocal()
        try:
            images = db.query(Image).all()
            total_images = len(images)

            yield sse_event({
                "status": "started",
                "phase": "reindexing",
                "total": total_images,
                "current": 0,
                "message": f"Found {total_images} images to reindex"
            })

            if total_images == 0:
                yield sse_event({
                    "status": "completed",
                    "updated": 0,
                    "errors": 0,
                    "re_resolved": 0,
                    "message": "No images to reindex"
                }, "complete")
                return

            indexer = FileIndexer(db)
            stats = {"updated": 0, "errors": 0, "re_resolved": 0}

            for i, image in enumerate(images):
                try:
                    from pathlib import Path
                    file_path = Path(image.file_path)

                    if not file_path.exists():
                        # File no longer exists, skip
                        yield sse_event({
                            "status": "reindexing",
                            "phase": "reindexing",
                            "current": i + 1,
                            "total": total_images,
                            "percent": round((i + 1) / total_images * 100, 1),
                            "current_file": image.file_name,
                            "updated": stats["updated"],
                            "errors": stats["errors"],
                            "re_resolved": stats["re_resolved"],
                            "message": f"Skipped (file not found): {image.file_name}"
                        })
                        continue

                    metadata = indexer.extractor.extract(file_path)

                    # Update image metadata
                    image.date_taken = metadata.date_taken
                    image.exposure_time = metadata.exposure_time
                    image.filter_name = metadata.filter_name
                    image.telescope = metadata.telescope
                    image.camera = metadata.camera
                    image.gain = metadata.gain
                    image.iso = metadata.iso
                    image.binning = metadata.binning
                    image.fits_header = metadata.fits_header

                    # Update FOV-related fields
                    image.ra = metadata.ra
                    image.dec = metadata.dec
                    image.pixel_size_x = metadata.pixel_size_x
                    image.pixel_size_y = metadata.pixel_size_y
                    image.image_width = metadata.image_width
                    image.image_height = metadata.image_height
                    image.focal_length = metadata.focal_length
                    image.fov_width = metadata.fov_width
                    image.fov_height = metadata.fov_height

                    # Re-resolve object name if requested or if not already linked
                    if metadata.object_name and (re_resolve_names or not image.object_id):
                        obj = indexer.resolver.resolve(metadata.object_name, file_path=str(file_path))
                        if obj:
                            if re_resolve_names and image.object_id:
                                stats["re_resolved"] += 1
                            image.object_id = obj.id
                            # Create ImageObject association if not exists
                            existing_assoc = db.query(ImageObject).filter(
                                ImageObject.image_id == image.id,
                                ImageObject.object_id == obj.id
                            ).first()
                            if not existing_assoc:
                                image_object = ImageObject(
                                    image_id=image.id,
                                    object_id=obj.id,
                                    association_type="primary",
                                    angular_distance=0.0
                                )
                                db.add(image_object)

                    db.commit()
                    stats["updated"] += 1

                except Exception as e:
                    db.rollback()
                    stats["errors"] += 1

                # Send progress update
                yield sse_event({
                    "status": "reindexing",
                    "phase": "reindexing",
                    "current": i + 1,
                    "total": total_images,
                    "percent": round((i + 1) / total_images * 100, 1),
                    "current_file": image.file_name,
                    "updated": stats["updated"],
                    "errors": stats["errors"],
                    "re_resolved": stats["re_resolved"]
                })

            # Final result
            yield sse_event({
                "status": "completed",
                "updated": stats["updated"],
                "errors": stats["errors"],
                "re_resolved": stats["re_resolved"]
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


@router.post("/detect-fov-objects/stream")
def detect_fov_objects_stream(
    catalogs: list[str] = Query(default=["NGC", "IC", "Messier", "LDN", "LBN"]),
    only_missing: bool = Query(default=True),
):
    """
    Detect FOV objects for all images with real-time progress streaming via SSE.

    Args:
        catalogs: List of catalog types to search
        only_missing: Only process images without existing FOV associations

    Returns Server-Sent Events with progress updates.
    """
    def generate_progress() -> Generator[str, None, None]:
        from app.models import Image, ImageObject

        db = SessionLocal()
        try:
            # Get images to process
            query = db.query(Image).filter(
                Image.ra.isnot(None),
                Image.dec.isnot(None),
                Image.fov_width.isnot(None),
                Image.fov_height.isnot(None)
            )

            if only_missing:
                # Only images without any in_fov associations
                images_with_fov = db.query(ImageObject.image_id).filter(
                    ImageObject.association_type == "in_fov"
                ).distinct()
                query = query.filter(~Image.id.in_(images_with_fov))

            images = query.all()
            total_images = len(images)

            yield sse_event({
                "status": "started",
                "phase": "detecting",
                "total": total_images,
                "current": 0,
                "message": f"Found {total_images} images to process"
            })

            if total_images == 0:
                yield sse_event({
                    "status": "completed",
                    "processed": 0,
                    "objects_found": 0,
                    "message": "No images to process"
                }, "complete")
                return

            matcher = FOVMatcher(db)
            stats = {"processed": 0, "objects_found": 0}

            for i, image in enumerate(images):
                try:
                    matches = matcher.match_image_to_objects(image, catalogs)
                    stats["processed"] += 1
                    stats["objects_found"] += len(matches)
                except Exception:
                    pass  # Continue with next image

                # Send progress update
                yield sse_event({
                    "status": "detecting",
                    "phase": "detecting",
                    "current": i + 1,
                    "total": total_images,
                    "percent": round((i + 1) / total_images * 100, 1),
                    "current_file": image.file_name,
                    "processed": stats["processed"],
                    "objects_found": stats["objects_found"]
                })

            # Final result
            yield sse_event({
                "status": "completed",
                "processed": stats["processed"],
                "objects_found": stats["objects_found"]
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


@router.post("/re-resolve-names/stream")
def re_resolve_names_stream():
    """
    Re-resolve object names via Telescopius to fetch missing aliases.

    Only processes objects that have associated images (not catalogue-only objects).
    This is useful when you initially indexed without Telescopius API configured,
    and later want to enrich existing objects with additional aliases.

    Returns Server-Sent Events with progress updates.
    """
    def generate_progress() -> Generator[str, None, None]:
        from app.models import AstroObject, ObjectAlias, Image
        from app.services.name_resolver import NameResolver, get_telescopius_api_key

        db = SessionLocal()
        try:
            # Check if Telescopius API is configured
            api_key = get_telescopius_api_key(db)
            if not api_key:
                yield sse_event({
                    "status": "error",
                    "message": "Telescopius API key not configured. Please set it in Settings."
                }, "error")
                return

            # Get only objects that have associated images
            # This avoids querying Telescopius for catalogue objects with no images
            objects_with_images = db.query(Image.object_id).filter(
                Image.object_id.isnot(None)
            ).distinct().subquery()

            objects = db.query(AstroObject).filter(
                AstroObject.id.in_(objects_with_images)
            ).all()
            total_objects = len(objects)

            yield sse_event({
                "status": "started",
                "phase": "resolving",
                "total": total_objects,
                "current": 0,
                "message": f"Found {total_objects} objects to check"
            })

            if total_objects == 0:
                yield sse_event({
                    "status": "completed",
                    "checked": 0,
                    "updated": 0,
                    "aliases_added": 0,
                    "message": "No objects to check"
                }, "complete")
                return

            resolver = NameResolver(db)
            stats = {"checked": 0, "updated": 0, "aliases_added": 0, "errors": 0}

            for i, obj in enumerate(objects):
                try:
                    # Skip solar system objects
                    if obj.object_type in ["Planet", "Moon", "Dwarf Planet", "Star"] and obj.primary_name.lower() in resolver.SOLAR_SYSTEM_OBJECTS:
                        stats["checked"] += 1
                        yield sse_event({
                            "status": "resolving",
                            "phase": "resolving",
                            "current": i + 1,
                            "total": total_objects,
                            "percent": round((i + 1) / total_objects * 100, 1),
                            "current_object": obj.primary_name,
                            "checked": stats["checked"],
                            "updated": stats["updated"],
                            "aliases_added": stats["aliases_added"]
                        })
                        continue

                    # Try to get more info from Telescopius
                    if hasattr(resolver.client, 'search_object_sync'):
                        telescopius_obj = resolver.client.search_object_sync(obj.primary_name)
                        if telescopius_obj:
                            aliases_before = db.query(ObjectAlias).filter(ObjectAlias.object_id == obj.id).count()

                            # Add any new aliases
                            existing_aliases = {a.alias_name.lower() for a in db.query(ObjectAlias).filter(ObjectAlias.object_id == obj.id).all()}
                            existing_aliases.add(obj.primary_name.lower())

                            for alias_data in telescopius_obj.aliases:
                                alias_name = alias_data.get("name", "")
                                if alias_name and alias_name.lower() not in existing_aliases:
                                    alias = ObjectAlias(
                                        object_id=obj.id,
                                        alias_name=alias_name,
                                        catalog=alias_data.get("catalog"),
                                    )
                                    db.add(alias)
                                    existing_aliases.add(alias_name.lower())

                            db.commit()

                            aliases_after = db.query(ObjectAlias).filter(ObjectAlias.object_id == obj.id).count()
                            new_aliases = aliases_after - aliases_before
                            if new_aliases > 0:
                                stats["updated"] += 1
                                stats["aliases_added"] += new_aliases

                    stats["checked"] += 1

                except Exception:
                    stats["errors"] += 1
                    db.rollback()

                # Send progress update
                yield sse_event({
                    "status": "resolving",
                    "phase": "resolving",
                    "current": i + 1,
                    "total": total_objects,
                    "percent": round((i + 1) / total_objects * 100, 1),
                    "current_object": obj.primary_name,
                    "checked": stats["checked"],
                    "updated": stats["updated"],
                    "aliases_added": stats["aliases_added"]
                })

            # Final result
            yield sse_event({
                "status": "completed",
                "checked": stats["checked"],
                "updated": stats["updated"],
                "aliases_added": stats["aliases_added"],
                "errors": stats["errors"]
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
