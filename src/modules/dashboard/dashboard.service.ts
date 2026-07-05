import { Prisma, type OrderStatus, type PrismaClient } from '@prisma/client'
import { ensureRestaurantRole } from '../../common/middleware/require-role'
import { endOfToday, startOfToday } from '../../common/utils/date'
import { addDaysToDateKey, getCafeReportingPeriod } from '../../common/utils/reporting-timezone'
import type { DashboardQuery, TopItemsQuery } from './dashboard.schema'

const analyticsStatuses: OrderStatus[] = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'SERVED',
  'CANCELLED',
]

type DailyAnalyticsRow = {
  date: string
  orderCount: number
  revenueInPaise: bigint
}

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async analyticsSummary(userId: string, restaurantId: string, now = new Date()) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER', 'STAFF'])

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    })
    const reporting = getCafeReportingPeriod(now, restaurant?.timezone)
    const { todayStart, tomorrowStart, sevenDayStart } = reporting
    const todayWhere: Prisma.OrderWhereInput = {
      restaurantId,
      createdAt: { gte: todayStart, lt: tomorrowStart },
    }
    const sevenDayWhere: Prisma.OrderWhereInput = {
      restaurantId,
      createdAt: { gte: sevenDayStart, lt: tomorrowStart },
    }

    const [
      ordersToday,
      revenueToday,
      sourceGroups,
      typeGroups,
      statusGroups,
      topItemGroups,
      recentOrders,
      dailyRows,
      pendingReservations,
      confirmedReservationsToday,
      upcomingReservations,
    ] = await Promise.all([
      this.prisma.order.count({ where: todayWhere }),
      this.prisma.order.aggregate({
        where: { ...todayWhere, status: { not: 'CANCELLED' } },
        _sum: { totalInPaise: true },
        _count: true,
      }),
      this.prisma.order.groupBy({
        by: ['source'],
        where: todayWhere,
        _count: true,
      }),
      this.prisma.order.groupBy({
        by: ['orderType'],
        where: todayWhere,
        _count: true,
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: todayWhere,
        _count: true,
      }),
      this.prisma.orderItem.groupBy({
        by: ['menuItemId'],
        where: {
          order: { ...sevenDayWhere, status: { not: 'CANCELLED' } },
        },
        _sum: { quantity: true, totalPriceInPaise: true },
        orderBy: [{ _sum: { quantity: 'desc' } }, { _sum: { totalPriceInPaise: 'desc' } }],
        take: 5,
      }),
      this.prisma.order.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          orderNumber: true,
          source: true,
          orderType: true,
          tableNumberSnapshot: true,
          table: { select: { tableNumber: true } },
          totalInPaise: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.$queryRaw<DailyAnalyticsRow[]>(Prisma.sql`
        SELECT
          TO_CHAR(
            ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${reporting.timeZone},
            'YYYY-MM-DD'
          ) AS "date",
          COUNT(*)::int AS "orderCount",
          COALESCE(
            SUM(CASE WHEN "status" <> 'CANCELLED' THEN "totalInPaise" ELSE 0 END),
            0
          )::bigint AS "revenueInPaise"
        FROM "orders"
        WHERE "restaurantId" = CAST(${restaurantId} AS uuid)
          AND "createdAt" >= ${sevenDayStart}
          AND "createdAt" < ${tomorrowStart}
        GROUP BY 1
        ORDER BY 1 ASC
      `),
      this.prisma.reservation.count({
        where: { restaurantId, status: 'REQUESTED' },
      }),
      this.prisma.reservation.count({
        where: {
          restaurantId,
          status: 'CONFIRMED',
          reservationDateTime: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      this.prisma.reservation.count({
        where: {
          restaurantId,
          status: 'CONFIRMED',
          reservationDateTime: { gte: now },
        },
      }),
    ])

    const statusCounts = Object.fromEntries(
      analyticsStatuses.map((status) => [status, 0]),
    ) as Record<OrderStatus, number>
    for (const group of statusGroups) statusCounts[group.status] = group._count

    const sourceCounts = Object.fromEntries(
      sourceGroups.map((group) => [group.source, group._count]),
    )
    const typeCounts = Object.fromEntries(
      typeGroups.map((group) => [group.orderType, group._count]),
    )
    const revenueTodayInPaise = revenueToday._sum.totalInPaise ?? 0
    const revenueOrderCount = revenueToday._count

    const topItemIds = topItemGroups.map((item) => item.menuItemId)
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: topItemIds }, restaurantId },
      select: { id: true, name: true, imageUrl: true },
    })
    const menuItemById = new Map(menuItems.map((item) => [item.id, item]))
    const dailyByDate = new Map(dailyRows.map((row) => [row.date, row]))
    const last7Days = Array.from({ length: 7 }, (_, index) => {
      const dateKey = addDaysToDateKey(reporting.sevenDayStartDate, index)
      const row = dailyByDate.get(dateKey)
      return {
        date: dateKey,
        orderCount: row?.orderCount ?? 0,
        revenueInPaise: Number(row?.revenueInPaise ?? 0),
      }
    })

    return {
      today: {
        ordersToday,
        revenueTodayInPaise,
        averageOrderValueTodayInPaise:
          revenueOrderCount > 0 ? Math.round(revenueTodayInPaise / revenueOrderCount) : 0,
        qrOrdersToday: sourceCounts['QR'] ?? 0,
        manualOrdersToday: sourceCounts['MANUAL'] ?? 0,
        dineInOrdersToday: typeCounts['DINE_IN'] ?? 0,
        takeawayOrdersToday: typeCounts['TAKEAWAY'] ?? 0,
      },
      statusCounts,
      last7Days,
      topItems: topItemGroups.map((item) => {
        const menuItem = menuItemById.get(item.menuItemId)
        return {
          itemId: item.menuItemId,
          name: menuItem?.name ?? 'Menu item',
          quantitySold: item._sum.quantity ?? 0,
          revenueInPaise: item._sum.totalPriceInPaise ?? 0,
          imageUrl: menuItem?.imageUrl ?? null,
        }
      }),
      recentOrders: recentOrders.map((order) => ({
        orderId: order.id,
        orderNumber: order.orderNumber,
        source: order.source,
        orderType: order.orderType,
        tableNumber: order.tableNumberSnapshot ?? order.table?.tableNumber ?? null,
        totalInPaise: order.totalInPaise,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
      })),
      reservations: {
        pending: pendingReservations,
        confirmedToday: confirmedReservationsToday,
        upcoming: upcomingReservations,
      },
      reportingTimezone: reporting.timeZone,
      reportingPeriodStart: todayStart.toISOString(),
      reportingPeriodEnd: tomorrowStart.toISOString(),
      period: {
        timezone: reporting.timeZone,
        today: reporting.today,
      },
    }
  }

  async today(userId: string, restaurantId: string, query: DashboardQuery) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER'])
    const where = this.todayWhere(restaurantId, query.branchId)
    const revenueWhere: Prisma.OrderWhereInput = { ...where, status: { not: 'CANCELLED' } }

    const [
      totalOrdersToday,
      revenue,
      activeOrdersCount,
      completedOrdersCount,
      cancelledOrdersCount,
    ] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where: revenueWhere,
        _sum: { totalInPaise: true },
        _count: true,
      }),
      this.prisma.order.count({
        where: { ...where, status: { in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] } },
      }),
      this.prisma.order.count({ where: { ...where, status: 'SERVED' } }),
      this.prisma.order.count({ where: { ...where, status: 'CANCELLED' } }),
    ])

    const revenueTodayInPaise = revenue._sum.totalInPaise ?? 0
    const paidOrderCount = revenue._count

    return {
      totalOrdersToday,
      revenueTodayInPaise,
      activeOrdersCount,
      completedOrdersCount,
      cancelledOrdersCount,
      averageOrderValueInPaise:
        paidOrderCount > 0 ? Math.round(revenueTodayInPaise / paidOrderCount) : 0,
    }
  }

  async topItems(userId: string, restaurantId: string, query: TopItemsQuery) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER'])
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          ...this.todayWhere(restaurantId, query.branchId),
          status: { not: 'CANCELLED' },
        },
      },
      select: {
        menuItemId: true,
        itemNameSnapshot: true,
        quantity: true,
        totalPriceInPaise: true,
      },
    })

    const grouped = new Map<
      string,
      { menuItemId: string; itemName: string; quantitySold: number; revenueInPaise: number }
    >()

    for (const item of orderItems) {
      const current = grouped.get(item.menuItemId) ?? {
        menuItemId: item.menuItemId,
        itemName: item.itemNameSnapshot,
        quantitySold: 0,
        revenueInPaise: 0,
      }
      current.quantitySold += item.quantity
      current.revenueInPaise += item.totalPriceInPaise
      grouped.set(item.menuItemId, current)
    }

    return [...grouped.values()]
      .sort((a, b) => b.quantitySold - a.quantitySold || b.revenueInPaise - a.revenueInPaise)
      .slice(0, query.limit)
  }

  async hourlySales(userId: string, restaurantId: string, query: DashboardQuery) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER'])
    const orders = await this.prisma.order.findMany({
      where: {
        ...this.todayWhere(restaurantId, query.branchId),
        status: { not: 'CANCELLED' },
      },
      select: { placedAt: true, totalInPaise: true },
    })

    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orderCount: 0,
      revenueInPaise: 0,
    }))

    for (const order of orders) {
      const hour = order.placedAt.getHours()
      const bucket = buckets[hour]
      if (bucket) {
        bucket.orderCount += 1
        bucket.revenueInPaise += order.totalInPaise
      }
    }

    return buckets
  }

  private todayWhere(restaurantId: string, branchId?: string): Prisma.OrderWhereInput {
    return {
      restaurantId,
      branchId,
      createdAt: {
        gte: startOfToday(),
        lte: endOfToday(),
      },
    }
  }
}
