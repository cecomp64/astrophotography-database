# Astrophotography Database - Desktop App Build Guide

## Overview

This guide will help you build distributable installers for the Astrophotography Database desktop application using Electron.

## Quick Start

### Development

1. **Setup dependencies:**
   ```bash
   bash setup-electron.sh
   ```

2. **Run in development mode:**
   ```bash
   npm run electron-dev
   ```
   This starts the Electron app with hot-reload for the frontend and the Python backend.

### Building Installers

#### On macOS (Intel/Apple Silicon):
```bash
npm run electron-build-mac
# Creates: dist/Astrophotography Database-*.dmg and .zip files
```

#### On Windows:
```bash
npm run electron-build-win
# Creates: dist/Astrophotography Database Setup *.exe and portable .exe
```

#### On Linux:
```bash
npm run electron-build-linux
# Creates: dist/*.AppImage and .deb files
```

#### Build for all platforms:
```bash
npm run electron-build-all
```

## Architecture

### How It Works

1. **Electron Main Process** (`frontend/electron-main.ts`)
   - Spawns the FastAPI backend as a Python subprocess
   - Creates and manages the application window
   - Handles file dialogs and system integrations

2. **FastAPI Backend** (`backend/`)
   - Runs on `http://localhost:8833`
   - Uses SQLite database stored in user's home directory:
     - macOS/Linux: `~/.config/astrophotography_db/database.db`
     - Windows: `%APPDATA%/Local/astrophotography_db/database.db`

3. **React Frontend** (`frontend/src/`)
   - Communicates with backend via HTTP
   - Automatically configured to connect to `localhost:8833`

## Installation File Locations

After building, installers are in the `frontend/dist/` directory:

- **macOS**: `*.dmg` (drag-and-drop installer) and `.zip`
- **Windows**: `*.exe` (installer and portable version)
- **Linux**: `.AppImage` (portable) and `.deb` (package)

## Development Notes

### Database

The backend automatically creates the SQLite database on first run. No external database setup is needed.

### Environment Variables

You can override the database location by setting `DATABASE_URL`:

```bash
DATABASE_URL="sqlite:////custom/path/database.db" npm run electron-dev
```

### API Configuration

The frontend is configured to use `http://localhost:8833` as the API base URL. This is set in [frontend/src/api/client.ts](frontend/src/api/client.ts).

## Troubleshooting

### Backend won't start
- Ensure Python 3.8+ is installed
- Verify all dependencies: `pip install -r backend/requirements.txt`
- Check logs in the Electron DevTools console

### Database errors
- Ensure the config directory exists and is writable
- Delete the old database to reset: `rm ~/.config/astrophotography_db/database.db`

### Build fails
- Clear node_modules: `rm -rf frontend/node_modules && npm install`
- Try building again: `npm run electron-build-mac`

## Next Steps

1. Add app icons in `frontend/assets/` (icon.png, icon.ico, icon.icns)
2. Customize the app name and product name in `frontend/package.json`
3. Set up signing certificates for macOS and Windows releases
4. Create installation guides for end users
