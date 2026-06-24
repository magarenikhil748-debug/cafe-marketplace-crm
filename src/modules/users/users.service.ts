import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@prisma/client'
import { env } from '../../config/env'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { ensureRestaurantRole } from '../../common/middleware/require-role'
import type { CreateMemberInput, UpdateUserInput } from './users.schema'

export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

  async listMembers(currentUserId: string, restaurantId: string) {
    await ensureRestaurantRole(this.prisma, currentUserId, restaurantId, ['MANAGER'])

    return this.prisma.restaurantMember.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
        },
        branch: true,
      },
    })
  }

  async createMember(currentUserId: string, restaurantId: string, input: CreateMemberInput) {
    await ensureRestaurantRole(this.prisma, currentUserId, restaurantId, ['MANAGER'])

    if (input.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: input.branchId, restaurantId, isActive: true },
      })
      if (!branch) {
        throw new AppError(404, ErrorCodes.NOT_FOUND, 'Branch was not found')
      }
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email } })
    if (existingUser) {
      throw new AppError(409, ErrorCodes.CONFLICT, 'A user with this email already exists')
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS)

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          passwordHash,
          role: input.role,
        },
        select: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
      })

      const membership = await tx.restaurantMember.create({
        data: {
          restaurantId,
          branchId: input.branchId,
          userId: user.id,
          role: input.role,
        },
        include: { branch: true },
      })

      return { user, membership }
    })
  }

  async updateUser(currentUserId: string, userId: string, input: UpdateUserInput) {
    if (currentUserId !== userId) {
      const targetMembership = await this.prisma.restaurantMember.findFirst({ where: { userId } })
      if (!targetMembership) {
        throw new AppError(404, ErrorCodes.NOT_FOUND, 'User was not found')
      }
      await ensureRestaurantRole(this.prisma, currentUserId, targetMembership.restaurantId, [
        'MANAGER',
      ])
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: input,
      select: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
    })
  }
}


