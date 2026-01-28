#!/bin/bash
set -e

# Create symbolic links for host's top-level directories (runs as root)
echo "Creating filesystem symlinks..."
for dir in /data/*; do
  target="/$(basename "$dir")"
  # If the target doesn't exist in the container root, link it
  if [ ! -e "$target" ]; then
    ln -s "$dir" "$target"
    echo "  Linked $target -> $dir"
  fi
done

echo "Running database migrations..."
gosu appuser alembic upgrade head

echo "Starting application..."
exec gosu appuser uvicorn app.main:app --host 0.0.0.0 --port 8000
