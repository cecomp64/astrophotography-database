"""Unify catalogue_objects with objects table

Revision ID: 003
Revises: 002
Create Date: 2024-01-15 00:00:00.000000

This migration:
- Adds size_major and size_minor columns to the objects table
- Drops the catalogue_objects table (data will be re-imported via CatalogueImporter)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add size columns to objects table
    op.add_column('objects', sa.Column('size_major', sa.Float(), nullable=True))
    op.add_column('objects', sa.Column('size_minor', sa.Float(), nullable=True))

    # Drop the catalogue_objects table - data will be re-imported as AstroObjects
    op.drop_table('catalogue_objects')


def downgrade() -> None:
    # Recreate catalogue_objects table
    op.create_table(
        'catalogue_objects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('catalog', sa.String(length=20), nullable=False),
        sa.Column('catalog_number', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('ra', sa.Float(), nullable=False),
        sa.Column('dec', sa.Float(), nullable=False),
        sa.Column('object_type', sa.String(length=100), nullable=True),
        sa.Column('size_major', sa.Float(), nullable=True),
        sa.Column('size_minor', sa.Float(), nullable=True),
        sa.Column('magnitude', sa.Float(), nullable=True),
        sa.Column('constellation', sa.String(length=100), nullable=True),
        sa.Column('extra_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('catalog', 'catalog_number', name='uq_catalog_entry')
    )
    op.create_index('ix_catalogue_objects_catalog', 'catalogue_objects', ['catalog'], unique=False)
    op.create_index('ix_catalogue_objects_ra_dec', 'catalogue_objects', ['ra', 'dec'], unique=False)

    # Remove size columns from objects table
    op.drop_column('objects', 'size_minor')
    op.drop_column('objects', 'size_major')
