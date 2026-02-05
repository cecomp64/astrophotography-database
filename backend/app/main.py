import logging
import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from alembic.config import Config
from alembic import command
from sqlalchemy import create_engine # Ensure this is imported

# Import settings to get the correct dynamic database URL
from app.config import get_settings
from app.database import engine, Base
from app.routers import (
    objects_router, images_router, indexer_router,
    catalogue_router, configuration_router, projects_router, files_router,
    export_router, showcases_router
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def run_migrations():
    """
    Programmatically run Alembic migrations on the correct database path.
    Ensures transactional integrity and prevents multi-process collisions.
    """
    # Prevent Uvicorn workers from re-running migrations during startup
    if os.environ.get("UVICORN_WORKER"):
        logger.info("Skipping migrations in worker process.")
        return

    try:
        settings = get_settings()
        
        # Determine base path for the executable or the script
        if getattr(sys, 'frozen', False):
            # In production, the ini is next to the executable in Resources/backend
            base_path = os.path.dirname(sys.executable)
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))

        ini_path = os.path.join(base_path, "alembic.ini")
        
        # Fallback for dev structure
        if not os.path.exists(ini_path):
            ini_path = os.path.join(os.path.dirname(base_path), "alembic.ini")

        # Define the location of the alembic folder (where env.py and versions/ live)
        scripts_location = os.path.join(os.path.dirname(ini_path), "alembic")

        logger.info(f"Using alembic.ini at: {ini_path}")
        logger.info(f"Target Database URL: {settings.database_url}")
        
        alembic_cfg = Config(ini_path)
        
        # 1. Force Alembic to use the dynamic URL and script location
        alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
        alembic_cfg.set_main_option("script_location", scripts_location)
        
        # 2. Use a dedicated engine and connection for the migration
        # This ensures the transaction is COMMITted before the app starts
        migration_engine = create_engine(settings.database_url)
        
        with migration_engine.begin() as connection:
            logger.info("Applying migrations within a transaction...")
            alembic_cfg.attributes['connection'] = connection
            command.upgrade(alembic_cfg, "head")
        
        # 3. Explicitly dispose the engine to release the SQLite file lock
        migration_engine.dispose()
        
        logger.info("Database migrations applied and file lock released.")
    except Exception as e:
        logger.error(f"Error running migrations: {e}")
        sys.exit(1)

# Run migrations BEFORE the app starts
logger.info("Pre-startup: Running migrations...")
run_migrations()
logger.info("Pre-startup: Migrations complete.")

app = FastAPI(
    title="Astrophotography Database API",
    description="API for indexing and querying astrophotography FITS files",
    version="1.0.0",
)

@app.on_event("startup")
async def startup_event():
    logger.info("Backend is now serving requests.")

# Configure CORS - allow any origin for PWA sync from GitHub Pages or other hosts
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Original-Size", "X-Checksum", "X-Last-Modified"],
)

# Include routers with the required /api prefix
app.include_router(objects_router, prefix="/api")
app.include_router(images_router, prefix="/api")
app.include_router(indexer_router, prefix="/api")
app.include_router(catalogue_router, prefix="/api")
app.include_router(configuration_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(files_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(showcases_router, prefix="/api")

@app.get("/")
def root():
    return {
        "name": "Astrophotography Database API",
        "version": "1.0.0",
        "docs": "/docs",
    }

@app.get("/api/health") # Added /api prefix here just in case your frontend checks this
@app.get("/health")
def health_check():
    return {"status": "healthy"}