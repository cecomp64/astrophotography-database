from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context
import os
import sys
import logging

logger = logging.getLogger("alembic.env")

# Add the parent directory to sys.path so we can import 'app'
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import your settings and models
from app.config import get_settings
from app.database import Base
# Importing models ensures they are registered on Base.metadata
from app.models import AstroObject, ObjectAlias, Image 

# Alembic Config object
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def get_url():
    """
    Retrieves the URL from app settings. 
    This ensures Alembic uses the same SQLite path as the main app.
    """
    settings = get_settings()
    return settings.database_url

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True  # Required for SQLite Alter Table support
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    
    # 1. Check if we passed an existing connection from main.py
    # context.config.attributes is where we injected the connection
    connectable = config.attributes.get("connection", None)

    if connectable is not None:
        # PATH A: Use the existing connection (Prevents Deadlock)
        logger.info("Alembic using existing connection from context attributes.")
        context.configure(
            connection=connectable,
            target_metadata=target_metadata,
            render_as_batch=True
        )

        with context.begin_transaction():
            context.run_migrations()
            
    else:
        # PATH B: Standard behavior for CLI (e.g., 'alembic upgrade head')
        logger.info("Alembic creating new engine from config.")
        configuration = config.get_section(config.config_ini_section) or {}
        configuration["sqlalchemy.url"] = get_url()

        connectable = engine_from_config(
            configuration,
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )

        with connectable.connect() as connection:
            context.configure(
                connection=connection, 
                target_metadata=target_metadata,
                render_as_batch=True
            )

            with context.begin_transaction():
                context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()