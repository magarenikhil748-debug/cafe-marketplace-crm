import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../../common/middleware/require-auth'
import { withSwagger } from '../../common/utils/route-schema'
import * as controller from './tables.controller'

export const tablesRoutes = async (fastify: FastifyInstance) => {
  fastify.post(
    '/branches/:branchId/tables',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Tables'], 'Create table', 'Creates a dining table and QR token.', true),
    },
    controller.createTable,
  )

  fastify.get(
    '/branches/:branchId/tables',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Tables'], 'List tables', 'Lists active tables for a branch.', true),
    },
    controller.listTables,
  )

  fastify.get(
    '/tables/:tableId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Tables'],
        'Get table',
        'Returns table details and QR code data URL.',
        true,
      ),
    },
    controller.getTable,
  )

  fastify.patch(
    '/tables/:tableId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Tables'], 'Update table', 'Updates table details.', true),
    },
    controller.updateTable,
  )

  fastify.delete(
    '/tables/:tableId',
    {
      preHandler: [requireAuth],
      schema: withSwagger(['Tables'], 'Delete table', 'Soft-deletes a dining table.', true),
    },
    controller.deleteTable,
  )

  fastify.post(
    '/tables/:tableId/regenerate-qr',
    {
      preHandler: [requireAuth],
      schema: withSwagger(
        ['Tables'],
        'Regenerate QR',
        'Regenerates a table QR token and QR URL.',
        true,
      ),
    },
    controller.regenerateQr,
  )
}


