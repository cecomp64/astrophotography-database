#!/bin/bash

# Development setup for Electron desktop app

echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo "📦 Installing backend dependencies..."
cd backend
pip install -r requirements.txt
cd ..

echo "✅ Setup complete!"
echo ""
echo "To develop locally:"
echo "  npm run electron-dev"
echo ""
echo "To build installers:"
echo "  npm run electron-build"
