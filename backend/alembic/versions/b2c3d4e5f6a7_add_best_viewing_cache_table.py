"""Add best_viewing_cache table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-22

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('best_viewing_cache',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('object_id', sa.Integer(), nullable=False),
        sa.Column('location_id', sa.String(length=100), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('min_altitude', sa.Float(), nullable=False),
        sa.Column('monthly_summary', sa.JSON(), nullable=False),
        sa.Column('peak_season', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['object_id'], ['objects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('object_id', 'location_id', 'year', 'min_altitude',
                           name='uq_best_viewing_cache_object_location_year_alt')
    )
    with op.batch_alter_table('best_viewing_cache', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_best_viewing_cache_id'), ['id'], unique=False)
        batch_op.create_index('ix_best_viewing_cache_object_id', ['object_id'], unique=False)
        batch_op.create_index('ix_best_viewing_cache_location_id', ['location_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('best_viewing_cache', schema=None) as batch_op:
        batch_op.drop_index('ix_best_viewing_cache_location_id')
        batch_op.drop_index('ix_best_viewing_cache_object_id')
        batch_op.drop_index(batch_op.f('ix_best_viewing_cache_id'))

    op.drop_table('best_viewing_cache')
