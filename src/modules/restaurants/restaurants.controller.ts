import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ErrorCodes } from '../../common/errors/app-error'
import { sendSuccess } from '../../common/utils/api-response'
import {
  createRestaurantSchema,
  restaurantParamsSchema,
  updateRestaurantSchema,
} from './restaurants.schema'
import { RestaurantsService } from './restaurants.service'

const requireUserId = (request: FastifyRequest) => {
  if (!request.authUser) {
    throw new AppError(401, ErrorCodes.AUTH_UNAUTHORIZED, 'Authentication is required')
  }
  return request.authUser.id
}

export const createRestaurant = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const input = createRestaurantSchema.parse(request.body)
  const service = new RestaurantsService((request.server as any).prisma)
  const restaurant = await service.create(userId, input)

  return sendSuccess(reply, 'Restaurant created successfully', { restaurant }, 201)
}

export const listRestaurants = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const service = new RestaurantsService((request.server as any).prisma)
  const restaurants = await service.list(userId)

  return sendSuccess(reply, 'Restaurants fetched successfully', { restaurants })
}

export const getRestaurant = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const service = new RestaurantsService((request.server as any).prisma)
  const restaurant = await service.get(userId, params.restaurantId)

  return sendSuccess(reply, 'Restaurant fetched successfully', { restaurant })
}

export const updateRestaurant = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const input = updateRestaurantSchema.parse(request.body)
  const service = new RestaurantsService((request.server as any).prisma)
  const restaurant = await service.update(userId, params.restaurantId, input)

  return sendSuccess(reply, 'Restaurant updated successfully', { restaurant })
}

export const deleteRestaurant = async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = requireUserId(request)
  const params = restaurantParamsSchema.parse(request.params)
  const service = new RestaurantsService((request.server as any).prisma)
  const restaurant = await service.delete(userId, params.restaurantId)

  return sendSuccess(reply, 'Restaurant deleted successfully', { restaurant })
}


