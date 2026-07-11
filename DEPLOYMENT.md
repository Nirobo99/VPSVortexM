# VortexM — полная инструкция по развёртыванию на сервере в РФ

> **Для кого эта инструкция:** для человека без опыта DevOps. Каждый шаг объяснён простым языком.  
> **Что в итоге получится:** работающий мессенджер VortexM на вашем домене с HTTPS, почтой, платежами и админ-панелью.

---

## Содержание

1. [Выбор хостинга и домена](#1-выбор-хостинга-и-домена)
2. [Первоначальная настройка сервера](#2-первоначальная-настройка-сервера)
3. [Настройка переменных окружения (.env)](#3-настройка-переменных-окружения-env)
4. [Docker Compose для production](#4-docker-compose-для-production)
5. [Настройка Nginx (обратный прокси и SSL)](#5-настройка-nginx-обратный-прокси-и-ssl)
6. [Запуск и проверка](#6-запуск-и-проверка)
7. [Резервное копирование](#7-резервное-копирование)
8. [Мониторинг (опционально)](#8-мониторинг-опционально)
9. [Публикация Android-приложения в RuStore](#9-публикация-android-приложения-в-rustore)
10. [Полезные ссылки, обновление и FAQ](#10-полезные-ссылки-обновление-и-faq)

---

## 1. Выбор хостинга и домена

### 1.1. Какой тип хостинга нужен

VortexM — это **не обычный сайт на PHP**. Это целый набор сервисов (база данных, Redis, файловое хранилище, видеозвонки, фоновые задачи). Поэтому нужен **VPS/VDS** — виртуальный сервер с root-доступом, где вы сами ставите Docker.

⚠️ **Не подойдёт:** дешёвый «виртуальный хостинг» только для WordPress/PHP — там нельзя запустить Docker и открыть нужные порты.

### 1.2. Российские VPS-провайдеры (оплата картой РФ)

| Провайдер | Ссылка на тарифы | Плюсы | Минусы | Цена от |
|-----------|------------------|-------|--------|---------|
| **Timeweb Cloud** | [timeweb.cloud/services/vds](https://timeweb.cloud/services/vds) | Удобная панель, дата-центры в РФ, хорошая поддержка | UDP для видеозвонков — уточнить в тарифе | ~500 ₽/мес |
| **Beget VPS** | [beget.com/ru/vps](https://beget.com/ru/vps) | Простая панель, привычный бренд | Меньше «облачных» настроек | ~450 ₽/мес |
| **FirstVDS** | [firstvds.ru](https://firstvds.ru/) | Недорого, root-доступ | Интерфейс проще | ~400 ₽/мес |
| **VK Cloud** *(опционально)* | [cloud.vk.com](https://cloud.vk.com/) | Масштабирование, Object Storage для файлов | Сложнее для новичка | ~1000 ₽/мес |

**Рекомендация для старта:** **Timeweb Cloud** или **Beget VPS** — 4 ГБ RAM, 2 vCPU, 50 ГБ SSD, Ubuntu 22.04 LTS.

### 1.3. Как выбрать тариф

При заказе сервера укажите:

| Параметр | Минимум | Лучше |
|----------|---------|-------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 ГБ | 8 ГБ |
| Диск | 20 ГБ SSD | 50–80 ГБ SSD |
| ОС | **Ubuntu 22.04 LTS** | Ubuntu 22.04 LTS |
| Регион | Москва / СПб (РФ) | Москва |

**Текстовое описание экрана заказа (пример):**  
Вы видите форму «Создать сервер». В поле «Операционная система» выбираете **Ubuntu 22.04**. В поле «Конфигурация» — слайдер RAM до **4 ГБ** и CPU **2 ядра**. В поле «Диск» — **50 ГБ SSD**. Нажимаете «Создать» / «Оплатить». Через 1–3 минуты на email приходит IP-адрес и пароль root.

### 1.4. Регистрация домена

Домен нужен, чтобы пользователи заходили на `https://vortexm.ru`, а не на голый IP.

Российские регистраторы:

- [REG.RU](https://www.reg.ru/) — домены `.ru`, `.рф`
- [NIC.RU](https://www.nic.ru/) — корпоративные домены

**Шаги:**

1. Купите домен (например `vortexm.ru`).
2. В панели DNS найдите раздел «Управление зоной» / «DNS-серверы».
3. Создайте **A-запись**:

   | Поле | Значение |
   |------|----------|
   | Тип | `A` |
   | Имя | `@` (корень домена) или `app` (поддомен) |
   | Значение | IP вашего VPS (например `185.xxx.xxx.xxx`) |
   | TTL | `3600` |

4. Подождите 5–60 минут. Проверка с компьютера:

```bash
nslookup vortexm.ru
```

Должен показаться IP вашего сервера.

---

## 2. Первоначальная настройка сервера

### 2.1. Подключение по SSH

**SSH** — способ удалённо управлять сервером через командную строку.

#### Windows — PuTTY

1. Скачайте [PuTTY](https://www.putty.org/).
2. Откройте PuTTY. В поле **Host Name** введите IP сервера (например `185.xxx.xxx.xxx`).
3. Port: `22`, Connection type: **SSH**.
4. Нажмите **Open**. Логин: `root`, пароль — из письма хостинга.

**Текстовое описание:** чёрное окно терминала, строка `login as: root`, затем запрос пароля (символы не отображаются — это нормально).

#### Mac / Linux — встроенный терминал

```bash
ssh root@185.xxx.xxx.xxx
```

При первом подключении ответьте `yes`, введите пароль.

### 2.2. Создание отдельного пользователя (рекомендуется)

Работать под `root` постоянно небезопасно. Создайте пользователя `deploy`:

```bash
adduser deploy
usermod -aG sudo deploy
```

Задайте пароль. Дальше можно подключаться так:

```bash
ssh deploy@185.xxx.xxx.xxx
```

### 2.3. Настройка файрвола (ufw)

Файрвол закрывает все порты, кроме разрешённых.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

**Ожидаемый вывод:**

```
Status: active
22/tcp    ALLOW
80/tcp    ALLOW
443/tcp   ALLOW
```

⚠️ **Видеозвонки (LiveKit):** для WebRTC дополнительно откройте UDP-порты (см. [раздел 5.5](#55-дополнительно-порты-для-видеозвонков-livekit)):

```bash
sudo ufw allow 7880/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 7882/udp
sudo ufw allow 50000:50100/udp
```

### 2.4. Установка Docker и Docker Compose

Docker запускает все сервисы проекта в изолированных контейнерах.

⚠️ **Из РФ** иногда недоступен `download.docker.com`. Если команда `curl` к docker.com зависает или выдаёт ошибку — попробуйте:
- повторить позже;
- использовать VPN на этапе установки;
- зеркало (например, пакеты из репозитория Ubuntu, если доступны).

**Официальная установка (Ubuntu 22.04):**

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Проверка:

```bash
docker --version
docker compose version
```

Добавьте пользователя в группу docker (чтобы не писать `sudo` каждый раз):

```bash
sudo usermod -aG docker deploy
# Перелогиньтесь: exit и снова ssh deploy@...
```

### 2.5. Установка Git

```bash
sudo apt install -y git
git --version
```

### 2.6. Клонирование проекта

```bash
sudo mkdir -p /opt/vortexm
sudo chown deploy:deploy /opt/vortexm
cd /opt/vortexm

git clone https://github.com/YOUR_USER/VortexM.git .
```

⚠️ Замените `YOUR_USER/VortexM` на адрес **вашего** репозитория.  
Если репозитория нет — загрузите архив проекта через SFTP (FileZilla, WinSCP) в `/opt/vortexm`.

Сделайте скрипты исполняемыми:

```bash
chmod +x scripts/deploy-prod.sh scripts/init-ssl.sh scripts/backup.sh
```

---

## 3. Настройка переменных окружения (.env)

### 3.1. Создание файла

```bash
cd /opt/vortexm
cp .env.production.example .env
nano .env
```

В редакторе `nano`: редактируйте текст, сохраните **Ctrl+O**, Enter, выход **Ctrl+X**.

⚠️ Файл `.env` содержит секреты. **Никогда** не публикуйте его в интернете и не коммитьте в Git.

### 3.2. Генерация секретов

Выполните на сервере:

```bash
# SECRET_KEY (подпись JWT и сессий)
openssl rand -hex 32

# MESSAGE_ENCRYPTION_KEY (шифрование сообщений в БД)
echo "base64:$(openssl rand -base64 32)"

# Пароль PostgreSQL
openssl rand -base64 24

# Ключи MinIO (S3_ACCESS_KEY / S3_SECRET_KEY)
openssl rand -hex 16   # access key
openssl rand -hex 32   # secret key

# LiveKit
openssl rand -hex 16   # LIVEKIT_API_KEY
openssl rand -hex 32   # LIVEKIT_API_SECRET
```

Скопируйте результаты в `.env`.

### 3.3. Описание каждой переменной

#### Общие настройки приложения

| Переменная | Пример | Описание |
|------------|--------|----------|
| `DOMAIN` | `vortexm.ru` | Ваш домен без `https://` |
| `APP_NAME` | `VortexM` | Название в письмах |
| `APP_ENV` | `production` | Режим работы |
| `DEBUG` | `false` | ⚠️ В production всегда `false` |
| `SECRET_KEY` | `a1b2c3...` | Главный секрет приложения. Используется для JWT и криптографии. **Генерируйте случайно!** |
| `API_PREFIX` | `/api/v1` | Префикс API (не менять без причины) |
| `ALLOWED_ORIGINS` | `https://vortexm.ru` | С какого домена разрешены запросы к API (CORS). Только HTTPS в production |

> **Примечание:** в проекте **нет** отдельных `JWT_SECRET` и `JWT_REFRESH_SECRET`. JWT подписывается через `SECRET_KEY`. Сроки токенов задаются `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` и `JWT_REFRESH_TOKEN_EXPIRE_DAYS`.

#### База данных PostgreSQL

| Переменная | Пример | Описание |
|------------|--------|----------|
| `POSTGRES_USER` | `vortexm` | Имя пользователя БД |
| `POSTGRES_PASSWORD` | `случайный_пароль` | ⚠️ Сложный пароль, не `vortexm_secret` |
| `POSTGRES_DB` | `vortexm` | Имя базы |
| `DATABASE_URL` | `postgresql+asyncpg://vortexm:ПАРОЛЬ@postgres:5432/vortexm` | Строка подключения. Хост `postgres` — имя сервиса в Docker |

#### Redis и Celery

| Переменная | Пример | Описание |
|------------|--------|----------|
| `REDIS_URL` | `redis://redis:6379/0` | Кэш и сессии |
| `CELERY_BROKER_URL` | `redis://redis:6379/1` | Очередь фоновых задач |
| `CELERY_RESULT_BACKEND` | `redis://redis:6379/2` | Результаты задач |

Фоновые задачи: отправка email подтверждения, уведомления.

#### JWT

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Время жизни access-токена |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Время жизни refresh-токена |
| `JWT_ALGORITHM` | `HS256` | Алгоритм подписи |
| `JWT_ISSUER` | `vortexm` | Издатель токена |
| `JWT_AUDIENCE` | `vortexm-clients` | Аудитория токена |

#### Шифрование сообщений

| Переменная | Пример | Описание |
|------------|--------|----------|
| `MESSAGE_ENCRYPTION_KEY` | `base64:AbCdEf...==` | Ключ AES-256 для сообщений в БД. Генерация: `echo "base64:$(openssl rand -base64 32)"` |

#### CSRF и cookies (HTTPS)

| Переменная | Production | Описание |
|------------|------------|----------|
| `CSRF_COOKIE_SECURE` | `true` | Cookie только по HTTPS |
| `CSRF_COOKIE_SAMESITE` | `strict` | Защита от CSRF |

#### MinIO / S3 (файлы, аватары, медиа)

В Docker Compose MinIO использует переменные из `.env`:

| Переменная в .env | Аналог в Docker | Описание |
|-------------------|-----------------|----------|
| `S3_ACCESS_KEY` | `MINIO_ROOT_USER` | Логин администратора MinIO |
| `S3_SECRET_KEY` | `MINIO_ROOT_PASSWORD` | Пароль MinIO |
| `S3_ENDPOINT` | — | Внутренний адрес: `http://minio:9000` |
| `S3_BUCKET` | — | Имя bucket: `vortexm` |
| `S3_REGION` | — | Регион: `ru-msk` |
| `S3_PUBLIC_URL` | — | Публичный URL файлов (в private-режиме файлы идут через API) |
| `S3_PRIVATE_BUCKET` | — | `true` — доступ по presigned URL (безопаснее) |
| `STORAGE_PRESIGN_TTL_SECONDS` | — | Время жизни ссылки на файл (900 сек = 15 мин) |

⚠️ Не используйте `minioadmin` / `minioadmin` в production!

#### SMTP — почта (Mail.ru)

1. Зайдите на [mail.ru](https://mail.ru), создайте ящик `noreply@ваш-домен.ru` (или используйте @mail.ru).
2. Настройки → **Пароли для внешних приложений** → Создать пароль.
3. В `.env`:

```env
SMTP_HOST=smtp.mail.ru
SMTP_PORT=465
SMTP_USER=noreply@mail.ru
SMTP_PASSWORD=пароль_приложения_16_символов
SMTP_FROM=VortexM <noreply@mail.ru>
SMTP_USE_TLS=true
```

#### SMTP — Яндекс.Почта

1. [passport.yandex.ru](https://passport.yandex.ru) → Безопасность → **Пароли приложений**.
2. В `.env`:

```env
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=noreply@yandex.ru
SMTP_PASSWORD=пароль_приложения
SMTP_FROM=VortexM <noreply@yandex.ru>
SMTP_USE_TLS=true
```

#### YooKassa (платежи)

1. Зарегистрируйтесь на [yookassa.ru](https://yookassa.ru/).
2. Личный кабинет → **Настройки** → **Ключи API**:
   - `YOOKASSA_SHOP_ID` — идентификатор магазина
   - `YOOKASSA_SECRET_KEY` — секретный ключ
3. Webhook (уведомления об оплате):

   URL: `https://ваш-домен.ru/api/v1/wallet/webhook`  
   Секрет webhook → `YOOKASSA_WEBHOOK_SECRET` в `.env`

```env
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=live_xxxxxxxx
YOOKASSA_WEBHOOK_SECRET=ваш_webhook_секрет
YOOKASSA_RETURN_URL=https://vortexm.ru/wallet/success
YOOKASSA_MOCK=false
```

Для тестов в кабинете YooKassa есть **тестовый магазин** с тестовыми ключами.

#### LiveKit (видеозвонки)

| Переменная | Production | Описание |
|------------|------------|----------|
| `LIVEKIT_URL` | `wss://vortexm.ru/livekit` | **Публичный** URL для браузера клиента |
| `LIVEKIT_API_KEY` | случайная строка | Ключ API |
| `LIVEKIT_API_SECRET` | случайная строка | Секрет API |

⚠️ Ключи должны **совпадать** с файлом `infra/livekit.prod.yaml`:

```yaml
keys:
  ВАШ_LIVEKIT_API_KEY: ВАШ_LIVEKIT_API_SECRET
```

Внутри Docker backend общается с LiveKit по внутренней сети, но клиентам отдаётся `LIVEKIT_URL` из `.env` (публичный `wss://...`).

#### reCAPTCHA v3

1. [google.com/recaptcha/admin](https://www.google.com/recaptcha/admin) — создайте ключ **v3**.
2. Домены: `vortexm.ru`
3. В `.env`:

```env
RECAPTCHA_ENABLED=true
RECAPTCHA_SECRET_KEY=6Lc...серверный_ключ
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Lc...публичный_ключ
```

⚠️ `NEXT_PUBLIC_*` вшивается при **сборке** frontend — после изменения нужна пересборка (см. раздел 6).

#### Frontend (публичные URL)

| Переменная | Пример |
|------------|--------|
| `NEXT_PUBLIC_API_URL` | `https://vortexm.ru/api/v1` |
| `NEXT_PUBLIC_WS_URL` | `wss://vortexm.ru/ws` |
| `NEXT_PUBLIC_LIVEKIT_URL` | `wss://vortexm.ru/livekit` |

#### Суперадмин (создаётся автоматически при первом запуске)

| Переменная | Описание |
|------------|----------|
| `SUPERADMIN_USERNAME` | Логин в админку (по умолчанию `моргенштерн@2399`) |
| `SUPERADMIN_PASSWORD` | ⚠️ Задайте свой сложный пароль |
| `SUPERADMIN_EMAIL` | Email суперадмина |

#### Nginx

| Переменная | До SSL | После SSL |
|------------|--------|-----------|
| `NGINX_CONFIG` | `./nginx/nginx.http-only.conf` | `./nginx/nginx.prod.active.conf` |

---

## 4. Docker Compose для production

### 4.1. Какой файл использовать

Для production используется **`docker-compose.prod.yml`**, а не `docker-compose.yml` (последний — для локальной разработки с hot-reload).

### 4.2. Состав сервисов

| Сервис | Образ / сборка | Назначение | Данные на диске |
|--------|----------------|------------|-----------------|
| `postgres` | postgres:15-alpine | База данных | volume `postgres_data` |
| `redis` | redis:7-alpine | Кэш, очереди | volume `redis_data` |
| `minio` | minio/minio | Файловое хранилище S3 | volume `minio_data` |
| `minio-init` | minio/mc | Создание bucket при старте | — |
| `livekit` | livekit/livekit-server | Видеозвонки WebRTC | конфиг `infra/livekit.prod.yaml` |
| `backend` | сборка `./backend` | FastAPI API | — |
| `celery-worker` | сборка `./backend` | Фоновые задачи | — |
| `celery-beat` | сборка `./backend` | Планировщик задач | — |
| `frontend` | сборка `Dockerfile.prod` | Next.js сайт | — |
| `nginx` | nginx:1.27-alpine | HTTPS, прокси | сертификаты в `./certbot/` |

### 4.3. Что происходит при первом запуске backend

Автоматически выполняется:

1. `alembic upgrade head` — миграции БД
2. `python -m app.scripts.seed` — создание суперадмина и достижений
3. `uvicorn ... --workers 2` — запуск API

### 4.4. Порты наружу

Только **nginx** публикует порты **80** и **443**. Остальные сервисы доступны только внутри Docker-сети `internal`.

LiveKit дополнительно публикует порты 7880–7882 и UDP 50000–50100 для WebRTC.

---

## 5. Настройка Nginx (обратный прокси и SSL)

### 5.1. Где лежат конфиги

В проекте уже подготовлены конфиги (отдельный `nginx/site.conf` не нужен — всё в одном файле):

| Файл | Когда использовать |
|------|-------------------|
| `nginx/nginx.http-only.conf` | Первый запуск, выпуск SSL-сертификата |
| `nginx/nginx.prod.conf` | Шаблон HTTPS (плейсхолдер `YOUR_DOMAIN`) |
| `nginx/nginx.prod.active.conf` | Создаётся скриптом `init-ssl.sh` с вашим доменом |

Конфиг монтируется в контейнер:

```yaml
volumes:
  - ${NGINX_CONFIG}:/etc/nginx/nginx.conf:ro
```

### 5.2. Что настроено в Nginx

| Путь | Куда проксируется | Назначение |
|------|-------------------|------------|
| `/api/` | `backend:8000` | REST API |
| `/ws` | `backend:8000` | WebSocket (чаты, уведомления) |
| `/livekit` | `livekit:7880` | Сигналинг видеозвонков |
| `/` | `frontend:3000` | Сайт Next.js |
| `/.well-known/acme-challenge/` | `/var/www/certbot` | Проверка Let's Encrypt |

### 5.3. Безопасные заголовки

Уже включены в `nginx/nginx.prod.conf`:

- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy`
- `Referrer-Policy`
- `Permissions-Policy`

### 5.4. Rate limiting (защита от перегрузки)

```nginx
limit_req_zone $binary_remote_addr zone=api_global:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=auth_strict:10m rate=10r/m;
```

- Общий лимит API: 30 запросов/сек с IP
- Логин/регистрация: строже (10 запросов/мин)

### 5.5. Дополнительно: порты для видеозвонков (LiveKit)

Без UDP-портов звонки могут не установиться. На сервере:

```bash
sudo ufw allow 7880/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 7882/udp
sudo ufw allow 50000:50100/udp
```

В панели хостинга (если есть облачный firewall) — те же правила.

### 5.6. Получение SSL-сертификата (Let's Encrypt)

**Автоматически (рекомендуется):**

```bash
cd /opt/vortexm
./scripts/init-ssl.sh vortexm.ru admin@vortexm.ru
```

Скрипт:
1. Запускает nginx в HTTP-режиме
2. Получает сертификат через Certbot
3. Создаёт `nginx/nginx.prod.active.conf`
4. Перезапускает nginx с HTTPS

**Вручную:**

```bash
mkdir -p certbot/conf certbot/www

# HTTP-режим
export NGINX_CONFIG=./nginx/nginx.http-only.conf
docker compose -f docker-compose.prod.yml up -d nginx

# Сертификат
docker run --rm \
  -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/certbot/www:/var/www/certbot" \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d vortexm.ru \
  --email admin@vortexm.ru \
  --agree-tos \
  --no-eff-email

# Подставить домен
sed "s/YOUR_DOMAIN/vortexm.ru/g" nginx/nginx.prod.conf > nginx/nginx.prod.active.conf

# В .env: NGINX_CONFIG=./nginx/nginx.prod.active.conf
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

**Автообновление сертификата (cron):**

```bash
crontab -e
```

Добавьте строку:

```cron
0 3 * * * cd /opt/vortexm && docker run --rm -v "$(pwd)/certbot/conf:/etc/letsencrypt" -v "$(pwd)/certbot/www:/var/www/certbot" certbot/certbot renew --quiet && docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

---

## 6. Запуск и проверка

### 6.1. Первый запуск

```bash
cd /opt/vortexm

# Убедитесь, что .env заполнен
cp .env.production.example .env   # если ещё не создан
nano .env

# Настройте LiveKit
nano infra/livekit.prod.yaml

# Запуск
./scripts/deploy-prod.sh
```

Или вручную:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

⚠️ Первая сборка занимает **10–20 минут** (скачивание образов, сборка frontend и backend).

### 6.2. Проверка статуса контейнеров

```bash
docker compose -f docker-compose.prod.yml ps
```

**Ожидаемый вывод (все STATE = running):**

```
NAME                  STATUS
vortexm-backend-1     running
vortexm-frontend-1    running
vortexm-nginx-1       running
vortexm-postgres-1    running (healthy)
...
```

### 6.3. Просмотр логов

```bash
# Все сервисы
docker compose -f docker-compose.prod.yml logs -f

# Только backend
docker compose -f docker-compose.prod.yml logs -f backend

# Только ошибки за последние 100 строк
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

Выход из логов: **Ctrl+C**.

### 6.4. Миграции Alembic (вручную, если нужно)

Обычно выполняются автоматически при старте backend. Если нужно вручную:

```bash
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

### 6.5. Создание суперадмина (seed)

Выполняется автоматически при старте. Вручную:

```bash
docker compose -f docker-compose.prod.yml exec backend python -m app.scripts.seed
```

**Ожидаемый вывод:**

```
Superadmin created: моргенштерн@2399
Superadmin admin account ensured
Achievements seeded
```

или `Superadmin already exists` — если уже создан.

### 6.6. SSL и пересборка frontend

После получения SSL обновите URL в `.env` и пересоберите frontend:

```bash
./scripts/init-ssl.sh vortexm.ru admin@vortexm.ru

# В .env проверьте:
# NEXT_PUBLIC_API_URL=https://vortexm.ru/api/v1
# NEXT_PUBLIC_WS_URL=wss://vortexm.ru/ws
# NEXT_PUBLIC_LIVEKIT_URL=wss://vortexm.ru/livekit
# LIVEKIT_URL=wss://vortexm.ru/livekit
# ALLOWED_ORIGINS=https://vortexm.ru

docker compose -f docker-compose.prod.yml up -d --build frontend
```

### 6.7. Проверка в браузере

| Шаг | URL | Что проверить |
|-----|-----|---------------|
| 1 | `https://vortexm.ru` | Открывается главная страница |
| 2 | `https://vortexm.ru/api/v1/health` | JSON: `{"status":"ok"}` или аналог |
| 3 | `https://vortexm.ru/register` | Форма регистрации |
| 4 | `https://vortexm.ru/admin/login` | Вход в админ-панель |
| 5 | Логин суперадмина | `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` из `.env` |

⚠️ **Сразу после первого входа смените пароль суперадмина** в админ-панели.

### 6.8. Проверка WebSocket

1. Откройте сайт, войдите в аккаунт.
2. **F12** → вкладка **Network** → фильтр **WS**.
3. Должно быть соединение `wss://vortexm.ru/ws` со статусом **101**.

---

## 7. Резервное копирование

### 7.1. Скрипт бэкапа

В проекте есть `scripts/backup.sh`. Он создаёт архив с дампом PostgreSQL и данными MinIO.

```bash
chmod +x scripts/backup.sh
./scripts/backup.sh
```

Архивы сохраняются в `/opt/vortexm/backups/vortexm_backup_YYYYMMDD_HHMMSS.tar.gz`.  
Старые архивы (>14 дней) удаляются автоматически.

### 7.2. Ежедневный cron

```bash
crontab -e
```

Добавьте:

```cron
0 3 * * * /opt/vortexm/scripts/backup.sh >> /var/log/vortexm-backup.log 2>&1
```

### 7.3. Ручной дамп БД

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U vortexm vortexm | gzip > backup_$(date +%Y%m%d).sql.gz
```

### 7.4. Хранение в VK Cloud Object Storage (опционально)

Документация: [cloud.vk.com/docs/storage](https://cloud.vk.com/docs/storage/quick-start)

После бэкапа можно загружать архив в бакет:

```bash
# Установите aws-cli или s3cmd, настройте endpoint VK Cloud
aws s3 cp /opt/vortexm/backups/vortexm_backup_latest.tar.gz \
  s3://your-backup-bucket/ \
  --endpoint-url https://hb.ru-msk.vkcloud-storage.ru
```

⚠️ Храните бэкапы **минимум в двух местах**: на сервере + в облаке.

---

## 8. Мониторинг (опционально)

### 8.1. Базовая проверка

Каждый день или после обновлений:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50 backend
```

### 8.2. UptimeRobot (бесплатно)

1. Зарегистрируйтесь на [uptimerobot.com](https://uptimerobot.com/).
2. Add New Monitor → **HTTPS** → `https://vortexm.ru/api/v1/health`.
3. Укажите email/Telegram для уведомлений при падении.

### 8.3. Prometheus + Grafana (для продвинутых)

Кратко: можно добавить отдельный `docker-compose.monitoring.yml` с Prometheus, node-exporter и Grafana. Это необязательно на старте. Документация: [prometheus.io/docs](https://prometheus.io/docs/introduction/overview/).

---

## 9. Публикация Android-приложения в RuStore

> ⚠️ В текущей версии проекта есть **веб-приложение (PWA)** и **Next.js-сайт**. Отдельного нативного Android-проекта в репозитории пока нет. Ниже — общая инструкция, когда вы соберёте APK/AAB (через Capacitor, React Native или TWA).

### 9.1. Подготовка приложения

1. Соберите production-версию с URL вашего сервера:
   - API: `https://vortexm.ru/api/v1`
   - WebSocket: `wss://vortexm.ru/ws`
2. В Android Studio: **Build → Generate Signed Bundle / APK** → выберите **Android App Bundle (AAB)**.
3. Создайте keystore (храните в безопасном месте — без него нельзя обновлять приложение).

**Сборка из командной строки (если есть модуль `android/`):**

```bash
cd android
./gradlew bundleRelease
# AAB: android/app/build/outputs/bundle/release/app-release.aab
```

### 9.2. Аккаунт разработчика RuStore

1. Перейдите на [rustore.ru](https://www.rustore.ru/).
2. Раздел **Для разработчиков** → [Регистрация](https://www.rustore.ru/help/developers).
3. Оплатите регистрацию (если требуется по тарифу), заполните данные юрлица или ИП.

Документация: [help.rustore.ru](https://www.rustore.ru/help/developers)

### 9.3. Загрузка приложения

1. Войдите в [консоль разработчика RuStore](https://console.rustore.ru/).
2. **Создать приложение** → укажите название, категорию «Социальные» / «Коммуникации».
3. Загрузите **AAB**-файл.
4. Заполните метаданные:
   - Название: **VortexM**
   - Краткое описание (до 80 символов)
   - Полное описание
   - Иконка 512×512 (можно взять `frontend/public/icons/icon-512.png`)
   - Скриншоты телефона (минимум 2, 1080×1920 или требуемый формат RuStore)
5. **Политика конфиденциальности** — URL на страницу вашего сайта, например:
   - `https://vortexm.ru/pages/privacy` (если создана в админ-панели → Страницы)
   - или отдельная статическая страница на сайте
6. Укажите возрастной рейтинг, контакты поддержки.
7. Отправьте на модерацию.

### 9.4. Требования RuStore (чеклист)

- [ ] Приложение не падает при запуске
- [ ] Есть политика конфиденциальности (ссылка открывается)
- [ ] Разрешения (камера, микрофон) запрашиваются только при звонках
- [ ] Используется HTTPS для всех запросов
- [ ] Версия и код версии увеличиваются при каждом обновлении

---

## 10. Полезные ссылки, обновление и FAQ

### 10.1. Документация сервисов

| Сервис | Ссылка |
|--------|--------|
| Docker | [docs.docker.com](https://docs.docker.com/) |
| Docker Compose | [docs.docker.com/compose](https://docs.docker.com/compose/) |
| FastAPI | [fastapi.tiangolo.com](https://fastapi.tiangolo.com/) |
| Next.js | [nextjs.org/docs](https://nextjs.org/docs) |
| PostgreSQL | [postgresql.org/docs](https://www.postgresql.org/docs/) |
| Redis | [redis.io/docs](https://redis.io/docs/) |
| MinIO | [min.io/docs](https://min.io/docs/minio/linux/index.html) |
| LiveKit | [docs.livekit.io](https://docs.livekit.io/) |
| Let's Encrypt / Certbot | [certbot.eff.org](https://certbot.eff.org/) |
| YooKassa API | [yookassa.ru/developers](https://yookassa.ru/developers) |
| reCAPTCHA | [developers.google.com/recaptcha](https://developers.google.com/recaptcha) |
| VK Cloud Storage | [cloud.vk.com/docs/storage](https://cloud.vk.com/docs/storage) |
| RuStore для разработчиков | [rustore.ru/help/developers](https://www.rustore.ru/help/developers) |

### 10.2. Обновление проекта

```bash
cd /opt/vortexm
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Если менялись только переменные `NEXT_PUBLIC_*`:

```bash
docker compose -f docker-compose.prod.yml up -d --build frontend
```

### 10.3. Часто задаваемые вопросы (FAQ)

#### Сайт не открывается

1. `docker compose -f docker-compose.prod.yml ps` — все ли контейнеры running?
2. `sudo ufw status` — открыты ли 80 и 443?
3. DNS: `nslookup vortexm.ru` — правильный ли IP?
4. Логи: `docker compose -f docker-compose.prod.yml logs nginx`

#### 502 Bad Gateway

Backend ещё запускается (миграции). Подождите 1–2 минуты.  
Проверьте: `docker compose -f docker-compose.prod.yml logs backend`

#### Не приходит email при регистрации

- Проверьте `SMTP_USER` и `SMTP_PASSWORD` (пароль **приложения**, не основной пароль почты)
- Логи Celery: `docker compose -f docker-compose.prod.yml logs celery-worker`
- Убедитесь, что контейнер `celery-worker` запущен

#### Не загружаются файлы / аватары

- Проверьте `S3_ACCESS_KEY` и `S3_SECRET_KEY` в `.env`
- Убедитесь, что `minio` и `minio-init` в статусе running
- Логи: `docker compose -f docker-compose.prod.yml logs minio backend`

#### Frontend обращается к localhost вместо домена

Переменные `NEXT_PUBLIC_*` задаются при сборке. Измените `.env` и выполните:

```bash
docker compose -f docker-compose.prod.yml up -d --build frontend
```

#### WebSocket не подключается

- `NEXT_PUBLIC_WS_URL=wss://ваш-домен.ru/ws` (именно `wss://` после SSL)
- Проверьте nginx-прокси для `/ws`

#### Видеозвонки не работают

1. Ключи в `infra/livekit.prod.yaml` = ключи в `.env`
2. `LIVEKIT_URL=wss://ваш-домен.ru/livekit`
3. UDP-порты 50000–50100 открыты в firewall
4. Frontend пересобран с правильным `NEXT_PUBLIC_LIVEKIT_URL`

#### Ошибка SSL / certificate not found

Сначала выпустите сертификат (раздел 5.6). Не переключайте на HTTPS-конфиг до появления файлов в `certbot/conf/live/ваш-домен/`.

#### Нехватка памяти при сборке

На сервере с 4 ГБ RAM добавьте swap:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 10.4. Полезные команды

```bash
# Перезапуск одного сервиса
docker compose -f docker-compose.prod.yml restart backend

# Остановка всего (данные сохраняются)
docker compose -f docker-compose.prod.yml down

# Остановка с удалением данных (ОСТОРОЖНО!)
docker compose -f docker-compose.prod.yml down -v
```

---

## Контакты поддержки

| Канал | Контакт |
|-------|---------|
| Email поддержки | support@vortexm.ru *(замените на ваш)* |
| Telegram | @vortexm_support *(замените на ваш)* |
| Документация проекта | [README.md](./README.md) |

---

*Последнее обновление инструкции: июль 2026*
