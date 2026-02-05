"""Add object_showcases table

Revision ID: a1b2c3d4e5f6
Revises: c94f2a1e8d37
Create Date: 2026-02-04

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'c94f2a1e8d37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('object_showcases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('object_id', sa.Integer(), nullable=False),
        sa.Column('source_type', sa.String(length=20), nullable=False),
        sa.Column('file_path', sa.String(length=1024), nullable=False),
        sa.Column('original_image_id', sa.Integer(), nullable=True),
        sa.Column('survey_name', sa.String(length=100), nullable=True),
        sa.Column('cached_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['object_id'], ['objects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['original_image_id'], ['images.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('object_id', name='uq_object_showcase')
    )
    with op.batch_alter_table('object_showcases', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_object_showcases_id'), ['id'], unique=False)
        batch_op.create_index('ix_object_showcases_object_id', ['object_id'], unique=True)


def downgrade() -> None:
    with op.batch_alter_table('object_showcases', schema=None) as batch_op:
        batch_op.drop_index('ix_object_showcases_object_id')
        batch_op.drop_index(batch_op.f('ix_object_showcases_id'))

    op.drop_table('object_showcases')
