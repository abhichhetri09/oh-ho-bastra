# Oh Ho Bastra

Ecommerce storefront (`web`, Vite + React) and API (`api`, Express + Postgres). npm workspaces at the repo root.

## Prerequisites

- Node.js 22
- Docker (for Postgres, or for the full stack)

## First-time setup

```bash
cp .env.example .env
```

Set `BETTER_AUTH_SECRET` in `.env` to a random value:

```bash
openssl rand -base64 32
```

Leave `DATABASE_URL` pointing at `localhost:5432` for host commands (`db:migrate`, `npm run dev`). Docker Compose overrides it inside the API container.

## Start the app

### Option A — Docker (Postgres, API, and Vite)

```bash
npm run docker:up
```

Then apply migrations and load the catalog (from the host, once Postgres is up):

```bash
npm run db:migrate
npm run db:seed
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` to the API.

| Service  | Container        | Port |
| -------- | ---------------- | ---- |
| Postgres | `ohhobastra-db`  | 5432 |
| API      | `ohhobastra-api` | 5000 |
| Vite     | `ohhobastra-web` | 5173 |

Stop:

```bash
npm run docker:down
```

### Option B — Apps on the host, Postgres in Docker

```bash
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Same URLs as above. `npm run dev` starts the API on `:5000` and Vite on `:5173`.

Useful splits:

```bash
npm run dev:api
npm run dev:web
```

## Checks

- Shop: [http://localhost:5173](http://localhost:5173)
- Products: [http://localhost:5173/api/v1/products](http://localhost:5173/api/v1/products)
- Checkout: add a tee to the bag → Checkout. Payments are mocked (Paytrail-style bank, MobilePay, card, Klarna); approve or cancel on the test payment page.
- API health: [http://localhost:5173/api/v1/health](http://localhost:5173/api/v1/health) (or [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health))
- Auth: [http://localhost:5173/api/auth/ok](http://localhost:5173/api/auth/ok)
- Google sign-in: set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`, and add redirect URI `http://localhost:5173/api/auth/callback/google` in Google Cloud Console

## Admin

Sign up on the site, then grant that account admin access (after that, admins can promote others from **Customers**):

```bash
npm run admin:grant -- you@example.fi
npm run admin:grant -- you@example.fi --revoke   # back to customer
```

Sign in again and open [http://localhost:5173/admin](http://localhost:5173/admin):

- **Dashboard**: 30-day revenue, orders to ship, low stock, recent orders
- **Orders**: filter, search, ship with tracking number, cancel with reason, timeline and internal notes
- **Products**: price, visibility, stock per size
- **Customers**: orders and spend per customer, make or remove admins, ban (7 days, 30 days or permanently), sign out everywhere
- **Settings**: store details, shipping options and prices, free-shipping threshold, payment methods, low-stock threshold (checkout uses these right away)

## Database

After pulling schema changes, or on a fresh database:

```bash
npm run db:migrate
```

Load or refresh the product catalog (idempotent; keeps existing stock levels):

```bash
npm run db:seed
```

Replace the whole catalog (products, sizes, photos, collections) with the seed. Orders and accounts are kept; their lines keep their own name, price and photo:

```bash
npm run db:reset-catalog
```

Product photos: seed photos live in `api/seed/images` (credits in `CREDITS.md`) and are copied to `api/uploads/seed` by the seed. Photos uploaded in the admin go to `api/uploads` (git-ignored) and are served at `/api/uploads/...`.

Generate a new migration from Drizzle schema (API workspace):

```bash
npm run db:generate
```

Postgres only (no API/web containers):

```bash
npm run db:up
```
