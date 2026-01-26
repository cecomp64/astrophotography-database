import csv
import io
import re
import logging
from typing import Optional, List, Tuple
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.objects import AstroObject, ObjectAlias

logger = logging.getLogger(__name__)

# Catalogue download URLs
OPENNGC_URL = "https://raw.githubusercontent.com/mattiaverga/OpenNGC/refs/heads/master/database_files/NGC.csv"
# VizieR TAP query URLs for LDN and LBN
VIZIER_TAP_URL = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync"


class CatalogueImporter:
    """
    Import astronomical catalogues into the database.

    Creates unified AstroObject entries with ObjectAlias for all designations.

    Supports:
    - OpenNGC (NGC + IC + Messier objects)
    - LDN (Lynds Dark Nebulae)
    - LBN (Lynds Bright Nebulae)
    """

    def __init__(self, db: Session):
        self.db = db

    def download_and_import_all(self) -> dict:
        """Download and import all supported catalogues."""
        results = {
            "openngc": None,
            "ldn": None,
            "lbn": None,
            "errors": []
        }

        # Import OpenNGC (includes NGC, IC, and Messier)
        try:
            logger.info("Downloading OpenNGC catalogue...")
            results["openngc"] = self.download_and_import_openngc()
        except Exception as e:
            logger.error(f"Error importing OpenNGC: {e}")
            results["errors"].append(f"OpenNGC: {str(e)}")
            self.db.rollback()

        # Import LDN
        try:
            logger.info("Downloading LDN catalogue...")
            results["ldn"] = self.download_and_import_ldn()
        except Exception as e:
            logger.error(f"Error importing LDN: {e}")
            results["errors"].append(f"LDN: {str(e)}")
            self.db.rollback()

        # Import LBN
        try:
            logger.info("Downloading LBN catalogue...")
            results["lbn"] = self.download_and_import_lbn()
        except Exception as e:
            logger.error(f"Error importing LBN: {e}")
            results["errors"].append(f"LBN: {str(e)}")
            self.db.rollback()

        return results

    def download_and_import_openngc(self) -> dict:
        """Download OpenNGC from GitHub and import into database."""
        response = httpx.get(OPENNGC_URL, timeout=60.0)
        response.raise_for_status()

        csv_content = response.text
        return self._import_openngc_from_string(csv_content)

    def download_and_import_ldn(self) -> dict:
        """Download LDN catalogue from VizieR and import into database."""
        query = """
        SELECT LDN, "_RA.icrs" AS ra_icrs, "_DE.icrs" AS dec_icrs, Area, Opacity
        FROM "VII/7A/ldn"
        """

        response = httpx.post(
            VIZIER_TAP_URL,
            data={
                "REQUEST": "doQuery",
                "LANG": "ADQL",
                "FORMAT": "csv",
                "QUERY": query
            },
            timeout=120.0
        )
        response.raise_for_status()

        return self._import_ldn_from_string(response.text)

    def download_and_import_lbn(self) -> dict:
        """Download LBN catalogue from VizieR and import into database."""
        query = """
        SELECT Seq, "_RA.icrs" AS ra_icrs, "_DE.icrs" AS dec_icrs, Diam1, Bright
        FROM "VII/9/catalog"
        """

        response = httpx.post(
            VIZIER_TAP_URL,
            data={
                "REQUEST": "doQuery",
                "LANG": "ADQL",
                "FORMAT": "csv",
                "QUERY": query
            },
            timeout=120.0
        )
        response.raise_for_status()

        return self._import_lbn_from_string(response.text)

    def _find_or_create_object(
        self,
        primary_name: str,
        ra: float,
        dec: float,
        object_type: Optional[str] = None,
        magnitude: Optional[float] = None,
        size_major: Optional[float] = None,
        size_minor: Optional[float] = None,
        constellation: Optional[str] = None,
        aliases: Optional[List[Tuple[str, str]]] = None  # List of (alias_name, catalog)
    ) -> Tuple[AstroObject, bool]:
        """
        Find existing object by alias or create new one.

        Returns tuple of (object, was_created).
        """
        # First check if any of the aliases already exist
        all_alias_names = [primary_name]
        if aliases:
            all_alias_names.extend([a[0] for a in aliases])

        existing_alias = self.db.query(ObjectAlias).filter(
            ObjectAlias.alias_name.in_(all_alias_names)
        ).first()

        if existing_alias:
            # Found existing object via alias
            obj = existing_alias.object
            # Update fields if they were empty
            if obj.ra is None:
                obj.ra = ra
            if obj.dec is None:
                obj.dec = dec
            if obj.object_type is None and object_type:
                obj.object_type = object_type
            if obj.magnitude is None and magnitude:
                obj.magnitude = magnitude
            if obj.size_major is None and size_major:
                obj.size_major = size_major
            if obj.size_minor is None and size_minor:
                obj.size_minor = size_minor
            if obj.constellation is None and constellation:
                obj.constellation = constellation

            # Add any missing aliases
            if aliases:
                existing_alias_names = {a.alias_name for a in obj.aliases}
                for alias_name, catalog in aliases:
                    if alias_name not in existing_alias_names:
                        new_alias = ObjectAlias(
                            object_id=obj.id,
                            alias_name=alias_name,
                            catalog=catalog
                        )
                        self.db.add(new_alias)
                        existing_alias_names.add(alias_name)

            return obj, False

        # Create new object
        obj = AstroObject(
            primary_name=primary_name,
            ra=ra,
            dec=dec,
            object_type=object_type,
            magnitude=magnitude,
            size_major=size_major,
            size_minor=size_minor,
            constellation=constellation
        )
        self.db.add(obj)
        self.db.flush()  # Get the ID

        # Add primary name as alias
        primary_alias = ObjectAlias(
            object_id=obj.id,
            alias_name=primary_name,
            catalog=self._extract_catalog(primary_name)
        )
        self.db.add(primary_alias)

        # Add other aliases
        if aliases:
            for alias_name, catalog in aliases:
                if alias_name != primary_name:
                    alias = ObjectAlias(
                        object_id=obj.id,
                        alias_name=alias_name,
                        catalog=catalog
                    )
                    self.db.add(alias)

        return obj, True

    def _extract_catalog(self, name: str) -> Optional[str]:
        """Extract catalog name from designation."""
        name_upper = name.upper().strip()
        if name_upper.startswith('NGC'):
            return 'NGC'
        elif name_upper.startswith('IC'):
            return 'IC'
        elif name_upper.startswith('M') and len(name_upper) > 1 and name_upper[1:].strip().isdigit():
            return 'Messier'
        elif name_upper.startswith('LDN'):
            return 'LDN'
        elif name_upper.startswith('LBN'):
            return 'LBN'
        elif name_upper.startswith('SH2') or name_upper.startswith('SHARPLESS'):
            return 'Sharpless'
        return None

    def _import_openngc_from_string(self, csv_content: str) -> dict:
        """Import OpenNGC from CSV string, creating AstroObject + ObjectAlias entries."""
        results = {"imported": 0, "updated": 0, "skipped": 0, "errors": 0, "messier_count": 0}

        reader = csv.DictReader(io.StringIO(csv_content), delimiter=';')

        for row in reader:
            try:
                name = row.get('Name', '').strip()
                if not name:
                    results["skipped"] += 1
                    continue

                # Parse catalog and number
                if name.startswith('NGC'):
                    catalog = 'NGC'
                    number = name[3:].strip()
                elif name.startswith('IC'):
                    catalog = 'IC'
                    number = name[2:].strip()
                else:
                    results["skipped"] += 1
                    continue

                # Parse RA/DEC
                ra = self._parse_ra(row.get('RA', ''))
                dec = self._parse_dec(row.get('Dec', ''))

                if ra is None or dec is None:
                    results["skipped"] += 1
                    continue

                # Build list of aliases
                aliases: List[Tuple[str, str]] = []

                # Primary designation (NGC/IC)
                primary_name = f"{catalog} {number}"
                aliases.append((primary_name, catalog))

                # Messier designation if available
                messier = row.get('M', '').strip().lstrip('0')  # Remove leading zeros
                if messier:
                    messier_name = f"M {messier}"
                    aliases.append((messier_name, 'Messier'))
                    # Also add without space for search flexibility
                    aliases.append((f"M{messier}", 'Messier'))
                    results["messier_count"] += 1

                # Common names
                common_names = row.get('Common names', '').strip()
                if common_names:
                    for common_name in common_names.split(','):
                        common_name = common_name.strip()
                        if common_name:
                            aliases.append((common_name, 'Common'))

                # Parse magnitude (prefer V-Mag, fall back to B-Mag)
                magnitude = self._parse_float(row.get('V-Mag')) or self._parse_float(row.get('B-Mag'))

                # Determine best primary name (prefer common name, then Messier, then NGC/IC)
                best_primary = primary_name
                if common_names:
                    best_primary = common_names.split(',')[0].strip()
                elif messier:
                    best_primary = f"M {messier}"

                obj, was_created = self._find_or_create_object(
                    primary_name=best_primary,
                    ra=ra,
                    dec=dec,
                    object_type=row.get('Type', '').strip() or None,
                    magnitude=magnitude,
                    size_major=self._parse_float(row.get('MajAx')),
                    size_minor=self._parse_float(row.get('MinAx')),
                    constellation=row.get('Const', '').strip() or None,
                    aliases=aliases
                )

                if was_created:
                    results["imported"] += 1
                else:
                    results["updated"] += 1

            except Exception as e:
                logger.debug(f"Error importing row {row.get('Name', 'unknown')}: {e}")
                results["errors"] += 1

        self.db.commit()
        return results

    def _import_ldn_from_string(self, csv_content: str) -> dict:
        """Import LDN from CSV string."""
        results = {"imported": 0, "updated": 0, "skipped": 0, "errors": 0}

        # Skip comment lines that VizieR adds
        lines = [line for line in csv_content.split('\n') if not line.startswith('#')]
        csv_content = '\n'.join(lines)

        reader = csv.DictReader(io.StringIO(csv_content))

        for row in reader:
            try:
                ldn_num = row.get('ldn', row.get('LDN', '')).strip()
                if not ldn_num:
                    results["skipped"] += 1
                    continue

                number = re.sub(r'^LDN\s*', '', str(ldn_num), flags=re.IGNORECASE)

                ra = self._parse_float(row.get('ra_icrs', ''))
                dec = self._parse_float(row.get('dec_icrs', ''))

                if ra is None or dec is None:
                    results["skipped"] += 1
                    continue

                primary_name = f"LDN {number}"
                aliases = [
                    (primary_name, 'LDN'),
                    (f"LDN{number}", 'LDN'),  # Without space
                ]

                obj, was_created = self._find_or_create_object(
                    primary_name=primary_name,
                    ra=ra,
                    dec=dec,
                    object_type='Dark Nebula',
                    size_major=self._parse_float(row.get('area', row.get('Area', ''))),
                    aliases=aliases
                )

                if was_created:
                    results["imported"] += 1
                else:
                    results["updated"] += 1

            except Exception as e:
                logger.debug(f"Error importing LDN row: {e}")
                results["errors"] += 1

        self.db.commit()
        return results

    def _import_lbn_from_string(self, csv_content: str) -> dict:
        """Import LBN from CSV string."""
        results = {"imported": 0, "updated": 0, "skipped": 0, "errors": 0}

        # Skip comment lines
        lines = [line for line in csv_content.split('\n') if not line.startswith('#')]
        csv_content = '\n'.join(lines)

        reader = csv.DictReader(io.StringIO(csv_content))

        for row in reader:
            try:
                lbn_num = row.get('seq', row.get('Seq', '')).strip()
                if not lbn_num:
                    results["skipped"] += 1
                    continue

                number = str(lbn_num)

                ra = self._parse_float(row.get('ra_icrs', ''))
                dec = self._parse_float(row.get('dec_icrs', ''))

                if ra is None or dec is None:
                    results["skipped"] += 1
                    continue

                primary_name = f"LBN {number}"
                aliases = [
                    (primary_name, 'LBN'),
                    (f"LBN{number}", 'LBN'),  # Without space
                ]

                obj, was_created = self._find_or_create_object(
                    primary_name=primary_name,
                    ra=ra,
                    dec=dec,
                    object_type='Bright Nebula',
                    size_major=self._parse_float(row.get('diam1', row.get('Diam1', ''))),
                    aliases=aliases
                )

                if was_created:
                    results["imported"] += 1
                else:
                    results["updated"] += 1

            except Exception as e:
                logger.debug(f"Error importing LBN row: {e}")
                results["errors"] += 1

        self.db.commit()
        return results

    def get_catalogue_stats(self) -> dict:
        """Get statistics about imported catalogues."""
        stats = {}

        # Count by catalog in aliases
        for catalog in ['NGC', 'IC', 'Messier', 'LDN', 'LBN', 'Common']:
            count = self.db.query(ObjectAlias).filter(
                ObjectAlias.catalog == catalog
            ).count()
            stats[catalog] = count

        # Total unique objects
        stats['total_objects'] = self.db.query(AstroObject).count()
        stats['total_aliases'] = self.db.query(ObjectAlias).count()

        return stats

    def _parse_ra(self, ra_str: str) -> Optional[float]:
        """Parse RA from various formats to degrees."""
        if not ra_str:
            return None

        ra_str = ra_str.strip()

        # Try as float first (decimal degrees)
        try:
            return float(ra_str)
        except ValueError:
            pass

        # Try sexagesimal (HH:MM:SS or HH MM SS)
        for sep in [':', ' ']:
            parts = ra_str.split(sep)
            if len(parts) >= 2:
                try:
                    hours = float(parts[0])
                    minutes = float(parts[1])
                    seconds = float(parts[2]) if len(parts) > 2 else 0.0
                    return (hours + minutes / 60 + seconds / 3600) * 15
                except (ValueError, IndexError):
                    continue

        return None

    def _parse_dec(self, dec_str: str) -> Optional[float]:
        """Parse DEC from various formats to degrees."""
        if not dec_str:
            return None

        dec_str = dec_str.strip()

        # Try as float first (decimal degrees)
        try:
            return float(dec_str)
        except ValueError:
            pass

        # Handle sign
        sign = 1
        if dec_str.startswith('-'):
            sign = -1
            dec_str = dec_str[1:]
        elif dec_str.startswith('+'):
            dec_str = dec_str[1:]

        # Try sexagesimal (DD:MM:SS or DD MM SS)
        for sep in [':', ' ']:
            parts = dec_str.split(sep)
            if len(parts) >= 2:
                try:
                    degrees = float(parts[0])
                    minutes = float(parts[1])
                    seconds = float(parts[2]) if len(parts) > 2 else 0.0
                    return sign * (degrees + minutes / 60 + seconds / 3600)
                except (ValueError, IndexError):
                    continue

        return None

    def _parse_float(self, value: str) -> Optional[float]:
        """Safely parse float value."""
        if not value:
            return None
        try:
            value = value.strip()
            if not value:
                return None
            return float(value)
        except ValueError:
            return None
