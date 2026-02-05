from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ObjectShowcase(Base):
    """Showcase image for an astronomical object.

    Each object can have one showcase image from three sources:
    - 'upload': User-uploaded JPEG/PNG image
    - 'indexed': Thumbnail generated from an indexed FITS image
    - 'survey': Image fetched from SkyView survey API
    """
    __tablename__ = "object_showcases"

    id = Column(Integer, primary_key=True, index=True)
    object_id = Column(
        Integer,
        ForeignKey("objects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True
    )
    source_type = Column(String(20), nullable=False)  # 'upload', 'indexed', 'survey'
    file_path = Column(String(1024), nullable=False)  # Relative path within showcases directory
    original_image_id = Column(
        Integer,
        ForeignKey("images.id", ondelete="SET NULL"),
        nullable=True
    )  # For indexed source - references the FITS image
    survey_name = Column(String(100), nullable=True)  # e.g., 'DSS2 Red' for survey images
    cached_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    object = relationship("AstroObject", back_populates="showcase")
    original_image = relationship("Image", foreign_keys=[original_image_id])

    __table_args__ = (
        UniqueConstraint("object_id", name="uq_object_showcase"),
    )
