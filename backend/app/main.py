from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers import objects_router, images_router, indexer_router

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Astrophotography Database API",
    description="API for indexing and querying astrophotography FITS files",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(objects_router)
app.include_router(images_router)
app.include_router(indexer_router)


@app.get("/")
def root():
    return {
        "name": "Astrophotography Database API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}
