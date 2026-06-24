import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../common/middleware/require-auth'
import { withSwagger } from '../../common/utils/route-schema'
import * as controller from './dashboard.controller'

export const dashboardRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    '/restaurants/:restaurantId/dashboard/today',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Dashboard'],
        'Today stats',
        'Returns today order counts, revenue, active/completed/cancelled counts, and AOV.',
        true,
      ),
    },
    controller.today,
  )

  fastify.get(
    '/restaurants/:restaurantId/dashboard/top-items',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Dashboard'],
        'Top items',
        'Returns top selling menu items for today.',
        true,
      ),
    },
    controller.topItems,
  )

  fastify.get(
    '/restaurants/:restaurantId/dashboard/hourly-sales',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Dashboard'],
        'Hourly sales',
        'Returns hourly order counts and revenue for today.',
        true,
      ),
    },
    controller.hourlySales,
  )
}


