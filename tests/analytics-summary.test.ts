import { describe, expect, it } from 'vitest'
import { DashboardService } from '../src/modules/dashboard/dashboard.service'
import {
  app,
  authHeader,
  createItem,
  parseBody,
  registerOwner,
  setupOrderingFixture,
  type ApiEnvelope,
} from './helpers'

type AnalyticsSummary = {
  today: {
    ordersToday: number
    revenueTodayInPaise: number
    averageOrderValueTodayInPaise: number
    qrOrdersToday: number
    manualOrdersToday: number
    dineInOrdersToday: number
    takeawayOrdersToday: number
  }
  statusCounts: Record<string, number>
  last7Days: Array<{ date: string; orderCount: number; revenueInPaise: number }>
  topItems: Array<{
    itemId: string
    name: string
    quantitySold: number
    revenueInPaise: number
    imageUrl: string | null
  }>
  recentOrders: Array<Record<string, unknown>>
  reservations: { pending: number; confirmedToday: number; upcoming: number }
  reportingTimezone: string
  reportingPeriodStart: string
  reportingPeriodEnd: string
  period: { timezone: string; today: string }
}

let qrAddressCounter = 1

const getAnalytics = (restaurantId: string, token?: string) =>
  app().inject({
    method: 'GET',
    url: `/api/v1/restaurants/${restaurantId}/analytics/summary`,
    headers: token ? authHeader(token) : undefined,
  })

const placeQrOrder = async (qrToken: string, itemId: string, quantity = 1) =>
  app().inject({
    method: 'POST',
    url: '/api/v1/public/orders',
    remoteAddress: `198.51.100.${qrAddressCounter++}`,
    payload: {
      qrToken,
      customerName: 'Analytics Guest',
      customerPhone: '+919999999999',
      items: [{ menuItemId: itemId, quantity }],
    },
  })

const placeManualTakeaway = async (token: string, restaurantId: string, itemId: string) =>
  app().inject({
    method: 'POST',
    url: `/api/v1/restaurants/${restaurantId}/orders/manual`,
    headers: authHeader(token),
    payload: {
      orderType: 'TAKEAWAY',
      items: [{ menuItemId: itemId, quantity: 1 }],
    },
  })

const createAnalyticsOrder = async ({
  restaurantId,
  branchId,
  createdAt,
  orderNumber,
  source = 'QR',
  orderType = 'DINE_IN',
  status = 'PLACED',
  totalInPaise = 10000,
}: {
  restaurantId: string
  branchId: string
  createdAt: Date
  orderNumber: string
  source?: 'QR' | 'MANUAL'
  orderType?: 'DINE_IN' | 'TAKEAWAY'
  status?: 'PLACED' | 'CANCELLED'
  totalInPaise?: number
}) =>
  app().prisma.order.create({
    data: {
      restaurantId,
      branchId,
      orderNumber,
      source,
      orderType,
      status,
      subtotalInPaise: totalInPaise,
      taxInPaise: 0,
      totalInPaise,
      placedAt: createdAt,
      createdAt,
      cancelledAt: status === 'CANCELLED' ? createdAt : undefined,
    },
  })

describe('Owner analytics summary', () => {
  it('rejects logged-out requests', async () => {
    const response = await getAnalytics('00000000-0000-0000-0000-000000000000')
    expect(response.statusCode).toBe(401)
  })

  it('returns own restaurant analytics without customer phone data', async () => {
    const fixture = await setupOrderingFixture('analytics-own')
    await placeQrOrder(fixture.table.qrToken, fixture.item.id)

    const response = await getAnalytics(fixture.restaurantId, fixture.token)
    const body = parseBody<ApiEnvelope<AnalyticsSummary>>(response)

    expect(response.statusCode).toBe(200)
    expect(body.data.today.ordersToday).toBe(1)
    expect(body.data.recentOrders).toHaveLength(1)
    expect(body.data.recentOrders[0]).not.toHaveProperty('customerPhone')
  })

  it("rejects an owner requesting another restaurant's analytics", async () => {
    const owner = await setupOrderingFixture('analytics-owner-a')
    const other = await setupOrderingFixture('analytics-owner-b')

    const response = await getAnalytics(other.restaurantId, owner.token)
    expect(response.statusCode).toBe(403)
  })

  it('counts QR/manual and dine-in/takeaway orders separately', async () => {
    const fixture = await setupOrderingFixture('analytics-mix')
    await placeQrOrder(fixture.table.qrToken, fixture.item.id)
    await placeManualTakeaway(fixture.token, fixture.restaurantId, fixture.item.id)

    const response = await getAnalytics(fixture.restaurantId, fixture.token)
    const body = parseBody<ApiEnvelope<AnalyticsSummary>>(response)

    expect(body.data.today).toMatchObject({
      ordersToday: 2,
      qrOrdersToday: 1,
      manualOrdersToday: 1,
      dineInOrdersToday: 1,
      takeawayOrdersToday: 1,
    })
  })

  it('excludes cancelled orders from revenue and average order value', async () => {
    const fixture = await setupOrderingFixture('analytics-revenue')
    const qrResponse = parseBody<ApiEnvelope<{ order: { id: string; totalInPaise: number } }>>(
      await placeQrOrder(fixture.table.qrToken, fixture.item.id),
    )
    await placeManualTakeaway(fixture.token, fixture.restaurantId, fixture.item.id)
    await app().prisma.order.update({
      where: { id: qrResponse.data.order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })

    const body = parseBody<ApiEnvelope<AnalyticsSummary>>(
      await getAnalytics(fixture.restaurantId, fixture.token),
    )

    expect(body.data.today.ordersToday).toBe(2)
    expect(body.data.today.revenueTodayInPaise).toBe(qrResponse.data.order.totalInPaise)
    expect(body.data.today.averageOrderValueTodayInPaise).toBe(qrResponse.data.order.totalInPaise)
    expect(body.data.statusCounts['CANCELLED']).toBe(1)
  })

  it('calculates the top five items from stored order item totals', async () => {
    const fixture = await setupOrderingFixture('analytics-top-items')
    const secondItem = await createItem(app(), fixture.token, fixture.category.id, {
      name: 'Cold Coffee',
      priceInPaise: 15000,
      foodType: 'BEVERAGE',
      imageUrl: 'https://images.example.com/cold-coffee.webp',
    })
    await placeQrOrder(fixture.table.qrToken, fixture.item.id, 3)
    await placeManualTakeaway(fixture.token, fixture.restaurantId, secondItem.id)

    const body = parseBody<ApiEnvelope<AnalyticsSummary>>(
      await getAnalytics(fixture.restaurantId, fixture.token),
    )

    expect(body.data.topItems[0]).toMatchObject({
      itemId: fixture.item.id,
      name: 'Paneer Tikka',
      quantitySold: 3,
      revenueInPaise: 84000,
    })
    expect(body.data.topItems).toHaveLength(2)
  })

  it('returns a stable seven-day cafe-local shape including zero days', async () => {
    const fixture = await setupOrderingFixture('analytics-seven-days')
    await placeQrOrder(fixture.table.qrToken, fixture.item.id)

    const body = parseBody<ApiEnvelope<AnalyticsSummary>>(
      await getAnalytics(fixture.restaurantId, fixture.token),
    )

    expect(body.data.last7Days).toHaveLength(7)
    expect(body.data.last7Days.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))).toBe(true)
    expect(body.data.last7Days.at(-1)?.orderCount).toBe(1)
    expect(body.data.period.timezone).toBe('Asia/Kolkata')
    expect(body.data.reportingTimezone).toBe('Asia/Kolkata')
    expect(body.data.reportingPeriodStart).toMatch(/T18:30:00\.000Z$/)
    expect(body.data.reportingPeriodEnd).toMatch(/T18:30:00\.000Z$/)
  })

  it('uses Asia/Kolkata local-day boundaries for orders, revenue, trends, and reservations', async () => {
    const fixture = await setupOrderingFixture('analytics-kolkata-boundary')
    await app().prisma.restaurant.update({
      where: { id: fixture.restaurantId },
      data: { timezone: 'Asia/Kolkata' },
    })
    const owner = await app().prisma.restaurant.findUniqueOrThrow({
      where: { id: fixture.restaurantId },
      select: { ownerId: true },
    })
    const now = new Date('2026-07-05T20:00:00.000Z')

    await createAnalyticsOrder({
      restaurantId: fixture.restaurantId,
      branchId: fixture.branch.id,
      createdAt: new Date('2026-07-05T18:29:59.000Z'),
      orderNumber: 'ORD-BEFORE-LOCAL-DAY',
      totalInPaise: 70000,
    })
    await createAnalyticsOrder({
      restaurantId: fixture.restaurantId,
      branchId: fixture.branch.id,
      createdAt: new Date('2026-07-05T18:30:01.000Z'),
      orderNumber: 'ORD-IN-LOCAL-DAY',
      totalInPaise: 10000,
    })
    await createAnalyticsOrder({
      restaurantId: fixture.restaurantId,
      branchId: fixture.branch.id,
      createdAt: new Date('2026-07-05T19:00:00.000Z'),
      orderNumber: 'ORD-CANCELLED-LOCAL-DAY',
      source: 'MANUAL',
      orderType: 'TAKEAWAY',
      status: 'CANCELLED',
      totalInPaise: 99000,
    })
    await app().prisma.reservation.createMany({
      data: [
        {
          restaurantId: fixture.restaurantId,
          customerName: 'Local Day Guest',
          customerPhone: '+919000000001',
          partySize: 2,
          reservationDateTime: new Date('2026-07-05T18:30:01.000Z'),
          status: 'CONFIRMED',
        },
        {
          restaurantId: fixture.restaurantId,
          customerName: 'Previous Day Guest',
          customerPhone: '+919000000002',
          partySize: 2,
          reservationDateTime: new Date('2026-07-05T18:29:59.000Z'),
          status: 'CONFIRMED',
        },
      ],
    })

    const analytics = await new DashboardService(app().prisma).analyticsSummary(
      owner.ownerId,
      fixture.restaurantId,
      now,
    )

    expect(analytics.today).toMatchObject({
      ordersToday: 2,
      revenueTodayInPaise: 10000,
      averageOrderValueTodayInPaise: 10000,
      qrOrdersToday: 1,
      manualOrdersToday: 1,
      dineInOrdersToday: 1,
      takeawayOrdersToday: 1,
    })
    expect(analytics.statusCounts.CANCELLED).toBe(1)
    expect(analytics.last7Days.at(-1)).toMatchObject({ date: '2026-07-06', orderCount: 2 })
    expect(analytics.reservations.confirmedToday).toBe(1)
    expect(analytics.reportingTimezone).toBe('Asia/Kolkata')
    expect(analytics.reportingPeriodStart).toBe('2026-07-05T18:30:00.000Z')
    expect(analytics.reportingPeriodEnd).toBe('2026-07-06T18:30:00.000Z')
  })

  it('falls back to Asia/Kolkata when a stored timezone is invalid', async () => {
    const fixture = await setupOrderingFixture('analytics-timezone-fallback')
    await app().prisma.restaurant.update({
      where: { id: fixture.restaurantId },
      data: { timezone: 'Invalid/Timezone' },
    })
    const owner = await app().prisma.restaurant.findUniqueOrThrow({
      where: { id: fixture.restaurantId },
      select: { ownerId: true },
    })

    const analytics = await new DashboardService(app().prisma).analyticsSummary(
      owner.ownerId,
      fixture.restaurantId,
      new Date('2026-07-05T20:00:00.000Z'),
    )

    expect(analytics.reportingTimezone).toBe('Asia/Kolkata')
    expect(analytics.period).toEqual({ timezone: 'Asia/Kolkata', today: '2026-07-06' })
  })

  it('returns zeroed analytics for a restaurant with no orders', async () => {
    const owner = await registerOwner(app(), 'analytics-empty')
    const body = parseBody<ApiEnvelope<AnalyticsSummary>>(
      await getAnalytics(owner.data.restaurant.id, owner.data.accessToken),
    )

    expect(body.data.today).toEqual({
      ordersToday: 0,
      revenueTodayInPaise: 0,
      averageOrderValueTodayInPaise: 0,
      qrOrdersToday: 0,
      manualOrdersToday: 0,
      dineInOrdersToday: 0,
      takeawayOrdersToday: 0,
    })
    expect(Object.values(body.data.statusCounts).every((count) => count === 0)).toBe(true)
    expect(body.data.topItems).toEqual([])
    expect(body.data.recentOrders).toEqual([])
  })

  it('allows staff analytics access but rejects kitchen-only members', async () => {
    const fixture = await setupOrderingFixture('analytics-role-access')
    const createMemberToken = async (role: 'STAFF' | 'KITCHEN') => {
      const user = await app().prisma.user.create({
        data: {
          name: `${role} analytics user`,
          email: `analytics-${role.toLowerCase()}@example.com`,
          passwordHash: 'not-used-by-token-auth',
          role,
          memberships: {
            create: { restaurantId: fixture.restaurantId, branchId: fixture.branch.id, role },
          },
        },
      })
      return app().jwt.sign({ sub: user.id, role: user.role, email: user.email })
    }

    const staffResponse = await getAnalytics(fixture.restaurantId, await createMemberToken('STAFF'))
    const kitchenResponse = await getAnalytics(
      fixture.restaurantId,
      await createMemberToken('KITCHEN'),
    )

    expect(staffResponse.statusCode).toBe(200)
    expect(kitchenResponse.statusCode).toBe(403)
  })
})
