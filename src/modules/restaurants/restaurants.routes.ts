import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../common/middleware/require-auth'
import { withSwagger } from '../../common/utils/route-schema'
import * as controller from './restaurants.controller'

export const restaurantsRoutes = async (fastify: FastifyInstance) => {
  fastify.post(
    '/restaurants',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Restaurants'],
        'Create restaurant',
        'Creates a restaurant profile.',
        true,
      ),
    },
    controller.createRestaurant,
  )

  fastify.get(
    '/restaurants',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Restaurants'],
        'List restaurants',
        'Lists restaurants visible to the user.',
        true,
      ),
    },
    controller.listRestaurants,
  )

  fastify.get(
    '/restaurants/:restaurantId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Restaurants'], 'Get restaurant', 'Returns a restaurant profile.', true),
    },
    controller.getRestaurant,
  )

  fastify.patch(
    '/restaurants/:restaurantId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Restaurants'],
        'Update restaurant',
        'Updates restaurant settings.',
        true,
      ),
    },
    controller.updateRestaurant,
  )

  fastify.delete(
    '/restaurants/:restaurantId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Restaurants'],
        'Delete restaurant',
        'Soft-deletes a restaurant profile.',
        true,
      ),
    },
    controller.deleteRestaurant,
  )
}


