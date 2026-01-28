"""Service for managing projects and calculating progress."""

from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import Project, ProjectTarget, ProjectImage, Image, ImageObject
from app.services.visibility_service import VisibilityService


class ProjectService:
    """Business logic for project management."""

    def __init__(self, db: Session):
        self.db = db

    def calculate_project_progress(self, project_id: int) -> Optional[dict]:
        """
        Calculate exposure progress for a project.

        Returns:
            dict with exposure goals, actual exposure, and progress percentages
        """
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None

        # Get all image IDs associated with this project
        project_images = self.db.query(ProjectImage).filter(
            ProjectImage.project_id == project_id
        ).all()
        image_ids = [pi.image_id for pi in project_images]

        if not image_ids:
            goals = project.exposure_goals or {}
            return {
                "exposure_goals": goals,
                "actual_exposure": {},
                "progress_percent": {f: 0.0 for f in goals},
                "overall_progress": 0.0,
                "total_frames": 0,
                "total_exposure_seconds": 0.0,
            }

        # Aggregate exposure by filter
        exposure_by_filter = (
            self.db.query(
                Image.filter_name,
                func.sum(Image.exposure_time).label("total_exposure"),
                func.count(Image.id).label("frame_count")
            )
            .filter(Image.id.in_(image_ids))
            .group_by(Image.filter_name)
            .all()
        )

        actual = {}
        total_frames = 0
        for row in exposure_by_filter:
            filter_name = row.filter_name or "Unknown"
            actual[filter_name] = float(row.total_exposure or 0)
            total_frames += row.frame_count

        goals = project.exposure_goals or {}

        # Calculate progress percentages
        progress = {}
        for filter_name, goal in goals.items():
            actual_val = actual.get(filter_name, 0)
            progress[filter_name] = min(100.0, (actual_val / goal) * 100) if goal > 0 else 0

        # Calculate overall progress (average of goal filters)
        overall = sum(progress.values()) / len(progress) if progress else 0.0

        return {
            "exposure_goals": goals,
            "actual_exposure": actual,
            "progress_percent": {f: round(p, 1) for f, p in progress.items()},
            "overall_progress": round(overall, 1),
            "total_frames": total_frames,
            "total_exposure_seconds": sum(actual.values()),
        }

    def auto_link_images(self, project_id: int) -> int:
        """
        Automatically link images to project based on target objects.

        Finds all images that have a primary association with any of the
        project's target objects and links them to the project.

        Returns:
            Count of newly linked images
        """
        # Get project target object IDs
        target_object_ids = [
            pt.object_id for pt in
            self.db.query(ProjectTarget).filter(
                ProjectTarget.project_id == project_id
            ).all()
        ]

        if not target_object_ids:
            return 0

        # Find images that have these objects as primary targets
        image_ids = (
            self.db.query(ImageObject.image_id)
            .filter(
                ImageObject.object_id.in_(target_object_ids),
                ImageObject.association_type == "primary"
            )
            .distinct()
            .all()
        )

        # Get already linked image IDs
        existing_links = set(
            pi.image_id for pi in
            self.db.query(ProjectImage.image_id).filter(
                ProjectImage.project_id == project_id
            ).all()
        )

        # Link new images
        linked_count = 0
        for (image_id,) in image_ids:
            if image_id not in existing_links:
                self.db.add(ProjectImage(
                    project_id=project_id,
                    image_id=image_id,
                    added_manually=False
                ))
                linked_count += 1

        if linked_count > 0:
            self.db.commit()

        return linked_count

    def get_primary_target(self, project: Project) -> Optional[ProjectTarget]:
        """Get the primary target for a project, or first target if none marked primary."""
        if not project.project_targets:
            return None

        for pt in project.project_targets:
            if pt.is_primary:
                return pt

        return project.project_targets[0]

    def get_recommended_filter(self, progress: Optional[dict]) -> Optional[str]:
        """
        Determine which filter to shoot based on lowest progress.

        Returns:
            Filter name with lowest progress, or None
        """
        if not progress or not progress.get("progress_percent"):
            return None

        incomplete = [
            (f, p) for f, p in progress["progress_percent"].items()
            if p < 100
        ]

        if not incomplete:
            return None

        # Return filter with lowest progress
        return min(incomplete, key=lambda x: x[1])[0]

    def get_well_placed_projects(
        self,
        visibility_service: VisibilityService,
        status_filter: Optional[str] = "active",
        limit: int = 10,
    ) -> List[dict]:
        """
        Get projects that are well-placed for imaging tonight.

        Ranks by: visibility score, incomplete filters, priority.

        Returns:
            List of dicts with project, visibility, and progress info
        """
        query = self.db.query(Project)
        if status_filter:
            query = query.filter(Project.status == status_filter)

        projects = query.all()

        results = []
        for project in projects:
            # Get primary target
            primary_target = self.get_primary_target(project)

            if not primary_target or not primary_target.object:
                continue

            obj = primary_target.object
            if obj.ra is None or obj.dec is None:
                continue

            # Calculate visibility
            visibility = visibility_service.calculate_object_visibility(obj.ra, obj.dec)

            if not visibility.get("is_visible_tonight"):
                continue

            # Calculate progress
            progress = self.calculate_project_progress(project.id)
            overall_progress = progress.get("overall_progress", 0) if progress else 0

            # Get recommended filter
            recommended_filter = self.get_recommended_filter(progress)

            # Calculate imaging score
            score = visibility_service.calculate_imaging_score(
                ra=obj.ra,
                dec=obj.dec,
                project_progress=overall_progress,
                priority=project.priority,
            )

            results.append({
                "project_id": project.id,
                "project_name": project.name,
                "project_status": project.status,
                "primary_target_name": obj.primary_name,
                "primary_target_id": obj.id,
                "visibility": {
                    "is_visible_tonight": visibility.get("is_visible_tonight", False),
                    "current_altitude": visibility.get("current_altitude"),
                    "max_altitude": visibility.get("max_altitude"),
                    "transit_time": visibility.get("transit_time"),
                    "hours_above_min_altitude": visibility.get("hours_above_min_altitude"),
                    "rise_time": visibility.get("rise_time"),
                    "set_time": visibility.get("set_time"),
                },
                "overall_progress": overall_progress,
                "recommended_filter": recommended_filter,
                "score": score,
            })

        # Sort by score descending
        results.sort(key=lambda x: x["score"], reverse=True)

        return results[:limit]
