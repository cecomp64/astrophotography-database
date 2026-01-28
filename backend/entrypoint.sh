#!/bin/bash
set -e

# Create symbolic links for host's top-level directories
echo "Creating home directory symbolic links..."
## Loop through top-level dirs on the host mount
for dir in /data/*; do
  target="/$(basename "$dir")"
  # If the directory doesn't exist in the container root, link it!
  if [ ! -e "$target" ]; then
    ln -s "$dir" "$target" 2>/dev/null || true
  fi
done

echo "Running database migrations..."
alembic upgrade head

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
