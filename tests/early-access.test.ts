import { describe, expect, it } from 'vitest'
import {
  app,
  authHeader,
  createPlatformAdmin,
  parseBody,
  registerOwner,
  type ApiEnvelope,
} from './helpers'

const validLead = {
  cafeName: 'Spice Corner Cafe',
  ownerName: 'Aarav Sharma',
  contact: '+919999999999',
  location: 'Indiranagar, Bengaluru',
  note: 'Interested in a pilot for QR ordering.',
}

describe('Early access lead APIs', () => {
  it('stores a validated early access request', async () => {
    const response = await app().inject({
      method: 'POST',
      url: '/api/v1/public/early-access',
      payload: { ...validLead, cafeName: '  Spice\u0000 Corner Cafe  ' },
    })
    const body = parseBody<ApiEnvelope<{ lead: { id: string; status: string } }>>(response)

    expect(response.statusCode).toBe(201)
    expect(body.message).toBe('Thanks — Tavero received your early access request.')
    expect(body.data.lead.status).toBe('NEW')

    const stored = await app().prisma.earlyAccessLead.findUnique({
      where: { id: body.data.lead.id },
    })
    expect(stored).toEqual(
      expect.objectContaining({
        cafeName: 'Spice Corner Cafe',
        ownerName: validLead.ownerName,
        source: 'website',
        status: 'NEW',
      }),
    )
  })

  it('rejects missing and oversized lead fields', async () => {
    const missing = await app().inject({
      method: 'POST',
      url: '/api/v1/public/early-access',
      payload: { cafeName: 'Only a cafe name' },
    })
    expect(missing.statusCode).toBe(400)

    const oversized = await app().inject({
      method: 'POST',
      url: '/api/v1/public/early-access',
      payload: { ...validLead, note: 'x'.repeat(601) },
    })
    expect(oversized.statusCode).toBe(400)
  })

  it('rate-limits repeated early access submissions', async () => {
    const responses = []
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(
        await app().inject({
          method: 'POST',
          url: '/api/v1/public/early-access',
          remoteAddress: '203.0.113.70',
          payload: validLead,
        }),
      )
    }

    expect(responses[0]?.statusCode).toBe(201)
    expect(responses[4]?.statusCode).toBe(201)
    expect(responses[5]?.statusCode).toBe(429)
  })

  it('blocks logged-out and owner users from admin lead routes', async () => {
    const owner = await registerOwner(app(), 'lead-admin-guard')

    const loggedOut = await app().inject({
      method: 'GET',
      url: '/api/v1/admin/leads',
    })
    expect(loggedOut.statusCode).toBe(401)

    const ownerRequest = await app().inject({
      method: 'GET',
      url: '/api/v1/admin/leads',
      headers: authHeader(owner.data.accessToken),
    })
    expect(ownerRequest.statusCode).toBe(403)
  })

  it('allows an admin to review and update a lead', async () => {
    const admin = await createPlatformAdmin(app(), 'lead-review')
    const lead = await app().prisma.earlyAccessLead.create({ data: validLead })

    const listResponse = await app().inject({
      method: 'GET',
      url: '/api/v1/admin/leads?status=NEW',
      headers: authHeader(admin.data.accessToken),
    })
    const listBody =
      parseBody<ApiEnvelope<{ leads: Array<{ id: string; status: string }> }>>(listResponse)
    expect(listResponse.statusCode).toBe(200)
    expect(listBody.data.leads).toEqual([expect.objectContaining({ id: lead.id, status: 'NEW' })])

    const updateResponse = await app().inject({
      method: 'PATCH',
      url: `/api/v1/admin/leads/${lead.id}/status`,
      headers: authHeader(admin.data.accessToken),
      payload: { status: 'CONTACTED' },
    })
    const updateBody =
      parseBody<ApiEnvelope<{ lead: { id: string; status: string } }>>(updateResponse)
    expect(updateResponse.statusCode).toBe(200)
    expect(updateBody.data.lead.status).toBe('CONTACTED')
  })
})
