# VortexM — мессенджер полного стека

Безопасный мессенджер с локализацией для РФ: FastAPI + Next.js 14 + PostgreSQL + Redis + LiveKit + MinIO.

## Быстрый старт (Docker)

```bash
# 1. Скопировать переменные окружения
cp .env.example .env

# 2. Запустить все сервисы
docker compose up --build
```

После запуска:

| Сервис | URL |
|--------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger (dev) | http://localhost:8000/docs |
| MinIO Console | http://localhost:9001 |
| LiveKit | ws://localhost:7880 |

## Production / хостинг (сервер в РФ)

**Полная пошаговая инструкция «для чайников»** — выбор VPS (Timeweb, Beget, FirstVDS), настройка сервера, `.env`, Docker, Nginx, SSL, бэкапы, RuStore:

**[DEPLOYMENT.md](./DEPLOYMENT.md)**

Краткая шпаргалка:

```bash
cp .env.production.example .env
nano .env
nano infra/livekit.prod.yaml
docker compose -f docker-compose.prod.yml up -d --build
./scripts/init-ssl.sh your-domain.ru admin@your-domain.ru
docker compose -f docker-compose.prod.yml up -d --build frontend
```

## Локальный запуск без Docker

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux: source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env
# Укажите DATABASE_URL и REDIS_URL на localhost
alembic upgrade head
python -m app.scripts.seed
uvicorn app.main:app --reload --port 8000
```

### Celery (отдельный терминал)

```bash
celery -A app.tasks.celery_app worker --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Суперадмин (seed)

| Поле | Значение |
|------|----------|
| Логин | `моргенштерн@2399` |
| Пароль | `10МнЛмЗ14%` |

Создаётся автоматически при `docker compose up` или `python -m app.scripts.seed`.

## Этап 1 — Регистрация и аутентификация ✅

- Регистрация по email с подтверждением (Celery + SMTP)
- Защитные вопросы: год животного + «2+2*2» (= 6); при ошибке — блок IP+email на 24 ч
- JWT access (15 мин) + refresh (7 дней)
- Защита от брутфорса: 5 попыток → бан 30 мин (IP+email)
- Восстановление пароля через email
- 2FA (TOTP) — опционально
- X-Forwarded-For / X-Real-IP для VPN/прокси
- Локализация API и UI: ru, en, fr, tt, tg

## Этап 2 — Профиль пользователя ✅

### Backend
- Редактирование имени, био, даты рождения, приватности
- Аватар (MinIO/S3), тема (светлая/тёмная/своя)
- Текстовый/эмодзи статус, сторис (24 ч, Celery cleanup)
- QR-код для контактов (SVG)
- Чёрный список, геймификация (очки, уровни, достижения)
- Публичный профиль, анонимные пользователи (суперадмин)

### Frontend
- `/profile` — редактирование профиля, аватар, статус, сторис, QR, достижения
- `/settings` — тема, язык, 2FA, чёрный список
- `/users/{username}` — публичный профиль
- `/contacts/add?user=...` — страница добавления по QR

### API эндпоинты (profile)

| Метод | Путь | Описание |
|-------|------|----------|
| GET/PATCH | `/api/v1/users/me/profile` | Профиль |
| PATCH | `/api/v1/users/me/theme` | Тема |
| PATCH | `/api/v1/users/me/status` | Статус |
| POST | `/api/v1/users/me/avatar` | Аватар |
| GET | `/api/v1/users/me/qr` | QR-код (SVG) |
| GET | `/api/v1/users/me/gamification` | Геймификация |
| GET/POST/DELETE | `/api/v1/users/me/blocks` | Чёрный список |
| GET/POST/DELETE | `/api/v1/users/me/stories` | Сторис |
| GET | `/api/v1/users/{username}` | Публичный профиль |

## Этап 3 — Личные сообщения и WebSocket ✅

### Backend
- Диалоги (личные и секретные), папки чатов
- Сообщения: текст, голос, видео-кружочки, файлы (MinIO, до 50 МБ)
- AES-256-GCM шифрование на сервере, E2E для секретных чатов (ECDH + AES-GCM на клиенте)
- Редактирование, мягкое удаление, ответы, реакции, закрепление, пересылка
- Поиск по тексту (PostgreSQL tsvector)
- WebSocket `/ws` + Redis Pub/Sub, статусы прочитано, счётчики непрочитанных (Redis)
- Автоудаление сообщений по таймеру (Celery, каждые 5 мин)

### Frontend
- `/chats` — список диалогов, поиск, создание чата
- `/chats/{id}` — переписка в реальном времени, реакции, ответы, файлы
- Секретные чаты с E2E-шифрованием (Web Crypto API)
- Горячая клавиша Ctrl+Enter для отправки

### API эндпоинты (chats)

| Метод | Путь | Описание |
|-------|------|----------|
| GET/POST | `/api/v1/chats/folders` | Папки чатов |
| GET/POST | `/api/v1/chats/dialogs` | Диалоги |
| GET | `/api/v1/chats/dialogs/{id}/messages` | Сообщения |
| POST | `/api/v1/chats/dialogs/{id}/messages` | Отправить |
| PATCH/DELETE | `/api/v1/chats/messages/{id}` | Редактировать/удалить |
| POST/DELETE | `/api/v1/chats/messages/{id}/reactions` | Реакции |
| GET | `/api/v1/chats/search` | Поиск |
| WS | `/ws?token=...` | WebSocket |

## Этап 4 — Аудио/видеозвонки (LiveKit) ✅

### Backend
- Модели звонков, участников, записей
- LiveKit JWT-токены (до 500 участников в комнате)
- Сигналинг входящих звонков через WebSocket
- Запись звонка с уведомлением участникам, сохранение в MinIO/S3
- Маскировка анонимов: метаданные mask_face/mask_voice в токене LiveKit

### Frontend
- `/call/{id}` — экран звонка (livekit-client)
- Входящий звонок — модальное окно (принять/отклонить)
- Кнопки 📞/📹 в чате
- Запись через MediaRecorder + загрузка в S3
- Blur-фильтр для анонимных пользователей

### API эндпоинты (calls)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/v1/calls` | Создать звонок |
| GET | `/api/v1/calls/{id}` | Информация о звонке |
| GET | `/api/v1/calls/dialog/{id}/active` | Активный звонок в чате |
| POST | `/api/v1/calls/{id}/join` | Получить LiveKit-токен |
| POST | `/api/v1/calls/{id}/decline` | Отклонить |
| POST | `/api/v1/calls/{id}/leave` | Выйти |
| POST | `/api/v1/calls/{id}/recording/start` | Начать запись |
| POST | `/api/v1/calls/{id}/recording/stop` | Остановить и сохранить |

## Этап 5 — Каналы и беседы ✅

### Backend
- Каналы: публичные/закрытые, подписка (списание с кошелька), верификация
- Посты: текст, медиа, опросы/квизы, события, платные посты (pay-per-view)
- Реакции, комментарии, закрепление, рассылка @all подписчикам
- Товары в канале, броадкасты
- Групповые беседы (до 500 участников, расширение до 1000 за 500 монет)
- Роли участников канала/беседы, права администраторов

### Frontend
- `/channels` — список и поиск каналов
- `/channels/new` — создание канала
- `/channels/{slug}` — лента постов, опросы, рассылка
- `/groups` — создание и список бесед
- Групповые чаты в `/chats` с отображением названия и участников

### API эндпоинты (channels & groups)

| Метод | Путь | Описание |
|-------|------|----------|
| GET/POST | `/api/v1/channels` | Список / создание |
| GET | `/api/v1/channels/{slug}` | Канал |
| POST | `/api/v1/channels/{slug}/join` | Подписаться |
| POST | `/api/v1/channels/{slug}/leave` | Отписаться |
| GET/POST | `/api/v1/channels/{slug}/posts` | Посты |
| POST | `/api/v1/channels/posts/{id}/unlock` | Разблокировать платный пост |
| POST | `/api/v1/channels/posts/{id}/vote` | Голос в опросе |
| POST | `/api/v1/channels/{slug}/broadcast` | Рассылка @all |
| GET/POST | `/api/v1/groups` | Беседы |
| POST | `/api/v1/groups/{id}/extend` | Расширить лимит участников |

### API эндпоинты (auth)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/v1/auth/security-questions` | Защитные вопросы |
| POST | `/api/v1/auth/register` | Регистрация |
| POST | `/api/v1/auth/verify-email` | Подтверждение email |
| POST | `/api/v1/auth/login` | Вход |
| POST | `/api/v1/auth/refresh` | Обновление токенов |
| POST | `/api/v1/auth/logout` | Выход |
| POST | `/api/v1/auth/password-reset` | Запрос сброса пароля |
| POST | `/api/v1/auth/password-reset/confirm` | Сброс пароля |
| GET | `/api/v1/auth/me` | Текущий пользователь |
| POST | `/api/v1/auth/2fa/setup` | Настройка 2FA |
| POST | `/api/v1/auth/2fa/enable` | Включить 2FA |
| POST | `/api/v1/auth/2fa/disable` | Отключить 2FA |

## Этап 6 — Платежи (YooKassa) ✅

### Backend
- Модели `WalletPayment`, `WalletTransaction` (миграция `006_payments`)
- Пополнение кошелька через YooKassa (redirect) или mock-режим (`YOOKASSA_MOCK=true`)
- Webhook `POST /api/v1/wallet/webhook` для `payment.succeeded`
- Идемпотентное зачисление, история транзакций
- Баланс используется в каналах (подписки, платные посты) и расширении бесед

### Frontend
- `/wallet` — баланс, пополнение (пресеты 100/500/1000/5000 ₽), история
- `/wallet/success` — страница возврата после оплаты
- Баланс в шапке приложения

### API эндпоинты (wallet)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/v1/wallet/balance` | Текущий баланс |
| GET | `/api/v1/wallet/history` | История платежей и транзакций |
| POST | `/api/v1/wallet/topup` | Создать платёж |
| GET | `/api/v1/wallet/payments/{id}` | Статус платежа |
| POST | `/api/v1/wallet/payments/{id}/confirm` | Подтвердить (poll YooKassa) |
| POST | `/api/v1/wallet/webhook` | Webhook YooKassa |

## Этап 7 — Админ-панель с RBAC ✅

Отдельный модуль администрирования с собственной аутентификацией, ролями и разрешениями.

### Доступ

| URL | Описание |
|-----|----------|
| http://localhost:3000/admin/login | Вход в админ-панель |
| http://localhost:3000/admin | Дашборд (после входа) |

Суперадмин входит теми же учётными данными, что и обычный пользователь (`моргенштерн@2399`). При первом входе автоматически создаётся запись `AdminAccount` с ролью `superadmin` и полными правами.

Кнопка «Админ» в пользовательском интерфейсе видна только пользователям с активной записью `AdminAccount` (поле `has_admin_panel` в `/auth/me`).

### Роли и разрешения

| Роль | Права |
|------|-------|
| `superadmin` | Все (`*`), нельзя изменить. Только `моргенштерн@2399` |
| `admin` | Всё, кроме критических настроек и самоуничтожения |
| `moderator` | Пользователи (просмотр, бан), жалобы, каналы, логи |
| `support` | Пользователи (просмотр, разбан), жалобы |
| `content_manager` | Каналы, реклама, рассылки, статические страницы |

Разрешения хранятся как `resource:action` (например `users:ban`, `channels:delete`). У каждого админа можно задать индивидуальный набор поверх шаблона роли.

### Разделы панели

- **Дашборд** — метрики пользователей, доходов, жалоб, график активности
- **Пользователи** — поиск, бан/разбан, верификация, экспорт CSV
- **Каналы и беседы** — модерация, верификация, удаление
- **Жалобы** — очередь, назначение, решение
- **Реклама** — CRUD баннеров, статистика
- **Рассылки** — email / внутренние уведомления
- **Страницы** — «О нас», «Правила», «Контакты»
- **Финансы** — транзакции, ручная корректировка баланса
- **Настройки** — регистрация, режим обслуживания, цены
- **Логи** — журнал действий админов (только чтение)
- **Бекапы** — создание и список резервных копий
- **Администраторы** — управление ролями и правами

### Назначение нового администратора

1. Пользователь должен быть зарегистрирован в системе
2. Суперадмин или админ с правом `admins:create` вызывает:

```bash
curl -X POST http://localhost:8000/api/v1/admin/accounts \
  -H "Authorization: Bearer <admin_access_token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "moderator@example.com", "role": "moderator"}'
```

3. Новый админ входит на `/admin/login` своим email и паролем пользователя

### Безопасность

- JWT с `scope: admin` (отдельно от пользовательских токенов)
- Токены в httpOnly-куках (`admin_access_token`, `admin_refresh_token`) + Bearer
- Обязательная 2FA (TOTP) для админов — настраивается через `/admin/auth/2fa/setup`
- Все действия логируются (IP, user-agent, детали)
- Опциональная фильтрация по IP (`allowed_admin_ips` в настройках)
- Режим обслуживания: обычные пользователи блокируются, админы проходят

### Backend (миграция `008_admin_rbac`)

Модели: `AdminAccount`, `AdminRefreshToken`, `AdBanner`, `Broadcast`, `StaticPage`, `BackupRecord`, расширенные `AdminLog`, `Complaint`, `PlatformSettings`.

### API эндпоинты (admin)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/v1/admin/auth/login` | Вход админа |
| POST | `/api/v1/admin/auth/refresh` | Обновление токена |
| GET | `/api/v1/admin/auth/me` | Текущий админ |
| GET | `/api/v1/admin/dashboard` | Метрики дашборда |
| GET/PATCH | `/api/v1/admin/users` | Пользователи |
| GET | `/api/v1/admin/channels` | Каналы |
| GET | `/api/v1/admin/complaints` | Жалобы |
| GET/POST | `/api/v1/admin/ads` | Реклама |
| GET/POST | `/api/v1/admin/broadcasts` | Рассылки |
| GET/PUT | `/api/v1/admin/pages` | Статические страницы |
| GET/PATCH | `/api/v1/admin/settings` | Настройки платформы |
| GET | `/api/v1/admin/finance` | Транзакции |
| GET | `/api/v1/admin/logs` | Логи админов |
| GET/POST | `/api/v1/admin/backups` | Резервные копии |
| GET/POST/PATCH | `/api/v1/admin/accounts` | Управление админами |
| POST | `/api/v1/complaints` | Отправить жалобу (пользователь) |
| GET | `/api/v1/pages/{slug}` | Публичная страница |

## Этап 8 — PWA, горячие клавиши, финализация ✅

### PWA
- `next-pwa` — service worker, offline-кэш статики
- `manifest.json` — иконки 192/512, shortcuts на чаты и каналы
- Скрипт `npm run prebuild` генерирует PNG из SVG (`sharp`)
- Баннер установки приложения (`beforeinstallprompt`)
- Индикатор offline-режима

### Горячие клавиши
| Клавиша | Действие |
|---------|----------|
| `?` | Справка по горячим клавишам |
| `Alt+1`…`6` | Навигация: главная, чаты, каналы, кошелёк, профиль, настройки |
| `Alt+7` | Админ-панель (если есть права) |
| `Ctrl+Enter` | Отправить сообщение в чате |
| `Esc` | Закрыть справку / снять фокус |

### Прочее
- Исправлено имя БД в `docker-compose.yml` (`vortexm`)
- Проект готов к деплою на VDS (см. раздел ниже)

## Структура проекта

```
vortexm/
├── backend/          # FastAPI, SQLAlchemy, Celery
├── frontend/         # Next.js 14, TypeScript, Tailwind
├── infra/            # LiveKit config
├── docker-compose.yml
├── .env.example
└── README.md
```

## Деплой на VDS/VPS (РФ)

1. Установите Docker и Docker Compose на сервер (Selectel, Timeweb, VK Cloud и т.д.)
2. Скопируйте проект, настройте `.env` с production-секретами
3. Для SMTP используйте Mail.ru или Яндекс.Почту (пароль приложения)
4. Для файлов — VK Cloud Object Storage (S3-совместимый)
5. Для платежей — YooKassa (`YOOKASSA_MOCK=false`)
6. Настройте reverse proxy (Nginx) с TLS и заголовками `X-Forwarded-For`
7. `docker compose -f docker-compose.yml up -d`

## Переменные окружения

Полный список — в `.env.example`.

## Безопасность

В проект добавлен слой security hardening с сохранением обратной совместимости.

### Что включено

- `AES-256-GCM` для серверного шифрования обычных сообщений (`CryptoService`, поле `messages.encrypted_content`)
- E2E для секретных чатов остаётся отдельным потоком: сервер хранит только `content_e2e`
- CSRF-защита через `double-submit cookie` (`/api/v1/csrf` + заголовок `X-CSRF-Token`)
- JWT с `jti`, `iss`, `aud` и blacklist в Redis при logout/refresh revoke
- `SameSite=Strict` для access/refresh cookie
- Глобальный и точечный rate limiting на API и WebSocket
- Presigned URLs для медиа, приватный S3/MinIO bucket
- Санитизация HTML (`bleach` на backend, `DOMPurify` на frontend)
- Security headers в FastAPI, Next.js и `nginx/nginx.conf`
- Дополнительная защита админки: allowlist IP + секретный заголовок
- Скрипт dependency audit: `python scripts/security_audit.py`

### Новые env-переменные

- `MESSAGE_ENCRYPTION_KEY` — 32 байта или `base64:<...>`
- `JWT_ISSUER`, `JWT_AUDIENCE`
- `CSRF_COOKIE_NAME`, `CSRF_HEADER_NAME`, `CSRF_COOKIE_SAMESITE`
- `GLOBAL_RATE_LIMIT_PER_MINUTE`, `WEBSOCKET_CONNECTIONS_PER_USER`
- `RECAPTCHA_ENABLED`, `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_MIN_SCORE`
- `STORAGE_PRESIGN_TTL_SECONDS`, `S3_PRIVATE_BUCKET`
- `TRUSTED_PROXY_IPS`
- `SECURITY_HEADER_NAME`, `ADMIN_SECRET_HEADER_VALUE`

### Nginx

Файл `nginx/nginx.conf` добавляет:

- `limit_req_zone` и `limit_conn`
- CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`
- proxy для `/`, `/api/`, `/ws`

В `docker-compose.yml` добавлен сервис `nginx`.

### Проверка после включения

1. `alembic upgrade head`
2. `python scripts/security_audit.py`
3. `npm run build` в `frontend`
4. Проверить:
   - логин/refresh/logout пользователя и админа
   - POST/PATCH/DELETE без `X-CSRF-Token` возвращают `403`
   - частые запросы на `/auth/login` получают `429`
   - WebSocket не допускает больше `WEBSOCKET_CONNECTIONS_PER_USER`
   - новые медиа-ссылки приходят как временные presigned URLs
