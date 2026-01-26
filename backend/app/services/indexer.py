import asyncio
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Image, AstroObject
from app.services.fits_extractor import FitsExtractor, FitsMetadata
from app.services.name_resolver import NameResolver


class FileIndexer:
    """
    Indexes FITS files from the filesystem into the database.
    """

    SUPPORTED_EXTENSIONS = {".fits", ".fit", ".fts", ".fits.gz", ".fit.gz"}

    def __init__(self, db: Session):
        self.db = db
        self.extractor = FitsExtractor()
        self.resolver = NameResolver(db, use_mock=True)

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

        if not directory.exists():
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
            elif result["status"] == "skipped":
                stats["skipped"] += 1
            else:
                stats["errors"] += 1

            stats["files"].append(result)

        return stats

    def index_file(self, file_path: str | Path) -> dict:
        """
        Index a single FITS file.

        Returns:
            Dictionary with indexing result
        """
        file_path = Path(file_path)

        # Check if already indexed
        existing = self.db.query(Image).filter(Image.file_path == str(file_path)).first()
        if existing:
            return {"status": "skipped", "file": str(file_path), "reason": "already indexed", "image_id": existing.id}

        try:
            # Extract metadata from FITS file
            metadata = self.extractor.extract(file_path)

            # Resolve object name if present
            object_id = None
            if metadata.object_name:
                obj = self.resolver.resolve(metadata.object_name)
                if obj:
                    object_id = obj.id

            # Create image record
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
                object_id=object_id,
                fits_header=metadata.fits_header,
            )

            self.db.add(image)
            self.db.commit()
            self.db.refresh(image)

            return {
                "status": "indexed",
                "file": str(file_path),
                "image_id": image.id,
                "object_name": metadata.object_name,
                "object_id": object_id,
            }

        except Exception as e:
            self.db.rollback()
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
            object_id = None
            if metadata.object_name:
                obj = await self.resolver.resolve_async(metadata.object_name)
                if obj:
                    object_id = obj.id

            # Create image record
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
                object_id=object_id,
                fits_header=metadata.fits_header,
            )

            self.db.add(image)
            self.db.commit()
            self.db.refresh(image)

            return {
                "status": "indexed",
                "file": str(file_path),
                "image_id": image.id,
                "object_name": metadata.object_name,
                "object_id": object_id,
            }

        except Exception as e:
            self.db.rollback()
            return {"status": "error", "file": str(file_path), "error": str(e)}

    def reindex_all(self) -> dict:
        """
        Reindex all files in the database (update metadata).
        """
        images = self.db.query(Image).all()
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

                # Try to resolve object if not already linked
                if not image.object_id and metadata.object_name:
                    obj = self.resolver.resolve(metadata.object_name)
                    if obj:
                        image.object_id = obj.id

                self.db.commit()
                stats["updated"] += 1

            except Exception as e:
                self.db.rollback()
                stats["errors"] += 1

        return stats

    def _is_fits_file(self, file_path: Path) -> bool:
        """Check if file has a supported FITS extension."""
        name_lower = file_path.name.lower()

        for ext in self.SUPPORTED_EXTENSIONS:
            if name_lower.endswith(ext):
                return True

        return False
