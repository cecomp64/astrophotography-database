"""Initial migration

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pg_trgm extension for fuzzy search
    op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')

    # Create objects table
    op.create_table(
        'objects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('primary_name', sa.String(length=255), nullable=False),
        sa.Column('ra', sa.Float(), nullable=True),
        sa.Column('dec', sa.Float(), nullable=True),
        sa.Column('object_type', sa.String(length=100), nullable=True),
        sa.Column('magnitude', sa.Float(), nullable=True),
        sa.Column('constellation', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_objects_id', 'objects', ['id'], unique=False)
    op.create_index('ix_objects_primary_name', 'objects', ['primary_name'], unique=False)

    # Create object_aliases table
    op.create_table(
        'object_aliases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('object_id', sa.Integer(), nullable=False),
        sa.Column('alias_name', sa.String(length=255), nullable=False),
        sa.Column('catalog', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['object_id'], ['objects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_object_aliases_id', 'object_aliases', ['id'], unique=False)
    op.create_index('ix_object_aliases_alias_name', 'object_aliases', ['alias_name'], unique=False)

    # Create images table
    op.create_table(
        'images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.String(length=1024), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('directory_path', sa.String(length=1024), nullable=False),
        sa.Column('date_taken', sa.DateTime(timezone=True), nullable=True),
        sa.Column('exposure_time', sa.Float(), nullable=True),
        sa.Column('filter_name', sa.String(length=50), nullable=True),
        sa.Column('telescope', sa.String(length=255), nullable=True),
        sa.Column('camera', sa.String(length=255), nullable=True),
        sa.Column('gain', sa.Integer(), nullable=True),
        sa.Column('iso', sa.Integer(), nullable=True),
        sa.Column('binning', sa.String(length=10), nullable=True),
        sa.Column('object_id', sa.Integer(), nullable=True),
        sa.Column('fits_header', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['object_id'], ['objects.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('file_path')
    )
    op.create_index('ix_images_id', 'images', ['id'], unique=False)
    op.create_index('ix_images_file_path', 'images', ['file_path'], unique=False)
    op.create_index('ix_images_date_taken', 'images', ['date_taken'], unique=False)
    op.create_index('ix_images_object_id', 'images', ['object_id'], unique=False)
    op.create_index('ix_images_filter_name', 'images', ['filter_name'], unique=False)


def downgrade() -> None:
    op.drop_table('images')
    op.drop_table('object_aliases')
    op.drop_table('objects')
