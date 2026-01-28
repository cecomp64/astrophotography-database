FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Make entrypoint script executable
RUN chmod +x entrypoint.sh

# Create non-root user (but don't switch yet - entrypoint needs root for symlinks)
RUN useradd -m appuser && chown -R appuser:appuser /app

EXPOSE 8000

# Entrypoint runs as root to create symlinks, then drops to appuser
CMD ["./entrypoint.sh"]
