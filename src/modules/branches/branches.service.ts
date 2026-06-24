import type { PrismaClient } from '@prisma/client'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { ensureRestaurantRole } from '../../common/middleware/require-role'
import type { CreateBranchInput, UpdateBranchInput } from './branches.schema'

export class BranchesService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string, restaurantId: string, input: CreateBranchInput) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER'])

    return this.prisma.branch.create({
      data: {
        restaurantId,
        name: input.name,
        address: input.address,
        phone: input.phone,
      },
    })
  }

  async list(userId: string, restaurantId: string) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['STAFF', 'MANAGER', 'KITCHEN'])

    return this.prisma.branch.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    })
  }

  async update(userId: string, branchId: string, input: UpdateBranchInput) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } })
    if (!branch) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, 'Branch was not found')
    }

    await ensureRestaurantRole(this.prisma, userId, branch.restaurantId, ['MANAGER'])

    return this.prisma.branch.update({
      where: { id: branchId },
      data: input,
    })
  }

  async delete(userId: string, branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } })
    if (!branch) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, 'Branch was not found')
    }

    await ensureRestaurantRole(this.prisma, userId, branch.restaurantId, ['MANAGER'])

    return this.prisma.branch.update({
      where: { id: branchId },
      data: { isActive: false },
    })
  }
}


