import math
from typing import Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_

from app.models import Image, AstroObject, ImageObject
from app.models.objects import ObjectAlias


class FOVMatcher:
    """
    Matches astronomical objects to images based on field of view.
    """

    def __init__(self, db: Session):
        self.db = db

    def find_objects_in_fov(
        self,
        ra_center: float,
        dec_center: float,
        fov_width: float,
        fov_height: float,
        catalogs: Optional[list[str]] = None
    ) -> list[AstroObject]:
        """
        Find all astronomical objects within the specified FOV.

        Args:
            ra_center: Right ascension of image center (degrees)
            dec_center: Declination of image center (degrees)
            fov_width: FOV width in degrees
            fov_height: FOV height in degrees
            catalogs: List of catalog types to filter by (e.g., ['NGC', 'IC', 'Messier'])

        Returns:
            List of AstroObject within FOV
        """
        # Calculate bounding box with cos(dec) correction for RA
        # RA span increases as we move away from the equator
        cos_dec = math.cos(math.radians(dec_center))
        if cos_dec < 0.01:  # Very close to pole
            cos_dec = 0.01

        ra_half = (fov_width / 2) / cos_dec
        dec_half = fov_height / 2

        ra_min = ra_center - ra_half
        ra_max = ra_center + ra_half
        dec_min = dec_center - dec_half
        dec_max = dec_center + dec_half

        # Build query with declination bounds
        query = self.db.query(AstroObject).options(
            joinedload(AstroObject.aliases)
        ).filter(
            and_(
                AstroObject.dec >= dec_min,
                AstroObject.dec <= dec_max,
                AstroObject.ra.isnot(None),
                AstroObject.dec.isnot(None)
            )
        )

        # Handle RA wraparound at 0/360 degrees
        if ra_min < 0:
            # RA wraps around 0 (e.g., range is 350-10 degrees)
            query = query.filter(
                or_(
                    AstroObject.ra >= (ra_min + 360),
                    AstroObject.ra <= ra_max
                )
            )
        elif ra_max > 360:
            # RA wraps around 360 (e.g., range is 350-370 which is 350-10)
            query = query.filter(
                or_(
                    AstroObject.ra >= ra_min,
                    AstroObject.ra <= (ra_max - 360)
                )
            )
        else:
            # Normal case, no wraparound
            query = query.filter(
                and_(
                    AstroObject.ra >= ra_min,
                    AstroObject.ra <= ra_max
                )
            )

        # Filter by catalog if specified
        if catalogs:
            # Join with aliases to filter by catalog type
            query = query.join(ObjectAlias).filter(
                ObjectAlias.catalog.in_(catalogs)
            ).distinct()

        return query.all()

    def calculate_angular_distance(
        self,
        ra1: float, dec1: float,
        ra2: float, dec2: float
    ) -> float:
        """
        Calculate angular distance in arcminutes using Haversine formula.

        Args:
            ra1, dec1: First coordinate pair (degrees)
            ra2, dec2: Second coordinate pair (degrees)

        Returns:
            Angular distance in arcminutes
        """
        ra1_rad, dec1_rad = math.radians(ra1), math.radians(dec1)
        ra2_rad, dec2_rad = math.radians(ra2), math.radians(dec2)

        dlat = dec2_rad - dec1_rad
        dlon = ra2_rad - ra1_rad

        a = math.sin(dlat / 2) ** 2 + math.cos(dec1_rad) * math.cos(dec2_rad) * math.sin(dlon / 2) ** 2
        c = 2 * math.asin(math.sqrt(a))

        # Convert radians to arcminutes (1 radian = 3437.75 arcminutes)
        return math.degrees(c) * 60

    def match_image_to_objects(
        self,
        image: Image,
        catalogs: Optional[list[str]] = None,
        create_associations: bool = True
    ) -> list[dict]:
        """
        Find and optionally associate astronomical objects with an image.

        Args:
            image: Image to match objects for
            catalogs: List of catalog types to search (default: NGC, IC, Messier, LDN, LBN)
            create_associations: Whether to create ImageObject associations

        Returns:
            List of matches with object and angular distance
        """
        if catalogs is None:
            catalogs = ["NGC", "IC", "Messier", "LDN", "LBN"]

        if not all([image.ra, image.dec, image.fov_width, image.fov_height]):
            return []

        astro_objects = self.find_objects_in_fov(
            image.ra, image.dec,
            image.fov_width, image.fov_height,
            catalogs
        )

        matches = []
        for astro_obj in astro_objects:
            distance = self.calculate_angular_distance(
                image.ra, image.dec,
                astro_obj.ra, astro_obj.dec
            )

            matches.append({
                "object": astro_obj,
                "angular_distance": distance
            })

            if create_associations:
                # Create association if not exists
                existing = self.db.query(ImageObject).filter(
                    ImageObject.image_id == image.id,
                    ImageObject.object_id == astro_obj.id
                ).first()

                if not existing:
                    image_obj = ImageObject(
                        image_id=image.id,
                        object_id=astro_obj.id,
                        association_type="in_fov",
                        angular_distance=distance
                    )
                    self.db.add(image_obj)

        if create_associations and matches:
            self.db.commit()

        return matches

    def detect_objects_for_all_images(
        self,
        catalogs: Optional[list[str]] = None,
        only_missing: bool = True
    ) -> dict:
        """
        Run FOV detection for all images in the database.

        Args:
            catalogs: List of catalog types to search
            only_missing: Only process images without existing FOV associations

        Returns:
            Summary of processing results
        """
        query = self.db.query(Image).filter(
            Image.fov_width.isnot(None),
            Image.fov_height.isnot(None),
            Image.ra.isnot(None),
            Image.dec.isnot(None)
        )

        if only_missing:
            # Get images that don't have any 'in_fov' associations
            subquery = self.db.query(ImageObject.image_id).filter(
                ImageObject.association_type == "in_fov"
            ).distinct()
            query = query.filter(~Image.id.in_(subquery))

        images = query.all()

        results = {
            "processed": 0,
            "objects_found": 0,
            "details": []
        }

        for image in images:
            matches = self.match_image_to_objects(image, catalogs)
            results["processed"] += 1
            results["objects_found"] += len(matches)
            results["details"].append({
                "image_id": image.id,
                "file_name": image.file_name,
                "objects_found": len(matches)
            })

        return results
