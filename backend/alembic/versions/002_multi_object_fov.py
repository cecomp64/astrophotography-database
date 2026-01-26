"""Add multi-object FOV support

Revision ID: 002
Revises: 001
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add FOV-related columns to images table
    op.add_column('images', sa.Column('ra', sa.Float(), nullable=True))
    op.add_column('images', sa.Column('dec', sa.Float(), nullable=True))
    op.add_column('images', sa.Column('pixel_size_x', sa.Float(), nullable=True))
    op.add_column('images', sa.Column('pixel_size_y', sa.Float(), nullable=True))
    op.add_column('images', sa.Column('image_width', sa.Integer(), nullable=True))
    op.add_column('images', sa.Column('image_height', sa.Integer(), nullable=True))
    op.add_column('images', sa.Column('focal_length', sa.Float(), nullable=True))
    op.add_column('images', sa.Column('fov_width', sa.Float(), nullable=True))
    op.add_column('images', sa.Column('fov_height', sa.Float(), nullable=True))

    # Create image_objects association table for many-to-many
    op.create_table(
        'image_objects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('image_id', sa.Integer(), nullable=False),
        sa.Column('object_id', sa.Integer(), nullable=False),
        sa.Column('association_type', sa.String(length=50), nullable=False, server_default='in_fov'),
        sa.Column('angular_distance', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['image_id'], ['images.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['object_id'], ['objects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('image_id', 'object_id', name='uq_image_object')
    )
    op.create_index('ix_image_objects_image_id', 'image_objects', ['image_id'], unique=False)
    op.create_index('ix_image_objects_object_id', 'image_objects', ['object_id'], unique=False)
    op.create_index('ix_image_objects_association_type', 'image_objects', ['association_type'], unique=False)

    # Create catalogue_objects table for NGC, IC, LDN, LBN data
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
        sa.Column('extra_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('catalog', 'catalog_number', name='uq_catalog_entry')
    )
    op.create_index('ix_catalogue_objects_catalog', 'catalogue_objects', ['catalog'], unique=False)
    op.create_index('ix_catalogue_objects_ra_dec', 'catalogue_objects', ['ra', 'dec'], unique=False)

    # Migrate existing object_id relationships to image_objects
    op.execute("""
        INSERT INTO image_objects (image_id, object_id, association_type)
        SELECT id, object_id, 'primary'
        FROM images
        WHERE object_id IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_table('catalogue_objects')
    op.drop_table('image_objects')
    op.drop_column('images', 'fov_height')
    op.drop_column('images', 'fov_width')
    op.drop_column('images', 'focal_length')
    op.drop_column('images', 'image_height')
    op.drop_column('images', 'image_width')
    op.drop_column('images', 'pixel_size_y')
    op.drop_column('images', 'pixel_size_x')
    op.drop_column('images', 'dec')
    op.drop_column('images', 'ra')
