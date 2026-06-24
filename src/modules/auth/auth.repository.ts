import type { Prisma, PrismaClient } from '@prisma/client'

export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } })
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        memberships: {
          include: {
            restaurant: true,
            branch: true,
          },
        },
      },
    })
  }

  createOwnerWithOptionalRestaurant(
    data: Prisma.UserCreateInput,
    restaurant?: Prisma.RestaurantCreateWithoutOwnerInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data })

      let createdRestaurant = null
      if (restaurant) {
        createdRestaurant = await tx.restaurant.create({
          data: {
            ...restaurant,
            ownerId: user.id,
            members: {
              create: {
                userId: user.id,
                role: 'OWNER',
              },
            },
            orderSequence: {
              create: {
                nextNumber: 1,
              },
            },
          },
        })
      }

      return { user, restaurant: createdRestaurant }
    })
  }
}


