import { describe, expect, it } from 'vitest'
import { app, authHeader, parseBody, setupOrderingFixture, type ApiEnvelope } from './helpers'

const placeOrder = async (qrToken: string, itemId: string, idempotencyKey?: string) =>
  app().inject({
    method: 'POST',
    url: '/api/v1/public/orders',
    headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : undefined,
    payload: {
      qrToken,
      customerName: 'Test Guest',
      items: [{ menuItemId: itemId, quantity: 2 }],
    },
  })

describe('Order APIs', () => {
  it('creates an order from a QR token', async () => {
    const fixture = await setupOrderingFixture()
    const response = await placeOrder(fixture.table.qrToken, fixture.item.id)
    const body =
      parseBody<ApiEnvelope<{ order: { id: string; orderNumber: string; totalInPaise: number } }>>(
        response,
      )

    expect(response.statusCode).toBe(201)
    expect(body.data.order.orderNumber).toBe('ORD-0001')
    expect(body.data.order.totalInPaise).toBeGreaterThan(0)
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

  it('rejects an invalid QR token', async () => {
    const response = await placeOrder(
      'invalid-qr-token-value',
      '00000000-0000-0000-0000-000000000000',
    )
    const body = parseBody<ApiEnvelope<unknown>>(response)

    expect(response.statusCode).toBe(404)
    expect(body.code).toBe('QR_INVALID')
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
