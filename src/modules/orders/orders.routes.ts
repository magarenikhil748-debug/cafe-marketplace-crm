import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../common/middleware/require-auth'
import { withSwagger } from '../../common/utils/route-schema'
import * as controller from './orders.controller'

export const ordersRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    '/restaurants/:restaurantId/orders',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Orders'],
        'List orders',
        'Lists restaurant orders with status, branch, table, date, and pagination filters.',
        true,
      ),
    },
    controller.listOrders,
  )

  fastify.get(
    '/orders/:orderId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Orders'],
        'Get order',
        'Returns full order details for admin, staff, or KDS.',
        true,
      ),
    },
    controller.getOrder,
  )

  fastify.patch(
    '/orders/:orderId/status',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Orders'],
        'Update order status',
        'Moves an order through the allowed status state machine.',
        true,
      ),
    },
    controller.updateOrderStatus,
  )
}


