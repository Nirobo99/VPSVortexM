from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.router import api_router
from app.api.ws import router as ws_router
from app.core.config import get_settings
from app.core.csrf import SAFE_METHODS, compare_csrf_tokens, generate_csrf_token
from app.core.database import AsyncSessionLocal
from app.core.i18n import t
from app.core.ip_helper import get_client_ip
from app.core.logging_filters import configure_sensitive_logging
from app.core.rate_limit import RateLimitService
from app.core.redis_client import close_redis
from app.core.security import verify_token
from app.services.admin_service import AdminService

settings = get_settings()
logger = logging.getLogger(__name__)


def _rate_limit_key(request: Request) -> str:
    return get_client_ip(request)


limiter = Limiter(key_func=_rate_limit_key)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_sensitive_logging()
    # Soft schema repairs so a failed alembic run does not keep the API offline.
    # Each statement is separate so one failure does not skip the rest.
    repairs = [
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'dialogs'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'dialogs' AND column_name = 'is_public'
          ) THEN
            ALTER TABLE dialogs
              ADD COLUMN is_public boolean NOT NULL DEFAULT false;
            UPDATE dialogs
              SET is_public = true
              WHERE dialog_type::text ILIKE 'group';
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'is_official_verified'
          ) THEN
            ALTER TABLE users
              ADD COLUMN is_official_verified boolean NOT NULL DEFAULT false;
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'profile_posts'
          ) THEN
            CREATE TABLE profile_posts (
              id uuid PRIMARY KEY,
              user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              media_url varchar(512),
              media_type varchar(16) NOT NULL DEFAULT 'text',
              text text,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS ix_profile_posts_user_id ON profile_posts (user_id);
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'profile_posts'
              AND column_name = 'media_type'
              AND udt_name = 'profilepostmediatype'
          ) THEN
            ALTER TABLE profile_posts ALTER COLUMN media_type DROP DEFAULT;
            ALTER TABLE profile_posts
              ALTER COLUMN media_type TYPE varchar(16)
              USING lower(media_type::text);
            ALTER TABLE profile_posts ALTER COLUMN media_type SET DEFAULT 'text';
            DROP TYPE IF EXISTS profilepostmediatype;
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'profile_post_comments'
          ) THEN
            CREATE TABLE profile_post_comments (
              id uuid PRIMARY KEY,
              post_id uuid NOT NULL REFERENCES profile_posts(id) ON DELETE CASCADE,
              author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              content text NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS ix_profile_post_comments_post_id
              ON profile_post_comments (post_id);
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'channels'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'channels' AND column_name = 'is_verified'
          ) THEN
            ALTER TABLE channels
              ADD COLUMN is_verified boolean NOT NULL DEFAULT false;
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
          ) THEN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'notify_messages'
            ) THEN
              ALTER TABLE users ADD COLUMN notify_messages boolean NOT NULL DEFAULT true;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'notify_calls'
            ) THEN
              ALTER TABLE users ADD COLUMN notify_calls boolean NOT NULL DEFAULT true;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'notify_channels'
            ) THEN
              ALTER TABLE users ADD COLUMN notify_channels boolean NOT NULL DEFAULT true;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'notify_sound'
            ) THEN
              ALTER TABLE users ADD COLUMN notify_sound boolean NOT NULL DEFAULT true;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'chat_auto_clear_hours'
            ) THEN
              ALTER TABLE users ADD COLUMN chat_auto_clear_hours integer;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'chat_appearance'
            ) THEN
              ALTER TABLE users ADD COLUMN chat_appearance varchar(32) NOT NULL DEFAULT 'default';
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'prefer_encrypted_chats'
            ) THEN
              ALTER TABLE users ADD COLUMN prefer_encrypted_chats boolean NOT NULL DEFAULT false;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'calls_audio_enabled'
            ) THEN
              ALTER TABLE users ADD COLUMN calls_audio_enabled boolean NOT NULL DEFAULT true;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'calls_video_enabled'
            ) THEN
              ALTER TABLE users ADD COLUMN calls_video_enabled boolean NOT NULL DEFAULT true;
            END IF;
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'dialog_participants'
          ) THEN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'dialog_participants' AND column_name = 'ban_reason'
            ) THEN
              ALTER TABLE dialog_participants ADD COLUMN ban_reason varchar(32);
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'dialog_participants' AND column_name = 'banned_until'
            ) THEN
              ALTER TABLE dialog_participants ADD COLUMN banned_until timestamptz;
            END IF;
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'vmoney_balance'
          ) THEN
            ALTER TABLE users
              ADD COLUMN vmoney_balance integer NOT NULL DEFAULT 0;
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'wallet_transactions'
              AND column_name = 'transaction_type'
              AND udt_name = 'transactiontype'
          ) THEN
            ALTER TABLE wallet_transactions ALTER COLUMN transaction_type DROP DEFAULT;
            ALTER TABLE wallet_transactions
              ALTER COLUMN transaction_type TYPE varchar(16)
              USING lower(transaction_type::text);
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'channel_posts'
              AND column_name = 'post_type'
              AND udt_name = 'posttype'
          ) THEN
            ALTER TABLE channel_posts ALTER COLUMN post_type DROP DEFAULT;
            ALTER TABLE channel_posts
              ALTER COLUMN post_type TYPE varchar(16)
              USING lower(post_type::text);
            ALTER TABLE channel_posts ALTER COLUMN post_type SET DEFAULT 'text';
            DROP TYPE IF EXISTS posttype;
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'channels'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'channel_posts'
          ) THEN
            CREATE TABLE channel_posts (
              id uuid PRIMARY KEY,
              channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
              author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              post_type varchar(16) NOT NULL DEFAULT 'text',
              content text,
              media_url varchar(512),
              media_type varchar(64),
              is_paid boolean NOT NULL DEFAULT false,
              price integer NOT NULL DEFAULT 0,
              is_pinned boolean NOT NULL DEFAULT false,
              is_announcement boolean NOT NULL DEFAULT false,
              views_count integer NOT NULL DEFAULT 0,
              created_at timestamptz NOT NULL DEFAULT now(),
              edited_at timestamptz
            );
            CREATE INDEX IF NOT EXISTS ix_channel_posts_channel_id ON channel_posts (channel_id);
            CREATE INDEX IF NOT EXISTS ix_channel_posts_created_at ON channel_posts (created_at);
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'channel_posts'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'post_comments'
          ) THEN
            CREATE TABLE post_comments (
              id uuid PRIMARY KEY,
              post_id uuid NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
              author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              content text NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS ix_post_comments_post_id ON post_comments (post_id);
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'channel_posts'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'post_reactions'
          ) THEN
            CREATE TABLE post_reactions (
              id uuid PRIMARY KEY,
              post_id uuid NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
              user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              emoji varchar(16) NOT NULL,
              created_at timestamptz NOT NULL DEFAULT now(),
              CONSTRAINT uq_post_reaction UNIQUE (post_id, user_id, emoji)
            );
            CREATE INDEX IF NOT EXISTS ix_post_reactions_post_id ON post_reactions (post_id);
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'channel_posts'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'poll_options'
          ) THEN
            CREATE TABLE poll_options (
              id uuid PRIMARY KEY,
              post_id uuid NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
              text varchar(256) NOT NULL,
              votes_count integer NOT NULL DEFAULT 0,
              is_correct boolean NOT NULL DEFAULT false
            );
            CREATE INDEX IF NOT EXISTS ix_poll_options_post_id ON poll_options (post_id);
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'channel_posts'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'post_events'
          ) THEN
            CREATE TABLE post_events (
              id uuid PRIMARY KEY,
              post_id uuid NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE UNIQUE,
              starts_at timestamptz NOT NULL,
              ends_at timestamptz,
              location varchar(256)
            );
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          ALTER TABLE users ADD COLUMN IF NOT EXISTS sticker_extra_slots integer NOT NULL DEFAULT 0;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until timestamptz;
          BEGIN
            ALTER TABLE wallet_transactions ALTER COLUMN transaction_type TYPE varchar(32);
          EXCEPTION WHEN others THEN NULL;
          END;
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'messagetype') THEN
            BEGIN
              ALTER TYPE messagetype ADD VALUE IF NOT EXISTS 'sticker';
            EXCEPTION WHEN others THEN NULL;
            END;
          END IF;
        END $$;
        """,
        """
        DO $$
        BEGIN
          BEGIN
            CREATE TYPE moderationstatus AS ENUM ('pending', 'approved', 'rejected', 'draft');
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
          CREATE TABLE IF NOT EXISTS sticker_packs (
            id uuid PRIMARY KEY,
            creator_id uuid REFERENCES users(id) ON DELETE SET NULL,
            name varchar(128) NOT NULL,
            description text,
            price numeric(12,2) NOT NULL DEFAULT 0,
            is_official boolean NOT NULL DEFAULT false,
            is_active boolean NOT NULL DEFAULT false,
            cover_image_url varchar(512),
            purchase_count integer NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS ix_sticker_packs_creator_id ON sticker_packs (creator_id);
          CREATE TABLE IF NOT EXISTS stickers (
            id uuid PRIMARY KEY,
            pack_id uuid NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
            image_url varchar(512) NOT NULL,
            sort_order integer NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS ix_stickers_pack_id ON stickers (pack_id);
          CREATE TABLE IF NOT EXISTS user_sticker_packs (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            pack_id uuid NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
            purchased_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE (user_id, pack_id)
          );
          CREATE INDEX IF NOT EXISTS ix_user_sticker_packs_user_id ON user_sticker_packs (user_id);
          CREATE TABLE IF NOT EXISTS sticker_pack_moderations (
            id uuid PRIMARY KEY,
            pack_id uuid NOT NULL UNIQUE REFERENCES sticker_packs(id) ON DELETE CASCADE,
            status moderationstatus NOT NULL DEFAULT 'pending',
            reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
            reviewed_at timestamptz,
            rejection_reason text
          );
        END $$;
        """,
        """
        DO $$
        BEGIN
          ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_bonus_earned integer NOT NULL DEFAULT 0;
          CREATE TABLE IF NOT EXISTS referral_bonuses (
            id uuid PRIMARY KEY,
            referrer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            referred_user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            purchase_amount integer NOT NULL,
            bonus_amount integer NOT NULL,
            purchase_type varchar(64),
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS ix_referral_bonuses_referrer_id ON referral_bonuses (referrer_id);
          CREATE INDEX IF NOT EXISTS ix_referral_bonuses_referred_user_id ON referral_bonuses (referred_user_id);
          UPDATE users
          SET referral_code = UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8))
          WHERE referral_code IS NULL OR referral_code = '';
        END $$;
        """,
        """
        DO $$
        BEGIN
          ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name_highlighted boolean NOT NULL DEFAULT false;
        END $$;
        """,
    ]
    try:
        from sqlalchemy import text

        async with AsyncSessionLocal() as db:
            for sql in repairs:
                try:
                    await db.execute(text(sql))
                    await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("Soft schema repair step failed")
    except Exception:
        logger.exception("Soft schema repair skipped")

    # Official support account for purchase / expiry notifications.
    try:
        from app.services.support_notify_service import SupportNotifyService

        async with AsyncSessionLocal() as db:
            await SupportNotifyService.ensure_support_user(db)
    except Exception:
        logger.exception("Support user bootstrap skipped")

    yield
    await close_redis()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.app_env != "development":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    if request.url.path.startswith(settings.api_prefix):
        response.headers["Content-Type"] = "application/json; charset=utf-8"
    return response


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    path = request.url.path
    if not path.startswith(settings.api_prefix) or request.method in SAFE_METHODS:
        return await call_next(request)

    if any(path.startswith(p) for p in settings.csrf_exempt_path_list):
        return await call_next(request)

    auth_header = request.headers.get("Authorization")
    cookie_access = request.cookies.get("access_token") or request.cookies.get("admin_access_token")
    cookie_refresh = request.cookies.get("refresh_token") or request.cookies.get("admin_refresh_token")

    if not cookie_access and not cookie_refresh and auth_header:
        return await call_next(request)

    csrf_cookie = request.cookies.get(settings.csrf_cookie_name)
    csrf_header = request.headers.get(settings.csrf_header_name)
    if not compare_csrf_tokens(csrf_cookie, csrf_header):
        lang = request.headers.get("Accept-Language", "ru")[:2]
        return JSONResponse(status_code=403, content={"detail": t("auth.invalid_csrf", lang)})
    return await call_next(request)


@app.middleware("http")
async def global_rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if path in {"/health", "/docs", "/redoc", "/openapi.json"}:
        return await call_next(request)

    client_ip = get_client_ip(request)
    global_key = f"ratelimit:global:{client_ip}"
    total = await RateLimitService.increment_window(global_key, 60)
    if total > settings.global_rate_limit_per_minute:
        lang = request.headers.get("Accept-Language", "ru")[:2]
        return JSONResponse(status_code=429, content={"detail": t("auth.rate_limit_exceeded", lang)})

    scoped_limit: tuple[str, int] | None = None
    if path == f"{settings.api_prefix}/auth/login":
        scoped_limit = (f"ratelimit:login:{client_ip}", 60)
        max_count = 10
    elif path == f"{settings.api_prefix}/auth/register":
        scoped_limit = (f"ratelimit:register:{client_ip}", 60)
        max_count = 3
    elif path == f"{settings.api_prefix}/auth/password-reset":
        scoped_limit = (f"ratelimit:password-reset:{client_ip}", 300)
        max_count = 1
    elif request.method == "POST" and (
        path.endswith("/avatar") or path.endswith("/stories") or path.endswith("/messages") or "upload" in path
    ):
        scoped_limit = (f"ratelimit:upload:{client_ip}", 60)
        max_count = 10
    else:
        max_count = 0

    if scoped_limit:
        count = await RateLimitService.increment_window(scoped_limit[0], scoped_limit[1])
        if count > max_count:
            lang = request.headers.get("Accept-Language", "ru")[:2]
            return JSONResponse(status_code=429, content={"detail": t("auth.rate_limit_exceeded", lang)})

    return await call_next(request)


@app.middleware("http")
async def project_gate_middleware(request: Request, call_next):
    path = request.url.path
    exempt_prefixes = (
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
        f"{settings.api_prefix}/admin",
        f"{settings.api_prefix}/auth",
        f"{settings.api_prefix}/wallet/webhook",
    )
    if any(path.startswith(p) for p in exempt_prefixes):
        return await call_next(request)

    async with AsyncSessionLocal() as db:
        platform = await AdminService.get_platform_settings(db)
        if not platform.project_enabled:
            auth = request.headers.get("Authorization", "")
            is_admin = False
            if auth.startswith("Bearer "):
                payload = verify_token(auth[7:], "access")
                if payload and payload.get("sub"):
                    import uuid as _uuid
                    from sqlalchemy import select
                    from app.models.admin import AdminAccount
                    if payload.get("scope") == "admin":
                        result = await db.execute(
                            select(AdminAccount).where(AdminAccount.id == _uuid.UUID(payload["sub"]))
                        )
                        if result.scalar_one_or_none():
                            is_admin = True
                    else:
                        from app.models.user import User, UserRole
                        result = await db.execute(select(User).where(User.id == _uuid.UUID(payload["sub"])))
                        user = result.scalar_one_or_none()
                        if user and user.role in (UserRole.ADMIN, UserRole.SUPERADMIN):
                            is_admin = True
            if not is_admin:
                lang = request.headers.get("Accept-Language", "ru")[:2]
                return JSONResponse(
                    status_code=503,
                    content={"detail": t("auth.project_disabled", lang)},
                )
    return await call_next(request)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    lang = request.headers.get("Accept-Language", "ru")[:2]
    logger.exception("Unhandled application error", extra={"path": request.url.path, "method": request.method})
    if settings.debug:
        return JSONResponse(status_code=500, content={"detail": str(exc)})
    return JSONResponse(status_code=500, content={"detail": t("errors.internal", lang)})


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name}


@app.get(f"{settings.api_prefix}/csrf")
async def csrf_token():
    token = generate_csrf_token()
    response = JSONResponse({"csrf_token": token})
    response.set_cookie(
        settings.csrf_cookie_name,
        token,
        httponly=False,
        secure=settings.csrf_cookie_secure or settings.app_env != "development",
        samesite=settings.csrf_cookie_samesite,
        max_age=3600,
    )
    return response


app.include_router(api_router, prefix=settings.api_prefix)
app.include_router(ws_router)
