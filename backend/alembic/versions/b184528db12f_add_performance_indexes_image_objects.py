"""add_performance_indexes_image_objects

Revision ID: b184528db12f
Revises: daf2ec8b9456
Create Date: 2026-02-02 19:56:02.990465

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b184528db12f'
down_revision: Union[str, None] = 'daf2ec8b9456'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Index on object_id for fast lookups by object (critical for image count queries)
    op.create_index('ix_image_objects_object_id', 'image_objects', ['object_id'])
    # Index on image_id for fast lookups by image
    op.create_index('ix_image_objects_image_id', 'image_objects', ['image_id'])
    # Index on association_type for filtering primary vs in_fov
    op.create_index('ix_image_objects_association_type', 'image_objects', ['association_type'])
    # Composite index for the common query: find primary objects with their counts
    op.create_index('ix_image_objects_object_assoc', 'image_objects', ['object_id', 'association_type'])


def downgrade() -> None:
    op.drop_index('ix_image_objects_object_assoc', 'image_objects')
    op.drop_index('ix_image_objects_association_type', 'image_objects')
    op.drop_index('ix_image_objects_image_id', 'image_objects')
    op.drop_index('ix_image_objects_object_id', 'image_objects')
