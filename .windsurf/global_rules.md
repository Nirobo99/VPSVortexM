# Global Development Rules for VortexyM

These rules apply to all code written in this project. The AI assistant must strictly follow them.

## 1. Code Style & Quality
- **Language:** All code (variables, functions, comments) must be written in **English**.
- **Naming:** Use clear, descriptive, and self-documenting names. Follow `camelCase` for variables/functions, `PascalCase` for classes/components, and `UPPER_CASE` for constants.
- **Principles:** Adhere to **KISS** (Keep It Simple, Stupid) and **DRY** (Don't Repeat Yourself). Avoid over-engineering.
- **Comments:** Write comments only for complex or non-obvious logic. Do not comment obvious code. Keep comments up-to-date.
- **Formatting:** Use consistent indentation (2 spaces). Follow the style enforced by ESLint/Prettier (to be configured later).

## 2. JavaScript/Node.js Specific
- Use **async/await** instead of raw promises (`.then()` chains) where possible.
- Handle errors properly: use try/catch, and never expose internal error details (stack traces, database errors) to the client. Return user-friendly error messages.
- Validate all user inputs on the server side (use libraries like Joi or express-validator).
- Prefer `const` over `let` unless reassignment is needed.

## 3. Security
- **Secrets:** Never hardcode credentials, API keys, or passwords. Always use environment variables (`.env`) and keep `.env` out of version control (add to `.gitignore`).
- **Authentication:** Always verify JWT tokens and check user permissions before accessing protected resources.
- **Data Sanitization:** Escape output to prevent XSS attacks. Use parameterized queries or ORM to prevent SQL injection.
- **Rate Limiting:** Implement rate limiting on sensitive endpoints (login, registration, etc.) to prevent brute force.
- **Logging:** Log important actions, especially admin actions. Never log sensitive data (passwords, tokens).

## 4. Git & Version Control
- Write commit messages in English, following the [Conventional Commits](https://www.conventionalcommits.org/) format:
  - `feat: add new feature`
  - `fix: resolve issue`
  - `docs: update documentation`
  - `style: format code`
  - `refactor: restructure code`
  - `test: add tests`
  - `chore: update dependencies`
- Keep commits atomic (one logical change per commit).
- Do not commit temporary files, logs, or build artifacts.

## 5. Project Structure
- Organize code by feature/module, not by technical role (e.g., `routes`, `models`, `controllers` is acceptable, but prefer grouping by domain).
- Keep files small and focused (single responsibility).

## 6. Testing (Future)
- Write unit tests for critical business logic.
- Aim for high test coverage, especially for payment and security-related code.

## 7. Performance
- Avoid N+1 queries in database operations (use eager loading with Sequelize).
- Use Redis caching for frequently accessed data (user sessions, online status, etc.).
- Optimize image/video uploads (compression, thumbnails).

## 8. Documentation
- Document all API endpoints (preferably using Swagger/OpenAPI).
- Maintain a `README.md` with setup instructions and project overview.

These rules are mandatory. The AI must remind itself of them before generating any code. If unsure, ask for clarification.