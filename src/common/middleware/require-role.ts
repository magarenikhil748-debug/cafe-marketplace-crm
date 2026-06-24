import type { PrismaClient, UserRole } from '@prisma/client'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../errors/app-error'

export const requireRole =
  (roles: UserRole[]) => async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = request.authUser

    if (!user) {
      throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
    }

    if (user.role !== 'OWNER' && !roles.includes(user.role)) {
      throw new AppError(403, ErrorCodes.AUTH_FORBIDDEN, 'You do not have permission')
    }
  }

export const ensureRestaurantRole = async (
  prisma: PrismaClient,
  userId: string,
  restaurantId: string,
  roles: UserRole[],
) => {
  const membership = await prisma.restaurantMember.findFirst({
    where: { userId, restaurantId, user: { isActive: true }, restaurant: { isActive: true } },
  })

  if (!membership) {
    throw new AppError(403, ErrorCodes.AUTH_FORBIDDEN, 'You do not have access to this restaurant')
  }

  if (membership.role !== 'OWNER' && !roles.includes(membership.role)) {
    throw new AppError(403, ErrorCodes.AUTH_FORBIDDEN, 'You do not have permission')
  }

  return membership
}


