from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
import logging

from app.models import AstroObject, ObjectAlias
from app.models.configuration import Configuration
from app.services.telescopius import TelescopiusClient, MockTelescopiusClient, TelescopiusObject
from app.config import get_settings

logger = logging.getLogger(__name__)


def get_telescopius_api_key(db: Session) -> str:
    """
    Get the Telescopius API key, checking database first then falling back to env var.

    Args:
        db: Database session

    Returns:
        API key string (empty string if not configured)
    """
    # First check database configuration
    config = db.query(Configuration).filter(Configuration.key == "telescopius_api_key").first()
    if config and config.value and config.value.get("api_key"):
        return config.value.get("api_key", "")

    # Fall back to environment variable
    settings = get_settings()
    return settings.telescopius_api_key


class NameResolver:
    """
    Resolves astronomical object names using local database and Telescopius API.

    Resolution pipeline:
    1. Check local database (objects and aliases)
    2. If solar system object, create directly without API lookup
    3. If not found, query Telescopius API
    4. Store resolved object in database for future lookups
    """

    # Solar system objects - these don't have fixed coordinates and shouldn't use Telescopius
    SOLAR_SYSTEM_OBJECTS = {
        # Planets
        "mercury": "Planet", "venus": "Planet", "mars": "Planet",
        "jupiter": "Planet", "saturn": "Planet", "uranus": "Planet", "neptune": "Planet",
        # Dwarf planets
        "pluto": "Dwarf Planet", "ceres": "Dwarf Planet", "eris": "Dwarf Planet",
        "makemake": "Dwarf Planet", "haumea": "Dwarf Planet",
        # Major moons
        "moon": "Moon", "luna": "Moon",
        "io": "Moon", "europa": "Moon", "ganymede": "Moon", "callisto": "Moon",
        "titan": "Moon", "enceladus": "Moon", "mimas": "Moon", "rhea": "Moon",
        "dione": "Moon", "tethys": "Moon", "iapetus": "Moon",
        "triton": "Moon", "charon": "Moon",
        # The Sun
        "sun": "Star", "sol": "Star",
    }

    def __init__(self, db: Session, use_mock: bool = False):
        self.db = db
        self.failed_lookups = set()  # Cache failed Telescopius lookups to avoid retrying

        # Get API key from database first, then fall back to env var
        api_key = get_telescopius_api_key(db)

        # Use mock client if no API key is configured or explicitly requested
        if use_mock or not api_key:
            self.client = MockTelescopiusClient()
        else:
            self.client = TelescopiusClient(api_key=api_key)

    def resolve(self, name: str, file_path: Optional[str] = None) -> Optional[AstroObject]:
        """
        Resolve an object name synchronously.
        First checks local database, then falls back to Telescopius if available.
        
        Args:
            name: The object name to resolve
            file_path: Optional file path for logging context
        """
        return self._resolve_with_context(name, file_path)

    def _resolve_with_context(self, name: str, file_path: Optional[str] = None) -> Optional[AstroObject]:
        """
        Internal resolve method with file path context for logging.
        """
        # Normalize the name for comparison
        normalized = self._normalize_name(name)

        # Check local database first
        obj = self._find_in_database(normalized)
        if obj:
            return obj

        # Check if this is a solar system object - create directly without API lookup
        name_lower = name.lower().strip()
        if name_lower in self.SOLAR_SYSTEM_OBJECTS:
            logger.info(f"Creating solar system object: {name}")
            obj = self._create_solar_system_object(name, self.SOLAR_SYSTEM_OBJECTS[name_lower])
            return obj

        # Check if this lookup has already failed
        if normalized in self.failed_lookups:
            file_context = f" (file: {file_path})" if file_path else ""
            logger.debug(f"Previously failed lookup for '{name}'{file_context}, skipping Telescopius")
            return None

        # For sync resolution, try Telescopius client's sync method if available
        try:
            # Check if client has a blocking search method
            if hasattr(self.client, 'search_object_sync'):
                file_context = f" (file: {file_path})" if file_path else ""
                logger.info(f"Looking up '{name}' in Telescopius{file_context}...")
                telescopius_obj = self.client.search_object_sync(name)
                if telescopius_obj:
                    logger.info(f"Found Telescopius match: {telescopius_obj.name}, creating database entry...")
                    # Create and store the object in our database
                    obj = self._create_from_telescopius(telescopius_obj, name)
                    logger.info(f"Object created with ID {obj.id}, name: {obj.primary_name}")
                    return obj
                else:
                    logger.info(f"No Telescopius match found for '{name}'{file_context}")
                    # Remember this failed lookup
                    self.failed_lookups.add(normalized)
        except Exception as e:
            file_context = f" (file: {file_path})" if file_path else ""
            logger.error(f"Error resolving '{name}'{file_context} via Telescopius: {e}")
            # Remember this failed lookup
            self.failed_lookups.add(normalized)

        return None

    async def resolve_async(self, name: str) -> Optional[AstroObject]:
        """
        Resolve an object name asynchronously.
        First checks local database, then queries Telescopius API if not found.
        """
        # Normalize the name for comparison
        normalized = self._normalize_name(name)

        # Check local database first
        obj = self._find_in_database(normalized)
        if obj:
            return obj

        # Query Telescopius API
        telescopius_obj = await self.client.search_object(name)
        if telescopius_obj:
            # Create and store the object in our database
            obj = self._create_from_telescopius(telescopius_obj, name)
            return obj

        return None

    def _normalize_name(self, name: str) -> str:
        """Normalize object name for comparison."""
        return name.lower().strip().replace(" ", "").replace("-", "")

    def _find_in_database(self, normalized_name: str) -> Optional[AstroObject]:
        """Find object in local database by name or alias."""
        # First try exact match on primary name (normalized)
        obj = self.db.query(AstroObject).filter(
            func.lower(func.replace(func.replace(AstroObject.primary_name, " ", ""), "-", "")) == normalized_name
        ).first()

        if obj:
            return obj

        # Try matching aliases
        alias = self.db.query(ObjectAlias).filter(
            func.lower(func.replace(func.replace(ObjectAlias.alias_name, " ", ""), "-", "")) == normalized_name
        ).first()

        if alias:
            return alias.object

        return None

    def _create_solar_system_object(self, name: str, object_type: str) -> AstroObject:
        """Create a solar system object directly without API lookup."""
        # Capitalize properly
        proper_name = name.capitalize()
        if proper_name.lower() == "luna":
            proper_name = "Moon"  # Normalize Luna to Moon
        elif proper_name.lower() == "sol":
            proper_name = "Sun"  # Normalize Sol to Sun

        obj = AstroObject(
            primary_name=proper_name,
            object_type=object_type,
            # Solar system objects don't have fixed coordinates
            ra=None,
            dec=None,
            magnitude=None,
            constellation=None,
        )
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)

        logger.info(f"Created solar system object: {obj.primary_name} (ID: {obj.id}, type: {object_type})")
        return obj

    def _create_from_telescopius(self, tobj: TelescopiusObject, original_query: str) -> AstroObject:
        """Create a database object from Telescopius response."""
        # Create the main object
        obj = AstroObject(
            primary_name=tobj.name,
            ra=tobj.ra,
            dec=tobj.dec,
            object_type=tobj.object_type,
            magnitude=tobj.magnitude,
            constellation=tobj.constellation,
        )
        self.db.add(obj)
        self.db.flush()  # Get the ID

        # Add the original query as an alias first (before processing other aliases)
        # This ensures we can find it by the name the user searched for
        added_aliases = set()
        query_normalized = original_query.lower()
        if query_normalized != tobj.name.lower():
            alias = ObjectAlias(
                object_id=obj.id,
                alias_name=original_query,
                catalog=self._detect_catalog(original_query),
            )
            self.db.add(alias)
            added_aliases.add(query_normalized)

        # Add aliases from Telescopius response
        for alias_data in tobj.aliases:
            alias_name = alias_data.get("name", "")
            if alias_name and alias_name.lower() not in added_aliases:
                alias = ObjectAlias(
                    object_id=obj.id,
                    alias_name=alias_name,
                    catalog=alias_data.get("catalog"),
                )
                self.db.add(alias)
                added_aliases.add(alias_name.lower())

        self.db.commit()
        self.db.refresh(obj)

        return obj

    def _detect_catalog(self, name: str) -> Optional[str]:
        """Detect catalog from object name."""
        name_upper = name.upper().replace(" ", "")

        if name_upper.startswith("M") and name_upper[1:].isdigit():
            return "Messier"
        elif name_upper.startswith("NGC"):
            return "NGC"
        elif name_upper.startswith("IC"):
            return "IC"
        elif name_upper.startswith("SH2") or name_upper.startswith("SH-"):
            return "Sharpless"
        elif name_upper.startswith("C") and name_upper[1:].isdigit():
            return "Caldwell"

        return None

    def fuzzy_search(self, query: str, limit: int = 10) -> list[AstroObject]:
        """
        Search for objects using fuzzy matching.
        Normalizes names by removing spaces, hyphens, and ignoring case.
        Searches both primary names and aliases.
        """
        # Normalize query: lowercase, remove spaces and hyphens
        normalized_query = f"%{self._normalize_name(query)}%"

        # Helper to normalize a column: lower(replace(replace(col, ' ', ''), '-', ''))
        def normalize_col(col):
            return func.lower(func.replace(func.replace(col, " ", ""), "-", ""))

        # Search in both primary names and aliases using normalized comparison
        objects = self.db.query(AstroObject).filter(
            or_(
                normalize_col(AstroObject.primary_name).like(normalized_query),
                AstroObject.id.in_(
                    self.db.query(ObjectAlias.object_id).filter(
                        normalize_col(ObjectAlias.alias_name).like(normalized_query)
                    )
                )
            )
        ).limit(limit).all()

        return objects
