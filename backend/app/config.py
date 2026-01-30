import os
from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    # Default for local development
    database_url: str = "sqlite:///./astrophotography.db"
    telescopius_api_key: str = ""

    def __init__(self, **values):
        super().__init__(**values)

        # Check if Electron sent us a specific data directory
        user_data_dir = os.getenv("APP_USER_DATA")
        
        if user_data_dir:
            # Ensure the directory exists
            os.makedirs(user_data_dir, exist_ok=True)
            
            # Construct the absolute path for SQLite
            # sqlite://// (4 slashes) indicates an absolute path
            db_path = os.path.join(user_data_dir, "astrophotography.db")
            self.database_url = f"sqlite:///{db_path}"

def get_settings():
    return Settings()