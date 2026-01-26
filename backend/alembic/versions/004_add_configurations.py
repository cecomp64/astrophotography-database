"""Add configurations table

Revision ID: 004
Revises: 003
Create Date: 2024-01-26 00:00:00.000000

This migration adds a configurations table to store application settings
such as observatory location (latitude, longitude, elevation).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'configurations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('value', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key')
    )
    op.create_index('ix_configurations_id', 'configurations', ['id'], unique=False)
    op.create_index('ix_configurations_key', 'configurations', ['key'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_configurations_key', table_name='configurations')
    op.drop_index('ix_configurations_id', table_name='configurations')
    op.drop_table('configurations')
