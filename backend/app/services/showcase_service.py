import os
import logging
from pathlib import Path
from typing import Optional
from io import BytesIO

import numpy as np
import httpx
from PIL import Image as PILImage
from astropy.io import fits
from sqlalchemy.orm import Session

from app.models import AstroObject, Image
from app.models.showcases import ObjectShowcase

logger = logging.getLogger(__name__)


class ShowcaseService:
    """Service for managing object showcase images."""

    # Target thumbnail size
    THUMBNAIL_SIZE = (800, 800)
    JPEG_QUALITY = 85

    # SkyView API configuration
    SKYVIEW_API_URL = "https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl"
    DEFAULT_SURVEY = "DSS2 Red"
    SURVEY_SIZE_DEG = 0.5  # Default field size in degrees

    def __init__(self, db: Session):
        self.db = db
        self._showcases_dir = self._get_showcases_dir()
        self._ensure_directories()

    def _get_showcases_dir(self) -> Path:
        """Get the showcases directory path."""
        user_data = os.getenv("APP_USER_DATA")
        if user_data:
            return Path(user_data) / "showcases"
        # Fallback for development
        return Path("./showcases")

    def _ensure_directories(self) -> None:
        """Ensure all showcase subdirectories exist."""
        for subdir in ["uploads", "indexed", "survey"]:
            (self._showcases_dir / subdir).mkdir(parents=True, exist_ok=True)

    def get_absolute_path(self, relative_path: str) -> Path:
        """Convert relative showcase path to absolute path."""
        return self._showcases_dir / relative_path

    def get_showcase(self, object_id: int) -> Optional[ObjectShowcase]:
        """Get existing showcase for an object."""
        return self.db.query(ObjectShowcase).filter(
            ObjectShowcase.object_id == object_id
        ).first()

    def upload_showcase(
        self,
        object_id: int,
        file_data: bytes,
        content_type: str,
    ) -> ObjectShowcase:
        """
        Save an uploaded image as showcase.

        Args:
            object_id: The object ID to set showcase for
            file_data: Raw image bytes
            content_type: MIME type (image/jpeg or image/png)

        Returns:
            The created/updated ObjectShowcase record
        """
        # Validate object exists
        obj = self.db.query(AstroObject).filter(AstroObject.id == object_id).first()
        if not obj:
            raise ValueError(f"Object {object_id} not found")

        # Determine extension
        ext = "jpg" if "jpeg" in content_type else "png"
        relative_path = f"uploads/{object_id}.{ext}"
        absolute_path = self.get_absolute_path(relative_path)

        # Process and save image (resize if needed)
        img = PILImage.open(BytesIO(file_data))
        img.thumbnail(self.THUMBNAIL_SIZE, PILImage.Resampling.LANCZOS)

        if ext == "jpg":
            img = img.convert("RGB")
            img.save(absolute_path, "JPEG", quality=self.JPEG_QUALITY)
        else:
            img.save(absolute_path, "PNG")

        # Create or update showcase record
        showcase = self.get_showcase(object_id)
        if showcase:
            # Delete old file if different
            if showcase.file_path != relative_path:
                old_path = self.get_absolute_path(showcase.file_path)
                if old_path.exists():
                    old_path.unlink()
            showcase.source_type = "upload"
            showcase.file_path = relative_path
            showcase.original_image_id = None
            showcase.survey_name = None
        else:
            showcase = ObjectShowcase(
                object_id=object_id,
                source_type="upload",
                file_path=relative_path,
            )
            self.db.add(showcase)

        self.db.commit()
        self.db.refresh(showcase)
        return showcase

    def generate_from_indexed(
        self,
        object_id: int,
        image_id: int,
    ) -> ObjectShowcase:
        """
        Generate showcase thumbnail from an indexed FITS image.

        Uses astropy to read FITS and PIL to create thumbnail.
        """
        # Validate object exists
        obj = self.db.query(AstroObject).filter(AstroObject.id == object_id).first()
        if not obj:
            raise ValueError(f"Object {object_id} not found")

        # Validate image exists
        image = self.db.query(Image).filter(Image.id == image_id).first()
        if not image:
            raise ValueError(f"Image {image_id} not found")

        if not os.path.exists(image.file_path):
            raise ValueError(f"FITS file not found: {image.file_path}")

        # Read FITS and extract image data
        with fits.open(image.file_path) as hdul:
            data = hdul[0].data
            if data is None:
                # Try to find data in other extensions
                for hdu in hdul[1:]:
                    if hdu.data is not None:
                        data = hdu.data
                        break
            if data is None:
                raise ValueError("FITS file has no image data")

            # Handle 3D data (e.g., RGB or multiple layers)
            if len(data.shape) == 3:
                # Use first layer or combine
                data = data[0] if data.shape[0] <= 3 else data.mean(axis=0)

            # Normalize and stretch for display
            data = self._stretch_image(data)

        # Convert to PIL Image
        img = PILImage.fromarray(data)
        img = img.convert("L")  # Grayscale
        img.thumbnail(self.THUMBNAIL_SIZE, PILImage.Resampling.LANCZOS)

        # Save as JPEG
        relative_path = f"indexed/{object_id}.jpg"
        absolute_path = self.get_absolute_path(relative_path)
        img.save(absolute_path, "JPEG", quality=self.JPEG_QUALITY)

        # Create or update showcase record
        showcase = self.get_showcase(object_id)
        if showcase:
            if showcase.file_path != relative_path:
                old_path = self.get_absolute_path(showcase.file_path)
                if old_path.exists():
                    old_path.unlink()
            showcase.source_type = "indexed"
            showcase.file_path = relative_path
            showcase.original_image_id = image_id
            showcase.survey_name = None
        else:
            showcase = ObjectShowcase(
                object_id=object_id,
                source_type="indexed",
                file_path=relative_path,
                original_image_id=image_id,
            )
            self.db.add(showcase)

        self.db.commit()
        self.db.refresh(showcase)
        return showcase

    def _stretch_image(self, data: np.ndarray) -> np.ndarray:
        """Apply asinh stretch for astronomical images."""
        # Handle NaN and Inf
        data = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)

        # Convert to float for calculations
        data = data.astype(np.float64)

        # Clip negative values
        data = np.clip(data, 0, None)

        # Calculate percentiles for robust scaling
        p1 = np.percentile(data, 1)
        p99 = np.percentile(data, 99)

        if p99 <= p1:
            # Flat image, just return zeros
            return np.zeros(data.shape, dtype=np.uint8)

        # Asinh stretch
        stretch_factor = 10.0
        data = np.arcsinh((data - p1) / (p99 - p1) * stretch_factor)

        # Normalize to 0-255
        data_min = data.min()
        data_max = data.max()
        if data_max > data_min:
            data = (data - data_min) / (data_max - data_min) * 255
        else:
            data = np.zeros(data.shape)

        return data.astype(np.uint8)

    async def fetch_survey_image(
        self,
        object_id: int,
        survey: str = DEFAULT_SURVEY,
        size_deg: float = SURVEY_SIZE_DEG,
    ) -> ObjectShowcase:
        """
        Fetch showcase image from SkyView API.

        SkyView API format:
        https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?
            Position={ra},{dec}&Survey={survey}&Pixels=800&Size={size}&Return=FITS
        """
        # Validate object exists and has coordinates
        obj = self.db.query(AstroObject).filter(AstroObject.id == object_id).first()
        if not obj:
            raise ValueError(f"Object {object_id} not found")
        if obj.ra is None or obj.dec is None:
            raise ValueError(f"Object {object_id} has no coordinates")

        # Adjust size based on object size if available
        if obj.size_major:
            # Use 2x object size, minimum 0.25 degrees
            size_deg = max(0.25, obj.size_major / 60 * 2)

        # Build SkyView URL
        params = {
            "Position": f"{obj.ra},{obj.dec}",
            "Survey": survey,
            "Pixels": "800",
            "Size": str(size_deg),
            "Return": "FITS",
        }

        logger.info(f"Fetching survey image for object {object_id} from SkyView: {survey}")

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(self.SKYVIEW_API_URL, params=params)
            response.raise_for_status()

            # Parse FITS from response
            with fits.open(BytesIO(response.content)) as hdul:
                data = hdul[0].data
                if data is None:
                    raise ValueError("SkyView returned empty image")
                data = self._stretch_image(data)

        # Convert to PIL and save
        img = PILImage.fromarray(data)
        img = img.convert("L")

        survey_slug = survey.lower().replace(" ", "_").replace("-", "_")
        relative_path = f"survey/{object_id}_{survey_slug}.jpg"
        absolute_path = self.get_absolute_path(relative_path)
        img.save(absolute_path, "JPEG", quality=self.JPEG_QUALITY)

        # Create or update showcase record
        showcase = self.get_showcase(object_id)
        if showcase:
            if showcase.file_path != relative_path:
                old_path = self.get_absolute_path(showcase.file_path)
                if old_path.exists():
                    old_path.unlink()
            showcase.source_type = "survey"
            showcase.file_path = relative_path
            showcase.original_image_id = None
            showcase.survey_name = survey
        else:
            showcase = ObjectShowcase(
                object_id=object_id,
                source_type="survey",
                file_path=relative_path,
                survey_name=survey,
            )
            self.db.add(showcase)

        self.db.commit()
        self.db.refresh(showcase)
        return showcase

    def delete_showcase(self, object_id: int) -> bool:
        """Delete showcase for an object."""
        showcase = self.get_showcase(object_id)
        if not showcase:
            return False

        # Delete file
        file_path = self.get_absolute_path(showcase.file_path)
        if file_path.exists():
            file_path.unlink()

        # Delete record
        self.db.delete(showcase)
        self.db.commit()
        return True
