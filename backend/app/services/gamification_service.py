import math
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import Achievement, Story, UserAchievement
from app.models.user import User

ACHIEVEMENTS_SEED = [
    {"code": "profile_complete", "title_key": "achievements.profile_complete", "description_key": "achievements.profile_complete_desc", "icon": "✨", "points_required": 10, "min_level": 1},
    {"code": "first_story", "title_key": "achievements.first_story", "description_key": "achievements.first_story_desc", "icon": "📸", "points_required": 15, "min_level": 1},
    {"code": "active_user", "title_key": "achievements.active_user", "description_key": "achievements.active_user_desc", "icon": "🔥", "points_required": 50, "min_level": 2},
    {"code": "veteran", "title_key": "achievements.veteran", "description_key": "achievements.veteran_desc", "icon": "⭐", "points_required": 0, "min_level": 5},
    {"code": "social", "title_key": "achievements.social", "description_key": "achievements.social_desc", "icon": "🤝", "points_required": 100, "min_level": 3},
]

POINTS = {
    "profile_update": 5,
    "avatar_upload": 10,
    "story_post": 15,
    "status_update": 3,
}


def calculate_level(points: int) -> int:
    return max(1, 1 + points // 100)


class GamificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    async def seed_achievements(db: AsyncSession) -> None:
        for item in ACHIEVEMENTS_SEED:
            result = await db.execute(select(Achievement).where(Achievement.code == item["code"]))
            if result.scalar_one_or_none():
                continue
            db.add(Achievement(**item))
        await db.commit()

    async def add_points(self, user: User, action: str) -> User:
        points = POINTS.get(action, 0)
        if points <= 0:
            return user
        user.activity_points += points
        user.level = calculate_level(user.activity_points)
        await self._check_achievements(user)
        await self.db.commit()
        return user

    async def _check_achievements(self, user: User) -> None:
        result = await self.db.execute(select(Achievement))
        all_achievements = result.scalars().all()

        earned_result = await self.db.execute(
            select(UserAchievement.achievement_id).where(UserAchievement.user_id == user.id)
        )
        earned_ids = set(earned_result.scalars().all())

        profile_complete = bool(user.display_name and user.bio and user.avatar_url)

        story_count_result = await self.db.execute(
            select(func.count()).select_from(Story).where(Story.user_id == user.id)
        )
        story_count = story_count_result.scalar() or 0

        for ach in all_achievements:
            if ach.id in earned_ids:
                continue
            qualifies = False
            if ach.code == "profile_complete" and profile_complete:
                qualifies = True
            elif ach.code == "first_story" and story_count >= 1:
                qualifies = True
            elif ach.code == "veteran":
                qualifies = user.level >= ach.min_level
            elif user.activity_points >= ach.points_required and user.level >= ach.min_level:
                qualifies = True

            if qualifies:
                self.db.add(UserAchievement(user_id=user.id, achievement_id=ach.id))

    async def get_user_gamification(self, user: User, lang: str = "ru") -> dict:
        from app.core.i18n import t

        result = await self.db.execute(
            select(Achievement, UserAchievement)
            .outerjoin(UserAchievement, (UserAchievement.achievement_id == Achievement.id) & (UserAchievement.user_id == user.id))
        )
        rows = result.all()

        achievements = []
        for ach, ua in rows:
            achievements.append({
                "code": ach.code,
                "title": t(ach.title_key, lang),
                "description": t(ach.description_key, lang),
                "icon": ach.icon,
                "earned": ua is not None,
                "earned_at": ua.earned_at.isoformat() if ua else None,
            })

        next_level_points = user.level * 100
        progress = user.activity_points - (user.level - 1) * 100
        progress_pct = min(100, int(progress / max(1, next_level_points - (user.level - 1) * 100) * 100))

        return {
            "activity_points": user.activity_points,
            "level": user.level,
            "next_level_at": user.level * 100,
            "progress_percent": progress_pct,
            "achievements": achievements,
        }
