from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Project(Base):
    """A project groups astronomical objects and images. Exposure goals are per-target."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="active")  # active, completed, paused, archived
    priority = Column(Integer, nullable=False, default=0)  # Higher = more important
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    project_targets = relationship("ProjectTarget", back_populates="project", cascade="all, delete-orphan")
    project_images = relationship("ProjectImage", back_populates="project", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_projects_status", "status"),
    )


class ProjectTarget(Base):
    """Association table for project targets (astronomical objects) with per-target exposure goals."""
    __tablename__ = "project_targets"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    object_id = Column(Integer, ForeignKey("objects.id", ondelete="CASCADE"), nullable=False)
    is_primary = Column(Boolean, nullable=False, default=False)  # Primary target for visibility calculations
    exposure_goals = Column(JSONB, nullable=True)  # {"L": 36000, "Ha": 72000} in seconds
    notes = Column(Text, nullable=True)  # Per-target notes
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project = relationship("Project", back_populates="project_targets")
    object = relationship("AstroObject", back_populates="project_targets")

    __table_args__ = (
        UniqueConstraint("project_id", "object_id", name="uq_project_target"),
        Index("ix_project_targets_project_id", "project_id"),
        Index("ix_project_targets_object_id", "object_id"),
    )


class ProjectImage(Base):
    """Association table for project images (contribution tracking)."""
    __tablename__ = "project_images"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    image_id = Column(Integer, ForeignKey("images.id", ondelete="CASCADE"), nullable=False)
    added_manually = Column(Boolean, nullable=False, default=False)  # True if manually added, False if auto-detected
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project = relationship("Project", back_populates="project_images")
    image = relationship("Image", back_populates="project_images")

    __table_args__ = (
        UniqueConstraint("project_id", "image_id", name="uq_project_image"),
        Index("ix_project_images_project_id", "project_id"),
        Index("ix_project_images_image_id", "image_id"),
    )
