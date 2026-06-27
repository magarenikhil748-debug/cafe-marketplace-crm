import { describe, expect, it } from 'vitest'
import {
  app,
  createBranch,
  createCategory,
  createItem,
  createTable,
  parseBody,
  registerOwner,
  type ApiEnvelope,
} from './helpers'

type CafeOrder = {
  id: string
  restaurantId: string
  branchId: string
  tableId: string
  tableNumber: string
  orderNumber: string
  status: string
  subtotalInPaise: number
  taxInPaise: number
  totalInPaise: number
  specialInstructions: string | null
  items: Array<{
    menuItemId: string
    name: string
    unitPriceInPaise: number
    quantity: number
    totalPriceInPaise: number
  }>
}

const setupApprovedCafe = async (suffix: string) => {
  const registered = await registerOwner(app(), suffix)
  const token = registered.data.accessToken
  const restaurantId = registered.data.restaurant.id
  const slug = registered.data.restaurant.slug
  const branch = await createBranch(app(), token, restaurantId)
  const table = await createTable(app(), token, branch.id)
  const category = await createCategory(app(), token, restaurantId)
  const item = await createItem(app(), token, category.id)

  await app().prisma.restaurant.update({
    where: { id: restaurantId },
    data: { isApproved: true },
  })

  return { registered, token, restaurantId, slug, branch, table, category, item }
}

const placeCafeOrder = (
  slug: string,
  qrToken: string,
  menuItemId: string,
  overrides: Record<string, unknown> = {},
) =>
  app().inject({
    method: 'POST',
    url: `/api/v1/public/cafes/${slug}/orders`,
    payload: {
      qrToken,
      customerName: 'Cafe Guest',
      customerPhone: '+919999999998',
      specialInstruction: 'Less spicy',
      items: [{ menuItemId, quantity: 2 }],
      ...overrides,
    },
  })

describe('Public cafe table ordering APIs', () => {
  it('lists active tables for an approved cafe', async () => {
    const fixture = await setupApprovedCafe('cafe-tables')
    const inactiveTable = await createTable(app(), fixture.token, fixture.branch.id, {
      tableNumber: '2',
      tableLabel: 'Table 2',
    })

    await app().prisma.diningTable.update({
      where: { id: inactiveTable.id },
      data: { isActive: false },
    })

    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/public/cafes/${fixture.slug}/tables`,
    })
    const body = parseBody<
      ApiEnvelope<{
        cafe: { id: string; slug: string }
        tables: Array<{
          id: string
          tableNumber: string
          tableLabel: string | null
          branch: { id: string; name: string }
        }>
      }>
    >(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.cafe.id).toBe(fixture.restaurantId)
    expect(body.data.tables).toHaveLength(1)
    expect(body.data.tables[0]?.tableNumber).toBe('1')
    expect(body.data.tables[0]).not.toHaveProperty('qrToken')
    expect(body.data.tables[0]).not.toHaveProperty('qrUrl')
  })

  it('places an order using a valid table QR token', async () => {
    const fixture = await setupApprovedCafe('cafe-order-success')
    const response = await placeCafeOrder(fixture.slug, fixture.table.qrToken, fixture.item.id)
    const body = parseBody<ApiEnvelope<{ order: CafeOrder }>>(response)

    expect(response.statusCode).toBe(201)
    expect(body.data.order.restaurantId).toBe(fixture.restaurantId)
    expect(body.data.order.branchId).toBe(fixture.branch.id)
    expect(body.data.order.tableId).toBe(fixture.table.id)
    expect(body.data.order.tableNumber).toBe('1')
    expect(body.data.order.status).toBe('PLACED')
    expect(body.data.order.specialInstructions).toBe('Less spicy')
    expect(body.data.order.items[0]?.name).toBe('Paneer Tikka')

    const storedOrder = await app().prisma.order.findUnique({
      where: { id: body.data.order.id },
      include: { items: true },
    })
    expect(storedOrder?.tableNumberSnapshot).toBe('1')
    expect(storedOrder?.items[0]?.itemNameSnapshot).toBe('Paneer Tikka')
    expect(storedOrder?.items[0]?.unitPriceInPaise).toBe(28000)
  })

  it('rejects order placement when the cafe is not approved', async () => {
    const registered = await registerOwner(app(), 'cafe-unapproved-order')
    const token = registered.data.accessToken
    const restaurantId = registered.data.restaurant.id
    const branch = await createBranch(app(), token, restaurantId)
    await createTable(app(), token, branch.id)
    const category = await createCategory(app(), token, restaurantId)
    const item = await createItem(app(), token, category.id)

    const table = await app().prisma.diningTable.findFirstOrThrow({
      where: { restaurantId },
    })
    const response = await placeCafeOrder(registered.data.restaurant.slug, table.qrToken, item.id)
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(404)
    expect(body.code).toBe('RESTAURANT_NOT_FOUND')
  })

  it('rejects order placement without a table QR token', async () => {
    const fixture = await setupApprovedCafe('cafe-missing-qr')
    const response = await app().inject({
      method: 'POST',
      url: `/api/v1/public/cafes/${fixture.slug}/orders`,
      payload: { items: [{ menuItemId: fixture.item.id, quantity: 1 }] },
    })
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(403)
    expect(body.code).toBe('QR_REQUIRED')
    expect(body.message).toContain('scan the QR code')
  })

  it('rejects an invalid table QR token', async () => {
    const fixture = await setupApprovedCafe('cafe-invalid-qr')
    const response = await placeCafeOrder(fixture.slug, 'invalid-token', fixture.item.id)
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(403)
    expect(body.code).toBe('INVALID_TABLE_QR')
    expect(body.message).toContain('invalid or expired')
  })

  it('rejects a QR token for an inactive table', async () => {
    const fixture = await setupApprovedCafe('cafe-inactive-table-qr')
    await app().prisma.diningTable.update({
      where: { id: fixture.table.id },
      data: { isActive: false },
    })

    const response = await placeCafeOrder(fixture.slug, fixture.table.qrToken, fixture.item.id)
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(403)
    expect(body.code).toBe('INVALID_TABLE_QR')
  })

  it('rejects a valid QR token that belongs to another cafe', async () => {
    const firstCafe = await setupApprovedCafe('cafe-token-owner')
    const secondCafe = await setupApprovedCafe('cafe-token-other')

    const response = await placeCafeOrder(
      firstCafe.slug,
      secondCafe.table.qrToken,
      firstCafe.item.id,
    )
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(403)
    expect(body.code).toBe('INVALID_TABLE_QR')
  })

  it('rejects a menu item that belongs to another cafe', async () => {
    const firstCafe = await setupApprovedCafe('cafe-item-owner')
    const secondCafe = await setupApprovedCafe('cafe-item-other')

    const response = await placeCafeOrder(
      firstCafe.slug,
      firstCafe.table.qrToken,
      secondCafe.item.id,
    )
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(400)
    expect(body.code).toBe('MENU_ITEM_UNAVAILABLE')
  })

  it('calculates item prices and totals from the database', async () => {
    const fixture = await setupApprovedCafe('cafe-server-price')
    const response = await placeCafeOrder(fixture.slug, fixture.table.qrToken, fixture.item.id, {
      subtotalInPaise: 1,
      taxInPaise: 0,
      totalInPaise: 1,
      items: [
        {
          menuItemId: fixture.item.id,
          quantity: 2,
          priceInPaise: 1,
          unitPriceInPaise: 1,
        },
      ],
    })
    const body = parseBody<ApiEnvelope<{ order: CafeOrder }>>(response)

    expect(response.statusCode).toBe(201)
    expect(body.data.order.items[0]?.unitPriceInPaise).toBe(28000)
    expect(body.data.order.items[0]?.totalPriceInPaise).toBe(56000)
    expect(body.data.order.subtotalInPaise).toBe(56000)
    expect(body.data.order.taxInPaise).toBe(2800)
    expect(body.data.order.totalInPaise).toBe(58800)
  })

  it('rate-limits excessive public order attempts with a clear response', async () => {
    const fixture = await setupApprovedCafe('cafe-order-rate-limit')
    const responses = []

    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(
        await app().inject({
          method: 'POST',
          url: `/api/v1/public/cafes/${fixture.slug}/orders`,
          remoteAddress: '198.51.100.42',
          headers: {
            'idempotency-key': 'rate-limit-order-key',
          },
          payload: {
            qrToken: fixture.table.qrToken,
            items: [{ menuItemId: fixture.item.id, quantity: 1 }],
          },
        }),
      )
    }

    expect(responses[0]?.statusCode).toBe(201)
    expect(responses[9]?.statusCode).toBe(200)
    expect(responses[10]?.statusCode).toBe(429)
    const body = parseBody<ApiEnvelope<unknown>>(responses[10]!)
    expect(body.code).toBe('RATE_LIMITED')
    expect(body.message).toContain('Too many requests')
  })
})
