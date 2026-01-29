#!/bin/bash

# Build configuration for PyInstaller to bundle the FastAPI backend

cat > /tmp/build_backend.spec << 'EOF'
# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules

a = Analysis(
    ['backend/app/main.py'],
    pathex=[],
    binaries=[],
    datas=[('backend/alembic', 'alembic'), ('backend/app', 'app')],
    hiddenimports=collect_submodules('fastapi') + collect_submodules('sqlalchemy') + [
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websocket',
        'uvicorn.protocols.websocket.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludedimports=[],
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='api',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
EOF

echo "PyInstaller spec file created at /tmp/build_backend.spec"
echo "To build the backend executable, run:"
echo "pyinstaller /tmp/build_backend.spec"
