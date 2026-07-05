import bcrypt from 'bcryptjs'
import { describe, expect, it } from 'vitest'
import { app, authHeader, parseBody, registerOwner, type ApiEnvelope } from './helpers'

const futureDate = (hours = 48) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

const setupCafe = async (suffix: string, approved = true, active = true) => {
  const owner = await registerOwner(app(), suffix)
  const restaurantId = owner.data.restaurant.id
  await app().prisma.restaurant.update({
    where: { id: restaurantId },
    data: { isApproved: approved, isActive: active },
  })
  return {
    owner,
    restaurantId,
    slug: owner.data.restaurant.slug,
    token: owner.data.accessToken,
  }
}

const reservationPayload = (overrides: Record<string, unknown> = {}) => ({
  customerName: 'Aarav Sharma',
  customerPhone: '+91 98765 43210',
  customerEmail: 'aarav@example.com',
  partySize: 4,
  reservationDateTime: futureDate(),
  occasion: 'Birthday',
  specialRequest: 'A quiet corner, if available.',
  ...overrides,
})

const requestReservation = (
  slug: string,
  overrides: Record<string, unknown> = {},
  remoteAddress = `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
) =>
  app().inject({
    method: 'POST',
    url: `/api/v1/public/cafes/${slug}/reservations`,
    payload: reservationPayload(overrides),
    remoteAddress,
  })

const createOffer = async (
  restaurantId: string,
  token: string,
  overrides: Record<string, unknown> = {},
) => {
  const response = await app().inject({
    method: 'POST',
    url: `/api/v1/restaurants/${restaurantId}/reservation-offers`,
    headers: authHeader(token),
    payload: {
      title: 'Tavero celebration offer',
      description: 'Complimentary dessert for reservation parties.',
      terms: 'Subject to cafe availability.',
      minGuests: 2,
      isActive: true,
      ...overrides,
    },
  })
  return {
    response,
    body: parseBody<ApiEnvelope<{ offer: { id: string; isActive: boolean } }>>(response),
  }
}

describe('table reservations', () => {
  it('creates a safe public reservation request for an approved active cafe', async () => {
    const cafe = await setupCafe('reservation-public')
    const response = await requestReservation(cafe.slug)
    const body = parseBody<
      ApiEnvelope<{
        reservation: {
          reservationId: string
          reference: string
          status: string
          reservationDateTime: string
          partySize: number
          customerPhone?: string
          customerEmail?: string
          restaurantId?: string
        }
      }>
    >(response)

    expect(response.statusCode).toBe(201)
    expect(body.message).toBe(
      'Your reservation request has been sent to the cafe. The cafe will confirm your table.',
    )
    expect(body.data.reservation).toMatchObject({ status: 'REQUESTED', partySize: 4 })
    expect(body.data.reservation.reference).toMatch(/^RSV-/)
    expect(body.data.reservation).not.toHaveProperty('customerPhone')
    expect(body.data.reservation).not.toHaveProperty('customerEmail')
    expect(body.data.reservation).not.toHaveProperty('restaurantId')

    const stored = await app().prisma.reservation.findUnique({
      where: { id: body.data.reservation.reservationId },
    })
    expect(stored).toMatchObject({
      restaurantId: cafe.restaurantId,
      customerPhone: '+91 98765 43210',
      source: 'PUBLIC_PROFILE',
    })
  })

  it.each([
    ['unapproved', false, true],
    ['inactive', true, false],
  ])('rejects public reservations for an %s cafe', async (suffix, approved, active) => {
    const cafe = await setupCafe(`reservation-${suffix}`, approved, active)
    const response = await requestReservation(cafe.slug)

    expect(response.statusCode).toBe(404)
  })

  it('rejects a past reservation date and invalid party sizes', async () => {
    const cafe = await setupCafe('reservation-validation')
    const past = await requestReservation(cafe.slug, {
      reservationDateTime: new Date(Date.now() - 60_000).toISOString(),
    })
    const tooLarge = await requestReservation(cafe.slug, { partySize: 21 })
    const emptyParty = await requestReservation(cafe.slug, { partySize: 0 })

    expect(past.statusCode).toBe(400)
    expect(tooLarge.statusCode).toBe(400)
    expect(emptyParty.statusCode).toBe(400)
  })

  it('rejects inactive, expired, cross-cafe, and undersized offers', async () => {
    const cafe = await setupCafe('reservation-offer-validation')
    const other = await setupCafe('reservation-offer-other')
    const active = await createOffer(cafe.restaurantId, cafe.token, { minGuests: 6 })
    const inactive = await createOffer(cafe.restaurantId, cafe.token, { isActive: false })
    const crossCafe = await createOffer(other.restaurantId, other.token)
    const expired = await app().prisma.reservationOffer.create({
      data: {
        restaurantId: cafe.restaurantId,
        title: 'Expired offer',
        description: 'No longer available.',
        isActive: true,
        validUntil: new Date(Date.now() - 60_000),
      },
    })

    for (const offerId of [inactive.body.data.offer.id, crossCafe.body.data.offer.id, expired.id]) {
      const response = await requestReservation(cafe.slug, { offerId })
      expect(response.statusCode).toBe(400)
    }

    const undersized = await requestReservation(cafe.slug, {
      offerId: active.body.data.offer.id,
      partySize: 2,
    })
    expect(undersized.statusCode).toBe(400)
  })

  it('requires authentication and isolates reservation lists by cafe', async () => {
    const first = await setupCafe('reservation-list-first')
    const second = await setupCafe('reservation-list-second')
    await requestReservation(first.slug)

    const loggedOut = await app().inject({
      method: 'GET',
      url: `/api/v1/restaurants/${first.restaurantId}/reservations`,
    })
    const own = await app().inject({
      method: 'GET',
      url: `/api/v1/restaurants/${first.restaurantId}/reservations`,
      headers: authHeader(first.token),
    })
    const crossCafe = await app().inject({
      method: 'GET',
      url: `/api/v1/restaurants/${second.restaurantId}/reservations`,
      headers: authHeader(first.token),
    })
    const ownBody = parseBody<ApiEnvelope<{ reservations: Array<{ customerPhone: string }> }>>(own)

    expect(loggedOut.statusCode).toBe(401)
    expect(own.statusCode).toBe(200)
    expect(ownBody.data.reservations).toHaveLength(1)
    expect(ownBody.data.reservations[0]?.customerPhone).toBe('+91 98765 43210')
    expect(crossCafe.statusCode).toBe(403)
  })

  it('lets an owner confirm or decline requests and rejects invalid transitions', async () => {
    const cafe = await setupCafe('reservation-status')
    const first = await requestReservation(cafe.slug)
    const second = await requestReservation(cafe.slug)
    const firstId =
      parseBody<ApiEnvelope<{ reservation: { reservationId: string } }>>(first).data.reservation
        .reservationId
    const secondId =
      parseBody<ApiEnvelope<{ reservation: { reservationId: string } }>>(second).data.reservation
        .reservationId

    const update = (reservationId: string, status: string) =>
      app().inject({
        method: 'PATCH',
        url: `/api/v1/restaurants/${cafe.restaurantId}/reservations/${reservationId}/status`,
        headers: authHeader(cafe.token),
        payload: { status },
      })

    expect((await update(firstId, 'CONFIRMED')).statusCode).toBe(200)
    expect((await update(secondId, 'DECLINED')).statusCode).toBe(200)
    expect((await update(firstId, 'DECLINED')).statusCode).toBe(400)
  })

  it('blocks cross-cafe status updates and KITCHEN-only users', async () => {
    const first = await setupCafe('reservation-status-first')
    const second = await setupCafe('reservation-status-second')
    const request = await requestReservation(first.slug)
    const reservationId =
      parseBody<ApiEnvelope<{ reservation: { reservationId: string } }>>(request).data.reservation
        .reservationId

    const crossCafe = await app().inject({
      method: 'PATCH',
      url: `/api/v1/restaurants/${second.restaurantId}/reservations/${reservationId}/status`,
      headers: authHeader(first.token),
      payload: { status: 'CONFIRMED' },
    })

    const password = 'StrongPass123'
    const kitchen = await app().prisma.user.create({
      data: {
        name: 'Kitchen User',
        email: 'kitchen-reservations@example.com',
        passwordHash: await bcrypt.hash(password, 8),
        role: 'KITCHEN',
        memberships: {
          create: { restaurantId: first.restaurantId, role: 'KITCHEN' },
        },
      },
    })
    const login = await app().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: kitchen.email, password },
    })
    const kitchenToken = parseBody<ApiEnvelope<{ accessToken: string }>>(login).data.accessToken
    const kitchenList = await app().inject({
      method: 'GET',
      url: `/api/v1/restaurants/${first.restaurantId}/reservations`,
      headers: authHeader(kitchenToken),
    })

    expect(crossCafe.statusCode).toBe(403)
    expect(kitchenList.statusCode).toBe(403)
  })

  it('caps private owner notes and permits a valid note', async () => {
    const cafe = await setupCafe('reservation-note')
    const request = await requestReservation(cafe.slug)
    const reservationId =
      parseBody<ApiEnvelope<{ reservation: { reservationId: string } }>>(request).data.reservation
        .reservationId
    const url = `/api/v1/restaurants/${cafe.restaurantId}/reservations/${reservationId}/note`

    const valid = await app().inject({
      method: 'PATCH',
      url,
      headers: authHeader(cafe.token),
      payload: { ownerNote: 'Window table preferred if one opens up.' },
    })
    const tooLong = await app().inject({
      method: 'PATCH',
      url,
      headers: authHeader(cafe.token),
      payload: { ownerNote: 'x'.repeat(1001) },
    })

    expect(valid.statusCode).toBe(200)
    expect(tooLong.statusCode).toBe(400)
  })

  it('lets owners create offers and returns only currently active offers publicly', async () => {
    const cafe = await setupCafe('reservation-public-offers')
    const active = await createOffer(cafe.restaurantId, cafe.token)
    await createOffer(cafe.restaurantId, cafe.token, {
      title: 'Inactive offer',
      isActive: false,
    })
    await app().prisma.reservationOffer.create({
      data: {
        restaurantId: cafe.restaurantId,
        title: 'Expired offer',
        description: 'This should not be public.',
        validUntil: new Date(Date.now() - 60_000),
      },
    })

    expect(active.response.statusCode).toBe(201)
    const response = await app().inject({
      method: 'GET',
      url: `/api/v1/public/cafes/${cafe.slug}`,
    })
    const body =
      parseBody<ApiEnvelope<{ cafe: { reservationOffers: Array<{ id: string; title: string }> } }>>(
        response,
      )

    expect(response.statusCode).toBe(200)
    expect(body.data.cafe.reservationOffers).toEqual([
      expect.objectContaining({ id: active.body.data.offer.id, title: 'Tavero celebration offer' }),
    ])
  })

  it('rate limits repeated public reservation submissions', async () => {
    const cafe = await setupCafe('reservation-rate-limit')
    const remoteAddress = '198.51.100.42'
    const responses = []
    for (let index = 0; index < 6; index += 1) {
      responses.push(await requestReservation(cafe.slug, {}, remoteAddress))
    }

    expect(responses.slice(0, 5).every((response) => response.statusCode === 201)).toBe(true)
    expect(responses[5]?.statusCode).toBe(429)
  })
})
