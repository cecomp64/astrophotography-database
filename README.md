# Astrophotography Database

A desktop application for indexing and exploring astrophotography FITS files. Extracts metadata from FITS headers and filenames, resolves object names using the Telescopius API, and provides a searchable database with a modern interface.

## Features

- **FITS File Indexing**: Automatically extract metadata from FITS headers
- **Object Name Resolution**: Resolve object names using Telescopius API with local caching
- **Alias Support**: Track multiple names per object (M42, NGC 1976, Orion Nebula, etc.)
- **Field of View Detection**: Automatically detect objects within image FOV using WCS coordinates
- **Project Management**: Organize imaging sessions and track exposure progress
- **Altitude Charts**: Visualize object visibility for your location
- **Catalogue Import**: Import OpenNGC, LDN, LBN catalogues for comprehensive object data
- **Statistics**: View total exposure time, filter usage, equipment stats

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, Astropy, Astroplan
- **Frontend**: React, TypeScript, TailwindCSS, React Query
- **Database**: SQLite (embedded)
- **Desktop**: Electron, PyInstaller

## Installation

### Download Release

Download the latest release for your platform from the [Releases](../../releases) page:

- **macOS**: `.dmg` installer
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` or `.deb` package

### Build from Source

#### Prerequisites

- Node.js 18+
- Python 3.12+
- pip

#### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/astrophotography-database.git
cd astrophotography-database

# Run setup script (installs all dependencies)
./setup-electron.sh

# Or manually:
cd frontend && npm install
cd ../backend && pip install -r requirements.txt
```

## Development

### Start Development Mode

```bash
cd frontend
npm run electron-dev
```

This launches the Electron app with:
- Hot-reloading React frontend (Vite)
- Python backend API server
- DevTools enabled

### Backend Only

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8833
```

API documentation available at http://localhost:8833/docs

### Frontend Only

```bash
cd frontend
npm run dev
```

## Building for Distribution

```bash
# Build for current platform
./build-app.sh

# Or manually:
cd backend && pyinstaller api.spec
cd ../frontend && npm run electron-build

# Build for all platforms
cd frontend && npm run electron-build-all
```

Build outputs are placed in `frontend/dist/`.

## API Endpoints

### Objects

- `GET /api/objects` - List all objects with filtering
- `GET /api/objects/{id}` - Get object details
- `GET /api/objects/search?q=...` - Search objects by name/alias
- `GET /api/objects/{id}/altitude` - Get altitude chart data

### Images

- `GET /api/images` - List images with filters
- `GET /api/images/{id}` - Get image details
- `GET /api/images/stats` - Get statistics

### Indexer

- `POST /api/indexer/directory` - Index a directory
- `POST /api/indexer/file` - Index a single file
- `POST /api/indexer/reindex` - Reindex all files

### Projects

- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/{id}` - Get project details with progress

### Catalogue

- `GET /api/catalogue` - Browse imported catalogues
- `POST /api/catalogue/import/{catalogue}` - Import catalogue (openngc, ldn, lbn)

### Configuration

- `GET /api/config` - Get current settings
- `POST /api/config` - Update settings (location, timezone)

## Configuration

Settings are configured through the Settings page in the app:

- **Observer Location**: Latitude, longitude, elevation for altitude calculations
- **Timezone**: Your local timezone for visibility charts
- **Telescopius API Key**: Optional API key for object name resolution

## Project Structure

```
astrophotography-database/
├── backend/
│   ├── app/
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── routers/       # FastAPI endpoints
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   ├── config.py      # Configuration
│   │   ├── database.py    # Database setup
│   │   └── main.py        # FastAPI app entry
│   ├── alembic/           # Database migrations
│   ├── api.spec           # PyInstaller spec
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/           # Type-safe API client
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── electron-main.cts  # Electron main process
│   ├── preload.ts         # Electron preload script
│   └── package.json
├── setup-electron.sh      # Development setup script
├── build-app.sh           # Build script
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
- WCS data for field of view calculations

Object names are also extracted from filenames and directory paths using common patterns like `M42_2023-01-01_L.fits` or `NGC7000/Ha/image.fits`.

## Indexing FITS Files

1. Open the Indexer page in the app
2. Use the file browser to select a directory containing FITS files
3. Click "Index Directory" to scan and import

The indexer will:
- Scan for `.fits`, `.fit`, `.fts` files (including `.gz` compressed)
- Extract metadata from FITS headers
- Resolve object names using the local database and Telescopius API
- Detect objects within the image field of view (if WCS data available)
- Store image records in the database

## Database

The application uses SQLite for data storage. Database location:

- **Development**: `./astrophotography.db` in project root
- **Production**:
  - macOS/Linux: `~/.config/astrophotography_db/database.db`
  - Windows: `%LOCALAPPDATA%/astrophotography_db/database.db`

Database migrations run automatically on startup.

## License

MIT
