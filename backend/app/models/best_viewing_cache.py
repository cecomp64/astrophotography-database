from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class BestViewingCache(Base):
    """Cache for pre-computed best viewing periods.

    Stores monthly visibility scores and peak season data per object/location/year.
    This avoids recalculating expensive visibility data that only changes yearly.
    """
    __tablename__ = "best_viewing_cache"

    id = Column(Integer, primary_key=True, index=True)
    object_id = Column(Integer, ForeignKey("objects.id", ondelete="CASCADE"), nullable=False, index=True)
    location_id = Column(String(100), nullable=False, index=True)  # Location ID from config
    year = Column(Integer, nullable=False)
    min_altitude = Column(Float, nullable=False, default=30.0)

    # Cached computation results (stored as JSON)
    monthly_summary = Column(JSON, nullable=False)  # List of monthly scores
    peak_season = Column(JSON, nullable=True)  # Peak season info or null

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    object = relationship("AstroObject")

    __table_args__ = (
        UniqueConstraint('object_id', 'location_id', 'year', 'min_altitude',
                        name='uq_best_viewing_cache_object_location_year_alt'),
    )
