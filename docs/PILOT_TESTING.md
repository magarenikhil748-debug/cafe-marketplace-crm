# Pilot Demo Checklist

## Prepare

1. Apply migrations with `npx prisma migrate deploy`.
2. Run `npm run prisma:seed` only in the demo database.
3. Start the backend with `npm run dev`.
4. Start the frontend from `frontend` with `npm run dev`.
5. Confirm `spice-garden-bistro` is approved and active.

Demo credentials:

- Platform admin: `admin@demo.com` / `Demo@12345`
- Cafe owner: `owner@demo.com` / `Demo@12345`
- Kitchen: `kitchen@demo.com` / `Demo@12345`

## Marketplace and ordering

1. Open `/cafes` and confirm Spice Garden Bistro appears.
2. Open `/cafe/spice-garden-bistro`; check profile, menu preview, and share controls.
3. Open `/cafe/spice-garden-bistro/menu`.
4. Select an active table, add an item, and place an order.
5. Confirm the request only sends table/customer/instruction fields and item IDs/quantities.
6. Confirm the success card displays an order number.

## Live operations

1. Sign in at `/dashboard/orders` as owner in another window.
2. Place a public order and confirm `order:created` adds/highlights it without a reload.
3. Move it through the supported status sequence.
4. Confirm totals and item snapshots remain visible.

## Platform admin

1. Open `/admin` logged out; confirm the admin sign-in screen.
2. Sign in as owner; confirm an unauthorized state.
3. Sign in as platform admin.
4. Unapprove the cafe; confirm it disappears from `/cafes` and public APIs.
5. Approve it again; confirm it returns.
6. Suspend it; confirm it disappears publicly.
7. Reactivate it; confirm it returns.

## QR deployment

1. Open `/dashboard/qr` as owner.
2. Confirm the displayed URL matches the deployed HTTPS frontend and has no localhost warning.
3. Download and scan the QR from a second device.
4. Test Copy link and WhatsApp share.

## Abuse and failure states

1. Exceed the configured public order request limit from one client address.
2. Confirm the next response is `429` with code `RATE_LIMITED`.
3. Confirm invalid tables and cross-cafe menu items are rejected.
4. Confirm a failed request shows an error and does not duplicate an order.

## Sign-off

- Marketplace visibility rules work.
- Admin authorization works.
- QR resolves on a real phone.
- Ordering, idempotency, and live dashboard updates work.
- No owner/private data appears in public cafe payloads.
- Production environment values and migration logs are archived.
