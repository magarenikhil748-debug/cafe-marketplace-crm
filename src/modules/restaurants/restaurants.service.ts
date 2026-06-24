import type { PrismaClient } from '@prisma/client'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { ensureRestaurantRole } from '../../common/middleware/require-role'
import { generateRestaurantSlug } from '../../common/utils/restaurant-slug'
import { AuditService } from '../audit/audit.service'
import { RestaurantsRepository } from './restaurants.repository'
import type { CreateRestaurantInput, UpdateRestaurantInput } from './restaurants.schema'

export class RestaurantsService {
  private readonly repository: RestaurantsRepository
  private readonly audit: AuditService

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new RestaurantsRepository(prisma)
    this.audit = new AuditService(prisma)
  }

  async create(userId: string, input: CreateRestaurantInput) {
    const slug = await this.resolveSlug(input.slug ?? input.name)
    return this.repository.create(userId, { ...input, slug })
  }

  list(userId: string) {
    return this.repository.listForUser(userId)
  }

  async get(userId: string, restaurantId: string) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['STAFF', 'MANAGER', 'KITCHEN'])
    const restaurant = await this.repository.findActiveById(restaurantId)
    if (!restaurant) {
      throw new AppError(404, ErrorCodes.RESTAURANT_NOT_FOUND, 'Restaurant was not found')
    }
    return restaurant
  }

  async update(userId: string, restaurantId: string, input: UpdateRestaurantInput) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER'])

    const restaurant = await this.repository.findActiveById(restaurantId)
    if (!restaurant) {
      throw new AppError(404, ErrorCodes.RESTAURANT_NOT_FOUND, 'Restaurant was not found')
    }

    const data = {
      ...input,
      slug: input.slug ? await this.resolveSlug(input.slug, restaurantId) : undefined,
    }

    const updated = await this.repository.update(restaurantId, data)
    await this.audit.log({
      restaurantId,
      userId,
      action: 'restaurant.settings_updated',
      entityType: 'Restaurant',
      entityId: restaurantId,
      metadata: { changedFields: Object.keys(input) },
    })

    return updated
  }

  async delete(userId: string, restaurantId: string) {
    await ensureRestaurantRole(this.prisma, userId, restaurantId, ['MANAGER'])
    const deleted = await this.repository.softDelete(restaurantId)
    await this.audit.log({
      restaurantId,
      userId,
      action: 'restaurant.deleted',
      entityType: 'Restaurant',
      entityId: restaurantId,
      metadata: {},
    })
    return deleted
  }

  private resolveSlug(value: string, currentRestaurantId?: string) {
    return generateRestaurantSlug(this.prisma, value, currentRestaurantId)
  }
}
