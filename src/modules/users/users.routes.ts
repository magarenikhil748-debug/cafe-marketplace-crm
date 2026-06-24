import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../common/middleware/require-auth'
import { withSwagger } from '../../common/utils/route-schema'
import * as controller from './users.controller'

export const usersRoutes = async (fastify: FastifyInstance) => {
  fastify.get(
    '/restaurants/:restaurantId/users',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Users'],
        'List members',
        'Lists users who belong to a restaurant.',
        true,
      ),
    },
    controller.listMembers,
  )

  fastify.post(
    '/restaurants/:restaurantId/users',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Users'],
        'Create member',
        'Creates a manager, staff, or kitchen account.',
        true,
      ),
    },
    controller.createMember,
  )

  fastify.patch(
    '/users/:userId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Users'], 'Update user', 'Updates a user profile or active flag.', true),
    },
    controller.updateUser,
  )
}


