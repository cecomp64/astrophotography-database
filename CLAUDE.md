# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Astrophotography Database is a desktop application for indexing and exploring astrophotography FITS files. It extracts metadata from FITS headers, resolves object names via the Telescopius API (with local caching), tracks multiple aliases per astronomical object, and provides a searchable interface with statistics and altitude/visibility charts.

The application is packaged as an Electron desktop app with an embedded Python backend.

## Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic (migrations)
- **Database**: SQLite (embedded, no external database required)
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, React Query
- **Desktop**: Electron 27, PyInstaller (backend bundling)
- **Astronomy**: Astropy for FITS parsing, Astroplan for visibility calculations

## Development Commands

### Initial Setup
```bash
./setup-electron.sh   # Installs frontend npm packages + backend pip requirements
```

Or manually:
```bash
cd frontend && npm install
cd ../backend && pip install -r requirements.txt
```

### Starting Development Mode
```bash
cd frontend
npm run electron-dev
```
This starts:
- Vite dev server on `localhost:5173` (hot reload)
- Python backend on `localhost:8833`
- Electron window with DevTools enabled

### Backend Only (for API development)
```bash
cd backend
python -m uvicorn app.main:app --reload --port 8833
```

### Frontend Only (for UI development)
```bash
cd frontend
npm run dev
```

### Database Migrations
```bash
cd backend
alembic upgrade head                                    # Run migrations
alembic revision --autogenerate -m "description"        # Create migration
alembic downgrade -1                                    # Rollback one migration
```

### Building for Distribution

**Recommended: Use GitHub Actions CI** (builds all platforms automatically):
```bash
git tag v1.0.0
git push origin v1.0.0
```
This triggers the release workflow which builds for macOS, Windows, and Linux, then publishes installers to GitHub Releases.

**Local build** (current platform only):
```bash
./build-app.sh        # Builds Electron installer for current platform
```

Or manually:
```bash
cd backend
pyinstaller api.spec                    # Build Python backend binary

cd ../frontend
npm run build:main                      # Compile Electron main process
npm run build:renderer                  # Build React frontend
npm run electron-build                  # Create installer for current platform
npm run electron-build-all              # Build for macOS, Windows, and Linux
```

### Linting
```bash
cd frontend && npm run lint             # ESLint
```

## Architecture

### Desktop App Architecture
```
Electron Main Process
    ├── Spawns Python backend (PyInstaller binary in production, uvicorn in dev)
    ├── Creates BrowserWindow loading React app
    └── Sets APP_USER_DATA env var for database location
```

### Backend Structure (`backend/app/`)
- **`models/`**: SQLAlchemy ORM models
  - `objects.py`: AstroObject + ObjectAlias
  - `images.py`: Image metadata with FOV calculations
  - `image_objects.py`: Many-to-many join table
  - `configuration.py`: App settings
  - `projects.py`: Projects, targets, images
- **`routers/`**: FastAPI endpoints
  - `objects.py`: CRUD + search + altitude charts
  - `images.py`: FITS file metadata queries
  - `indexer.py`: Directory scanning, FITS extraction
  - `catalogue.py`: OpenNGC, LDN, LBN imports
  - `configuration.py`: Location, timezone settings
  - `projects.py`: Project management
  - `files.py`: File browser for directory picking
- **`schemas/`**: Pydantic request/response validation
- **`services/`**: Business logic layer
  - `fits_extractor.py`: Parses FITS headers using astropy
  - `name_resolver.py`: Resolves object names (local DB first, then Telescopius API)
  - `indexer.py`: Orchestrates directory scanning and metadata extraction
  - `fov_matcher.py`: Detects objects within image field of view using WCS coordinates
  - `catalogue_importer.py`: Imports external catalogues (OpenNGC, LDN, LBN)
  - `visibility_service.py`: Altitude/azimuth calculations with astroplan
  - `project_service.py`: Project management logic

### Database Schema
- **objects**: Astronomical objects with coordinates, magnitude, type, constellation
- **object_aliases**: Multiple names per object (Messier, NGC, IC, etc.)
- **images**: FITS file metadata (exposure, filter, telescope, camera, FOV)
- **image_objects**: Many-to-many join with association type (`primary` or `in_fov`)
- **configurations**: Application settings stored as JSON
- **projects**: Astrophotography projects with targets
- **project_targets**: Project-to-object relationships
- **project_images**: Project-to-image relationships

### Frontend Structure (`frontend/src/`)
- **`api/client.ts`**: Type-safe Axios client with namespaced functions (`objectsApi`, `imagesApi`, `projectsApi`, etc.)
- **`pages/`**: Page components (Dashboard, Objects, Images, Indexer, Catalogue, Projects, Settings)
- **`components/`**: Reusable components (AltitudeChart, ImageTable, ObjectCard, FilePicker, ProjectCard)

### Electron Structure (`frontend/`)
- **`electron-main.cts`**: Main process - spawns backend, creates window, manages lifecycle
- **`preload.ts`**: Preload script for context isolation

## Key Patterns

- **Service layer**: Business logic in services, routers are thin validation + service calls
- **Object resolution**: `NameResolver` checks local DB first, falls back to Telescopius API with caching
- **Image-object relationships**: Images can have a primary target and multiple "in_fov" objects
- **Dynamic database path**: Electron sets `APP_USER_DATA` env var, backend creates SQLite DB in user's app data directory
- **Migrations at startup**: Alembic runs automatically when backend starts

## Environment Variables

- `APP_USER_DATA`: User data directory (set by Electron, contains database)
- `TELESCOPIUS_API_KEY`: Optional API key for Telescopius rate limiting
- `TELESCOPIUS_API_URL`: Telescopius API base URL (default: https://telescopius.com/api)

## Database Location

- **Development**: `./astrophotography.db` in project root (or backend directory)
- **Production (Electron)**:
  - macOS: `~/.config/astrophotography_db/database.db`
  - Windows: `%APPDATA%/Local/astrophotography_db/database.db`
  - Linux: `~/.config/astrophotography_db/database.db`

## Build Outputs

- **macOS**: DMG installer + ZIP
- **Windows**: NSIS installer + portable EXE
- **Linux**: AppImage + DEB package

Installers are output to `frontend/dist/`.

## CI/CD

GitHub Actions workflow (`.github/workflows/release.yml`) automates cross-platform builds:

### Triggering a Release
```bash
git tag v1.0.0
git push origin v1.0.0
```

### What the Workflow Does
1. Builds on macOS, Windows, and Linux runners in parallel
2. Each runner: installs dependencies → builds PyInstaller backend → builds Electron app
3. Uploads all artifacts to a GitHub Release

### Release Artifacts
| Platform | Files |
|----------|-------|
| macOS | `.dmg`, `.zip` |
| Windows | `.exe` (NSIS installer, portable) |
| Linux | `.AppImage`, `.deb` |

### Manual Builds
Use "Run workflow" button in GitHub Actions to trigger a test build without creating a release.

### Versioning
- Tags matching `v*` trigger automatic releases (e.g., `v1.0.0`, `v2.1.0-beta`)
- Pre-release versions (containing `-`) are marked as pre-releases on GitHub
