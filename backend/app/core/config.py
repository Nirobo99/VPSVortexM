from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "VortexM"
    app_env: str = "development"
    debug: bool = True
    secret_key: str
    api_prefix: str = "/api/v1"
    allowed_origins: str = "http://localhost:3000"
    trusted_proxy_ips: str = ""
    security_header_name: str = "X-Admin-Secret"
    admin_secret_header_value: str = ""

    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    jwt_access_token_expire_minutes: int = 480
    jwt_refresh_token_expire_days: int = 30
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "vortexm"
    jwt_audience: str = "vortexm-clients"

    message_encryption_key: str = "0123456789abcdef0123456789abcdef"
    csrf_cookie_name: str = "vortexm_csrf_token"
    csrf_header_name: str = "X-CSRF-Token"
    csrf_cookie_secure: bool = False
    csrf_cookie_samesite: str = "strict"
    csrf_exempt_paths: str = "/health,/docs,/redoc,/openapi.json"

    global_rate_limit_per_minute: int = 200
    login_rate_limit: str = "10/minute"
    register_rate_limit: str = "3/minute"
    password_reset_rate_limit: str = "1/5minute"
    upload_rate_limit: str = "10/minute"
    websocket_connections_per_user: int = 5

    recaptcha_enabled: bool = False
    recaptcha_secret_key: str = ""
    recaptcha_verify_url: str = "https://www.google.com/recaptcha/api/siteverify"
    recaptcha_min_score: float = 0.5

    storage_presign_ttl_seconds: int = 900
    s3_private_bucket: bool = False

    smtp_host: str = "smtp.mail.ru"
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "VortexM <noreply@mail.ru>"
    smtp_use_tls: bool = True

    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "vortexm"
    s3_region: str = "ru-msk"
    s3_public_url: str = "http://localhost:9000/vortexm"

    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str = "devkey"
    livekit_api_secret: str = "secret"

    yookassa_shop_id: str = ""
    yookassa_secret_key: str = ""
    yookassa_webhook_secret: str = ""
    yookassa_return_url: str = "http://localhost:3000/wallet/success"
    yookassa_mock: bool = True

    superadmin_username: str = "моргенштерн@2399"
    superadmin_password: str = "10МнЛмЗ14%"
    superadmin_email: str = "superadmin@vortexm.local"

    login_max_attempts: int = 5
    login_lockout_minutes: int = 30
    registration_lockout_hours: int = 24

    @property
    def trusted_proxies(self) -> list[str]:
        return [o.strip() for o in self.trusted_proxy_ips.split(",") if o.strip()]

    @property
    def csrf_exempt_path_list(self) -> list[str]:
        return [o.strip() for o in self.csrf_exempt_paths.split(",") if o.strip()]

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
