import { describe, expect, it } from 'vitest'
import { app, parseBody, setupOrderingFixture, type ApiEnvelope, authHeader } from './helpers'

describe('Dashboard APIs', () => {
  it('returns today stats', async () => {
    const fixture = await setupOrderingFixture()
    await app().inject({
      method: 'POST',
      url: '/api/v1/public/orders',
      payload: {
        qrToken: fixture.table.qrToken,
        items: [{ menuItemId: fixture.item.id, quantity: 1 }],
      },
    })

    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/restaurants/${fixture.restaurantId}/dashboard/today`,
      headers: authHeader(fixture.token),
    })
    const body =
      parseBody<ApiEnvelope<{ totalOrdersToday: number; revenueTodayInPaise: number }>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.totalOrdersToday).toBe(1)
    expect(body.data.revenueTodayInPaise).toBeGreaterThan(0)
  })

  it('returns top selling items', async () => {
    const fixture = await setupOrderingFixture()
    await app().inject({
      method: 'POST',
      url: '/api/v1/public/orders',
      payload: {
        qrToken: fixture.table.qrToken,
        items: [{ menuItemId: fixture.item.id, quantity: 3 }],
      },
    })

    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/restaurants/${fixture.restaurantId}/dashboard/top-items`,
      headers: authHeader(fixture.token),
    })
    const body =
      parseBody<ApiEnvelope<{ items: Array<{ itemName: string; quantitySold: number }> }>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.items[0]?.itemName).toBe('Paneer Tikka')
    expect(body.data.items[0]?.quantitySold).toBe(3)
  })
})
