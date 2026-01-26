from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.services.indexer import FileIndexer

router = APIRouter(prefix="/indexer", tags=["indexer"])


class IndexDirectoryRequest(BaseModel):
    directory: str
    recursive: bool = True


class IndexFileRequest(BaseModel):
    file_path: str


@router.post("/directory")
def index_directory(request: IndexDirectoryRequest, db: Session = Depends(get_db)):
    """
    Index all FITS files in a directory.

    Provide the path to a directory containing FITS files. The indexer will:
    - Scan for .fits, .fit, .fts files (including .gz compressed)
    - Extract metadata from FITS headers
    - Attempt to resolve object names
    - Store image records in the database
    
    Note: Paths are relative to the host machine root and will be mounted at /data/host_mnt
    """
    # Prepend /data/host_mnt to make paths absolute within container
    directory = f"/data/host_mnt{request.directory}" if not request.directory.startswith("/data") else request.directory
    indexer = FileIndexer(db)
    result = indexer.index_directory(directory, recursive=request.recursive)

    return {
        "status": "completed",
        "directory": request.directory,
        "indexed": result["indexed"],
        "skipped": result["skipped"],
        "errors": result["errors"],
    }


@router.post("/file")
def index_file(request: IndexFileRequest, db: Session = Depends(get_db)):
    """
    Index a single FITS file.

    Provide the full path to a FITS file to extract its metadata and add it to the database.
    Note: Paths are relative to the host machine root and will be mounted at /data/host_mnt
    """
    # Prepend /data/host_mnt to make paths absolute within container
    file_path = f"/data/host_mnt{request.file_path}" if not request.file_path.startswith("/data") else request.file_path
    indexer = FileIndexer(db)
    result = indexer.index_file(file_path)

    return result


@router.post("/reindex")
def reindex_all(db: Session = Depends(get_db)):
    """
    Reindex all files in the database (update metadata).

    Re-reads FITS headers for all indexed files and updates their metadata.
    Useful after making changes to metadata extraction logic.
    """
    indexer = FileIndexer(db)
    result = indexer.reindex_all()

    return {
        "status": "completed",
        "updated": result["updated"],
        "errors": result["errors"],
    }
