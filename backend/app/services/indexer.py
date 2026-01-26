import asyncio
import logging
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Image, AstroObject, ImageObject
from app.services.fits_extractor import FitsExtractor, FitsMetadata
from app.services.name_resolver import NameResolver
from app.services.fov_matcher import FOVMatcher

logger = logging.getLogger(__name__)


class FileIndexer:
    """
    Indexes FITS files from the filesystem into the database.
    """

    SUPPORTED_EXTENSIONS = {".fits", ".fit", ".fts", ".fits.gz", ".fit.gz"}

    def __init__(self, db: Session, detect_fov_objects: bool = True):
        """
        Initialize the file indexer.

        Args:
            db: Database session
            detect_fov_objects: Whether to detect and associate objects within FOV after indexing
        """
        self.db = db
        self.extractor = FitsExtractor()
        self.resolver = NameResolver(db, use_mock=False)
        self.detect_fov_objects = detect_fov_objects
        self._fov_matcher = None

    @property
    def fov_matcher(self) -> FOVMatcher:
        """Lazy-load FOV matcher."""
        if self._fov_matcher is None:
            self._fov_matcher = FOVMatcher(self.db)
        return self._fov_matcher

    def index_directory(self, directory: str | Path, recursive: bool = True) -> dict:
        """
        Index all FITS files in a directory.

        Args:
            directory: Path to the directory to scan
            recursive: Whether to scan subdirectories

        Returns:
            Dictionary with indexing statistics
        """
        directory = Path(directory)
        logger.info(f"Starting directory indexing: {directory} (recursive={recursive})")

        if not directory.exists():
            logger.error(f"Directory not found: {directory}")
            return {"error": f"Directory not found: {directory}", "indexed": 0, "skipped": 0, "errors": 0}

        stats = {"indexed": 0, "skipped": 0, "errors": 0, "files": []}

        pattern = "**/*" if recursive else "*"

        for file_path in directory.glob(pattern):
            if not file_path.is_file():
                continue

            # Check if file has supported extension
            if not self._is_fits_file(file_path):
                continue

            result = self.index_file(file_path)

            if result["status"] == "indexed":
                stats["indexed"] += 1
                logger.info(f"Indexed: {file_path}")
            elif result["status"] == "skipped":
                stats["skipped"] += 1
                logger.debug(f"Skipped: {file_path} - {result.get('reason', 'unknown')}")
            else:
                stats["errors"] += 1
                logger.error(f"Error indexing {file_path}: {result.get('error', 'unknown')}")

            stats["files"].append(result)

        logger.info(f"Directory indexing complete. Indexed: {stats['indexed']}, Skipped: {stats['skipped']}, Errors: {stats['errors']}")
        return stats

    def index_file(self, file_path: str | Path) -> dict:
        """
        Index a single FITS file.

        Returns:
            Dictionary with indexing result
        """
        file_path = Path(file_path)
        logger.debug(f"Indexing file: {file_path}")

        # Check if already indexed
        existing = self.db.query(Image).filter(Image.file_path == str(file_path)).first()
        if existing:
            logger.debug(f"File already indexed: {file_path} (image_id={existing.id})")
            return {"status": "skipped", "file": str(file_path), "reason": "already indexed", "image_id": existing.id}

        try:
            # Extract metadata from FITS file
            metadata = self.extractor.extract(file_path)

            # Resolve object name if present
            resolved_object = None
            if metadata.object_name:
                resolved_object = self.resolver.resolve(metadata.object_name, file_path=str(file_path))

            # Create image record with FOV fields
            image = Image(
                file_path=metadata.file_path,
                file_name=metadata.file_name,
                directory_path=metadata.directory_path,
                date_taken=metadata.date_taken,
                exposure_time=metadata.exposure_time,
                filter_name=metadata.filter_name,
                telescope=metadata.telescope,
                camera=metadata.camera,
                gain=metadata.gain,
                iso=metadata.iso,
                binning=metadata.binning,
                # FOV-related fields
                ra=metadata.ra,
                dec=metadata.dec,
                pixel_size_x=metadata.pixel_size_x,
                pixel_size_y=metadata.pixel_size_y,
                image_width=metadata.image_width,
                image_height=metadata.image_height,
                focal_length=metadata.focal_length,
                fov_width=metadata.fov_width,
                fov_height=metadata.fov_height,
                # Legacy FK (kept for backward compatibility)
                object_id=resolved_object.id if resolved_object else None,
                fits_header=metadata.fits_header,
            )

            self.db.add(image)
            self.db.flush()  # Get image.id without committing

            # Create ImageObject association for primary object
            if resolved_object:
                image_object = ImageObject(
                    image_id=image.id,
                    object_id=resolved_object.id,
                    association_type="primary",
                    angular_distance=0.0  # Primary object is at center
                )
                self.db.add(image_object)

            self.db.commit()
            self.db.refresh(image)

            # Detect objects in FOV if enabled and image has FOV data
            fov_objects_found = 0
            if self.detect_fov_objects and all([image.ra, image.dec, image.fov_width, image.fov_height]):
                try:
                    matches = self.fov_matcher.match_image_to_objects(image)
                    fov_objects_found = len(matches)
                    if fov_objects_found > 0:
                        logger.info(f"Found {fov_objects_found} objects in FOV for {file_path}")
                except Exception as e:
                    logger.warning(f"FOV detection failed for {file_path}: {e}")

            logger.info(f"Successfully indexed: {file_path} (image_id={image.id}, object={metadata.object_name})")
            return {
                "status": "indexed",
                "file": str(file_path),
                "image_id": image.id,
                "object_name": metadata.object_name,
                "object_id": resolved_object.id if resolved_object else None,
                "fov_width": metadata.fov_width,
                "fov_height": metadata.fov_height,
                "fov_objects_found": fov_objects_found,
            }

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error indexing {file_path}: {str(e)}", exc_info=True)
            return {"status": "error", "file": str(file_path), "error": str(e)}

    async def index_file_async(self, file_path: str | Path) -> dict:
        """
        Index a single FITS file asynchronously with Telescopius lookup.
        """
        file_path = Path(file_path)

        # Check if already indexed
        existing = self.db.query(Image).filter(Image.file_path == str(file_path)).first()
        if existing:
            return {"status": "skipped", "file": str(file_path), "reason": "already indexed", "image_id": existing.id}

        try:
            # Extract metadata from FITS file
            metadata = self.extractor.extract(file_path)

            # Resolve object name asynchronously (with Telescopius)
            resolved_object = None
            if metadata.object_name:
                resolved_object = await self.resolver.resolve_async(metadata.object_name)

            # Create image record with FOV fields
            image = Image(
                file_path=metadata.file_path,
                file_name=metadata.file_name,
                directory_path=metadata.directory_path,
                date_taken=metadata.date_taken,
                exposure_time=metadata.exposure_time,
                filter_name=metadata.filter_name,
                telescope=metadata.telescope,
                camera=metadata.camera,
                gain=metadata.gain,
                iso=metadata.iso,
                binning=metadata.binning,
                # FOV-related fields
                ra=metadata.ra,
                dec=metadata.dec,
                pixel_size_x=metadata.pixel_size_x,
                pixel_size_y=metadata.pixel_size_y,
                image_width=metadata.image_width,
                image_height=metadata.image_height,
                focal_length=metadata.focal_length,
                fov_width=metadata.fov_width,
                fov_height=metadata.fov_height,
                # Legacy FK
                object_id=resolved_object.id if resolved_object else None,
                fits_header=metadata.fits_header,
            )

            self.db.add(image)
            self.db.flush()

            # Create ImageObject association for primary object
            if resolved_object:
                image_object = ImageObject(
                    image_id=image.id,
                    object_id=resolved_object.id,
                    association_type="primary",
                    angular_distance=0.0
                )
                self.db.add(image_object)

            self.db.commit()
            self.db.refresh(image)

            # Detect objects in FOV if enabled
            fov_objects_found = 0
            if self.detect_fov_objects and all([image.ra, image.dec, image.fov_width, image.fov_height]):
                try:
                    matches = self.fov_matcher.match_image_to_objects(image)
                    fov_objects_found = len(matches)
                except Exception as e:
                    logger.warning(f"FOV detection failed for {file_path}: {e}")

            return {
                "status": "indexed",
                "file": str(file_path),
                "image_id": image.id,
                "object_name": metadata.object_name,
                "object_id": resolved_object.id if resolved_object else None,
                "fov_width": metadata.fov_width,
                "fov_height": metadata.fov_height,
                "fov_objects_found": fov_objects_found,
            }

        except Exception as e:
            self.db.rollback()
            return {"status": "error", "file": str(file_path), "error": str(e)}

    def reindex_all(self) -> dict:
        """
        Reindex all files in the database (update metadata including FOV fields).
        """
        images = self.db.query(Image).all()
        logger.info(f"Starting reindex of {len(images)} images")
        stats = {"updated": 0, "errors": 0}

        for image in images:
            try:
                file_path = Path(image.file_path)
                if not file_path.exists():
                    continue

                metadata = self.extractor.extract(file_path)

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

                # Try to resolve object if not already linked
                if not image.object_id and metadata.object_name:
                    obj = self.resolver.resolve(metadata.object_name, file_path=str(file_path))
                    if obj:
                        image.object_id = obj.id
                        # Also create ImageObject association if not exists
                        existing_assoc = self.db.query(ImageObject).filter(
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
                            self.db.add(image_object)

                self.db.commit()
                stats["updated"] += 1
                logger.debug(f"Reindexed: {image.file_path}")

            except Exception as e:
                self.db.rollback()
                stats["errors"] += 1
                logger.error(f"Error reindexing {image.file_path}: {str(e)}")

        logger.info(f"Reindex complete. Updated: {stats['updated']}, Errors: {stats['errors']}")
        return stats

    def _is_fits_file(self, file_path: Path) -> bool:
        """Check if file has a supported FITS extension."""
        name_lower = file_path.name.lower()

        for ext in self.SUPPORTED_EXTENSIONS:
            if name_lower.endswith(ext):
                return True

        return False
