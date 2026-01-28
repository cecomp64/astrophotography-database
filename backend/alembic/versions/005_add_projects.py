"""Add projects tables

Revision ID: 005
Revises: 004
Create Date: 2025-01-27 00:00:00.000000

This migration adds projects, project_targets, and project_images tables
for tracking imaging projects with exposure goals and visibility planning.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create projects table
    op.create_table(
        'projects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='active'),
        sa.Column('exposure_goals', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_projects_id', 'projects', ['id'], unique=False)
    op.create_index('ix_projects_name', 'projects', ['name'], unique=False)
    op.create_index('ix_projects_status', 'projects', ['status'], unique=False)

    # Create project_targets table (many-to-many: projects <-> objects)
    op.create_table(
        'project_targets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('object_id', sa.Integer(), nullable=False),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('exposure_goals', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['object_id'], ['objects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'object_id', name='uq_project_target')
    )
    op.create_index('ix_project_targets_id', 'project_targets', ['id'], unique=False)
    op.create_index('ix_project_targets_project_id', 'project_targets', ['project_id'], unique=False)
    op.create_index('ix_project_targets_object_id', 'project_targets', ['object_id'], unique=False)

    # Create project_images table (many-to-many: projects <-> images)
    op.create_table(
        'project_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('image_id', sa.Integer(), nullable=False),
        sa.Column('added_manually', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['image_id'], ['images.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'image_id', name='uq_project_image')
    )
    op.create_index('ix_project_images_id', 'project_images', ['id'], unique=False)
    op.create_index('ix_project_images_project_id', 'project_images', ['project_id'], unique=False)
    op.create_index('ix_project_images_image_id', 'project_images', ['image_id'], unique=False)


def downgrade() -> None:
    # Drop project_images table
    op.drop_index('ix_project_images_image_id', table_name='project_images')
    op.drop_index('ix_project_images_project_id', table_name='project_images')
    op.drop_index('ix_project_images_id', table_name='project_images')
    op.drop_table('project_images')

    # Drop project_targets table
    op.drop_index('ix_project_targets_object_id', table_name='project_targets')
    op.drop_index('ix_project_targets_project_id', table_name='project_targets')
    op.drop_index('ix_project_targets_id', table_name='project_targets')
    op.drop_table('project_targets')

    # Drop projects table
    op.drop_index('ix_projects_status', table_name='projects')
    op.drop_index('ix_projects_name', table_name='projects')
    op.drop_index('ix_projects_id', table_name='projects')
    op.drop_table('projects')
