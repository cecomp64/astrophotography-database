from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.models import AstroObject, ObjectAlias
from app.services.telescopius import TelescopiusClient, MockTelescopiusClient, TelescopiusObject
from app.config import get_settings


class NameResolver:
    """
    Resolves astronomical object names using local database and Telescopius API.

    Resolution pipeline:
    1. Check local database (objects and aliases)
    2. If not found, query Telescopius API
    3. Store resolved object in database for future lookups
    """

    def __init__(self, db: Session, use_mock: bool = False):
        self.db = db
        settings = get_settings()

        # Use mock client if no API key is configured or explicitly requested
        if use_mock or not settings.telescopius_api_key:
            self.client = MockTelescopiusClient()
        else:
            self.client = TelescopiusClient()

    def resolve(self, name: str) -> Optional[AstroObject]:
        """
        Resolve an object name synchronously.
        First checks local database, then falls back to Telescopius.
        """
        # Normalize the name for comparison
        normalized = self._normalize_name(name)

        # Check local database first
        obj = self._find_in_database(normalized)
        if obj:
            return obj

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

        # Add aliases
        added_aliases = set()
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

        # Add the original query as an alias if not already present
        query_normalized = original_query.lower()
        if query_normalized not in added_aliases and query_normalized != tobj.name.lower():
            alias = ObjectAlias(
                object_id=obj.id,
                alias_name=original_query,
                catalog=self._detect_catalog(original_query),
            )
            self.db.add(alias)

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
        Uses PostgreSQL's trigram similarity if available.
        """
        normalized = f"%{query.lower()}%"

        # Search in both primary names and aliases
        objects = self.db.query(AstroObject).filter(
            or_(
                func.lower(AstroObject.primary_name).like(normalized),
                AstroObject.id.in_(
                    self.db.query(ObjectAlias.object_id).filter(
                        func.lower(ObjectAlias.alias_name).like(normalized)
                    )
                )
            )
        ).limit(limit).all()

        return objects
