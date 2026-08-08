# FBMS Backend

Express + Mongoose REST API for the Feedback Management System. See the repository root `README.md` and `docs/ARCHITECTURE.md` for full project context.

## Scripts

- `npm run dev` — start the server with nodemon (auto-restart)
- `npm start` — start the server
- `npm run lint` — run ESLint

## Environment Variables

Copy `.env.example` to `.env` and set real values. See `docs/MONGODB_HANDOFF.md` for the approved development MongoDB Atlas connection string. Never commit `.env` or hardcode credentials in source code.

## Health Check

```text
GET /api/v1/health
```
