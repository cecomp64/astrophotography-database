from app.routers.objects import router as objects_router
from app.routers.images import router as images_router
from app.routers.indexer import router as indexer_router
from app.routers.catalogue import router as catalogue_router
from app.routers.configuration import router as configuration_router

__all__ = ["objects_router", "images_router", "indexer_router", "catalogue_router", "configuration_router"]
