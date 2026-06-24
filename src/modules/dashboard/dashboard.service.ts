import type { Prisma, PrismaClient } from '@prisma/client'
import { ensureRestaurantRole } from '../../common/middleware/require-role'
import { endOfToday, startOfToday } from '../../common/utils/date'
import type { DashboardQuery, TopItemsQuery } from './dashboard.schema'

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

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


