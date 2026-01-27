# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Astrophotography Database is a web application for indexing and exploring astrophotography FITS files. It extracts metadata from FITS headers, resolves object names via the Telescopius API (with local caching), tracks multiple aliases per astronomical object, and provides a searchable web interface with statistics and altitude/visibility charts.

## Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic (migrations)
- **Database**: PostgreSQL 16
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, React Query
- **Astronomy**: Astropy for FITS parsing and coordinate calculations

## Development Commands

### Starting the Application
```bash
cp .env.example .env
docker compose up -d
# Frontend: http://localhost:4000, API: http://localhost:8000, Docs: http://localhost:8000/docs
```

### Viewing Logs
```bash
docker compose logs -f           # All services
docker compose logs -f backend   # Backend only
docker compose logs -f frontend  # Frontend only
```

### Database Migrations
```bash
docker compose exec backend alembic upgrade head     # Run migrations
docker compose exec backend alembic revision --autogenerate -m "description"  # Create migration
docker compose exec backend alembic downgrade -1     # Rollback one migration
```

### Running Backend Commands
```bash
docker compose exec backend python -m pytest        # Run tests
docker compose exec backend python -c "..."         # Run Python code
```

### Frontend Commands
```bash
docker compose exec frontend npm run lint           # ESLint
docker compose exec frontend npm run build          # Production build
docker compose run --rm frontend npm install <pkg>  # Install new package
```

### Database Access
```bash
docker compose exec db psql -U postgres -d astrophotography  # PostgreSQL shell
```

### Rebuilding Containers
```bash
docker compose build              # Rebuild all
docker compose build backend      # Rebuild specific service
docker compose up -d --build      # Rebuild and restart
```

## Architecture

### Backend Structure
- **`app/models/`**: SQLAlchemy ORM models (objects, images, image_objects, configuration)
- **`app/routers/`**: FastAPI endpoints (objects, images, indexer, catalogue, configuration)
- **`app/schemas/`**: Pydantic request/response validation
- **`app/services/`**: Business logic layer
  - `fits_extractor.py`: Parses FITS headers using astropy
  - `name_resolver.py`: Resolves object names (local DB first, then Telescopius API)
  - `indexer.py`: Orchestrates directory scanning and metadata extraction
  - `fov_matcher.py`: Detects objects within image field of view using WCS coordinates
  - `catalogue_importer.py`: Imports external catalogues (OpenNGC, LDN, LBN)

### Database Schema
- **objects**: Astronomical objects with coordinates, magnitude, type, constellation
- **object_aliases**: Multiple names per object (Messier, NGC, IC, etc.)
- **images**: FITS file metadata (exposure, filter, telescope, camera, FOV)
- **image_objects**: Many-to-many join with association type (`primary` or `in_fov`)
- **configurations**: Application settings stored as JSONB

### Frontend Structure
- **`src/api/client.ts`**: Type-safe Axios client with namespaced functions (`objectsApi`, `imagesApi`, etc.)
- **`src/pages/`**: Main page components (Dashboard, Objects, Images, Indexer, Catalogue, Settings)
- **`src/components/`**: Reusable components (AltitudeChart, ImageTable, ObjectCard)

## Key Patterns

- **Service layer**: Business logic in services, routers are thin validation + service calls
- **Object resolution**: `NameResolver` checks local DB first, falls back to Telescopius API with caching
- **Image-object relationships**: Images can have a primary target and multiple "in_fov" objects
- **Full-text search**: PostgreSQL trigram indexes on object/alias names for fuzzy search

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (required)
- `TELESCOPIUS_API_KEY`: Optional API key for Telescopius rate limiting
- `TELESCOPIUS_API_URL`: Telescopius API base URL (default: https://telescopius.com/api)
