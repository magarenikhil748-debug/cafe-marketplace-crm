# Production Deployment

The recommended MVP topology is Vercel for the frontend, one Railway service for the backend and
Socket.io, and managed PostgreSQL.

## Backend environment

Set these on Railway:

```env
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require&connection_limit=5&pool_timeout=10
JWT_SECRET=a-random-secret-at-least-32-characters
FRONTEND_URL=https://your-frontend.example
CORS_ORIGIN=https://your-frontend.example
TRUST_PROXY=true
PUBLIC_ORDER_RATE_LIMIT_MAX=10
PUBLIC_ORDER_RATE_LIMIT_WINDOW=10 minutes
```

Use the exact deployed frontend origin for `FRONTEND_URL` and `CORS_ORIGIN`, with no trailing path.
Do not use `*` in production. The backend rejects wildcard production CORS configuration.

When entering `DATABASE_URL` in a shell, quote the complete value because `&` is a shell control
character. In Railway's variable editor, paste it as one value. A small Prisma pool
(`connection_limit=5`) is a safe starting point for one instance; tune it against the database
provider's connection limit.

Optional placeholders:

```env
SENTRY_DSN=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Sentry and Cloudinary SDKs are not installed in this checkpoint. These variables document the
production contract without making the working application depend on an unfinished integration.
Cafe and menu image fields continue to accept hosted HTTPS URLs.

## Database migration

Production releases must apply committed migrations:

```bash
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

Never use `prisma db push` or `prisma migrate dev` against production. The Phase 7 migration adds
the platform `ADMIN` enum value, so deploy migrations before starting this release.

## Frontend environment

Set these on Vercel:

```env
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
NEXT_PUBLIC_APP_URL=https://your-frontend.example
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=
```

Redeploy after changing any `NEXT_PUBLIC_*` value because Next.js embeds them at build time.
`NEXT_PUBLIC_APP_URL` and backend `FRONTEND_URL` must describe the same public frontend. QR codes
generated with localhost must be regenerated/reloaded before printing.

## Railway commands

```text
Build: npm install && npx prisma generate && npm run build
Start: npx prisma migrate deploy && npm start
```

Run `npm run prisma:seed` only in a disposable demo environment. Demo passwords are not suitable
for a real pilot.

## Socket.io and rate-limit scaling boundary

The current Socket.io room architecture is correct for a single backend instance. Do not enable
multiple Railway replicas yet: rooms and broadcasts are process-local. Horizontal scaling requires
a shared adapter such as `@socket.io/redis-adapter`, managed Redis, and suitable sticky routing.

Rate-limit counters are also process-memory based. They reset on restart and do not coordinate
across replicas. Move them to Redis before horizontal scaling.

## Smoke checks

1. Open backend `/docs`.
2. Confirm `GET /api/v1/public/cafes` succeeds.
3. Open `/cafes`, `/cafe/spice-garden-bistro`, and `/cafe/spice-garden-bistro/menu`.
4. Sign in to `/admin` and verify cafe approval controls.
5. Open `/dashboard/qr` and confirm the encoded URL is HTTPS, not localhost.
6. Place one QR order and confirm it appears live in `/dashboard/orders`.
