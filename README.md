# Astrophotography Database

A web application for indexing and exploring astrophotography FITS files. Extracts metadata from FITS headers and filenames, resolves object names using the Telescopius API, and provides a searchable database with a modern web interface.

## Features

- **FITS File Indexing**: Automatically extract metadata from FITS headers
- **Object Name Resolution**: Resolve object names using Telescopius API with local caching
- **Alias Support**: Track multiple names per object (M42, NGC 1976, Orion Nebula, etc.)
- **Web UI**: Search, browse, and explore your astrophotography collection
- **Statistics**: View total exposure time, filter usage, equipment stats

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, Astropy
- **Frontend**: React, TypeScript, TailwindCSS, React Query
- **Database**: PostgreSQL
- **Deployment**: Docker, Docker Compose

## Quick Start

### Using Docker Compose (Recommended)

1. Clone the repository and navigate to the directory

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

3. Start the services:
   ```bash
   docker-compose up -d
   ```

4. Access the application:
   - Frontend: http://localhost:3000
   - API: http://localhost:8833
   - API Docs: http://localhost:8833/docs

5. Use the Indexer page to scan your FITS directories by providing the path

### Local Development

#### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Start PostgreSQL (using Docker)
docker run -d --name postgres -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=astrophotography \
  postgres:16-alpine

# Run migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload
```

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## API Endpoints

### Objects

- `GET /objects` - List all objects
- `GET /objects/{id}` - Get object details
- `GET /objects/search?q=...` - Search objects by name/alias
- `POST /objects` - Create new object
- `PATCH /objects/{id}` - Update object
- `DELETE /objects/{id}` - Delete object

### Images

- `GET /images` - List images with filters
- `GET /images/{id}` - Get image details
- `GET /images/stats` - Get statistics
- `POST /images/{id}/link-object/{object_id}` - Link image to object

### Indexer

- `POST /indexer/directory` - Index a directory (provide `directory` path in request body)
- `POST /indexer/file` - Index a single file (provide `file_path` in request body)
- `POST /indexer/reindex` - Reindex all files in the database

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/astrophotography` |
| `TELESCOPIUS_API_URL` | Telescopius API base URL | `https://telescopius.com/api` |
| `TELESCOPIUS_API_KEY` | API key (optional) | - |

## Project Structure

```
astrophotography-database/
├── backend/
│   ├── app/
│   │   ├── models/        # SQLAlchemy models
│   │   ├── routers/       # FastAPI routes
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   ├── config.py      # Configuration
│   │   ├── database.py    # Database setup
│   │   └── main.py        # FastAPI app
│   ├── alembic/           # Database migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## FITS Metadata Extraction

The indexer extracts the following metadata from FITS headers:

- Date/time (`DATE-OBS`, `DATE`)
- Exposure time (`EXPTIME`, `EXPOSURE`)
- Filter (`FILTER`, `FILTER1`)
- Telescope (`TELESCOP`, `INSTRUME`)
- Camera (`CAMERA`, `INSTRUME`)
- Gain/ISO (`GAIN`, `ISO`)
- Binning (`XBINNING`, `YBINNING`)
- Object name (`OBJECT`, `OBJNAME`)
- Coordinates (`RA`, `DEC`, `OBJCTRA`, `OBJCTDEC`)

Object names are also extracted from filenames and directory paths using common patterns like `M42_2023-01-01_L.fits` or `NGC7000/Ha/image.fits`.

## Indexing FITS Files

To index your FITS files:

1. Via the Web UI: Go to the Indexer page and enter the directory path
2. Via API: POST to `/indexer/directory` with `{"directory": "/path/to/fits", "recursive": true}`

The indexer will:
- Scan for `.fits`, `.fit`, `.fts` files (including `.gz` compressed)
- Extract metadata from FITS headers
- Attempt to resolve object names using the local database and Telescopius API
- Store image records in the database
