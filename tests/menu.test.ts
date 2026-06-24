import { describe, expect, it } from 'vitest'
import {
  app,
  authHeader,
  createBranch,
  createCategory,
  createItem,
  createTable,
  parseBody,
  registerOwner,
  type ApiEnvelope,
} from './helpers'

describe('Menu APIs', () => {
  it('creates a category and item', async () => {
    const registered = await registerOwner(app(), 'menu-create')
    const category = await createCategory(
      app(),
      registered.data.accessToken,
      registered.data.restaurant.id,
    )
    const item = await createItem(app(), registered.data.accessToken, category.id)

    expect(category.id).toBeTruthy()
    expect(item.priceInPaise).toBe(28000)
  })

  it('returns available items in the public menu', async () => {
    const registered = await registerOwner(app(), 'public-menu')
    const token = registered.data.accessToken
    const restaurantId = registered.data.restaurant.id
    const branch = await createBranch(app(), token, restaurantId)
    const table = await createTable(app(), token, branch.id)
    const category = await createCategory(app(), token, restaurantId)
    await createItem(app(), token, category.id)

    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/public/menu/${table.qrToken}`,
    })

    const body =
      parseBody<ApiEnvelope<{ categories: Array<{ items: Array<{ name: string }> }> }>>(response)
    expect(response.statusCode).toBe(200)
    expect(body.data.categories[0]?.items[0]?.name).toBe('Paneer Tikka')
  })

  it('does not show unavailable items publicly', async () => {
    const registered = await registerOwner(app(), 'unavailable')
    const token = registered.data.accessToken
    const restaurantId = registered.data.restaurant.id
    const branch = await createBranch(app(), token, restaurantId)
    const table = await createTable(app(), token, branch.id)
    const category = await createCategory(app(), token, restaurantId)
    const item = await createItem(app(), token, category.id)

    await app().inject({
      method: 'PATCH',
      url: `/api/v1/items/${item.id}/availability`,
      headers: authHeader(token),
      payload: { isAvailable: false },
    })

    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/public/menu/${table.qrToken}`,
    })

    const body = parseBody<ApiEnvelope<{ categories: Array<{ items: unknown[] }> }>>(response)
    expect(body.data.categories).toHaveLength(0)
  })
})
