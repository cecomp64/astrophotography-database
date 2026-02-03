"""Add telescope camera and grouped indexes

Revision ID: b83c8ea7025b
Revises: b184528db12f
Create Date: 2026-02-02 20:41:25.449127

"""
from typing import Sequence, Union
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b83c8ea7025b'
down_revision: Union[str, None] = 'b184528db12f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add indexes for telescope and camera filtering
    with op.batch_alter_table('images', schema=None) as batch_op:
        batch_op.create_index('ix_images_camera', ['camera'], unique=False)
        batch_op.create_index('ix_images_telescope', ['telescope'], unique=False)
        # Composite index for grouped queries
        batch_op.create_index('ix_images_grouped', ['date_taken', 'object_id', 'telescope'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('images', schema=None) as batch_op:
        batch_op.drop_index('ix_images_grouped')
        batch_op.drop_index('ix_images_telescope')
        batch_op.drop_index('ix_images_camera')
