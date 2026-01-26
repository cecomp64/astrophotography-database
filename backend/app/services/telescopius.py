import httpx
from typing import Optional
from dataclasses import dataclass
from app.config import get_settings


@dataclass
class TelescopiusObject:
    name: str
    ra: Optional[float] = None
    dec: Optional[float] = None
    object_type: Optional[str] = None
    magnitude: Optional[float] = None
    constellation: Optional[str] = None
    aliases: list[dict[str, str]] = None

    def __post_init__(self):
        if self.aliases is None:
            self.aliases = []


class TelescopiusClient:
    """
    Client for the Telescopius REST API.

    This is a placeholder implementation based on the expected API structure.
    The actual API endpoints and response format should be adjusted based on
    the real Telescopius API documentation.
    """

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.telescopius_api_url
        self.api_key = settings.telescopius_api_key

    async def search_object(self, query: str) -> Optional[TelescopiusObject]:
        """
        Search for an astronomical object by name.

        Args:
            query: Object name to search for (e.g., "M42", "NGC 7000", "Orion Nebula")

        Returns:
            TelescopiusObject if found, None otherwise
        """
        try:
            async with httpx.AsyncClient() as client:
                headers = {}
                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"

                response = await client.get(
                    f"{self.base_url}/objects/search",
                    params={"q": query},
                    headers=headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    if data and isinstance(data, list) and len(data) > 0:
                        obj = data[0]
                        return self._parse_object(obj)
                    elif data and isinstance(data, dict):
                        return self._parse_object(data)

                return None

        except httpx.RequestError as e:
            print(f"Telescopius API request failed: {e}")
            return None

    async def get_object_by_id(self, object_id: str) -> Optional[TelescopiusObject]:
        """
        Get detailed object information by ID.
        """
        try:
            async with httpx.AsyncClient() as client:
                headers = {}
                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"

                response = await client.get(
                    f"{self.base_url}/objects/{object_id}",
                    headers=headers,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    return self._parse_object(data)

                return None

        except httpx.RequestError as e:
            print(f"Telescopius API request failed: {e}")
            return None

    def _parse_object(self, data: dict) -> TelescopiusObject:
        """
        Parse API response into TelescopiusObject.

        Note: Field names should be adjusted based on actual API response format.
        """
        aliases = []

        # Parse aliases from various possible response formats
        if "aliases" in data:
            for alias in data["aliases"]:
                if isinstance(alias, str):
                    aliases.append({"name": alias, "catalog": None})
                elif isinstance(alias, dict):
                    aliases.append({
                        "name": alias.get("name", alias.get("alias", "")),
                        "catalog": alias.get("catalog", alias.get("type", None))
                    })

        # Also check for catalog-specific fields
        for catalog in ["messier", "ngc", "ic", "sharpless", "caldwell"]:
            if catalog in data and data[catalog]:
                aliases.append({
                    "name": data[catalog],
                    "catalog": catalog.upper()
                })

        return TelescopiusObject(
            name=data.get("name", data.get("primary_name", "")),
            ra=data.get("ra", data.get("right_ascension")),
            dec=data.get("dec", data.get("declination")),
            object_type=data.get("type", data.get("object_type")),
            magnitude=data.get("magnitude", data.get("mag")),
            constellation=data.get("constellation"),
            aliases=aliases,
        )


# For testing/development without API access
class MockTelescopiusClient(TelescopiusClient):
    """Mock client with common objects for testing."""

    MOCK_OBJECTS = {
        "m42": TelescopiusObject(
            name="Orion Nebula",
            ra=83.8221,
            dec=-5.3911,
            object_type="Emission Nebula",
            magnitude=4.0,
            constellation="Orion",
            aliases=[
                {"name": "M42", "catalog": "Messier"},
                {"name": "NGC 1976", "catalog": "NGC"},
                {"name": "Great Orion Nebula", "catalog": None},
            ]
        ),
        "m31": TelescopiusObject(
            name="Andromeda Galaxy",
            ra=10.6847,
            dec=41.2689,
            object_type="Spiral Galaxy",
            magnitude=3.4,
            constellation="Andromeda",
            aliases=[
                {"name": "M31", "catalog": "Messier"},
                {"name": "NGC 224", "catalog": "NGC"},
            ]
        ),
        "ngc7000": TelescopiusObject(
            name="North America Nebula",
            ra=314.6833,
            dec=44.5333,
            object_type="Emission Nebula",
            magnitude=4.0,
            constellation="Cygnus",
            aliases=[
                {"name": "NGC 7000", "catalog": "NGC"},
                {"name": "Caldwell 20", "catalog": "Caldwell"},
            ]
        ),
        "ic1396": TelescopiusObject(
            name="Elephant Trunk Nebula",
            ra=324.7500,
            dec=57.5000,
            object_type="Emission Nebula",
            magnitude=3.5,
            constellation="Cepheus",
            aliases=[
                {"name": "IC 1396", "catalog": "IC"},
            ]
        ),
    }

    async def search_object(self, query: str) -> Optional[TelescopiusObject]:
        # Normalize query
        normalized = query.lower().replace(" ", "").replace("-", "")

        # Check direct match
        if normalized in self.MOCK_OBJECTS:
            return self.MOCK_OBJECTS[normalized]

        # Check aliases
        for obj in self.MOCK_OBJECTS.values():
            for alias in obj.aliases:
                if alias["name"].lower().replace(" ", "") == normalized:
                    return obj

            if obj.name.lower().replace(" ", "") == normalized:
                return obj

        return None
