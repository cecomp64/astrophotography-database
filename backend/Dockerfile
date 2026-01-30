FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download astropy/astroplan ephemeris data for offline use
#RUN python -c "\
#from astropy.utils.data import download_file; \
#from astropy.coordinates import solar_system_ephemeris; \
#from astropy.utils.iers import IERS_Auto; \
#solar_system_ephemeris.set('de440s'); \
#IERS_Auto.open(); \
#print('Ephemeris data downloaded successfully')"

# Configure astropy to use cached data and not require network at runtime
ENV ASTROPY_IERS_AUTO_DOWNLOAD=0

# Copy application code
COPY . .

# Make entrypoint script executable
RUN chmod +x entrypoint.sh

# Create non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8833

CMD ["./entrypoint.sh"]
