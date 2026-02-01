# PWA with Offline Database Sync - Implementation Plan

## Overview

Add a Progressive Web App (PWA) that syncs the SQLite database from your desktop app for fully offline mobile browsing. The PWA shares the React frontend codebase but uses a separate build configuration and an offline database layer powered by sql.js (SQLite compiled to WebAssembly).

## Architecture

```
Desktop (Electron)                         PWA (Mobile Browser)
┌──────────────────────┐                   ┌──────────────────────┐
│ React + Python API   │                   │ React (same code!)   │
│        ↓             │                   │        ↓             │
│ SQLite Database      │ ──── sync ────>   │ sql.js (WASM)        │
│                      │  /api/export      │        ↓             │
└──────────────────────┘                   │ IndexedDB (persist)  │
                                           └──────────────────────┘
```

**Key decisions:**
- **SQLite file transfer** (not JSON) - sql.js loads SQLite directly, efficient for 50-150MB databases
- **Shared React components** - Different entry points, same UI code
- **Read-only PWA** - No indexing or writes, just browsing

---

## Phase 1: Backend Export Endpoint

Create `/api/export/sqlite` endpoint to download the database file.

### Files to Create

**backend/app/routers/export.py**
```python
# Endpoints:
# GET /api/export/sqlite - Gzipped SQLite file download
# GET /api/export/metadata - Sync info (version, size, row counts)
```

### Files to Modify

**backend/app/main.py** - Register export router

---

## Phase 2: PWA Infrastructure

### Files to Create

**frontend/vite.config.pwa.ts** - PWA build config with vite-plugin-pwa

**frontend/index-pwa.html** - PWA entry HTML with manifest link

**frontend/src/main-pwa.tsx** - PWA entry point with service worker registration

**frontend/public/manifest.webmanifest** - PWA manifest (icons, theme, display mode)

### Dependencies to Add

```json
{
  "dependencies": {
    "sql.js": "^1.10.0",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "vite-plugin-pwa": "^0.20.0"
  }
}
```

---

## Phase 3: Offline Database Layer

### Files to Create

**frontend/src/pwa/db/offline-db.ts**
- sql.js wrapper class
- Load/save SQLite binary from IndexedDB
- Import database from sync download

**frontend/src/pwa/db/persistence.ts**
- IndexedDB storage for SQLite binary
- Sync metadata (last synced, version)

**frontend/src/pwa/api/offline-client.ts**
- Mirror of `src/api/client.ts` but queries sql.js
- Same TypeScript types, different data source

**frontend/src/pwa/context/OfflineDbContext.tsx**
- React context providing database instance
- Initialization and loading state

**frontend/src/pwa/hooks/useOfflineDb.ts**
- Hook for components to access offline database

---

## Phase 4: Sync UI

### Files to Create

**frontend/src/pwa/context/SyncContext.tsx**
- Sync state management (status, progress, errors)

**frontend/src/pwa/components/SyncSettings.tsx**
- Server URL input
- Sync button with progress
- Last sync time display
- Clear local data option

**frontend/src/pwa/pages/SyncPage.tsx**
- Full sync settings page for PWA

### Sync Flow

1. User enters desktop app URL (e.g., `http://192.168.1.100:8833`)
2. PWA fetches `/api/export/metadata` to check version
3. PWA downloads `/api/export/sqlite` (gzipped)
4. Decompresses and loads into sql.js
5. Saves to IndexedDB for persistence

---

## Phase 5: Mobile UI Adjustments

### Files to Modify

**frontend/src/components/Layout.tsx**
- Hide "Indexer" nav item in PWA mode
- Add "Sync" nav item in PWA mode
- Add sync status indicator

**frontend/src/pages/SettingsPage.tsx**
- Conditionally show sync settings in PWA mode
- Hide location/API key settings (read-only)

**frontend/src/pages/*.tsx** (various)
- Hide edit/delete buttons in PWA mode
- Ensure touch-friendly interactions

---

## Phase 6: Build & Deployment

### Files to Create

**frontend/package.json** (scripts to add)
```json
{
  "scripts": {
    "dev:pwa": "vite --config vite.config.pwa.ts",
    "build:pwa": "vite build --config vite.config.pwa.ts",
    "preview:pwa": "vite preview --config vite.config.pwa.ts"
  }
}
```

**.github/workflows/pwa-deploy.yml**
- Build PWA on push to main
- Deploy to GitHub Pages

### Hosting

GitHub Pages at `https://<username>.github.io/astrophotography-database/`
- Free, HTTPS included (required for service workers)
- Auto-deploys on push

---

## Optional: Network Discovery

Make connecting easier with one of:

1. **QR Code** - Desktop shows QR with local IP, PWA scans it
2. **mDNS/Bonjour** - Desktop advertises on network, PWA auto-discovers
3. **Manual URL** - User types IP address (simplest to implement)

---

## PWA Pages (Read-Only)

| Page | Included | Notes |
|------|----------|-------|
| Dashboard | Yes | Stats, recent objects, projects |
| Objects | Yes | Browse and search objects |
| Object Detail | Yes | Object info, altitude charts |
| Images | Yes | Browse images by filter/date |
| Image Detail | Yes | Image metadata |
| Projects | Yes | Project list |
| Project Detail | Yes | Progress, targets (no editing) |
| Catalogue | Yes | Browse astronomical catalogues |
| Indexer | No | Write operation |
| Settings | Modified | Sync settings only |

---

## Verification

1. **Backend export**: `curl http://localhost:8833/api/export/sqlite -o test.db && sqlite3 test.db ".tables"`
2. **PWA dev**: `npm run dev:pwa` - opens at localhost:5173
3. **Offline test**: Load PWA, sync once, then disable network in DevTools
4. **Mobile test**: Deploy to GitHub Pages, access from phone
5. **Install test**: Add to home screen on iOS/Android

---

## File Summary

### New Files (13)
- `backend/app/routers/export.py`
- `frontend/vite.config.pwa.ts`
- `frontend/index-pwa.html`
- `frontend/src/main-pwa.tsx`
- `frontend/public/manifest.webmanifest`
- `frontend/src/pwa/db/offline-db.ts`
- `frontend/src/pwa/db/persistence.ts`
- `frontend/src/pwa/api/offline-client.ts`
- `frontend/src/pwa/context/OfflineDbContext.tsx`
- `frontend/src/pwa/context/SyncContext.tsx`
- `frontend/src/pwa/components/SyncSettings.tsx`
- `frontend/src/pwa/pages/SyncPage.tsx`
- `.github/workflows/pwa-deploy.yml`

### Modified Files (4)
- `backend/app/main.py`
- `frontend/package.json`
- `frontend/src/components/Layout.tsx`
- `frontend/src/pages/SettingsPage.tsx`
