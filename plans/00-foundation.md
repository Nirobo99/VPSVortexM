Привет, Cascade! Мы начинаем разработку мессенджера VortexyM согласно нашему Техническому заданию (ТЗ).

Текущий этап: Этап 0 – Фундамент и окружение.

Цель этапа: настроить среду разработки, поднять базы данных (PostgreSQL, Redis) через Docker, создать базовую структуру backend (Node.js/Express) и frontend (React/Vite), реализовать модели пользователей и базовую аутентификацию (регистрация, вход, JWT).

Важно: все команды и файлы создавай пошагово. После каждого значимого изменения мы будем тестировать. Используй лучшие практики безопасности: пароли хешировать (bcrypt), секреты хранить в .env, не коммитить .env в git.

План действий (подзадачи):

1. Создание структуры проекта

· Создай в корне папки: server, client.
· В папке server инициализируй npm-пакет (npm init -y).
· Установи необходимые зависимости: express, cors, dotenv, sequelize, pg, pg-hstore, redis, jsonwebtoken, bcrypt, socket.io.
· Установи nodemon как dev-зависимость.
· В корне проекта создай файл .gitignore (исключи node_modules, .env, dist, build).

2. Docker-окружение

· Создай в корне файл docker-compose.yml с сервисами:
  · postgres (образ postgres:15, БД vortexym, пользователь vortexym_user, пароль vortexym_pass, порт 5432).
  · redis (образ redis:7, порт 6379).
· Добавь volumes для сохранения данных.
· Напиши краткую инструкцию по запуску контейнеров (docker-compose up -d).

3. Настройка backend

· В папке server создай файл .env с переменными:
  ```
  PORT=3001
  DB_NAME=vortexym
  DB_USER=vortexym_user
  DB_PASSWORD=vortexym_pass
  DB_HOST=localhost
  DB_PORT=5432
  REDIS_HOST=localhost
  REDIS_PORT=6379
  JWT_SECRET=супер_секретный_ключ_измени_меня
  ```
· Создай файл server/app.js – базовый Express с middleware (cors, json).
· Создай файл server/server.js – запуск сервера на порту из .env.
· Добавь скрипты в package.json: "start": "node server.js", "dev": "nodemon server.js".

4. Подключение к базам данных

· Создай папку server/models.
· В server/models/index.js настрой подключение к PostgreSQL через Sequelize (используй переменные окружения).
· Создай файл server/utils/redis.js для подключения к Redis (используй redis клиент).
· Проверь подключения при старте сервера (логируй успех или ошибку).

5. Создание модели User

· В server/models/User.js определи модель User с полями:
  · id (integer, primaryKey, autoIncrement)
  · email (string, unique, allowNull false)
  · passwordHash (string, allowNull false)
  · name (string, allowNull false)
  · avatar (string, defaultValue: 'default-avatar.png')
  · birthYear (integer, allowNull false) – для проверки при регистрации
  · role (enum: 'user', 'admin', defaultValue: 'user')
  · stickerLimit (integer, defaultValue: 5)
  · invisible (boolean, defaultValue: false)
  · invisibleExpiry (date, allowNull true)
  · hidden (boolean, defaultValue: false) – для скрытых профилей (пригодится позже)
  · anonymous (boolean, defaultValue: false) – для анонимных профилей
· Добавь timestamps: true.
· Экспортируй модель из models/index.js.

6. Регистрация и вход (JWT)

· Создай папку server/routes и файл auth.js.
· В auth.js:
  · POST /register:
    · Принимает email, password, name, birthYear.
    · Хеширует пароль (bcrypt, salt rounds 10).
    · Создаёт пользователя в БД.
    · Возвращает успех (201).
  · POST /login:
    · Принимает email, password.
    · Ищет пользователя, сравнивает пароль.
    · Если верно, создаёт JWT (срок действия, например, 7 дней) и возвращает его.
· Подключи маршруты в app.js по пути /api/auth.
· Создай middleware server/middleware/auth.js, который проверяет JWT и добавляет пользователя в req.user.

7. Базовая защита и тестирование

· Добавь rate limiting для входа (например, 5 попыток за 15 минут) – можно использовать express-rate-limit или самодельный на Redis (отложим на потом, но заложим основу).
· Убедись, что все секреты в .env, а сам .env добавлен в .gitignore.
· Протестируй ручки через Postman или curl (можно написать простой тест в будущем).

8. Инициализация frontend (заготовка)

· В папке client выполни npm create vite@latest . -- --template react.
· Установи зависимости: axios, socket.io-client, react-router-dom, i18next, react-i18next.
· Создай базовую структуру: src/components, src/pages, src/services (api), src/i18n (для будущей локализации).
· Настрой прокси для разработки, чтобы запросы к API шли на backend (в vite.config.js добавить proxy).

9. Фиксация изменений

· После завершения всех шагов, сделай коммит в git с сообщением: "feat: этап 0 – фундамент и окружение".

Примечание: Пиши код последовательно, не перескакивай. Если что-то непонятно, спрашивай. После выполнения каждого пункта останавливайся и жди моего подтверждения (я буду говорить "дальше"). Давай начнём с создания структуры проекта и файла .gitignore.

