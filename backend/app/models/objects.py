from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class AstroObject(Base):
    __tablename__ = "objects"

    id = Column(Integer, primary_key=True, index=True)
    primary_name = Column(String(255), nullable=False, index=True)
    ra = Column(Float, nullable=True)  # Right ascension in degrees
    dec = Column(Float, nullable=True)  # Declination in degrees
    object_type = Column(String(100), nullable=True)  # galaxy, nebula, cluster, etc.
    magnitude = Column(Float, nullable=True)
    size_major = Column(Float, nullable=True)  # Major axis in arcminutes
    size_minor = Column(Float, nullable=True)  # Minor axis in arcminutes
    constellation = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    aliases = relationship("ObjectAlias", back_populates="object", cascade="all, delete-orphan")
    images = relationship("Image", back_populates="object")  # Legacy via object_id FK
    image_objects = relationship("ImageObject", back_populates="object", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_objects_primary_name_trgm", "primary_name", postgresql_using="gin",
              postgresql_ops={"primary_name": "gin_trgm_ops"}),
    )


class ObjectAlias(Base):
    __tablename__ = "object_aliases"

    id = Column(Integer, primary_key=True, index=True)
    object_id = Column(Integer, ForeignKey("objects.id", ondelete="CASCADE"), nullable=False)
    alias_name = Column(String(255), nullable=False, index=True)
    catalog = Column(String(100), nullable=True)  # Messier, NGC, IC, Sharpless, etc.
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    object = relationship("AstroObject", back_populates="aliases")

    __table_args__ = (
        Index("ix_object_aliases_alias_name_trgm", "alias_name", postgresql_using="gin",
              postgresql_ops={"alias_name": "gin_trgm_ops"}),
    )
