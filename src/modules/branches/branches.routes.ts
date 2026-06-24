import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../common/middleware/require-auth'
import { withSwagger } from '../../common/utils/route-schema'
import * as controller from './branches.controller'

export const branchesRoutes = async (fastify: FastifyInstance) => {
  fastify.post(
    '/restaurants/:restaurantId/branches',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Branches'],
        'Create branch',
        'Creates a branch for a restaurant.',
        true,
      ),
    },
    controller.createBranch,
  )

  fastify.get(
    '/restaurants/:restaurantId/branches',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Branches'],
        'List branches',
        'Lists active branches for a restaurant.',
        true,
      ),
    },
    controller.listBranches,
  )

  fastify.patch(
    '/branches/:branchId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Branches'], 'Update branch', 'Updates branch details.', true),
    },
    controller.updateBranch,
  )

  fastify.delete(
    '/branches/:branchId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Branches'], 'Delete branch', 'Soft-deletes a branch.', true),
    },
    controller.deleteBranch,
  )
}


