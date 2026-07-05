import { describe, expect, it } from 'vitest'
import { app, authHeader, parseBody, setupOrderingFixture, type ApiEnvelope } from './helpers'

type PrintData = {
  cafe: {
    name: string
    address: string | null
    city: string | null
    phone: string | null
    branchName: string
    currency: string
  }
  order: {
    id: string
    orderNumber: string
    source: 'QR' | 'MANUAL'
    orderType: 'DINE_IN' | 'TAKEAWAY'
    table: { number: string | null; label: string | null } | null
    customerName: string | null
    status: string
    subtotalInPaise: number
    taxInPaise: number
    totalInPaise: number
    notes: string | null
    createdAt: string
    items: Array<{
      name: string
      unitPriceInPaise: number
      quantity: number
      totalPriceInPaise: number
      instructions: string | null
    }>
  }
}

let printQrAddressCounter = 1

const createQrOrder = async (qrToken: string, itemId: string) =>
  app().inject({
    method: 'POST',
    url: '/api/v1/public/orders',
    remoteAddress: `203.0.113.${printQrAddressCounter++}`,
    payload: {
      qrToken,
      customerName: 'Print Guest',
      customerPhone: '+919876543210',
      specialInstructions: 'Bring cutlery',
      items: [{ menuItemId: itemId, quantity: 2, instructions: 'Less spicy' }],
    },
  })

const createManualTakeaway = async (token: string, restaurantId: string, itemId: string) =>
  app().inject({
    method: 'POST',
    url: `/api/v1/restaurants/${restaurantId}/orders/manual`,
    headers: authHeader(token),
    payload: {
      orderType: 'TAKEAWAY',
      customerName: 'Counter Guest',
      notes: 'Pack separately',
      items: [{ menuItemId: itemId, quantity: 1, instructions: 'No onion' }],
    },
  })

const getPrintData = (restaurantId: string, orderId: string, token?: string) =>
  app().inject({
    method: 'GET',
    url: `/api/v1/restaurants/${restaurantId}/orders/${orderId}/print`,
    headers: token ? authHeader(token) : undefined,
  })

const createMemberToken = async (
  restaurantId: string,
  branchId: string,
  role: 'MANAGER' | 'STAFF' | 'KITCHEN',
  suffix: string,
) => {
  const user = await app().prisma.user.create({
    data: {
      name: `${role} Print User`,
      email: `print-${role.toLowerCase()}-${suffix}@example.com`,
      passwordHash: 'not-used-by-token-auth',
      role,
      memberships: { create: { restaurantId, branchId, role } },
    },
  })
  return app().jwt.sign({ sub: user.id, role: user.role, email: user.email })
}

describe('Order print data', () => {
  it('rejects logged-out requests', async () => {
    const response = await getPrintData(
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000001',
    )
    expect(response.statusCode).toBe(401)
  })

  it('returns complete own-cafe QR bill data from stored order values', async () => {
    const fixture = await setupOrderingFixture('print-own-qr')
    await app().prisma.restaurant.update({
      where: { id: fixture.restaurantId },
      data: { address: '12 Cafe Road', city: 'Bengaluru', phone: '+911234567890' },
    })
    const created = parseBody<ApiEnvelope<{ order: { id: string } }>>(
      await createQrOrder(fixture.table.qrToken, fixture.item.id),
    )
    const response = await getPrintData(fixture.restaurantId, created.data.order.id, fixture.token)
    const body = parseBody<ApiEnvelope<PrintData>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.cafe).toMatchObject({
      address: '12 Cafe Road',
      city: 'Bengaluru',
      phone: '+911234567890',
    })
    expect(body.data.order).toMatchObject({
      source: 'QR',
      orderType: 'DINE_IN',
      table: { number: fixture.table.tableNumber, label: fixture.table.tableLabel },
      customerName: 'Print Guest',
      notes: 'Bring cutlery',
      status: 'PLACED',
    })
    expect(body.data.order.items[0]).toMatchObject({
      name: 'Paneer Tikka',
      quantity: 2,
      unitPriceInPaise: 28000,
      totalPriceInPaise: 56000,
      instructions: 'Less spicy',
    })
  })

  it("rejects an owner fetching another cafe's print data", async () => {
    const owner = await setupOrderingFixture('print-owner-a')
    const other = await setupOrderingFixture('print-owner-b')
    const created = parseBody<ApiEnvelope<{ order: { id: string } }>>(
      await createQrOrder(other.table.qrToken, other.item.id),
    )

    const response = await getPrintData(other.restaurantId, created.data.order.id, owner.token)
    expect(response.statusCode).toBe(403)
  })

  it('allows manager and staff members of the cafe', async () => {
    const fixture = await setupOrderingFixture('print-team')
    const created = parseBody<ApiEnvelope<{ order: { id: string } }>>(
      await createQrOrder(fixture.table.qrToken, fixture.item.id),
    )
    const managerToken = await createMemberToken(
      fixture.restaurantId,
      fixture.branch.id,
      'MANAGER',
      'manager',
    )
    const staffToken = await createMemberToken(
      fixture.restaurantId,
      fixture.branch.id,
      'STAFF',
      'staff',
    )

    expect(
      (await getPrintData(fixture.restaurantId, created.data.order.id, managerToken)).statusCode,
    ).toBe(200)
    expect(
      (await getPrintData(fixture.restaurantId, created.data.order.id, staffToken)).statusCode,
    ).toBe(200)
  })

  it('rejects kitchen-only members consistently', async () => {
    const fixture = await setupOrderingFixture('print-kitchen')
    const created = parseBody<ApiEnvelope<{ order: { id: string } }>>(
      await createQrOrder(fixture.table.qrToken, fixture.item.id),
    )
    const kitchenToken = await createMemberToken(
      fixture.restaurantId,
      fixture.branch.id,
      'KITCHEN',
      'kitchen',
    )

    const response = await getPrintData(fixture.restaurantId, created.data.order.id, kitchenToken)
    expect(response.statusCode).toBe(403)
  })

  it('returns manual takeaway data without requiring a table', async () => {
    const fixture = await setupOrderingFixture('print-takeaway')
    const created = parseBody<ApiEnvelope<{ order: { id: string } }>>(
      await createManualTakeaway(fixture.token, fixture.restaurantId, fixture.item.id),
    )

    const response = await getPrintData(fixture.restaurantId, created.data.order.id, fixture.token)
    const body = parseBody<ApiEnvelope<PrintData>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.order).toMatchObject({
      source: 'MANUAL',
      orderType: 'TAKEAWAY',
      table: null,
      notes: 'Pack separately',
    })
  })

  it('returns cancelled orders clearly without changing their status', async () => {
    const fixture = await setupOrderingFixture('print-cancelled')
    const created = parseBody<ApiEnvelope<{ order: { id: string } }>>(
      await createQrOrder(fixture.table.qrToken, fixture.item.id),
    )
    await app().prisma.order.update({
      where: { id: created.data.order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })

    const body = parseBody<ApiEnvelope<PrintData>>(
      await getPrintData(fixture.restaurantId, created.data.order.id, fixture.token),
    )

    expect(body.data.order.status).toBe('CANCELLED')
    await expect(
      app().prisma.order.findUnique({ where: { id: created.data.order.id } }),
    ).resolves.toMatchObject({ status: 'CANCELLED' })
  })

  it('does not expose customer phone, owner, idempotency, or internal restaurant IDs', async () => {
    const fixture = await setupOrderingFixture('print-sensitive')
    const created = parseBody<ApiEnvelope<{ order: { id: string } }>>(
      await createQrOrder(fixture.table.qrToken, fixture.item.id),
    )

    const response = await getPrintData(fixture.restaurantId, created.data.order.id, fixture.token)
    const body = parseBody<ApiEnvelope<PrintData>>(response)
    const serialized = JSON.stringify(body.data)

    expect(serialized).not.toContain('+919876543210')
    expect(body.data.cafe).not.toHaveProperty('ownerId')
    expect(body.data.cafe).not.toHaveProperty('restaurantId')
    expect(body.data.order).not.toHaveProperty('customerPhone')
    expect(body.data.order).not.toHaveProperty('idempotencyKey')
  })
})
