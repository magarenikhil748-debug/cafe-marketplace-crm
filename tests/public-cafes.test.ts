import { describe, expect, it } from 'vitest'
import {
  app,
  createBranch,
  createCategory,
  createItem,
  parseBody,
  registerOwner,
  type ApiEnvelope,
} from './helpers'

type PublicCafe = {
  id: string
  name: string
  slug: string
  description: string | null
  address: string | null
  city: string | null
  phone: string | null
  imageUrl: string | null
  galleryImages: Array<{
    url: string
    type: string
    sortOrder: number
  }>
  logoUrl: string | null
  currency: string
  businessType: string
  menuUrl: string
}

describe('Public cafe marketplace APIs', () => {
  it('only exposes cafes that are active and approved', async () => {
    const registered = await registerOwner(app(), 'marketplace-filter')
    const { id, slug } = registered.data.restaurant

    const unapprovedList = await app().inject({
      method: 'GET',
      url: '/api/v1/public/cafes',
    })
    const unapprovedBody = parseBody<ApiEnvelope<{ cafes: PublicCafe[] }>>(unapprovedList)
    expect(unapprovedBody.data.cafes).toHaveLength(0)

    const unapprovedDetail = await app().inject({
      method: 'GET',
      url: `/api/v1/public/cafes/${slug}`,
    })
    expect(unapprovedDetail.statusCode).toBe(404)

    const unapprovedMenu = await app().inject({
      method: 'GET',
      url: `/api/v1/public/cafes/${slug}/menu`,
    })
    expect(unapprovedMenu.statusCode).toBe(404)

    await app().prisma.restaurant.update({
      where: { id },
      data: { isApproved: true, isActive: false },
    })

    const inactiveList = await app().inject({
      method: 'GET',
      url: '/api/v1/public/cafes',
    })
    const inactiveBody = parseBody<ApiEnvelope<{ cafes: PublicCafe[] }>>(inactiveList)
    expect(inactiveBody.data.cafes).toHaveLength(0)
  })

  it('returns public-safe cafe fields without owner data', async () => {
    const registered = await registerOwner(app(), 'marketplace-detail')
    const { id, slug } = registered.data.restaurant

    await app().prisma.restaurant.update({
      where: { id },
      data: {
        description: 'Neighborhood cafe with all-day breakfast.',
        address: '12 Market Street',
        city: 'Bengaluru',
        phone: '+911234567890',
        email: 'private-operations@example.com',
        gstNumber: 'PRIVATE-GST',
        imageUrl: 'https://example.com/cafe.jpg',
        galleryImages: [
          {
            url: 'https://example.com/interior.jpg',
            type: 'INTERIOR',
            sortOrder: 0,
          },
        ],
        isApproved: true,
      },
    })

    const listResponse = await app().inject({
      method: 'GET',
      url: '/api/v1/public/cafes',
    })
    const listBody = parseBody<ApiEnvelope<{ cafes: PublicCafe[] }>>(listResponse)
    expect(listResponse.statusCode).toBe(200)
    expect(listBody.data.cafes).toHaveLength(1)

    const detailResponse = await app().inject({
      method: 'GET',
      url: `/api/v1/public/cafes/${slug}`,
    })
    const detailBody = parseBody<ApiEnvelope<{ cafe: PublicCafe }>>(detailResponse)
    expect(detailResponse.statusCode).toBe(200)
    expect(detailBody.data.cafe.description).toBe('Neighborhood cafe with all-day breakfast.')
    expect(detailBody.data.cafe.imageUrl).toBe('https://example.com/cafe.jpg')
    expect(detailBody.data.cafe.galleryImages).toEqual([
      {
        url: 'https://example.com/interior.jpg',
        type: 'INTERIOR',
        sortOrder: 0,
      },
    ])
    expect(detailBody.data.cafe.businessType).toBe('CAFE')
    expect(detailBody.data.cafe).not.toHaveProperty('ownerId')
    expect(detailBody.data.cafe).not.toHaveProperty('owner')
    expect(detailBody.data.cafe).not.toHaveProperty('email')
    expect(detailBody.data.cafe).not.toHaveProperty('gstNumber')
    expect(detailBody.data.cafe).not.toHaveProperty('isApproved')
    expect(detailBody.data.cafe.menuUrl).toBe(`http://localhost:5173/cafe/${slug}/menu`)
    expect(detailBody.data.cafe).toHaveProperty('qrCodeDataUrl')
  })

  it('returns the active available menu for an approved cafe', async () => {
    const registered = await registerOwner(app(), 'marketplace-menu')
    const token = registered.data.accessToken
    const restaurantId = registered.data.restaurant.id
    const branch = await createBranch(app(), token, restaurantId)
    const category = await createCategory(app(), token, restaurantId)
    await createItem(app(), token, category.id)

    await app().prisma.restaurant.update({
      where: { id: restaurantId },
      data: { isApproved: true },
    })

    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/public/cafes/${registered.data.restaurant.slug}/menu`,
    })
    const body = parseBody<
      ApiEnvelope<{
        cafe: PublicCafe
        categories: Array<{
          name: string
          items: Array<{ name: string; branchId: string | null }>
        }>
      }>
    >(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.cafe.slug).toBe(registered.data.restaurant.slug)
    expect(body.data.categories[0]?.name).toBe('Starters')
    expect(body.data.categories[0]?.items[0]?.name).toBe('Paneer Tikka')
    expect(body.data.categories[0]?.items[0]?.branchId).toBeNull()
    expect(branch.id).toBeTruthy()
  })
})
