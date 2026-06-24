import type { PrismaClient } from '@prisma/client'
import { buildUniqueSlug } from './slug'

export const generateRestaurantSlug = (
  prisma: PrismaClient,
  restaurantName: string,
  currentRestaurantId?: string,
) =>
  buildUniqueSlug(restaurantName, async (candidate) => {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })

    return Boolean(restaurant && restaurant.id !== currentRestaurantId)
  })
