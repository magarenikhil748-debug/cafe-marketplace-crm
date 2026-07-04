import { describe, expect, it } from 'vitest'
import {
  app,
  authHeader,
  createPlatformAdmin,
  parseBody,
  registerOwner,
  type ApiEnvelope,
} from './helpers'

const conversionInput = (suffix: string, overrides: Record<string, unknown> = {}) => ({
  cafeName: `Launch Cafe ${suffix}`,
  slug: `launch-cafe-${suffix}`,
  businessType: 'CAFE',
  description: 'A launch-ready Tavero cafe.',
  city: 'Bengaluru',
  address: '12 Market Road',
  phone: '+919876543210',
  ownerName: 'Launch Owner',
  ownerEmail: `launch-owner-${suffix}@example.com`,
  temporaryPassword: 'TemporaryPass123',
  tableCount: 3,
  ...overrides,
})

const createLead = (status: 'NEW' | 'QUALIFIED' | 'CONVERTED' = 'QUALIFIED') =>
  app().prisma.earlyAccessLead.create({
    data: {
      cafeName: 'Launch Cafe',
      ownerName: 'Launch Owner',
      contact: '+919876543210',
      location: 'Bengaluru',
      note: 'Ready for onboarding.',
      status,
    },
  })

const convert = (
  token: string,
  leadId: string,
  suffix: string,
  overrides: Record<string, unknown> = {},
) =>
  app().inject({
    method: 'POST',
    url: `/api/v1/admin/leads/${leadId}/convert-to-cafe`,
    headers: authHeader(token),
    payload: conversionInput(suffix, overrides),
  })

describe('Admin lead to cafe conversion', () => {
  it('blocks logged-out and owner accounts', async () => {
    const lead = await createLead()
    const owner = await registerOwner(app(), 'conversion-guard')

    const loggedOut = await app().inject({
      method: 'POST',
      url: `/api/v1/admin/leads/${lead.id}/convert-to-cafe`,
      payload: conversionInput('logged-out'),
    })
    expect(loggedOut.statusCode).toBe(401)

    const ownerRequest = await convert(owner.data.accessToken, lead.id, 'owner-guard')
    expect(ownerRequest.statusCode).toBe(403)
  })

  it.each(['QUALIFIED', 'CONVERTED'] as const)(
    'allows an admin to convert an unlinked %s lead',
    async (status) => {
      const admin = await createPlatformAdmin(app(), `conversion-${status.toLowerCase()}`)
      const lead = await createLead(status)

      const response = await convert(admin.data.accessToken, lead.id, status.toLowerCase())
      const body = parseBody<
        ApiEnvelope<{
          cafe: {
            id: string
            slug: string
            isApproved: boolean
            tableCount: number
            owner: { email: string }
          }
          lead: { status: string; restaurant: { id: string } }
        }>
      >(response)

      expect(response.statusCode).toBe(201)
      expect(body.data.cafe).toEqual(
        expect.objectContaining({
          slug: `launch-cafe-${status.toLowerCase()}`,
          isApproved: false,
          tableCount: 3,
        }),
      )
      expect(body.data.lead).toEqual(
        expect.objectContaining({
          status: 'CONVERTED',
          restaurant: expect.objectContaining({ id: body.data.cafe.id }),
        }),
      )
      expect(response.payload).not.toContain('TemporaryPass123')
      expect(response.payload).not.toContain('passwordHash')
    },
  )

  it('rejects duplicate conversion from the same lead', async () => {
    const admin = await createPlatformAdmin(app(), 'conversion-duplicate')
    const lead = await createLead()

    expect((await convert(admin.data.accessToken, lead.id, 'duplicate-first')).statusCode).toBe(201)
    expect((await convert(admin.data.accessToken, lead.id, 'duplicate-second')).statusCode).toBe(
      409,
    )
  })

  it('keeps a new cafe private by default', async () => {
    const admin = await createPlatformAdmin(app(), 'conversion-private')
    const lead = await createLead()
    const response = await convert(admin.data.accessToken, lead.id, 'private')
    expect(response.statusCode).toBe(201)

    const publicList = await app().inject({ method: 'GET', url: '/api/v1/public/cafes' })
    const listBody = parseBody<ApiEnvelope<{ cafes: Array<{ slug: string }> }>>(publicList)
    expect(listBody.data.cafes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'launch-cafe-private' })]),
    )
  })

  it('lists a cafe publicly only when approval is explicitly selected', async () => {
    const admin = await createPlatformAdmin(app(), 'conversion-approved')
    const lead = await createLead()
    const response = await convert(admin.data.accessToken, lead.id, 'approved', {
      isApproved: true,
    })
    expect(response.statusCode).toBe(201)

    const publicList = await app().inject({ method: 'GET', url: '/api/v1/public/cafes' })
    const listBody = parseBody<ApiEnvelope<{ cafes: Array<{ slug: string }> }>>(publicList)
    expect(listBody.data.cafes).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'launch-cafe-approved' })]),
    )
  })

  it('creates a main branch and tables with secure unique QR tokens', async () => {
    const admin = await createPlatformAdmin(app(), 'conversion-tables')
    const lead = await createLead()
    const response = await convert(admin.data.accessToken, lead.id, 'tables', { tableCount: 5 })
    const body = parseBody<ApiEnvelope<{ cafe: { id: string } }>>(response)

    const tables = await app().prisma.diningTable.findMany({
      where: { restaurantId: body.data.cafe.id },
      include: { branch: true },
    })
    expect(tables).toHaveLength(5)
    expect(new Set(tables.map((table) => table.qrToken)).size).toBe(5)
    expect(tables.every((table) => table.qrToken.length >= 32)).toBe(true)
    expect(tables.every((table) => table.qrUrl.includes('?t='))).toBe(true)
    expect(tables.every((table) => table.branch.name === 'Main Branch')).toBe(true)
  })

  it('creates an owner who can log in and access only the linked cafe', async () => {
    const admin = await createPlatformAdmin(app(), 'conversion-owner-login')
    const lead = await createLead()
    const email = 'new-tavero-owner@example.com'
    const password = 'OwnerLaunchPass123'
    const response = await convert(admin.data.accessToken, lead.id, 'owner-login', {
      ownerEmail: email,
      temporaryPassword: password,
    })
    expect(response.statusCode).toBe(201)

    const login = await app().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    })
    const loginBody = parseBody<ApiEnvelope<{ accessToken: string }>>(login)
    expect(login.statusCode).toBe(200)

    const me = await app().inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: authHeader(loginBody.data.accessToken),
    })
    const meBody = parseBody<
      ApiEnvelope<{
        user: { role: string; memberships: Array<{ restaurant: { slug: string } }> }
      }>
    >(me)
    expect(meBody.data.user.role).toBe('OWNER')
    expect(
      await app().prisma.user.findUnique({
        where: { email },
        select: { mustChangePassword: true },
      }),
    ).toEqual({ mustChangePassword: true })
    expect(meBody.data.user.memberships).toEqual([
      expect.objectContaining({
        restaurant: expect.objectContaining({ slug: 'launch-cafe-owner-login' }),
      }),
    ])
  })

  it('rejects non-qualified leads', async () => {
    const admin = await createPlatformAdmin(app(), 'conversion-new-lead')
    const lead = await createLead('NEW')
    expect((await convert(admin.data.accessToken, lead.id, 'new-lead')).statusCode).toBe(409)
  })

  it('rejects an existing owner email without changing that account', async () => {
    const admin = await createPlatformAdmin(app(), 'conversion-email-conflict')
    const existingOwner = await registerOwner(app(), 'conversion-existing-owner')
    const lead = await createLead()
    const response = await convert(admin.data.accessToken, lead.id, 'email-conflict', {
      ownerEmail: existingOwner.data.user.email,
    })
    expect(response.statusCode).toBe(409)

    const unchanged = await app().prisma.user.findUnique({
      where: { email: existingOwner.data.user.email },
    })
    expect(unchanged?.id).toBe(existingOwner.data.user.id)
  })

  it('rejects invalid slug, email, password, and table count', async () => {
    const admin = await createPlatformAdmin(app(), 'conversion-validation')
    const invalidInputs = [
      { slug: 'Not URL Safe' },
      { ownerEmail: 'not-an-email' },
      { temporaryPassword: 'short' },
      { tableCount: 101 },
    ]

    for (const [index, invalid] of invalidInputs.entries()) {
      const lead = await createLead()
      const response = await convert(admin.data.accessToken, lead.id, `invalid-${index}`, invalid)
      expect(response.statusCode).toBe(400)
    }
  })
})
