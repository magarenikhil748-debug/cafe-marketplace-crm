# Security Model

## Authorization boundaries

- Public marketplace reads return only cafes where `isActive=true` and `isApproved=true`.
- Public responses do not include owner account data.
- Cafe dashboard APIs require JWT authentication and restaurant membership checks.
- Platform admin APIs require authentication and the global `ADMIN` role.
- Owners and staff receive `403` from `/api/v1/admin/*`.
- Member creation permits only `MANAGER`, `STAFF`, or `KITCHEN`; it cannot create `OWNER` or
  `ADMIN`.

The admin role is global and must be granted through a controlled operational process, never public
registration.

## Account security

- Authenticated users change their own password through `POST /api/v1/auth/change-password` after
  proving the current password.
- Lead-converted owners and admin-reset owners are marked `mustChangePassword=true`; changing their
  password clears the flag.
- Password hashes and temporary passwords never appear in API responses or audit metadata.
- There is no email delivery or refresh-token infrastructure in this release. Recovery is therefore
  admin-assisted through `POST /api/v1/admin/cafes/:restaurantId/owner-password`.
- Existing access tokens remain valid after a password change. Owners can continue their current
  session; use account deactivation for immediate access revocation.

## Public ordering

Both public order routes are throttled separately from normal API traffic:

- `POST /api/v1/public/cafes/:slug/orders`
- `POST /api/v1/public/orders` (legacy per-table QR compatibility)

The default is 10 requests per 10 minutes per client address. Idempotency remains the primary
duplicate-order protection. Prices and totals are calculated from database records; frontend
totals are never accepted.

Behind Railway or another trusted reverse proxy, set `TRUST_PROXY=true` so Fastify uses the
forwarded client address. Do not enable it for untrusted forwarding headers.

## Production configuration

- Use `NODE_ENV=production`.
- Use a unique random `JWT_SECRET` of at least 32 characters.
- Set one exact HTTPS `CORS_ORIGIN`; wildcard production CORS is rejected.
- Keep database and Cloudinary API secrets server-side.
- Only `NEXT_PUBLIC_*` variables may enter the frontend bundle.
- Use HTTPS for frontend, backend, image assets, and QR destinations.
- Do not commit `.env`, database dumps, build output, or logs.

## Operational safeguards

- Suspending or unapproving a cafe immediately removes it from public marketplace routes.
- Admin approval/status changes use the existing audit log.
- Create named administrator accounts and rotate all demo credentials before a pilot.

## Known boundaries

- Rate limiting is in-memory and single-instance.
- Socket.io rooms are single-instance until a shared adapter is added.
- Sentry variables are reserved, but runtime reporting is not installed.
- Cloudinary uploads are signed server-side and accept only JPEG, PNG, or WebP files up to 5 MB.
- Password reset email and token-version-based JWT revocation are not implemented.
- PostHog is opt-in and sends no customer name, phone, or order contents.
