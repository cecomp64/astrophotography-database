from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    file_path = Column(String(1024), nullable=False, unique=True)
    file_name = Column(String(255), nullable=False)
    directory_path = Column(String(1024), nullable=False)
    date_taken = Column(DateTime(timezone=True), nullable=True)
    exposure_time = Column(Float, nullable=True)  # In seconds
    filter_name = Column(String(50), nullable=True)  # L, R, G, B, Ha, OIII, SII, etc.
    telescope = Column(String(255), nullable=True)
    camera = Column(String(255), nullable=True)
    gain = Column(Integer, nullable=True)
    iso = Column(Integer, nullable=True)
    binning = Column(String(10), nullable=True)  # 1x1, 2x2, etc.
    object_id = Column(Integer, ForeignKey("objects.id", ondelete="SET NULL"), nullable=True)
    fits_header = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    object = relationship("AstroObject", back_populates="images")

    __table_args__ = (
        Index("ix_images_file_path", "file_path"),
        Index("ix_images_date_taken", "date_taken"),
        Index("ix_images_object_id", "object_id"),
        Index("ix_images_filter_name", "filter_name"),
    )
