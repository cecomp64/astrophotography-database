import uvicorn
import multiprocessing
import argparse
import os
from pathlib import Path
from app.main import app  # Import your FastAPI app object
from app.services.ssl_cert import ensure_ssl_certs

if __name__ == "__main__":
    # Crucial for Windows: prevents the app from spawning infinite processes
    multiprocessing.freeze_support()

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8833)
    parser.add_argument("--host", default="0.0.0.0")  # Listen on all interfaces for PWA sync
    parser.add_argument("--ssl", action="store_true", help="Enable HTTPS with self-signed cert")
    parser.add_argument("--ssl-certfile", help="Path to SSL certificate")
    parser.add_argument("--ssl-keyfile", help="Path to SSL private key")
    args = parser.parse_args()

    ssl_certfile = None
    ssl_keyfile = None

    if args.ssl:
        # Generate or use existing certs in user data directory
        user_data = os.environ.get("APP_USER_DATA", os.path.expanduser("~/.config/astrophotography_db"))
        cert_dir = Path(user_data) / "ssl"
        cert_path, key_path = ensure_ssl_certs(cert_dir)
        ssl_certfile = str(cert_path)
        ssl_keyfile = str(key_path)
    elif args.ssl_certfile and args.ssl_keyfile:
        ssl_certfile = args.ssl_certfile
        ssl_keyfile = args.ssl_keyfile

    # Run uvicorn programmatically
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
        workers=1,  # Keep it simple for desktop apps
        ssl_certfile=ssl_certfile,
        ssl_keyfile=ssl_keyfile,
    )