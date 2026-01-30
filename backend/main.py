import uvicorn
import multiprocessing
import sys
from app.main import app # Import your FastAPI app object

if __name__ == "__main__":
    # Crucial for Windows: prevents the app from spawning infinite processes
    multiprocessing.freeze_support()
    
    # Run uvicorn programmatically
    uvicorn.run(
        app, 
        host="127.0.0.1", 
        port=8833, 
        log_level="info",
        workers=1 # Keep it simple for desktop apps
    )