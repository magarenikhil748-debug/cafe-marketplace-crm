import type { PrismaClient } from '@prisma/client'
import type { CreateRestaurantInput, UpdateRestaurantInput } from './restaurants.schema'

export class RestaurantsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(ownerId: string, input: CreateRestaurantInput & { slug: string }) {
    return this.prisma.restaurant.create({
      data: {
        ...input,
        ownerId,
        members: { create: { userId: ownerId, role: 'OWNER' } },
        orderSequence: { create: { nextNumber: 1 } },
      },
    })
  }

  listForUser(userId: string) {
    return this.prisma.restaurant.findMany({
      where: {
        isActive: true,
        members: { some: { userId } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        branches: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
      },
    })
  }

  findActiveById(id: string) {
    return this.prisma.restaurant.findFirst({
      where: { id, isActive: true },
      include: {
        branches: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
      },
    })
  }

  update(id: string, input: UpdateRestaurantInput & { slug?: string }) {
    return this.prisma.restaurant.update({
      where: { id },
      data: input,
    })
  }

  softDelete(id: string) {
    return this.prisma.restaurant.update({
      where: { id },
      data: { isActive: false },
    })
  }
}


