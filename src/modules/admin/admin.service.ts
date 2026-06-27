import type { LeadStatus, PrismaClient } from '@prisma/client'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { AuditService } from '../audit/audit.service'
import type { ListAdminCafesQuery, ListAdminLeadsQuery } from './admin.schema'

export class AdminService {
  private readonly audit: AuditService

  constructor(private readonly prisma: PrismaClient) {
    this.audit = new AuditService(prisma)
  }

  listCafes(query: ListAdminCafesQuery) {
    return this.prisma.restaurant.findMany({
      where: {
        isApproved: query.isApproved,
        isActive: query.isActive,
        OR: query.search
          ? [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
              { address: { contains: query.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        address: true,
        city: true,
        phone: true,
        imageUrl: true,
        isActive: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
    })
  }

  listLeads(query: ListAdminLeadsQuery) {
    return this.prisma.earlyAccessLead.findMany({
      where: { status: query.status },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        cafeName: true,
        ownerName: true,
        contact: true,
        location: true,
        note: true,
        status: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  }

  async updateLeadStatus(leadId: string, status: LeadStatus) {
    const lead = await this.prisma.earlyAccessLead.findUnique({ where: { id: leadId } })
    if (!lead) {
      throw new AppError(404, ErrorCodes.LEAD_NOT_FOUND, 'Early access lead was not found')
    }

    return this.prisma.earlyAccessLead.update({
      where: { id: leadId },
      data: { status },
    })
  }

  async updateApproval(adminUserId: string, restaurantId: string, isApproved: boolean) {
    const restaurant = await this.getCafe(restaurantId)
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { isApproved },
    })

    await this.audit.log({
      restaurantId,
      userId: adminUserId,
      action: isApproved ? 'admin.cafe_approved' : 'admin.cafe_unapproved',
      entityType: 'Restaurant',
      entityId: restaurantId,
      metadata: { previousValue: restaurant.isApproved, isApproved },
    })

    return updated
  }

  async updateStatus(adminUserId: string, restaurantId: string, isActive: boolean) {
    const restaurant = await this.getCafe(restaurantId)
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { isActive },
    })

    await this.audit.log({
      restaurantId,
      userId: adminUserId,
      action: isActive ? 'admin.cafe_reactivated' : 'admin.cafe_suspended',
      entityType: 'Restaurant',
      entityId: restaurantId,
      metadata: { previousValue: restaurant.isActive, isActive },
    })

    return updated
  }

  private async getCafe(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, isActive: true, isApproved: true },
    })
    if (!restaurant) {
      throw new AppError(404, ErrorCodes.RESTAURANT_NOT_FOUND, 'Cafe was not found')
    }
    return restaurant
  }
}
