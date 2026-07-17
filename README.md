# Restaurant QR Ordering Backend

Production-ready Node.js backend for a restaurant QR menu and table ordering MVP. It is built as a one-time restaurant software product for v1, while keeping the architecture ready for multi-branch operations, analytics, payments, KDS, subscriptions, and loyalty.

## Tech Stack

- Node.js, TypeScript, Fastify
- Prisma ORM, PostgreSQL
- Socket.io live order updates
- JWT authentication, bcrypt password hashing
- Zod validation
- Swagger/OpenAPI at `/docs`
- Docker and Docker Compose
- Vitest integration tests
- Pino logging, Helmet, CORS, rate limiting

## Folder Structure

```text
src/
  app.ts
  server.ts
  config/
  plugins/
  common/
    errors/
    middleware/
    utils/
    types/
  modules/
    auth/
    users/
    restaurants/
    branches/
    tables/
    menu/
    public/
    admin/
    orders/
    dashboard/
    audit/
    payments/
    notifications/
prisma/
  schema.prisma
  seed.ts
tests/
```

Routes stay thin. Controllers validate requests with Zod, services own business rules, Prisma handles persistence, and shared concerns live under `common/`.

## Environment Variables

Copy `.env.example` to `.env`.

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/restaurant_dev
PORT=3000
NODE_ENV=development
JWT_SECRET=replace-with-a-random-secret-at-least-32-characters
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_MAX=300
RATE_LIMIT_WINDOW=1 minute
LOG_LEVEL=info
```

`FRONTEND_URL` is used for table QR URLs: `FRONTEND_URL/cafe/{slug}/menu?t={qrToken}`.

## Setup

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

The API starts on `http://localhost:3000`.

## Docker

```bash
docker compose up --build
```

The compose stack starts PostgreSQL and the API. The dev container runs Prisma generate, applies migrations with `migrate deploy`, then starts the Fastify server.

## Scripts

```bash
pnpm dev              # run local API with nodemon + ts-node
pnpm build            # compile TypeScript to dist/
pnpm start            # run compiled server
pnpm lint             # run ESLint
pnpm format           # run Prettier
pnpm test             # run Vitest integration tests
pnpm prisma:generate  # generate Prisma client
pnpm prisma:migrate   # create/apply dev migrations
pnpm prisma:seed      # seed demo restaurant data
pnpm prisma:studio    # open Prisma Studio
```

## API Docs

Swagger UI is exposed at:

```text
http://localhost:3000/docs
```

Every endpoint is registered with OpenAPI metadata, response envelopes, and auth security markers where required.

## Demo Credentials

Seed data creates:

- Owner: `owner@demo.com` / `Demo@12345`
- Platform admin: `admin@demo.com` / `Demo@12345`
- Kitchen: `kitchen@demo.com` / `Demo@12345`
- Restaurant: `Spice Garden Bistro`
- Public slug: `spice-garden-bistro` (seeded active and approved)
- Branch: `Main Branch`
- Tables: `Table 1` through `Table 5`
- Menu categories and items for starters, mains, biryani, beverages, and desserts

The seed prints `restaurantId`, `branchId`, table IDs, and sample QR URLs.

## Demo Flow

1. Login as owner with `POST /api/v1/auth/login`.
2. View branches and tables with `GET /api/v1/restaurants/:restaurantId/branches` and `GET /api/v1/branches/:branchId/tables`.
3. Open a printed QR URL or call `GET /api/v1/public/qr/:qrToken`.
4. Load the public menu with `GET /api/v1/public/menu/:qrToken`.
5. Place an order with `POST /api/v1/public/orders` and an optional `Idempotency-Key` header.
6. Join `restaurant:{restaurantId}` or `branch:{branchId}` over Socket.io with a JWT to watch `order:created`.
7. Update status with `PATCH /api/v1/orders/:orderId/status`.
8. Customer checks `GET /api/v1/public/orders/:orderId/status`.
9. Admin checks `GET /api/v1/restaurants/:restaurantId/dashboard/today`.

## Socket.io

Admin/KDS sockets authenticate with JWT in `handshake.auth.token` and can join:

- `restaurant:{restaurantId}`
- `branch:{branchId}`

Public customers can join:

- `order:{orderId}`

Backend events:

- `order:created`
- `order:status_updated`
- `order:cancelled`
- `menu:item_availability_updated`

## Testing

Tests are integration-style Fastify inject tests against PostgreSQL and Prisma.

```bash
pnpm test
```

Covered flows include register/login, invalid login, category/item creation, public menu filtering, QR order creation, idempotency, unavailable item rejection, invalid QR rejection, status transitions, today stats, and top items.

## Production Notes

- Use a managed PostgreSQL instance and run `prisma migrate deploy`.
- Set a strong `JWT_SECRET` and restrictive `CORS_ORIGIN`.
- Keep `NODE_ENV=production` to hide stack traces.
- Run behind HTTPS and a reverse proxy.
- Use persistent logs/metrics around Pino output.
- Payment and notification modules are intentionally interfaces/placeholders so Razorpay, WhatsApp, SMS, or email can be added without rewriting order logic.
- Order items store name and price snapshots, so menu edits do not rewrite historical orders.

Detailed production and pilot guidance:

- [Deployment](docs/DEPLOYMENT.md)
- [Security model](docs/SECURITY.md)
- [Pilot testing](docs/PILOT_TESTING.md)

Platform administration is exposed at `/api/v1/admin/cafes` and the frontend `/admin` route. Public
order placement is rate-limited separately through `PUBLIC_ORDER_RATE_LIMIT_MAX` and
`PUBLIC_ORDER_RATE_LIMIT_WINDOW`.
