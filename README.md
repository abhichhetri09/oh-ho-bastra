# Oh ho Bastra

Ecommerce storefront (Vite + React) and API (Express).

## Start everything with Docker

```bash
cp .env.example .env
npm run docker:up
```

Then open [http://localhost:5173](http://localhost:5173).

| Service | Container | Port |
|---|---|---|
| Postgres | `ohhb-db` | `5432` |
| API | `ohhb-api` | `5000` |
| Vite | `ohhb-web` | `5173` |

Stop:

```bash
npm run docker:down
```

Health check: [http://localhost:5173/api/v1/health](http://localhost:5173/api/v1/health).

Auth check: [http://localhost:5173/api/auth/ok](http://localhost:5173/api/auth/ok).

After pulling schema changes, apply migrations:

```bash
npm run db:migrate
```

## Host apps (optional)

If you prefer Vite and Express on the machine, keep only the database in Docker:

```bash
npm install
npm run db:up
npm run dev
```
