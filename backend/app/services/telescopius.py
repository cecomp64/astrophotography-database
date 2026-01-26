import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from dataclasses import dataclass
from telescopius import TelescopiusClient as OfficialTelescopiusClient
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
    url: Optional[str] = None
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None

    def __post_init__(self):
        if self.aliases is None:
            self.aliases = []


class TelescopiusClient:
    """
    Client for the Telescopius API using the official telescopius-api package.
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.telescopius_api_key
        self._executor = ThreadPoolExecutor(max_workers=2)
        self._client: Optional[OfficialTelescopiusClient] = None

    def _get_client(self) -> OfficialTelescopiusClient:
        if self._client is None:
            self._client = OfficialTelescopiusClient(api_key=self.api_key)
        return self._client

    async def search_object(self, query: str) -> Optional[TelescopiusObject]:
        """
        Search for an astronomical object by name.

        Args:
            query: Object name to search for (e.g., "M42", "NGC 7000", "Orion Nebula")

        Returns:
            TelescopiusObject if found, None otherwise
        """
        try:
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                self._executor,
                self._search_sync,
                query
            )
            return results
        except Exception as e:
            print(f"Telescopius API request failed: {e}")
            return None

    def search_object_sync(self, query: str) -> Optional[TelescopiusObject]:
        """
        Synchronously search for an astronomical object by name.
        
        Args:
            query: Object name to search for (e.g., "M42", "NGC 7000", "Orion Nebula")

        Returns:
            TelescopiusObject if found, None otherwise
        """
        try:
            return self._search_sync(query)
        except Exception as e:
            print(f"Telescopius API request failed: {e}")
            return None

    def _search_sync(self, query: str) -> Optional[TelescopiusObject]:
        """Synchronous search wrapper for the official client."""
        results = self._search_targets_sync(
            lat=0,
            lon=0,
            timezone="UTC",
            types=None,
            min_alt=None,
            mag_max=None,
            query=query,
            results_per_page=1
        )

        if results and results.get("page_results"):
            obj_data = results["page_results"][0].get("object", {})
            return self._parse_object(obj_data)

        return None

    async def search_targets(
        self,
        lat: float = 0,
        lon: float = 0,
        timezone: str = "UTC",
        types: Optional[str] = None,
        min_alt: Optional[int] = None,
        mag_max: Optional[float] = None,
        query: Optional[str] = None,
        results_per_page: int = 20
    ) -> dict:
        """
        Search for astronomical targets with filters.

        Args:
            lat: Latitude of observation location
            lon: Longitude of observation location
            timezone: Timezone string (e.g., "Europe/Lisbon")
            types: Comma-separated object types (e.g., "GXY,ENEB")
            min_alt: Minimum altitude in degrees
            mag_max: Maximum magnitude
            query: Search query string
            results_per_page: Number of results per page

        Returns:
            Dict with 'matched' count and 'page_results' list
        """
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                self._executor,
                lambda: self._search_targets_sync(
                    lat, lon, timezone, types, min_alt, mag_max, query, results_per_page
                )
            )
        except Exception as e:
            print(f"Telescopius API request failed: {e}")
            return {"matched": 0, "page_results": []}

    def _search_targets_sync(
        self,
        lat: float,
        lon: float,
        timezone: str,
        types: Optional[str],
        min_alt: Optional[int],
        mag_max: Optional[float],
        query: Optional[str],
        results_per_page: int
    ) -> dict:
        """Synchronous search_targets wrapper."""
        client = self._get_client()

        kwargs = {
            "lat": lat,
            "lon": lon,
            "timezone": timezone,
            "results_per_page": results_per_page
        }

        if types:
            kwargs["types"] = types
        if min_alt is not None:
            kwargs["min_alt"] = min_alt
        if mag_max is not None:
            kwargs["mag_max"] = mag_max
        if query:
            kwargs["name"] = query

        return client.search_targets(**kwargs)

    def _parse_object(self, data: dict) -> TelescopiusObject:
        """
        Parse API response into TelescopiusObject.
        """
        aliases = []

        # Parse IDs as aliases
        for id_str in data.get("ids", []):
            if id_str != data.get("main_id"):
                aliases.append({"name": id_str, "catalog": None})

        # Parse alternative IDs
        for alt_id in data.get("alt_ids", []):
            aliases.append({"name": alt_id, "catalog": None})

        # Parse common names
        for name in data.get("names", []):
            if name != data.get("main_name"):
                aliases.append({"name": name, "catalog": None})

        # Determine object type from types list
        types = data.get("types", [])
        object_type = None
        type_mapping = {
            "gxy": "Galaxy",
            "sgx": "Spiral Galaxy",
            "eneb": "Emission Nebula",
            "rneb": "Reflection Nebula",
            "pneb": "Planetary Nebula",
            "snr": "Supernova Remnant",
            "ocl": "Open Cluster",
            "gcl": "Globular Cluster",
            "dneb": "Dark Nebula",
        }
        for t in types:
            if t.lower() in type_mapping:
                object_type = type_mapping[t.lower()]
                break
        if not object_type and types:
            object_type = types[0]

        return TelescopiusObject(
            name=data.get("main_name", data.get("main_id", "")),
            ra=data.get("ra"),
            dec=data.get("dec"),
            object_type=object_type,
            magnitude=data.get("visual_mag", data.get("photo_mag")),
            constellation=data.get("con_name", data.get("con")),
            aliases=aliases,
            url=data.get("url"),
            image_url=data.get("main_image_url"),
            thumbnail_url=data.get("thumbnail_url"),
        )


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

    def __init__(self):
        self.api_key = None
        self._executor = None
        self._client = None

    async def search_object(self, query: str) -> Optional[TelescopiusObject]:
        normalized = query.lower().replace(" ", "").replace("-", "")

        if normalized in self.MOCK_OBJECTS:
            return self.MOCK_OBJECTS[normalized]

        for obj in self.MOCK_OBJECTS.values():
            for alias in obj.aliases:
                if alias["name"].lower().replace(" ", "") == normalized:
                    return obj

            if obj.name.lower().replace(" ", "") == normalized:
                return obj

        return None

    async def search_targets(self, **kwargs) -> dict:
        query = kwargs.get("query", "").lower().replace(" ", "").replace("-", "")
        results = []

        for key, obj in self.MOCK_OBJECTS.items():
            if not query or query in key or query in obj.name.lower().replace(" ", ""):
                results.append({
                    "object": {
                        "main_id": obj.aliases[0]["name"] if obj.aliases else obj.name,
                        "main_name": obj.name,
                        "ids": [a["name"] for a in obj.aliases],
                        "names": [obj.name],
                        "ra": obj.ra,
                        "dec": obj.dec,
                        "con_name": obj.constellation,
                        "visual_mag": obj.magnitude,
                    }
                })

        return {"matched": len(results), "page_results": results}
