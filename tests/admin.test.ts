import { describe, expect, it } from 'vitest'
import {
  app,
  authHeader,
  createPlatformAdmin,
  parseBody,
  registerOwner,
  type ApiEnvelope,
} from './helpers'

type AdminCafe = {
  id: string
  name: string
  slug: string
  city: string | null
  isActive: boolean
  isApproved: boolean
  owner: {
    id: string
    name: string
    email: string
  }
}

describe('Platform admin cafe controls', () => {
  it('blocks logged-out and non-admin users from admin endpoints', async () => {
    const owner = await registerOwner(app(), 'admin-guard-owner')

    const loggedOut = await app().inject({
      method: 'GET',
      url: '/api/v1/admin/cafes',
    })
    expect(loggedOut.statusCode).toBe(401)

    const ownerRequest = await app().inject({
      method: 'GET',
      url: '/api/v1/admin/cafes',
      headers: authHeader(owner.data.accessToken),
    })
    expect(ownerRequest.statusCode).toBe(403)
  })

  it('allows an admin to list cafes with operational fields', async () => {
    const admin = await createPlatformAdmin(app(), 'admin-list')
    const owner = await registerOwner(app(), 'admin-list-cafe')

    const response = await app().inject({
      method: 'GET',
      url: '/api/v1/admin/cafes?search=Test%20Restaurant',
      headers: authHeader(admin.data.accessToken),
    })
    const body = parseBody<ApiEnvelope<{ cafes: AdminCafe[] }>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.cafes).toHaveLength(1)
    expect(body.data.cafes[0]).toEqual(
      expect.objectContaining({
        id: owner.data.restaurant.id,
        slug: owner.data.restaurant.slug,
        isActive: true,
        isApproved: false,
      }),
    )
    expect(body.data.cafes[0]?.owner.email).toBe(owner.data.user.email)
  })

  it('allows only an admin to issue an owner temporary password', async () => {
    const admin = await createPlatformAdmin(app(), 'admin-password-reset')
    const owner = await registerOwner(app(), 'admin-password-reset-owner')
    const endpoint = `/api/v1/admin/cafes/${owner.data.restaurant.id}/owner-password`

    const ownerAttempt = await app().inject({
      method: 'POST',
      url: endpoint,
      headers: authHeader(owner.data.accessToken),
      payload: { temporaryPassword: 'OwnerRecoveryPass456' },
    })
    expect(ownerAttempt.statusCode).toBe(403)

    const response = await app().inject({
      method: 'POST',
      url: endpoint,
      headers: authHeader(admin.data.accessToken),
      payload: { temporaryPassword: 'OwnerRecoveryPass456' },
    })
    const body =
      parseBody<ApiEnvelope<{ owner: { id: string; email: string; mustChangePassword: boolean } }>>(
        response,
      )

    expect(response.statusCode).toBe(200)
    expect(body.data.owner).toEqual(
      expect.objectContaining({
        id: owner.data.user.id,
        email: owner.data.user.email,
        mustChangePassword: true,
      }),
    )
    expect(response.payload).not.toContain('OwnerRecoveryPass456')
    expect(response.payload).not.toContain('passwordHash')

    const oldLogin = await app().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: owner.data.user.email, password: 'StrongPass123' },
    })
    expect(oldLogin.statusCode).toBe(401)

    const temporaryLogin = await app().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: owner.data.user.email, password: 'OwnerRecoveryPass456' },
    })
    expect(temporaryLogin.statusCode).toBe(200)
  })

  it('approves and unapproves marketplace visibility', async () => {
    const admin = await createPlatformAdmin(app(), 'admin-approval')
    const owner = await registerOwner(app(), 'admin-approval-cafe')
    const cafeId = owner.data.restaurant.id
    const slug = owner.data.restaurant.slug

    const approve = await app().inject({
      method: 'PATCH',
      url: `/api/v1/admin/cafes/${cafeId}/approval`,
      headers: authHeader(admin.data.accessToken),
      payload: { isApproved: true },
    })
    expect(approve.statusCode).toBe(200)

    const visible = await app().inject({
      method: 'GET',
      url: `/api/v1/public/cafes/${slug}`,
    })
    expect(visible.statusCode).toBe(200)

    const unapprove = await app().inject({
      method: 'PATCH',
      url: `/api/v1/admin/cafes/${cafeId}/approval`,
      headers: authHeader(admin.data.accessToken),
      payload: { isApproved: false },
    })
    expect(unapprove.statusCode).toBe(200)

    const hidden = await app().inject({
      method: 'GET',
      url: `/api/v1/public/cafes/${slug}`,
    })
    expect(hidden.statusCode).toBe(404)
  })

  it('suspends and reactivates cafe marketplace visibility', async () => {
    const admin = await createPlatformAdmin(app(), 'admin-status')
    const owner = await registerOwner(app(), 'admin-status-cafe')
    const cafeId = owner.data.restaurant.id
    const slug = owner.data.restaurant.slug
    await app().prisma.restaurant.update({
      where: { id: cafeId },
      data: { isApproved: true },
    })

    const suspend = await app().inject({
      method: 'PATCH',
      url: `/api/v1/admin/cafes/${cafeId}/status`,
      headers: authHeader(admin.data.accessToken),
      payload: { isActive: false },
    })
    expect(suspend.statusCode).toBe(200)

    const hidden = await app().inject({
      method: 'GET',
      url: `/api/v1/public/cafes/${slug}`,
    })
    expect(hidden.statusCode).toBe(404)

    const reactivate = await app().inject({
      method: 'PATCH',
      url: `/api/v1/admin/cafes/${cafeId}/status`,
      headers: authHeader(admin.data.accessToken),
      payload: { isActive: true },
    })
    expect(reactivate.statusCode).toBe(200)

    const visible = await app().inject({
      method: 'GET',
      url: `/api/v1/public/cafes/${slug}`,
    })
    expect(visible.statusCode).toBe(200)
  })
})
