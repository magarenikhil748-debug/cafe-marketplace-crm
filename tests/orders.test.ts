import { describe, expect, it } from 'vitest'
import { app, authHeader, parseBody, setupOrderingFixture, type ApiEnvelope } from './helpers'

let publicOrderRequestCounter = 1

const placeOrder = async (qrToken: string, itemId: string, idempotencyKey?: string) =>
  app().inject({
    method: 'POST',
    url: '/api/v1/public/orders',
    remoteAddress: `192.0.2.${publicOrderRequestCounter++}`,
    headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : undefined,
    payload: {
      qrToken,
      customerName: 'Test Guest',
      items: [{ menuItemId: itemId, quantity: 2 }],
    },
  })

describe('Order APIs', () => {
  it('rejects a public order without a table QR token', async () => {
    const response = await app().inject({
      method: 'POST',
      url: '/api/v1/public/orders',
      payload: {
        items: [{ menuItemId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
      },
    })
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(403)
    expect(body.code).toBe('QR_REQUIRED')
  })

  it('creates an order from a QR token', async () => {
    const fixture = await setupOrderingFixture()
    const response = await placeOrder(fixture.table.qrToken, fixture.item.id)
    const body = parseBody<
      ApiEnvelope<{
        order: {
          id: string
          orderNumber: string
          totalInPaise: number
          source: string
          orderType: string
          tableId: string | null
        }
      }>
    >(response)

    expect(response.statusCode).toBe(201)
    expect(body.data.order.orderNumber).toBe('ORD-0001')
    expect(body.data.order.totalInPaise).toBeGreaterThan(0)
    expect(body.data.order.source).toBe('QR')
    expect(body.data.order.orderType).toBe('DINE_IN')
    expect(body.data.order.tableId).toBe(fixture.table.id)
  })

  it('prevents duplicate orders with an idempotency key', async () => {
    const fixture = await setupOrderingFixture()
    const first = parseBody<ApiEnvelope<{ order: { id: string } }>>(
      await placeOrder(fixture.table.qrToken, fixture.item.id, 'order-key-123'),
    )
    const secondResponse = await placeOrder(fixture.table.qrToken, fixture.item.id, 'order-key-123')
    const second = parseBody<ApiEnvelope<{ order: { id: string } }>>(secondResponse)

    expect(secondResponse.statusCode).toBe(200)
    expect(second.data.order.id).toBe(first.data.order.id)
    await expect(app().prisma.order.count()).resolves.toBe(1)
  })

  it('rejects unavailable items', async () => {
    const fixture = await setupOrderingFixture()
    await app().inject({
      method: 'PATCH',
      url: `/api/v1/items/${fixture.item.id}/availability`,
      headers: authHeader(fixture.token),
      payload: { isAvailable: false },
    })

    const response = await placeOrder(fixture.table.qrToken, fixture.item.id)
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(400)
    expect(body.code).toBe('MENU_ITEM_UNAVAILABLE')
  })

  it('rejects unsafe quantities and oversized customer input', async () => {
    const fixture = await setupOrderingFixture()
    const quantityResponse = await app().inject({
      method: 'POST',
      url: '/api/v1/public/orders',
      payload: {
        qrToken: fixture.table.qrToken,
        items: [{ menuItemId: fixture.item.id, quantity: 21 }],
      },
    })
    expect(quantityResponse.statusCode).toBe(400)

    const customerResponse = await app().inject({
      method: 'POST',
      url: '/api/v1/public/orders',
      payload: {
        qrToken: fixture.table.qrToken,
        customerName: 'x'.repeat(121),
        items: [{ menuItemId: fixture.item.id, quantity: 1 }],
      },
    })
    expect(customerResponse.statusCode).toBe(400)
  })

  it('rejects a QR token when its cafe is unapproved', async () => {
    const fixture = await setupOrderingFixture()
    await app().prisma.restaurant.update({
      where: { id: fixture.restaurantId },
      data: { isApproved: false },
    })

    const response = await placeOrder(fixture.table.qrToken, fixture.item.id)
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(403)
    expect(body.code).toBe('INVALID_TABLE_QR')
  })

  it('rejects an invalid QR token', async () => {
    const response = await placeOrder(
      'invalid-qr-token-value',
      '00000000-0000-0000-0000-000000000000',
    )
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(403)
    expect(body.code).toBe('INVALID_TABLE_QR')
  })

  it('updates an order status', async () => {
    const fixture = await setupOrderingFixture()
    const created = parseBody<ApiEnvelope<{ order: { id: string } }>>(
      await placeOrder(fixture.table.qrToken, fixture.item.id),
    )

    const response = await app().inject({
      method: 'PATCH',
      url: `/api/v1/orders/${created.data.order.id}/status`,
      headers: authHeader(fixture.token),
      payload: { status: 'ACCEPTED' },
    })
    const body = parseBody<ApiEnvelope<{ order: { status: string } }>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.order.status).toBe('ACCEPTED')
  })

  it('rejects an invalid status transition', async () => {
    const fixture = await setupOrderingFixture()
    const created = parseBody<ApiEnvelope<{ order: { id: string } }>>(
      await placeOrder(fixture.table.qrToken, fixture.item.id),
    )

    const response = await app().inject({
      method: 'PATCH',
      url: `/api/v1/orders/${created.data.order.id}/status`,
      headers: authHeader(fixture.token),
      payload: { status: 'READY' },
    })
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(400)
    expect(body.code).toBe('ORDER_INVALID_STATUS_TRANSITION')
  })
})
