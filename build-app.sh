#!/bin/bash

# Build script for creating distributable installers

set -e

echo "🔨 Building Astrophotography Database Desktop App..."

# Build frontend
echo "📦 Building frontend..."
cd frontend
npm install
npm run build
cd ..

# Build installers for current platform
echo "🚀 Building installers..."
cd frontend
if [[ "$OSTYPE" == "darwin"* ]]; then
  npm run electron-build-mac
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  npm run electron-build-win
else
  npm run electron-build-linux
fi

echo "✅ Build complete! Installers are in the 'dist' folder."
