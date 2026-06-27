import type { PrismaClient } from '@prisma/client'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { ensureRestaurantRole } from '../../common/middleware/require-role'
import { buildTableQrUrl, createQrCodeDataUrl, generateQrToken } from '../../common/utils/qr-code'
import { AuditService } from '../audit/audit.service'
import type { CreateTableInput, UpdateTableInput } from './tables.schema'

export class TablesService {
  private readonly audit: AuditService

  constructor(private readonly prisma: PrismaClient) {
    this.audit = new AuditService(prisma)
  }

  async create(userId: string, branchId: string, input: CreateTableInput) {
    const branch = await this.getActiveBranch(branchId)
    await ensureRestaurantRole(this.prisma, userId, branch.restaurantId, ['MANAGER'])

    const qrToken = generateQrToken()
    const table = await this.prisma.diningTable.create({
      data: {
        restaurantId: branch.restaurantId,
        branchId,
        tableNumber: input.tableNumber,
        tableLabel: input.tableLabel,
        qrToken,
        qrUrl: buildTableQrUrl(branch.restaurant.slug, qrToken),
      },
    })

    return this.withQrCode(table)
  }

  async list(userId: string, branchId: string, includeInactive = false) {
    const branch = await this.getActiveBranch(branchId)
    await ensureRestaurantRole(this.prisma, userId, branch.restaurantId, [
      'STAFF',
      'MANAGER',
      'KITCHEN',
    ])

    const tables = await this.prisma.diningTable.findMany({
      where: { branchId, isActive: includeInactive ? undefined : true },
      orderBy: [{ tableNumber: 'asc' }, { createdAt: 'asc' }],
      include: { restaurant: { select: { slug: true } } },
    })

    return Promise.all(
      tables.map(({ restaurant, ...table }) => {
        const qrUrl = buildTableQrUrl(restaurant.slug, table.qrToken)
        return this.withQrCode({ ...table, qrUrl })
      }),
    )
  }

  async get(userId: string, tableId: string) {
    const table = await this.getActiveTable(tableId)
    await ensureRestaurantRole(this.prisma, userId, table.restaurantId, [
      'STAFF',
      'MANAGER',
      'KITCHEN',
    ])

    const { restaurant, ...tableData } = table
    return this.withQrCode({
      ...tableData,
      qrUrl: buildTableQrUrl(restaurant.slug, table.qrToken),
    })
  }

  async update(userId: string, tableId: string, input: UpdateTableInput) {
    const table = await this.getTableForManagement(tableId)
    await ensureRestaurantRole(this.prisma, userId, table.restaurantId, ['MANAGER'])

    return this.prisma.diningTable.update({
      where: { id: tableId },
      data: {
        ...input,
        ...(input.isActive === true
          ? { qrUrl: buildTableQrUrl(table.restaurant.slug, table.qrToken) }
          : {}),
      },
    })
  }

  async delete(userId: string, tableId: string) {
    const table = await this.getActiveTable(tableId)
    await ensureRestaurantRole(this.prisma, userId, table.restaurantId, ['MANAGER'])

    return this.prisma.diningTable.update({
      where: { id: tableId },
      data: { isActive: false },
    })
  }

  async regenerateQr(userId: string, tableId: string) {
    const table = await this.getActiveTable(tableId)
    await ensureRestaurantRole(this.prisma, userId, table.restaurantId, ['MANAGER'])

    const qrToken = generateQrToken()
    const updated = await this.prisma.diningTable.update({
      where: { id: tableId },
      data: {
        qrToken,
        qrUrl: buildTableQrUrl(table.restaurant.slug, qrToken),
      },
    })

    await this.audit.log({
      restaurantId: table.restaurantId,
      branchId: table.branchId,
      userId,
      action: 'table.qr_regenerated',
      entityType: 'DiningTable',
      entityId: tableId,
      metadata: { tableNumber: table.tableNumber },
    })

    return this.withQrCode(updated)
  }

  private async getActiveBranch(branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, isActive: true, restaurant: { isActive: true } },
      include: { restaurant: { select: { slug: true } } },
    })
    if (!branch) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, 'Branch was not found')
    }
    return branch
  }

  private async getActiveTable(tableId: string) {
    const table = await this.prisma.diningTable.findFirst({
      where: {
        id: tableId,
        isActive: true,
        restaurant: { isActive: true },
        branch: { isActive: true },
      },
      include: { restaurant: { select: { slug: true } } },
    })
    if (!table) {
      throw new AppError(404, ErrorCodes.TABLE_NOT_FOUND, 'Table was not found')
    }
    return table
  }

  private async getTableForManagement(tableId: string) {
    const table = await this.prisma.diningTable.findFirst({
      where: {
        id: tableId,
        restaurant: { isActive: true },
        branch: { isActive: true },
      },
      include: { restaurant: { select: { slug: true } } },
    })
    if (!table) {
      throw new AppError(404, ErrorCodes.TABLE_NOT_FOUND, 'Table was not found')
    }
    return table
  }

  private async withQrCode<T extends { qrUrl: string }>(table: T) {
    return {
      ...table,
      qrCodeDataUrl: await createQrCodeDataUrl(table.qrUrl),
    }
  }
}
