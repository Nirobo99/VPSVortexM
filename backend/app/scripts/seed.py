import asyncio

from app.core.database import AsyncSessionLocal
from app.services.auth_service import AuthService
from app.services.admin_auth_service import AdminAuthService
from app.services.gamification_service import GamificationService


async def main() -> None:
    async with AsyncSessionLocal() as db:
        user = await AuthService.create_superadmin(db)
        if user:
            print(f"Superadmin created: {user.username}")
            await AdminAuthService(db).ensure_superadmin_account(user)
            print("Superadmin admin account ensured")
        else:
            print("Superadmin already exists")
            from sqlalchemy import select
            from app.core.permissions import SUPERADMIN_USERNAME
            from app.models.user import User
            result = await db.execute(select(User).where(User.username == SUPERADMIN_USERNAME))
            existing = result.scalar_one_or_none()
            if existing:
                await AdminAuthService(db).ensure_superadmin_account(existing)
        await GamificationService.seed_achievements(db)
        print("Achievements seeded")


if __name__ == "__main__":
    asyncio.run(main())
