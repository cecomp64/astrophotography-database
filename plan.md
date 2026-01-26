# Astrophotography Indexing System Plan

## 1. Overview

Build an app that:

- **Indexes astrophotography files** from the filesystem
- **Extracts metadata** from FITS files and filenames/paths
- **Normalizes object names**, including aliases
- **Stores metadata in a database**
- **Provides a web UI** for querying and exploring the data

Key requirement: **Object name handling**, including multiple names/aliases per object, using the **Telescopius REST API** (via JavaScript client) and optionally other catalogs.

---

## 2. Language and tooling choices

### 2.1 Metadata extraction and backend language

**Primary choice: Python**

- **Reasons:**
  - `astropy` provides robust FITS support (`astropy.io.fits`)
  - Excellent ecosystem for astronomy and scientific computing
  - Easy filesystem crawling and regex parsing
  - Integrates cleanly with web frameworks and databases

- **Key libraries:**
  - `astropy` — FITS parsing, WCS, coordinates
  - `re` — filename/path parsing
  - `sqlalchemy` — ORM for database access
  - `pydantic` — data models (especially with FastAPI)
  - `pathlib` — filesystem traversal

**Alternative: Node.js**

- Possible to use Node.js with libraries like `fitsjs`, but:
  - FITS support is weaker than Python’s `astropy`
  - More friction for astronomy‑specific tasks

**Decision:** Use **Python** for metadata extraction and backend.

---

### 2.2 Database

**Primary choice: PostgreSQL**

- **Reasons:**
  - Strong relational modeling
  - Good support for **many‑to‑many** relationships (objects ↔ aliases)
  - **Full‑text search** and fuzzy matching (`pg_trgm`)
  - JSONB fields for flexible, semi‑structured metadata (e.g., raw FITS headers)

---

## 3. Data model

### 3.1 Core tables

**`objects`**

- `id` (PK)
- `primary_name`
- `ra` (right ascension)
- `dec` (declination)
- `type` (e.g., galaxy, nebula, cluster)
- `magnitude` (optional)
- `constellation` (optional)
- `created_at`
- `updated_at`

**`object_aliases`**

- `id` (PK)
- `object_id` (FK → `objects.id`)
- `alias_name`
- `catalog` (e.g., Messier, NGC, IC, Sharpless)
- `created_at`

**`images`**

- `id` (PK)
- `file_path`
- `file_name`
- `directory_path`
- `date_taken`
- `exposure_time`
- `filter`
- `telescope`
- `camera`
- `gain` / `iso` (if applicable)
- `binning`
- `object_id` (FK → `objects.id`, nullable if unknown)
- `fits_header` (JSONB, raw or normalized subset)
- `created_at`
- `updated_at`

### 3.2 Indexing and search

- **Indexes:**
  - `objects.primary_name` (B‑tree)
  - `object_aliases.alias_name` (B‑tree + optional trigram index)
  - Full‑text or trigram index on `objects.primary_name` and `object_aliases.alias_name` for fuzzy search

---

## 4. Object name resolution

### 4.1 Source of truth

- Use **Telescopius REST API** as the primary external source for:
  - Normalizing object names
  - Fetching canonical identifiers
  - Getting alternate names/aliases
  - Use a placeholder for a python version of this api: https://www.npmjs.com/package/telescopius-api 
  - Keep any known aliases in memory and/or use the application's own Postgres API to resolve object names and limit queries to the external telescopius API

### 4.2 Resolution pipeline

1. **Extract candidate name** from:
   - Filename (e.g., `M42_2023-01-01_Luminance.fits`)
   - Directory structure (e.g., `.../Orion/M42/...`)
   - FITS header fields (e.g., `OBJECT` keyword)

2. **Check local database**:
   - Look up in `objects` and `object_aliases`
   - If found, link image to existing `object_id`

3. **If not found, query Telescopius**:
   - Use the JavaScript client (or a Python wrapper around the API)
   - Retrieve:
     - Canonical object name
     - Coordinates
     - Type
     - Aliases / catalog IDs

4. **Insert or update database**:
   - Create a new row in `objects` if needed
   - Insert aliases into `object_aliases`
   - Link the image to the resolved `object_id`

5. **Optional additional catalogs** (later enhancement):
   - SIMBAD via `astroquery`
   - Other catalogs if needed

---

## 5. Backend web API

### 5.1 Framework

**Primary choice: FastAPI (Python)**

- **Reasons:**
  - Modern, fast, async‑friendly
  - Great developer experience
  - Automatic OpenAPI docs
  - Integrates well with Pydantic and SQLAlchemy

### 5.2 Example endpoints

- **Objects**
  - `GET /objects` — list/search objects (by name, alias, type, etc.)
  - `GET /objects/{id}` — get object details and associated images
  - `GET /objects/search?q=...` — fuzzy search by name/alias

- **Images**
  - `GET /images` — list/search images (by date, filter, telescope, object, etc.)
  - `GET /images/{id}` — image metadata
  - `POST /reindex` — trigger a reindexing job (optional, or handled by a separate worker)

- **Name resolution**
  - `GET /resolve?q=...` — resolve a name using local DB + Telescopius (optional if done offline)

---

## 6. Frontend web UI

### 6.1 Framework options

**Recommended: React or SvelteKit**

- **React**
  - Huge ecosystem
  - Many UI libraries (MUI, Chakra, Tailwind, etc.)
  - Easy integration with REST APIs

- **SvelteKit**
  - Lightweight and fast
  - Great developer experience
  - Built‑in routing and server‑side rendering

**Alternative: Next.js**

- If you want server‑side rendering and API routes in the same project
- Can still talk to the FastAPI backend or proxy requests

### 6.2 Core UI features

- **Search bar**:
  - Search by object name, alias, catalog ID
  - Fuzzy matching and suggestions

- **Object detail page**:
  - Canonical name and aliases
  - Coordinates, type, basic info
  - List of associated images with filters (date, filter, telescope, etc.)

- **Image browser**:
  - Grid or list view of images
  - Filters: date range, filter, telescope, camera, object
  - Links back to object detail pages

- **Advanced filters**:
  - Exposure time ranges
  - Filter combinations (e.g., LRGB, SHO)
  - Telescope/camera combinations

---

## 7. Indexing and background processing

### 7.1 File crawler

- Implement a Python script/service that:
  - Walks configured directories using `pathlib`
  - Detects new/changed FITS files
  - Extracts metadata from:
    - FITS headers (`astropy.io.fits`)
    - Filenames and directory paths (regex)
  - Sends data to the database (directly or via API)

### 7.2 Background jobs

- **Optional:** Use a task queue for heavier work:
  - **Celery** or **RQ** with Redis
  - Tasks:
    - FITS parsing
    - Telescopius lookups
    - Name resolution and DB updates

---

## 8. Integration with Telescopius JavaScript client

### 8.1 Options

1. **Use Telescopius from the frontend (JS client):**
   - Frontend calls Telescopius directly for live lookups
   - Backend remains responsible for persistent storage and indexing
   - Good for interactive search, but you’ll still want a backend pipeline for long‑term normalization

2. **Wrap Telescopius in the backend:**
   - Use a small Node.js microservice with the JS client
   - Or call Telescopius from Python via HTTP directly
   - Backend handles:
     - Caching
     - Rate limiting
     - Normalization and storage

### 8.2 Recommended approach

- **Primary:** Use Python backend for indexing and name resolution, calling Telescopius via HTTP.
- **Frontend:** Optionally use the JS client for live suggestions, but rely on the backend as the source of truth.

---

## 9. Deployment and infrastructure

### 9.1 Containerization

- Use **Docker** for:
  - FastAPI backend
  - Frontend app
  - PostgreSQL
  - Optional Redis (for background jobs)

- Use **Docker Compose** to orchestrate:
  - `web` (frontend)
  - `api` (FastAPI)
  - `db` (PostgreSQL)
  - `worker` (Celery/RQ, optional)
  - `redis` (optional)

### 9.2 Environments

- **Local development:**
  - Run everything via Docker Compose
  - Mount local directories with FITS files

- **Production:**
  - Deploy to a VPS, cloud instance, or container platform
  - Use persistent volumes for:
    - Database
    - FITS file storage (if served directly)

---

## 10. Stack summary

| Component              | Recommendation          | Notes                                      |
|------------------------|------------------------|--------------------------------------------|
| FITS parsing           | Python + `astropy`     | Best‑in‑class astronomy tooling            |
| Metadata extraction    | Python                 | Filesystem + regex + FITS headers          |
| Database               | PostgreSQL             | Relational + full‑text/fuzzy search        |
| ORM                    | SQLAlchemy             | Clean DB access from Python                |
| Backend API            | FastAPI                | Modern, fast, async                        |
| Frontend               | React or SvelteKit     | Flexible, great UI ecosystems              |
| Object name resolution | Telescopius API        | Primary external catalog                   |
| Background jobs        | Celery or RQ (optional)| For heavy/batch tasks                      |
| Deployment             | Docker + Docker Compose| Simple, reproducible environments          |

---
