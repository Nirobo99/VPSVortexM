"""admin RBAC stage - full admin panel

Revision ID: 008_admin_rbac
Revises: 007_admin
Create Date: 2026-06-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "008_admin_rbac"
down_revision: Union[str, None] = "007_admin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE complaintstatus ADD VALUE IF NOT EXISTS 'in_progress'")
    for action in (
        "finance_adjust", "backup_create", "backup_restore", "admin_manage",
        "broadcast_send", "ad_manage", "page_edit",
    ):
        op.execute(f"ALTER TYPE adminaction ADD VALUE IF NOT EXISTS '{action}'")

    op.create_table(
        "admin_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("role", sa.String(32), nullable=False, server_default="moderator"),
        sa.Column("permissions", postgresql.JSONB(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("totp_secret", sa.String(64), nullable=True),
        sa.Column("totp_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_admin_accounts_user_id", "admin_accounts", ["user_id"])

    op.create_table(
        "admin_refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("admin_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("admin_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.add_column("admin_logs", sa.Column("admin_account_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("admin_logs", sa.Column("user_agent", sa.String(512), nullable=True))
    op.create_foreign_key("fk_admin_logs_account", "admin_logs", "admin_accounts", ["admin_account_id"], ["id"])

    op.add_column("complaints", sa.Column("internal_note", sa.Text(), nullable=True))
    op.add_column("complaints", sa.Column("assigned_to_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_complaints_assigned", "complaints", "users", ["assigned_to_id"], ["id"])

    op.add_column("platform_settings", sa.Column("project_name", sa.String(128), server_default="VortexM", nullable=False))
    op.add_column("platform_settings", sa.Column("logo_url", sa.String(512), nullable=True))
    op.add_column("platform_settings", sa.Column("favicon_url", sa.String(512), nullable=True))
    op.add_column("platform_settings", sa.Column("prices", postgresql.JSONB(), nullable=True))
    op.add_column("platform_settings", sa.Column("allowed_admin_ips", postgresql.JSONB(), nullable=True))
    op.add_column("platform_settings", sa.Column("backup_schedule_cron", sa.String(64), nullable=True))

    op.create_table(
        "ad_banners",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("image_url", sa.String(512), nullable=True),
        sa.Column("link_url", sa.String(512), nullable=True),
        sa.Column("target_locale", sa.String(8), nullable=True),
        sa.Column("target_region", sa.String(64), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("impressions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("clicks", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "broadcasts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("broadcast_type", sa.String(16), server_default="internal", nullable=False),
        sa.Column("subject", sa.String(256), nullable=True),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("internal_text", sa.Text(), nullable=True),
        sa.Column("audience_filter", postgresql.JSONB(), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), server_default="draft", nullable=False),
        sa.Column("sent_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "static_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("content_html", sa.Text(), nullable=False),
        sa.Column("updated_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "backup_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("filename", sa.String(256), nullable=False),
        sa.Column("file_size", sa.Integer(), server_default="0", nullable=False),
        sa.Column("storage_path", sa.String(512), nullable=True),
        sa.Column("status", sa.String(16), server_default="completed", nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.execute("""
        INSERT INTO admin_accounts (id, user_id, role, is_active, totp_enabled, created_at, updated_at)
        SELECT gen_random_uuid(), u.id, 'superadmin', true, false, NOW(), NOW()
        FROM users u
        WHERE u.username = 'моргенштерн@2399'
        AND NOT EXISTS (SELECT 1 FROM admin_accounts aa WHERE aa.user_id = u.id)
    """)

    for slug, title, html in (
        ("about", "О нас", "<p>VortexM — безопасный мессенджер.</p>"),
        ("rules", "Правила", "<p>Правила использования платформы.</p>"),
        ("contacts", "Контакты", "<p>support@vortexm.local</p>"),
    ):
        op.execute(f"""
            INSERT INTO static_pages (id, slug, title, content_html, updated_at)
            SELECT gen_random_uuid(), '{slug}', '{title}', '{html}', NOW()
            WHERE NOT EXISTS (SELECT 1 FROM static_pages WHERE slug = '{slug}')
        """)


def downgrade() -> None:
    op.drop_table("backup_records")
    op.drop_table("static_pages")
    op.drop_table("broadcasts")
    op.drop_table("ad_banners")
    op.drop_column("platform_settings", "backup_schedule_cron")
    op.drop_column("platform_settings", "allowed_admin_ips")
    op.drop_column("platform_settings", "prices")
    op.drop_column("platform_settings", "favicon_url")
    op.drop_column("platform_settings", "logo_url")
    op.drop_column("platform_settings", "project_name")
    op.drop_constraint("fk_complaints_assigned", "complaints", type_="foreignkey")
    op.drop_column("complaints", "assigned_to_id")
    op.drop_column("complaints", "internal_note")
    op.drop_constraint("fk_admin_logs_account", "admin_logs", type_="foreignkey")
    op.drop_column("admin_logs", "user_agent")
    op.drop_column("admin_logs", "admin_account_id")
    op.drop_table("admin_refresh_tokens")
    op.drop_table("admin_accounts")
