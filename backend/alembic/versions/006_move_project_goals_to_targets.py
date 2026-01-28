"""Move exposure_goals and notes from projects to targets

Revision ID: 006
Revises: 005
Create Date: 2025-01-27 00:00:00.000000

This migration removes exposure_goals and notes from the projects table,
as these are now specified per-target on the project_targets table.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '006'
down_revision: Union[str, None] = '005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove exposure_goals and notes columns from projects table
    op.drop_column('projects', 'exposure_goals')
    op.drop_column('projects', 'notes')


def downgrade() -> None:
    # Re-add exposure_goals and notes columns to projects table
    op.add_column('projects', sa.Column('notes', sa.Text(), nullable=True))
    op.add_column('projects', sa.Column('exposure_goals', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
