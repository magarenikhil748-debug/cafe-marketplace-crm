import { describe, expect, it } from 'vitest'
import {
  app,
  authHeader,
  createCategory,
  createItem,
  parseBody,
  registerOwner,
  type ApiEnvelope,
} from './helpers'

const itemImageUrl = 'https://images.example.com/paneer-tikka.webp'
const categoryImageUrl = 'https://images.example.com/starters.webp'

describe('Menu image management', () => {
  it('allows an owner to update an image for their own menu item', async () => {
    const owner = await registerOwner(app(), 'image-own-item')
    const category = await createCategory(app(), owner.data.accessToken, owner.data.restaurant.id)
    const item = await createItem(app(), owner.data.accessToken, category.id)

    const response = await app().inject({
      method: 'PATCH',
      url: `/api/v1/items/${item.id}/image`,
      headers: authHeader(owner.data.accessToken),
      payload: { imageUrl: itemImageUrl },
    })
    const body = parseBody<ApiEnvelope<{ item: { imageUrl: string | null } }>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.item.imageUrl).toBe(itemImageUrl)
  })

  it('allows restaurant staff but rejects kitchen-only image management', async () => {
    const owner = await registerOwner(app(), 'image-role-access')
    const category = await createCategory(app(), owner.data.accessToken, owner.data.restaurant.id)
    const item = await createItem(app(), owner.data.accessToken, category.id)
    const createMemberToken = async (role: 'STAFF' | 'KITCHEN') => {
      const user = await app().prisma.user.create({
        data: {
          name: `${role} user`,
          email: `image-${role.toLowerCase()}@example.com`,
          passwordHash: 'not-used-by-token-auth',
          role,
          memberships: {
            create: {
              restaurantId: owner.data.restaurant.id,
              role,
            },
          },
        },
      })
      return app().jwt.sign({ sub: user.id, role: user.role, email: user.email })
    }

    const staffResponse = await app().inject({
      method: 'PATCH',
      url: `/api/v1/items/${item.id}/image`,
      headers: authHeader(await createMemberToken('STAFF')),
      payload: { imageUrl: itemImageUrl },
    })
    const kitchenResponse = await app().inject({
      method: 'PATCH',
      url: `/api/v1/items/${item.id}/image`,
      headers: authHeader(await createMemberToken('KITCHEN')),
      payload: { imageUrl: itemImageUrl },
    })

    expect(staffResponse.statusCode).toBe(200)
    expect(kitchenResponse.statusCode).toBe(403)
  })

  it("rejects updating another cafe's menu item image", async () => {
    const owner = await registerOwner(app(), 'image-item-owner')
    const other = await registerOwner(app(), 'image-item-other')
    const category = await createCategory(app(), other.data.accessToken, other.data.restaurant.id)
    const item = await createItem(app(), other.data.accessToken, category.id)

    const response = await app().inject({
      method: 'PATCH',
      url: `/api/v1/items/${item.id}/image`,
      headers: authHeader(owner.data.accessToken),
      payload: { imageUrl: itemImageUrl },
    })

    expect(response.statusCode).toBe(403)
  })

  it('rejects non-HTTP image URLs', async () => {
    const owner = await registerOwner(app(), 'image-invalid-url')
    const category = await createCategory(app(), owner.data.accessToken, owner.data.restaurant.id)
    const item = await createItem(app(), owner.data.accessToken, category.id)

    const response = await app().inject({
      method: 'PATCH',
      url: `/api/v1/items/${item.id}/image`,
      headers: authHeader(owner.data.accessToken),
      payload: { imageUrl: 'ftp://images.example.com/menu.jpg' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('transactionally assigns images to multiple own menu items', async () => {
    const owner = await registerOwner(app(), 'image-bulk-own')
    const category = await createCategory(app(), owner.data.accessToken, owner.data.restaurant.id)
    const first = await createItem(app(), owner.data.accessToken, category.id)
    const second = await createItem(app(), owner.data.accessToken, category.id, {
      name: 'Cold Coffee',
      priceInPaise: 15000,
      foodType: 'BEVERAGE',
    })

    const response = await app().inject({
      method: 'PATCH',
      url: `/api/v1/restaurants/${owner.data.restaurant.id}/items/images/bulk`,
      headers: authHeader(owner.data.accessToken),
      payload: {
        items: [
          { itemId: first.id, imageUrl: itemImageUrl },
          { itemId: second.id, imageUrl: 'https://images.example.com/cold-coffee.jpg' },
        ],
      },
    })
    const body = parseBody<ApiEnvelope<{ items: Array<{ imageUrl: string | null }> }>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.items.map((item) => item.imageUrl)).toEqual([
      itemImageUrl,
      'https://images.example.com/cold-coffee.jpg',
    ])
  })

  it('rejects a cross-cafe item in a bulk assignment without partial updates', async () => {
    const owner = await registerOwner(app(), 'image-bulk-owner')
    const other = await registerOwner(app(), 'image-bulk-other')
    const ownCategory = await createCategory(
      app(),
      owner.data.accessToken,
      owner.data.restaurant.id,
    )
    const otherCategory = await createCategory(
      app(),
      other.data.accessToken,
      other.data.restaurant.id,
    )
    const ownItem = await createItem(app(), owner.data.accessToken, ownCategory.id)
    const otherItem = await createItem(app(), other.data.accessToken, otherCategory.id)

    const response = await app().inject({
      method: 'PATCH',
      url: `/api/v1/restaurants/${owner.data.restaurant.id}/items/images/bulk`,
      headers: authHeader(owner.data.accessToken),
      payload: {
        items: [
          { itemId: ownItem.id, imageUrl: itemImageUrl },
          { itemId: otherItem.id, imageUrl: 'https://images.example.com/foreign.jpg' },
        ],
      },
    })

    expect(response.statusCode).toBe(403)
    await expect(
      app().prisma.menuItem.findUnique({ where: { id: ownItem.id } }),
    ).resolves.toMatchObject({ imageUrl: null })
  })

  it('updates an image for an owner category', async () => {
    const owner = await registerOwner(app(), 'image-own-category')
    const category = await createCategory(app(), owner.data.accessToken, owner.data.restaurant.id)

    const response = await app().inject({
      method: 'PATCH',
      url: `/api/v1/categories/${category.id}/image`,
      headers: authHeader(owner.data.accessToken),
      payload: { imageUrl: categoryImageUrl },
    })
    const body = parseBody<ApiEnvelope<{ category: { imageUrl: string | null } }>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.category.imageUrl).toBe(categoryImageUrl)
  })

  it("rejects updating another cafe's category image", async () => {
    const owner = await registerOwner(app(), 'image-category-owner')
    const other = await registerOwner(app(), 'image-category-other')
    const category = await createCategory(app(), other.data.accessToken, other.data.restaurant.id)

    const response = await app().inject({
      method: 'PATCH',
      url: `/api/v1/categories/${category.id}/image`,
      headers: authHeader(owner.data.accessToken),
      payload: { imageUrl: categoryImageUrl },
    })

    expect(response.statusCode).toBe(403)
  })

  it('includes category and item image URLs in the public menu', async () => {
    const owner = await registerOwner(app(), 'image-public-menu')
    const category = await createCategory(app(), owner.data.accessToken, owner.data.restaurant.id)
    const item = await createItem(app(), owner.data.accessToken, category.id, {
      imageUrl: itemImageUrl,
    })
    await app().inject({
      method: 'PATCH',
      url: `/api/v1/categories/${category.id}/image`,
      headers: authHeader(owner.data.accessToken),
      payload: { imageUrl: categoryImageUrl },
    })
    await app().prisma.restaurant.update({
      where: { id: owner.data.restaurant.id },
      data: { isApproved: true },
    })

    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/public/cafes/${owner.data.restaurant.slug}/menu`,
    })
    const body = parseBody<
      ApiEnvelope<{
        categories: Array<{
          imageUrl: string | null
          items: Array<{ id: string; imageUrl: string | null }>
        }>
      }>
    >(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.categories[0]?.imageUrl).toBe(categoryImageUrl)
    expect(body.data.categories[0]?.items[0]).toMatchObject({ id: item.id, imageUrl: itemImageUrl })
  })
})
