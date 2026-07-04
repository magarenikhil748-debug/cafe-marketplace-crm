# Production Deployment

The recommended MVP topology is Vercel for the frontend, one Railway service for the backend and
Socket.io, and managed PostgreSQL.

## Backend environment

Set these on Railway:

```env
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require&connection_limit=5&pool_timeout=10
JWT_SECRET=a-random-secret-at-least-32-characters
JWT_EXPIRES_IN=12h
FRONTEND_URL=https://your-frontend.example
CORS_ORIGIN=https://your-frontend.example
TRUST_PROXY=true
PUBLIC_ORDER_RATE_LIMIT_MAX=10
PUBLIC_ORDER_RATE_LIMIT_WINDOW=10 minutes
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Use the exact deployed frontend origin for `FRONTEND_URL` and `CORS_ORIGIN`, with no trailing path.
Do not use `*` in production. The backend rejects wildcard production CORS configuration.

When entering `DATABASE_URL` in a shell, quote the complete value because `&` is a shell control
character. In Railway's variable editor, paste it as one value. A small Prisma pool
(`connection_limit=5`) is a safe starting point for one instance; tune it against the database
provider's connection limit.

Optional integrations:

```env
SENTRY_DSN=
```

Sentry remains optional. All three Cloudinary variables are required for direct owner cafe photo
uploads; missing values return a clear error from the upload endpoint without affecting the rest of
the application. Keep `CLOUDINARY_API_SECRET` on Railway only—never expose it through a
`NEXT_PUBLIC_*` variable. Uploaded cafe images use `tavero/cafes/<restaurantId>/` folders. Existing
hosted HTTPS image URLs and Tavero presets remain supported.

The current release uses signed access JWTs only. `JWT_REFRESH_SECRET` is not required because no
refresh-token route exists. Do not add an unused secret and assume refresh-token rotation is active.

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
```

Redeploy after changing any `NEXT_PUBLIC_*` value because Next.js embeds them at build time.
`NEXT_PUBLIC_APP_URL` and backend `FRONTEND_URL` must describe the same public frontend. QR codes
generated with localhost must be regenerated/reloaded before printing.

Cafe uploads are signed by the backend. Do not configure a Cloudinary secret or unsigned upload
preset in Vercel.

## Railway commands

```text
Build: corepack enable && pnpm install --frozen-lockfile && npx prisma generate && npm run build
Start: npx prisma migrate deploy && npm start
```

Do not run the seed on every deploy. If production seed data is intentionally needed once, set
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_OWNER_EMAIL`, and `SEED_OWNER_PASSWORD`, run
`npx prisma db seed` once, verify the records, and then remove the password variables from Railway.

## Owner account recovery

No email provider is installed, so Tavero does not present a fake forgot-password email flow.
Owners should contact Tavero support. A platform admin can set a temporary password from
`/admin/cafes`; the owner is then prompted to change it at `/dashboard/account` after login.

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
7. Convert a test lead, sign in as its owner, and confirm the temporary-password banner appears.
8. Change the owner password at `/dashboard/account`; verify the old password fails and the new one works.
9. Upload a JPEG/PNG/WebP image and save the cafe profile; reject SVG and files over 5 MB.
10. Open `/cafe/spice-garden-bistro/menu` without `?t=` and confirm it remains preview-only.
