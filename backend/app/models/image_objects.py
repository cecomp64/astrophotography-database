from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ImageObject(Base):
    """Association table for many-to-many relationship between images and objects."""
    __tablename__ = "image_objects"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True)
    object_id = Column(Integer, ForeignKey("objects.id", ondelete="CASCADE"), nullable=False, index=True)
    association_type = Column(String(50), nullable=False, default="in_fov", index=True)
    angular_distance = Column(Float, nullable=True)  # Distance from image center in arcminutes
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    image = relationship("Image", back_populates="image_objects")
    object = relationship("AstroObject", back_populates="image_objects")

    __table_args__ = (
        UniqueConstraint("image_id", "object_id", name="uq_image_object"),
    )
