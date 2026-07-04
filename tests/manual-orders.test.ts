import { describe, expect, it } from 'vitest'
import { app, authHeader, parseBody, setupOrderingFixture, type ApiEnvelope } from './helpers'

type ManualOrder = {
  id: string
  restaurantId: string
  branchId: string
  tableId: string | null
  tableNumber: string | null
  orderNumber: string
  status: string
  orderType: 'DINE_IN' | 'TAKEAWAY'
  source: 'QR' | 'MANUAL'
  subtotalInPaise: number
  taxInPaise: number
  totalInPaise: number
  items: Array<{
    menuItemId: string
    unitPriceInPaise: number
    quantity: number
    totalPriceInPaise: number
  }>
}

const createManualOrder = (
  token: string | undefined,
  restaurantId: string,
  payload: Record<string, unknown>,
) =>
  app().inject({
    method: 'POST',
    url: `/api/v1/restaurants/${restaurantId}/orders/manual`,
    headers: token ? authHeader(token) : undefined,
    payload,
  })

describe('Manual order APIs', () => {
  it('rejects a logged-out manual order', async () => {
    const response = await createManualOrder(undefined, '00000000-0000-0000-0000-000000000000', {
      orderType: 'TAKEAWAY',
      items: [{ menuItemId: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
    })

    expect(response.statusCode).toBe(401)
  })

  it('creates a manual dine-in order for the owner active table', async () => {
    const fixture = await setupOrderingFixture('manual-dine-in')
    const response = await createManualOrder(fixture.token, fixture.restaurantId, {
      orderType: 'DINE_IN',
      tableId: fixture.table.id,
      customerName: 'Counter Guest',
      customerPhone: '+919876543210',
      notes: 'Serve water first',
      items: [{ menuItemId: fixture.item.id, quantity: 2, instructions: 'Less spicy' }],
    })
    const body = parseBody<ApiEnvelope<{ order: ManualOrder }>>(response)

    expect(response.statusCode).toBe(201)
    expect(body.data.order).toMatchObject({
      restaurantId: fixture.restaurantId,
      tableId: fixture.table.id,
      tableNumber: fixture.table.tableNumber,
      orderType: 'DINE_IN',
      source: 'MANUAL',
      status: 'PLACED',
    })
    await expect(
      app().prisma.auditLog.count({ where: { action: 'order.manual_created' } }),
    ).resolves.toBe(1)
  })

  it('creates a takeaway order without a table and accepts orderMode', async () => {
    const fixture = await setupOrderingFixture('manual-takeaway')
    const response = await createManualOrder(fixture.token, fixture.restaurantId, {
      orderMode: 'TAKEAWAY',
      items: [{ menuItemId: fixture.item.id, quantity: 1 }],
    })
    const body = parseBody<ApiEnvelope<{ order: ManualOrder }>>(response)

    expect(response.statusCode).toBe(201)
    expect(body.data.order).toMatchObject({
      tableId: null,
      tableNumber: null,
      orderType: 'TAKEAWAY',
      source: 'MANUAL',
    })
  })

  it('allows a staff member of the restaurant to create a manual order', async () => {
    const fixture = await setupOrderingFixture('manual-staff')
    const staff = await app().prisma.user.create({
      data: {
        name: 'Counter Staff',
        email: 'manual-staff@example.com',
        passwordHash: 'not-used-by-token-auth',
        role: 'STAFF',
        memberships: {
          create: {
            restaurantId: fixture.restaurantId,
            branchId: fixture.branch.id,
            role: 'STAFF',
          },
        },
      },
    })
    const token = app().jwt.sign({ sub: staff.id, role: staff.role, email: staff.email })
    const response = await createManualOrder(token, fixture.restaurantId, {
      orderType: 'TAKEAWAY',
      items: [{ menuItemId: fixture.item.id, quantity: 1 }],
    })

    expect(response.statusCode).toBe(201)
  })

  it('rejects a kitchen-only member from creating a manual order', async () => {
    const fixture = await setupOrderingFixture('manual-kitchen')
    const kitchen = await app().prisma.user.create({
      data: {
        name: 'Kitchen User',
        email: 'manual-kitchen@example.com',
        passwordHash: 'not-used-by-token-auth',
        role: 'KITCHEN',
        memberships: {
          create: {
            restaurantId: fixture.restaurantId,
            branchId: fixture.branch.id,
            role: 'KITCHEN',
          },
        },
      },
    })
    const token = app().jwt.sign({ sub: kitchen.id, role: kitchen.role, email: kitchen.email })
    const response = await createManualOrder(token, fixture.restaurantId, {
      orderType: 'TAKEAWAY',
      items: [{ menuItemId: fixture.item.id, quantity: 1 }],
    })

    expect(response.statusCode).toBe(403)
  })

  it('rejects an owner creating an order for another restaurant', async () => {
    const owner = await setupOrderingFixture('manual-owner-a')
    const other = await setupOrderingFixture('manual-owner-b')
    const response = await createManualOrder(owner.token, other.restaurantId, {
      orderType: 'DINE_IN',
      tableId: other.table.id,
      items: [{ menuItemId: other.item.id, quantity: 1 }],
    })

    expect(response.statusCode).toBe(403)
  })

  it('rejects a table from another restaurant', async () => {
    const owner = await setupOrderingFixture('manual-table-a')
    const other = await setupOrderingFixture('manual-table-b')
    const response = await createManualOrder(owner.token, owner.restaurantId, {
      orderType: 'DINE_IN',
      tableId: other.table.id,
      items: [{ menuItemId: owner.item.id, quantity: 1 }],
    })
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(400)
    expect(body.code).toBe('TABLE_NOT_FOUND')
  })

  it('rejects an unavailable menu item', async () => {
    const fixture = await setupOrderingFixture('manual-unavailable')
    await app().prisma.menuItem.update({
      where: { id: fixture.item.id },
      data: { isAvailable: false },
    })
    const response = await createManualOrder(fixture.token, fixture.restaurantId, {
      orderType: 'TAKEAWAY',
      items: [{ menuItemId: fixture.item.id, quantity: 1 }],
    })
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(400)
    expect(body.code).toBe('MENU_ITEM_UNAVAILABLE')
  })

  it('rejects unsafe quantities and oversized customer input', async () => {
    const fixture = await setupOrderingFixture('manual-input-caps')
    const quantityResponse = await createManualOrder(fixture.token, fixture.restaurantId, {
      orderType: 'TAKEAWAY',
      items: [{ menuItemId: fixture.item.id, quantity: 21 }],
    })
    const customerResponse = await createManualOrder(fixture.token, fixture.restaurantId, {
      orderType: 'TAKEAWAY',
      customerName: 'x'.repeat(121),
      items: [{ menuItemId: fixture.item.id, quantity: 1 }],
    })

    expect(quantityResponse.statusCode).toBe(400)
    expect(customerResponse.statusCode).toBe(400)
  })

  it('rejects a menu item from another restaurant', async () => {
    const owner = await setupOrderingFixture('manual-item-a')
    const other = await setupOrderingFixture('manual-item-b')
    const response = await createManualOrder(owner.token, owner.restaurantId, {
      orderType: 'TAKEAWAY',
      items: [{ menuItemId: other.item.id, quantity: 1 }],
    })
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(400)
    expect(body.code).toBe('MENU_ITEM_UNAVAILABLE')
  })

  it('ignores a client-sent item price', async () => {
    const fixture = await setupOrderingFixture('manual-price')
    const response = await createManualOrder(fixture.token, fixture.restaurantId, {
      orderType: 'TAKEAWAY',
      items: [{ menuItemId: fixture.item.id, quantity: 1, priceInPaise: 1 }],
    })
    const body = parseBody<ApiEnvelope<{ order: ManualOrder }>>(response)

    expect(response.statusCode).toBe(201)
    expect(body.data.order.items[0]?.unitPriceInPaise).toBe(28000)
    expect(body.data.order.subtotalInPaise).toBe(28000)
  })

  it('calculates subtotal, tax, and total from database prices', async () => {
    const fixture = await setupOrderingFixture('manual-total')
    const response = await createManualOrder(fixture.token, fixture.restaurantId, {
      orderType: 'TAKEAWAY',
      items: [{ menuItemId: fixture.item.id, quantity: 2 }],
    })
    const body = parseBody<ApiEnvelope<{ order: ManualOrder }>>(response)

    expect(response.statusCode).toBe(201)
    expect(body.data.order.subtotalInPaise).toBe(56000)
    expect(body.data.order.taxInPaise).toBe(2800)
    expect(body.data.order.totalInPaise).toBe(58800)
    expect(body.data.order.items[0]?.totalPriceInPaise).toBe(56000)
  })

  it('supports the existing order status workflow', async () => {
    const fixture = await setupOrderingFixture('manual-status')
    const created = parseBody<ApiEnvelope<{ order: ManualOrder }>>(
      await createManualOrder(fixture.token, fixture.restaurantId, {
        orderType: 'TAKEAWAY',
        items: [{ menuItemId: fixture.item.id, quantity: 1 }],
      }),
    )

    const response = await app().inject({
      method: 'PATCH',
      url: `/api/v1/orders/${created.data.order.id}/status`,
      headers: authHeader(fixture.token),
      payload: { status: 'ACCEPTED' },
    })
    const body = parseBody<ApiEnvelope<{ order: ManualOrder }>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.order.status).toBe('ACCEPTED')
  })
})
