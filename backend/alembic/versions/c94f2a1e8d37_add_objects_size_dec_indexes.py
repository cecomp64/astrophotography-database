"""Add objects size and declination indexes

Revision ID: c94f2a1e8d37
Revises: b83c8ea7025b
Create Date: 2026-02-03

"""
from typing import Sequence, Union
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c94f2a1e8d37'
down_revision: Union[str, None] = 'b83c8ea7025b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Index on size_major for filtering by object size (well-placed endpoint)
    with op.batch_alter_table('objects', schema=None) as batch_op:
        batch_op.create_index('ix_objects_size_major', ['size_major'], unique=False)
        # Index on declination for pre-filtering by visibility
        batch_op.create_index('ix_objects_dec', ['dec'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('objects', schema=None) as batch_op:
        batch_op.drop_index('ix_objects_dec')
        batch_op.drop_index('ix_objects_size_major')
