"""File browser endpoints for cross-platform filesystem navigation."""

import os
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/files", tags=["files"])

# Base mount point where host filesystem is accessible
DATA_MOUNT = Path("/data")


def detect_mount_structure() -> dict:
    """
    Detect the host mount structure to determine path translation rules.

    Returns dict with:
    - mount_prefix: The path prefix within /data that maps to host root
    - platform: Detected platform (macos, linux, windows, unknown)
    """
    # Check for macOS Docker Desktop structure (uses host_mnt symlink)
    host_mnt = DATA_MOUNT / "host_mnt"
    if host_mnt.exists() and (host_mnt / "Users").exists():
        return {"mount_prefix": "/data/host_mnt", "platform": "macos"}

    # Check for Windows Docker Desktop (drive letters under host_mnt)
    if host_mnt.exists():
        for item in host_mnt.iterdir():
            if item.is_dir() and len(item.name) == 1 and item.name.isalpha():
                return {"mount_prefix": "/data/host_mnt", "platform": "windows"}

    # Linux: /data directly maps to host root
    if (DATA_MOUNT / "home").exists():
        return {"mount_prefix": "/data", "platform": "linux"}

    # Fallback
    return {"mount_prefix": "/data", "platform": "unknown"}


def container_to_display_path(container_path: str, mount_info: dict) -> str:
    """Convert container path to user-friendly display path."""
    prefix = mount_info["mount_prefix"]
    platform = mount_info["platform"]

    if not container_path.startswith(prefix):
        return container_path

    # Strip the mount prefix
    relative = container_path[len(prefix):]

    if platform == "windows" and len(relative) >= 2 and relative[1].isalpha():
        # Convert /c/Users to C:\Users
        drive = relative[1].upper()
        rest = relative[2:].replace("/", "\\")
        return f"{drive}:{rest}" if rest else f"{drive}:\\"

    # macOS/Linux: just return the path as-is (e.g., /Users/foo)
    return relative if relative else "/"


def display_to_container_path(display_path: str, mount_info: dict) -> str:
    """Convert user display path to container path."""
    prefix = mount_info["mount_prefix"]
    platform = mount_info["platform"]

    if platform == "windows" and len(display_path) >= 2 and display_path[1] == ":":
        # Convert C:\Users to /c/Users
        drive = display_path[0].lower()
        rest = display_path[2:].replace("\\", "/")
        return f"{prefix}/{drive}{rest}"

    # macOS/Linux: prepend mount prefix
    if display_path.startswith("/"):
        return f"{prefix}{display_path}"

    return f"{prefix}/{display_path}"


class FileEntry(BaseModel):
    """A file or directory entry."""
    name: str
    type: str  # "file" or "directory"
    path: str  # Container path (for API calls)
    display_path: str  # User-friendly path
    size: Optional[int] = None
    modified: Optional[str] = None


class RootEntry(BaseModel):
    """A root/starting location for browsing."""
    name: str  # Display name (e.g., "Home", "Users")
    path: str  # Container path
    display_path: str  # User-friendly path
    icon: str  # Icon hint for frontend


class BrowseResponse(BaseModel):
    """Response for directory browsing."""
    current_path: str
    current_display_path: str
    parent_path: Optional[str]
    parent_display_path: Optional[str]
    entries: list[FileEntry]
    platform: str


class RootsResponse(BaseModel):
    """Response for available root locations."""
    roots: list[RootEntry]
    platform: str


@router.get("/roots", response_model=RootsResponse)
def get_roots():
    """
    Get available root locations for file browsing.

    Returns platform-appropriate starting points like Users folder, home directory, etc.
    """
    mount_info = detect_mount_structure()
    platform = mount_info["platform"]
    prefix = mount_info["mount_prefix"]
    roots = []

    if platform == "macos":
        # macOS: Users folder is the main starting point
        users_path = f"{prefix}/Users"
        if Path(users_path).exists():
            roots.append(RootEntry(
                name="Users",
                path=users_path,
                display_path="/Users",
                icon="users"
            ))

        # Volumes for external drives
        volumes_path = f"{prefix}/Volumes"
        if Path(volumes_path).exists():
            roots.append(RootEntry(
                name="Volumes",
                path=volumes_path,
                display_path="/Volumes",
                icon="hard-drive"
            ))

    elif platform == "linux":
        # Linux: home directory
        home_path = f"{prefix}/home"
        if Path(home_path).exists():
            roots.append(RootEntry(
                name="Home",
                path=home_path,
                display_path="/home",
                icon="home"
            ))

        # Media for mounted drives
        media_path = f"{prefix}/media"
        if Path(media_path).exists():
            roots.append(RootEntry(
                name="Media",
                path=media_path,
                display_path="/media",
                icon="hard-drive"
            ))

        # mnt for other mounts
        mnt_path = f"{prefix}/mnt"
        if Path(mnt_path).exists():
            roots.append(RootEntry(
                name="Mounts",
                path=mnt_path,
                display_path="/mnt",
                icon="folder"
            ))

    elif platform == "windows":
        # Windows: list available drive letters
        host_mnt = Path(f"{prefix}")
        for item in sorted(host_mnt.iterdir()):
            if item.is_dir() and len(item.name) == 1 and item.name.isalpha():
                drive = item.name.upper()
                roots.append(RootEntry(
                    name=f"Drive {drive}:",
                    path=str(item),
                    display_path=f"{drive}:\\",
                    icon="hard-drive"
                ))

    # Fallback: just show /data contents
    if not roots:
        for item in sorted(DATA_MOUNT.iterdir()):
            if item.is_dir():
                roots.append(RootEntry(
                    name=item.name,
                    path=str(item),
                    display_path=f"/{item.name}",
                    icon="folder"
                ))

    return RootsResponse(roots=roots, platform=platform)


@router.get("/browse", response_model=BrowseResponse)
def browse_directory(
    path: str = Query(default=None, description="Container path to browse (from previous response or roots)"),
    display_path: str = Query(default=None, description="User-friendly path to browse"),
):
    """
    Browse a directory and list its contents.

    Provide either `path` (container path from a previous response) or `display_path` (user-friendly path).
    Returns files and directories sorted with directories first, then alphabetically.
    """
    mount_info = detect_mount_structure()

    # Determine the actual path to browse
    if path:
        browse_path = Path(path)
    elif display_path:
        browse_path = Path(display_to_container_path(display_path, mount_info))
    else:
        # Default to first available root
        roots_response = get_roots()
        if roots_response.roots:
            browse_path = Path(roots_response.roots[0].path)
        else:
            browse_path = DATA_MOUNT

    # Security: ensure path is within /data
    try:
        resolved = browse_path.resolve()
        if not str(resolved).startswith(str(DATA_MOUNT.resolve())):
            raise HTTPException(status_code=403, detail="Access denied: path outside data mount")
    except (OSError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not browse_path.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {browse_path}")

    if not browse_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    # List directory contents
    entries = []
    try:
        for item in browse_path.iterdir():
            try:
                stat = item.stat()
                entry = FileEntry(
                    name=item.name,
                    type="directory" if item.is_dir() else "file",
                    path=str(item),
                    display_path=container_to_display_path(str(item), mount_info),
                    size=stat.st_size if item.is_file() else None,
                    modified=datetime.fromtimestamp(stat.st_mtime).isoformat()
                )
                entries.append(entry)
            except (PermissionError, OSError):
                # Skip items we can't access
                continue
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    # Sort: directories first, then alphabetically (case-insensitive)
    entries.sort(key=lambda e: (e.type != "directory", e.name.lower()))

    # Calculate parent path
    parent_path = None
    parent_display_path = None
    if str(browse_path) != str(DATA_MOUNT) and browse_path.parent != browse_path:
        parent = browse_path.parent
        if str(parent).startswith(str(DATA_MOUNT)):
            parent_path = str(parent)
            parent_display_path = container_to_display_path(str(parent), mount_info)

    return BrowseResponse(
        current_path=str(browse_path),
        current_display_path=container_to_display_path(str(browse_path), mount_info),
        parent_path=parent_path,
        parent_display_path=parent_display_path,
        entries=entries,
        platform=mount_info["platform"]
    )
