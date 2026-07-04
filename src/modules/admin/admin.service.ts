import bcrypt from 'bcryptjs'
import type { LeadStatus, PrismaClient } from '@prisma/client'
import { env } from '../../config/env'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { buildTableQrUrl, generateQrToken } from '../../common/utils/qr-code'
import { AuditService } from '../audit/audit.service'
import type {
  ConvertLeadToCafeInput,
  ListAdminCafesQuery,
  ListAdminLeadsQuery,
} from './admin.schema'

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
        businessType: true,
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
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            isApproved: true,
          },
        },
      },
    })
  }

  async updateLeadStatus(leadId: string, status: LeadStatus) {
    const lead = await this.prisma.earlyAccessLead.findUnique({
      where: { id: leadId },
      select: { id: true, restaurantId: true },
    })
    if (!lead) {
      throw new AppError(404, ErrorCodes.LEAD_NOT_FOUND, 'Early access lead was not found')
    }
    if (lead.restaurantId && status !== 'CONVERTED') {
      throw new AppError(409, ErrorCodes.CONFLICT, 'A lead linked to a cafe must remain converted')
    }

    return this.prisma.earlyAccessLead.update({
      where: { id: leadId },
      data: { status },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            isApproved: true,
          },
        },
      },
    })
  }

  async convertLeadToCafe(adminUserId: string, leadId: string, input: ConvertLeadToCafeInput) {
    const passwordHash = await bcrypt.hash(input.temporaryPassword, env.BCRYPT_SALT_ROUNDS)

    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.earlyAccessLead.findUnique({
        where: { id: leadId },
        select: { id: true, status: true, restaurantId: true },
      })

      if (!lead) {
        throw new AppError(404, ErrorCodes.LEAD_NOT_FOUND, 'Early access lead was not found')
      }
      if (lead.restaurantId) {
        throw new AppError(409, ErrorCodes.CONFLICT, 'This lead already has a cafe account')
      }
      if (!['QUALIFIED', 'CONVERTED'].includes(lead.status)) {
        throw new AppError(
          409,
          ErrorCodes.CONFLICT,
          'Only qualified leads can become cafe accounts',
        )
      }

      const claimed = await tx.earlyAccessLead.updateMany({
        where: {
          id: leadId,
          restaurantId: null,
          status: { in: ['QUALIFIED', 'CONVERTED'] },
        },
        data: { status: 'CONVERTED' },
      })
      if (claimed.count !== 1) {
        throw new AppError(409, ErrorCodes.CONFLICT, 'This lead is already being converted')
      }

      const [existingOwner, existingCafe] = await Promise.all([
        tx.user.findUnique({ where: { email: input.ownerEmail }, select: { id: true } }),
        tx.restaurant.findUnique({ where: { slug: input.slug }, select: { id: true } }),
      ])
      if (existingOwner) {
        throw new AppError(
          409,
          ErrorCodes.CONFLICT,
          'An account with this owner email already exists',
        )
      }
      if (existingCafe) {
        throw new AppError(409, ErrorCodes.CONFLICT, 'A cafe with this slug already exists')
      }

      const owner = await tx.user.create({
        data: {
          name: input.ownerName,
          email: input.ownerEmail,
          phone: input.phone,
          passwordHash,
          role: 'OWNER',
          isActive: true,
        },
      })

      const restaurant = await tx.restaurant.create({
        data: {
          name: input.cafeName,
          slug: input.slug,
          businessType: input.businessType,
          description: input.description,
          ownerId: owner.id,
          phone: input.phone,
          email: input.ownerEmail,
          address: input.address,
          city: input.city,
          isActive: true,
          isApproved: input.isApproved,
          members: { create: { userId: owner.id, role: 'OWNER' } },
          orderSequence: { create: { nextNumber: 1 } },
        },
      })

      const branch = await tx.branch.create({
        data: {
          restaurantId: restaurant.id,
          name: 'Main Branch',
          address: [input.address, input.city].filter(Boolean).join(', '),
          phone: input.phone,
          isActive: true,
        },
      })

      if (input.tableCount > 0) {
        await tx.diningTable.createMany({
          data: Array.from({ length: input.tableCount }, (_, index) => {
            const tableNumber = String(index + 1)
            const qrToken = generateQrToken()
            return {
              restaurantId: restaurant.id,
              branchId: branch.id,
              tableNumber,
              tableLabel: `Table ${tableNumber}`,
              qrToken,
              qrUrl: buildTableQrUrl(restaurant.slug, qrToken),
              isActive: true,
            }
          }),
        })
      }

      const updatedLead = await tx.earlyAccessLead.update({
        where: { id: leadId },
        data: { status: 'CONVERTED', restaurantId: restaurant.id },
        select: {
          id: true,
          status: true,
          restaurant: {
            select: { id: true, name: true, slug: true, isActive: true, isApproved: true },
          },
        },
      })

      await tx.auditLog.create({
        data: {
          restaurantId: restaurant.id,
          branchId: branch.id,
          userId: adminUserId,
          action: 'admin.lead_converted_to_cafe',
          entityType: 'EarlyAccessLead',
          entityId: leadId,
          metadata: {
            businessType: input.businessType,
            tableCount: input.tableCount,
            isApproved: input.isApproved,
          },
        },
      })

      return {
        cafe: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          businessType: restaurant.businessType,
          isActive: restaurant.isActive,
          isApproved: restaurant.isApproved,
          owner: { id: owner.id, name: owner.name, email: owner.email },
          branch: { id: branch.id, name: branch.name },
          tableCount: input.tableCount,
        },
        lead: updatedLead,
      }
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
